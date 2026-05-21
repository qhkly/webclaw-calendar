# webclaw-calendar

WebClaw Calendar is a Tauri 2 desktop app for Google Calendar and Google Tasks.
It uses the same lightweight stack as `webcode-git-manager`: Vanilla React,
runtime Babel JSX, custom CSS, and a Rust Tauri backend with no frontend build
step.

## Features

- Google Calendar OAuth login through a local loopback callback
- Week-view calendar grid with all-day events, timed events, overlap layout, and
  a current-time line
- Google Calendar list selection
- Google Tasks list display, task creation, completion, and deletion
- Tasks with due dates appear in the calendar all-day row
- Optional HTTP/SOCKS proxy for Google API requests
- GitHub Actions release workflow for macOS, Linux, and Windows packages

## Project Structure

```text
webclaw-calendar/
├── src/                  # Vanilla React app loaded directly by Tauri
│   ├── index.html
│   ├── bridge.js         # Tauri IPC wrapper and data transforms
│   ├── app.jsx
│   ├── mini-calendar.jsx
│   ├── time-grid.jsx
│   ├── tasks-panel.jsx
│   ├── style.css
│   ├── calendar.css
│   └── vendor/           # React, ReactDOM, Babel runtime files
├── src-tauri/            # Tauri 2 Rust backend
│   ├── src/commands/
│   │   ├── auth_commands.rs
│   │   └── calendar_commands.rs
│   ├── Cargo.toml
│   └── tauri.conf.json
└── .github/workflows/
    └── release.yml
```

## Development

Install dependencies:

```bash
npm install
```

Run the app in development mode:

```bash
npm run dev
```

Build a local package:

```bash
npm run build
```

Run Rust checks:

```bash
cd src-tauri
cargo check
```

## Google OAuth Setup

Before logging in, create OAuth credentials in Google Cloud Console:

1. Create or select a Google Cloud project.
2. Enable these APIs:
   - Google Calendar API
   - Google Tasks API
3. Configure the OAuth consent screen.
4. Add scopes for Calendar, Tasks, OpenID, and email.
5. Add your Google account as a test user if the app is still in testing mode.
6. Create an OAuth 2.0 Client ID with application type `Desktop app`.
7. Copy the Client ID and Client Secret into the app settings page.

The app stores local configuration here:

```text
~/.config/webclaw-calendar/settings.json
~/.config/webclaw-calendar/auth.json
```

The OAuth callback listens on:

```text
http://127.0.0.1:18795/callback
```

## Proxy

The settings page accepts an optional proxy URL, for example:

```text
http://127.0.0.1:7890
socks5://127.0.0.1:7891
```

All Google API requests go through the Rust backend and use this proxy setting.

## Release Builds

GitHub Actions automatically builds release artifacts when pushing a tag that
starts with `v`:

```bash
git tag v0.1.0
git push origin v0.1.0
```

The release workflow builds:

- macOS arm64
- macOS x64 Intel
- Linux x64
- Linux arm64
- Windows x64

When triggered by a tag, the workflow also creates a GitHub Release and uploads
the generated installers.
