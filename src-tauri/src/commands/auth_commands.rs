use chrono::Utc;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use tauri::AppHandle;
use tauri_plugin_opener::OpenerExt;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpListener;
use tokio::time::{timeout, Duration};

const APP_DIR: &str = "webclaw-calendar";
const CALLBACK_ADDR: &str = "127.0.0.1:18795";
const REDIRECT_URI: &str = "http://127.0.0.1:18795/callback";
const SCOPES: &str = "https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/tasks https://www.googleapis.com/auth/userinfo.email openid email";

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct Settings {
    pub client_id: String,
    pub client_secret: String,
    pub proxy: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuthTokens {
    pub access_token: String,
    pub refresh_token: String,
    pub expires_at: i64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct AuthStatus {
    pub authenticated: bool,
    pub email: Option<String>,
}

#[derive(Debug, Deserialize)]
struct TokenResponse {
    access_token: String,
    refresh_token: Option<String>,
    expires_in: Option<i64>,
}

#[derive(Debug, Deserialize)]
struct UserInfo {
    email: Option<String>,
}

pub fn build_client(settings: &Settings) -> Result<Client, String> {
    let mut builder = Client::builder();
    if let Some(proxy_url) = &settings.proxy {
        let trimmed = proxy_url.trim();
        if !trimmed.is_empty() {
            let proxy = reqwest::Proxy::all(trimmed).map_err(|e| format!("代理配置无效: {e}"))?;
            builder = builder.proxy(proxy);
        }
    }
    builder
        .build()
        .map_err(|e| format!("HTTP 客户端构建失败: {e}"))
}

fn app_dir() -> Result<PathBuf, String> {
    let dir = dirs::config_dir()
        .ok_or_else(|| "无法定位系统配置目录".to_string())?
        .join(APP_DIR);
    fs::create_dir_all(&dir).map_err(|e| format!("创建配置目录失败: {e}"))?;
    Ok(dir)
}

fn settings_path() -> Result<PathBuf, String> {
    Ok(app_dir()?.join("settings.json"))
}

fn auth_path() -> Result<PathBuf, String> {
    Ok(app_dir()?.join("auth.json"))
}

pub fn load_settings_from_disk() -> Result<Settings, String> {
    let path = settings_path()?;
    if !path.exists() {
        return Ok(Settings::default());
    }
    let data = fs::read_to_string(path).map_err(|e| format!("读取设置失败: {e}"))?;
    serde_json::from_str(&data).map_err(|e| format!("解析设置失败: {e}"))
}

fn save_tokens(tokens: &AuthTokens) -> Result<(), String> {
    let data = serde_json::to_string_pretty(tokens).map_err(|e| format!("序列化令牌失败: {e}"))?;
    fs::write(auth_path()?, data).map_err(|e| format!("保存令牌失败: {e}"))
}

fn load_tokens() -> Result<Option<AuthTokens>, String> {
    let path = auth_path()?;
    if !path.exists() {
        return Ok(None);
    }
    let data = fs::read_to_string(path).map_err(|e| format!("读取令牌失败: {e}"))?;
    serde_json::from_str(&data)
        .map(Some)
        .map_err(|e| format!("解析令牌失败: {e}"))
}

pub fn clear_tokens() -> Result<(), String> {
    let path = auth_path()?;
    if path.exists() {
        fs::remove_file(path).map_err(|e| format!("删除令牌失败: {e}"))?;
    }
    Ok(())
}

async fn refresh_access_token(settings: &Settings, tokens: &AuthTokens) -> Result<AuthTokens, String> {
    let client = build_client(settings)?;
    let res = client
        .post("https://oauth2.googleapis.com/token")
        .form(&[
            ("client_id", settings.client_id.as_str()),
            ("client_secret", settings.client_secret.as_str()),
            ("refresh_token", tokens.refresh_token.as_str()),
            ("grant_type", "refresh_token"),
        ])
        .send()
        .await
        .map_err(|e| format!("刷新授权失败: {e}"))?;

    if !res.status().is_success() {
        clear_tokens()?;
        return Err(format!("刷新授权失败: HTTP {}", res.status()));
    }

    let body: TokenResponse = res.json().await.map_err(|e| format!("解析刷新响应失败: {e}"))?;
    let refreshed = AuthTokens {
        access_token: body.access_token,
        refresh_token: tokens.refresh_token.clone(),
        expires_at: Utc::now().timestamp() + body.expires_in.unwrap_or(3600),
    };
    save_tokens(&refreshed)?;
    Ok(refreshed)
}

pub async fn get_valid_access_token() -> Result<String, String> {
    let settings = load_settings_from_disk()?;
    let tokens = load_tokens()?.ok_or_else(|| "尚未登录 Google".to_string())?;
    if tokens.expires_at > Utc::now().timestamp() + 120 {
        return Ok(tokens.access_token);
    }
    match refresh_access_token(&settings, &tokens).await {
        Ok(refreshed) => Ok(refreshed.access_token),
        Err(e) => {
            let _ = clear_tokens();
            Err(e)
        }
    }
}

fn parse_code_from_request(request: &str) -> Result<String, String> {
    let first_line = request.lines().next().ok_or_else(|| "OAuth 回调为空".to_string())?;
    let path = first_line
        .split_whitespace()
        .nth(1)
        .ok_or_else(|| "OAuth 回调格式无效".to_string())?;
    let query = path
        .split_once('?')
        .map(|(_, q)| q)
        .ok_or_else(|| "OAuth 回调缺少 code".to_string())?;

    for pair in query.split('&') {
        let (key, value) = pair.split_once('=').unwrap_or((pair, ""));
        if key == "code" {
            return urlencoding::decode(value)
                .map(|v| v.into_owned())
                .map_err(|e| format!("OAuth code 解码失败: {e}"));
        }
        if key == "error" {
            let err = urlencoding::decode(value).map(|v| v.into_owned()).unwrap_or_else(|_| value.to_string());
            return Err(format!("Google 授权失败: {err}"));
        }
    }
    Err("OAuth 回调缺少 code".to_string())
}

async fn write_callback_response(stream: &mut tokio::net::TcpStream, ok: bool, message: &str) -> Result<(), String> {
    let status = if ok { "200 OK" } else { "400 Bad Request" };
    let html = format!(
        "<!doctype html><html><head><meta charset=\"utf-8\"><title>WebClaw Calendar</title></head><body style=\"font-family:-apple-system,BlinkMacSystemFont,sans-serif;padding:48px\"><h2>{}</h2><p>可以关闭此窗口，回到 WebClaw Calendar。</p></body></html>",
        message
    );
    let response = format!(
        "HTTP/1.1 {status}\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\n\r\n{}",
        html.as_bytes().len(),
        html
    );
    stream
        .write_all(response.as_bytes())
        .await
        .map_err(|e| format!("写入 OAuth 回调响应失败: {e}"))
}

#[tauri::command]
pub async fn cal_load_settings() -> Result<Settings, String> {
    load_settings_from_disk()
}

#[tauri::command]
pub async fn cal_save_settings(settings: Settings) -> Result<(), String> {
    let data = serde_json::to_string_pretty(&settings).map_err(|e| format!("序列化设置失败: {e}"))?;
    fs::write(settings_path()?, data).map_err(|e| format!("保存设置失败: {e}"))
}

#[tauri::command]
pub async fn cal_start_oauth(app: AppHandle) -> Result<AuthStatus, String> {
    let settings = load_settings_from_disk()?;
    if settings.client_id.trim().is_empty() || settings.client_secret.trim().is_empty() {
        return Err("请先在设置页填写 Google OAuth Client ID 和 Client Secret".to_string());
    }

    let listener = TcpListener::bind(CALLBACK_ADDR)
        .await
        .map_err(|e| format!("绑定 OAuth 回调端口失败: {e}"))?;

    let auth_url = format!(
        "https://accounts.google.com/o/oauth2/v2/auth?client_id={}&redirect_uri={}&response_type=code&scope={}&access_type=offline&prompt=consent",
        urlencoding::encode(&settings.client_id),
        urlencoding::encode(REDIRECT_URI),
        urlencoding::encode(SCOPES)
    );
    app.opener()
        .open_url(&auth_url, None::<String>)
        .map_err(|e| format!("打开浏览器失败: {e}"))?;

    let (mut stream, _) = timeout(Duration::from_secs(300), listener.accept())
        .await
        .map_err(|_| "OAuth 授权超时".to_string())?
        .map_err(|e| format!("接收 OAuth 回调失败: {e}"))?;

    let mut buf = vec![0_u8; 8192];
    let n = stream
        .read(&mut buf)
        .await
        .map_err(|e| format!("读取 OAuth 回调失败: {e}"))?;
    let request = String::from_utf8_lossy(&buf[..n]).to_string();
    let code = match parse_code_from_request(&request) {
        Ok(code) => code,
        Err(e) => {
            let _ = write_callback_response(&mut stream, false, "授权失败").await;
            return Err(e);
        }
    };

    let client = build_client(&settings)?;
    let res = client
        .post("https://oauth2.googleapis.com/token")
        .form(&[
            ("client_id", settings.client_id.as_str()),
            ("client_secret", settings.client_secret.as_str()),
            ("code", code.as_str()),
            ("redirect_uri", REDIRECT_URI),
            ("grant_type", "authorization_code"),
        ])
        .send()
        .await
        .map_err(|e| format!("换取令牌失败: {e}"))?;

    if !res.status().is_success() {
        let status = res.status();
        let text = res.text().await.unwrap_or_default();
        let _ = write_callback_response(&mut stream, false, "授权失败").await;
        return Err(format!("换取令牌失败: HTTP {status} {text}"));
    }

    let body: TokenResponse = res.json().await.map_err(|e| format!("解析令牌响应失败: {e}"))?;
    let refresh_token = body
        .refresh_token
        .ok_or_else(|| "Google 未返回 refresh_token，请确认使用 prompt=consent 并重新授权".to_string())?;
    let tokens = AuthTokens {
        access_token: body.access_token,
        refresh_token,
        expires_at: Utc::now().timestamp() + body.expires_in.unwrap_or(3600),
    };
    save_tokens(&tokens)?;
    let _ = write_callback_response(&mut stream, true, "授权成功").await;
    cal_get_auth_status().await
}

#[tauri::command]
pub async fn cal_get_auth_status() -> Result<AuthStatus, String> {
    let token = match get_valid_access_token().await {
        Ok(token) => token,
        Err(_) => {
            return Ok(AuthStatus {
                authenticated: false,
                email: None,
            })
        }
    };
    let settings = load_settings_from_disk()?;
    let client = build_client(&settings)?;
    let res = client
        .get("https://www.googleapis.com/oauth2/v2/userinfo")
        .bearer_auth(token)
        .send()
        .await
        .map_err(|e| format!("读取用户信息失败: {e}"))?;
    if !res.status().is_success() {
        return Ok(AuthStatus {
            authenticated: true,
            email: None,
        });
    }
    let info: UserInfo = res.json().await.unwrap_or(UserInfo { email: None });
    Ok(AuthStatus {
        authenticated: true,
        email: info.email,
    })
}

#[tauri::command]
pub async fn cal_logout() -> Result<(), String> {
    clear_tokens()
}
