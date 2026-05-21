mod commands;

use commands::auth_commands::*;
use commands::calendar_commands::*;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            cal_load_settings,
            cal_save_settings,
            cal_start_oauth,
            cal_get_auth_status,
            cal_logout,
            cal_list_calendars,
            cal_get_events,
            cal_create_event,
            cal_delete_event,
            cal_list_task_lists,
            cal_get_tasks,
            cal_create_task,
            cal_update_task,
            cal_delete_task,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|_app_handle, _event| {});
}
