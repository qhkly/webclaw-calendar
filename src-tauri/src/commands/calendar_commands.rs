use crate::commands::auth_commands::{build_client, get_valid_access_token, load_settings_from_disk};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

const CALENDAR_BASE: &str = "https://www.googleapis.com/calendar/v3";
const TASKS_BASE: &str = "https://tasks.googleapis.com/tasks/v1";

#[derive(Debug, Serialize, Deserialize)]
pub struct CalendarItem {
    pub id: String,
    pub summary: String,
    pub background_color: Option<String>,
    pub foreground_color: Option<String>,
    pub selected: bool,
    pub primary: bool,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct EventDate {
    pub date_time: Option<String>,
    pub date: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CalendarEvent {
    pub id: String,
    pub calendar_id: String,
    pub summary: String,
    pub description: Option<String>,
    pub start: EventDate,
    pub end: EventDate,
    pub calendar_color: Option<String>,
    pub is_all_day: bool,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct EventInput {
    pub calendar_id: String,
    pub summary: String,
    pub description: Option<String>,
    pub start: String,
    pub end: String,
    pub all_day: bool,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct TaskList {
    pub id: String,
    pub title: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Task {
    pub id: String,
    pub task_list_id: String,
    pub title: String,
    pub notes: Option<String>,
    pub due: Option<String>,
    pub status: String,
    pub position: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct TaskInput {
    pub task_list_id: String,
    pub title: String,
    pub notes: Option<String>,
    pub due: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct TaskUpdate {
    pub task_list_id: String,
    pub task_id: String,
    pub title: Option<String>,
    pub notes: Option<String>,
    pub due: Option<String>,
    pub status: Option<String>,
}

#[derive(Debug, Deserialize)]
struct CalendarListResponse {
    items: Option<Vec<Value>>,
}

#[derive(Debug, Deserialize)]
struct EventsResponse {
    items: Option<Vec<Value>>,
}

#[derive(Debug, Deserialize)]
struct TaskListsResponse {
    items: Option<Vec<Value>>,
}

#[derive(Debug, Deserialize)]
struct TasksResponse {
    items: Option<Vec<Value>>,
}

fn value_string(v: &Value, key: &str) -> Option<String> {
    v.get(key).and_then(Value::as_str).map(ToString::to_string)
}

fn value_bool(v: &Value, key: &str) -> bool {
    v.get(key).and_then(Value::as_bool).unwrap_or(false)
}

fn parse_event(v: Value, calendar_id: &str, calendar_color: Option<String>) -> Option<CalendarEvent> {
    let id = value_string(&v, "id")?;
    let summary = value_string(&v, "summary").unwrap_or_else(|| "(无标题)".to_string());
    let start_v = v.get("start")?;
    let end_v = v.get("end")?;
    let start = EventDate {
        date_time: value_string(start_v, "dateTime"),
        date: value_string(start_v, "date"),
    };
    let end = EventDate {
        date_time: value_string(end_v, "dateTime"),
        date: value_string(end_v, "date"),
    };
    let is_all_day = start.date_time.is_none();
    Some(CalendarEvent {
        id,
        calendar_id: calendar_id.to_string(),
        summary,
        description: value_string(&v, "description"),
        start,
        end,
        calendar_color,
        is_all_day,
    })
}

fn parse_task(v: Value, task_list_id: &str) -> Option<Task> {
    let id = value_string(&v, "id")?;
    let title = value_string(&v, "title").unwrap_or_else(|| "(无标题任务)".to_string());
    let status = value_string(&v, "status").unwrap_or_else(|| "needsAction".to_string());
    Some(Task {
        id,
        task_list_id: task_list_id.to_string(),
        title,
        notes: value_string(&v, "notes"),
        due: value_string(&v, "due"),
        status,
        position: value_string(&v, "position"),
    })
}

async fn authed_get(url: &str) -> Result<reqwest::RequestBuilder, String> {
    let settings = load_settings_from_disk()?;
    let token = get_valid_access_token().await?;
    let client = build_client(&settings)?;
    Ok(client.get(url).bearer_auth(token))
}

#[tauri::command]
pub async fn cal_list_calendars() -> Result<Vec<CalendarItem>, String> {
    let res = authed_get(&format!("{CALENDAR_BASE}/users/me/calendarList"))
        .await?
        .send()
        .await
        .map_err(|e| format!("读取日历列表失败: {e}"))?;
    if !res.status().is_success() {
        return Err(format!("读取日历列表失败: HTTP {}", res.status()));
    }
    let body: CalendarListResponse = res.json().await.map_err(|e| format!("解析日历列表失败: {e}"))?;
    Ok(body
        .items
        .unwrap_or_default()
        .into_iter()
        .filter_map(|v| {
            Some(CalendarItem {
                id: value_string(&v, "id")?,
                summary: value_string(&v, "summary").unwrap_or_else(|| "Calendar".to_string()),
                background_color: value_string(&v, "backgroundColor"),
                foreground_color: value_string(&v, "foregroundColor"),
                selected: v.get("selected").and_then(Value::as_bool).unwrap_or(true),
                primary: value_bool(&v, "primary"),
            })
        })
        .collect())
}

#[tauri::command]
pub async fn cal_get_events(
    calendar_id: String,
    time_min: String,
    time_max: String,
    calendar_color: Option<String>,
) -> Result<Vec<CalendarEvent>, String> {
    let encoded = urlencoding::encode(&calendar_id);
    let url = format!("{CALENDAR_BASE}/calendars/{encoded}/events");
    let res = authed_get(&url)
        .await?
        .query(&[
            ("timeMin", time_min.as_str()),
            ("timeMax", time_max.as_str()),
            ("singleEvents", "true"),
            ("orderBy", "startTime"),
        ])
        .send()
        .await
        .map_err(|e| format!("读取日历事件失败: {e}"))?;
    if !res.status().is_success() {
        return Err(format!("读取日历事件失败: HTTP {}", res.status()));
    }
    let body: EventsResponse = res.json().await.map_err(|e| format!("解析日历事件失败: {e}"))?;
    Ok(body
        .items
        .unwrap_or_default()
        .into_iter()
        .filter_map(|v| parse_event(v, &calendar_id, calendar_color.clone()))
        .collect())
}

#[tauri::command]
pub async fn cal_create_event(input: EventInput) -> Result<CalendarEvent, String> {
    let settings = load_settings_from_disk()?;
    let token = get_valid_access_token().await?;
    let client = build_client(&settings)?;
    let encoded = urlencoding::encode(&input.calendar_id);
    let url = format!("{CALENDAR_BASE}/calendars/{encoded}/events");
    let body = if input.all_day {
        json!({
            "summary": input.summary,
            "description": input.description,
            "start": { "date": input.start },
            "end": { "date": input.end }
        })
    } else {
        json!({
            "summary": input.summary,
            "description": input.description,
            "start": { "dateTime": input.start },
            "end": { "dateTime": input.end }
        })
    };
    let res = client
        .post(url)
        .bearer_auth(token)
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("创建事件失败: {e}"))?;
    if !res.status().is_success() {
        return Err(format!("创建事件失败: HTTP {}", res.status()));
    }
    let v: Value = res.json().await.map_err(|e| format!("解析创建事件响应失败: {e}"))?;
    parse_event(v, &input.calendar_id, None).ok_or_else(|| "创建事件响应无效".to_string())
}

#[tauri::command]
pub async fn cal_delete_event(calendar_id: String, event_id: String) -> Result<(), String> {
    let settings = load_settings_from_disk()?;
    let token = get_valid_access_token().await?;
    let client = build_client(&settings)?;
    let url = format!(
        "{CALENDAR_BASE}/calendars/{}/events/{}",
        urlencoding::encode(&calendar_id),
        urlencoding::encode(&event_id)
    );
    let res = client
        .delete(url)
        .bearer_auth(token)
        .send()
        .await
        .map_err(|e| format!("删除事件失败: {e}"))?;
    if res.status().is_success() {
        Ok(())
    } else {
        Err(format!("删除事件失败: HTTP {}", res.status()))
    }
}

#[tauri::command]
pub async fn cal_list_task_lists() -> Result<Vec<TaskList>, String> {
    let res = authed_get(&format!("{TASKS_BASE}/users/@me/lists"))
        .await?
        .send()
        .await
        .map_err(|e| format!("读取任务列表失败: {e}"))?;
    if !res.status().is_success() {
        return Err(format!("读取任务列表失败: HTTP {}", res.status()));
    }
    let body: TaskListsResponse = res.json().await.map_err(|e| format!("解析任务列表失败: {e}"))?;
    Ok(body
        .items
        .unwrap_or_default()
        .into_iter()
        .filter_map(|v| {
            Some(TaskList {
                id: value_string(&v, "id")?,
                title: value_string(&v, "title").unwrap_or_else(|| "Tasks".to_string()),
            })
        })
        .collect())
}

#[tauri::command]
pub async fn cal_get_tasks(task_list_id: String) -> Result<Vec<Task>, String> {
    let encoded = urlencoding::encode(&task_list_id);
    let url = format!("{TASKS_BASE}/lists/{encoded}/tasks");
    let res = authed_get(&url)
        .await?
        .query(&[("showCompleted", "true")])
        .send()
        .await
        .map_err(|e| format!("读取任务失败: {e}"))?;
    if !res.status().is_success() {
        return Err(format!("读取任务失败: HTTP {}", res.status()));
    }
    let body: TasksResponse = res.json().await.map_err(|e| format!("解析任务失败: {e}"))?;
    Ok(body
        .items
        .unwrap_or_default()
        .into_iter()
        .filter_map(|v| parse_task(v, &task_list_id))
        .filter(|t| t.status == "needsAction")
        .collect())
}

#[tauri::command]
pub async fn cal_create_task(input: TaskInput) -> Result<Task, String> {
    let settings = load_settings_from_disk()?;
    let token = get_valid_access_token().await?;
    let client = build_client(&settings)?;
    let url = format!("{TASKS_BASE}/lists/{}/tasks", urlencoding::encode(&input.task_list_id));
    let mut body = json!({ "title": input.title });
    if let Some(notes) = input.notes {
        body["notes"] = json!(notes);
    }
    if let Some(due) = input.due {
        body["due"] = json!(due);
    }
    let res = client
        .post(url)
        .bearer_auth(token)
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("创建任务失败: {e}"))?;
    if !res.status().is_success() {
        return Err(format!("创建任务失败: HTTP {}", res.status()));
    }
    let v: Value = res.json().await.map_err(|e| format!("解析创建任务响应失败: {e}"))?;
    parse_task(v, &input.task_list_id).ok_or_else(|| "创建任务响应无效".to_string())
}

#[tauri::command]
pub async fn cal_update_task(update: TaskUpdate) -> Result<Task, String> {
    let settings = load_settings_from_disk()?;
    let token = get_valid_access_token().await?;
    let client = build_client(&settings)?;
    let url = format!(
        "{TASKS_BASE}/lists/{}/tasks/{}",
        urlencoding::encode(&update.task_list_id),
        urlencoding::encode(&update.task_id)
    );
    let mut body = json!({});
    if let Some(title) = update.title {
        body["title"] = json!(title);
    }
    if let Some(notes) = update.notes {
        body["notes"] = json!(notes);
    }
    if let Some(due) = update.due {
        body["due"] = json!(due);
    }
    if let Some(status) = update.status {
        body["status"] = json!(status);
    }
    let res = client
        .patch(url)
        .bearer_auth(token)
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("更新任务失败: {e}"))?;
    if !res.status().is_success() {
        return Err(format!("更新任务失败: HTTP {}", res.status()));
    }
    let v: Value = res.json().await.map_err(|e| format!("解析更新任务响应失败: {e}"))?;
    parse_task(v, &update.task_list_id).ok_or_else(|| "更新任务响应无效".to_string())
}

#[tauri::command]
pub async fn cal_delete_task(task_list_id: String, task_id: String) -> Result<(), String> {
    let settings = load_settings_from_disk()?;
    let token = get_valid_access_token().await?;
    let client = build_client(&settings)?;
    let url = format!(
        "{TASKS_BASE}/lists/{}/tasks/{}",
        urlencoding::encode(&task_list_id),
        urlencoding::encode(&task_id)
    );
    let res = client
        .delete(url)
        .bearer_auth(token)
        .send()
        .await
        .map_err(|e| format!("删除任务失败: {e}"))?;
    if res.status().is_success() {
        Ok(())
    } else {
        Err(format!("删除任务失败: HTTP {}", res.status()))
    }
}
