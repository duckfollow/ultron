mod connection_transfer;
pub mod credentials;
mod monitor;
mod secure_backup;
mod ssh;
mod terminal;
mod updates;
use tauri::Manager;
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(terminal::Sessions::default())
        .manage(ssh::ProfileStore::default())
        .manage(monitor::LocalMonitor::default())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            monitor::local_system_snapshot,
            updates::check_for_updates,
            updates::open_release_page,
            updates::open_companion_app,
            terminal::open_terminal,
            terminal::write_terminal,
            terminal::resize_terminal,
            terminal::ack_terminal,
            terminal::close_terminal,
            ssh::list_ssh_profiles,
            ssh::save_ssh_profile,
            ssh::move_ssh_profile_group,
            ssh::rename_ssh_group,
            ssh::reorder_ssh_profile,
            ssh::delete_ssh_profile,
            ssh::forget_ssh_password,
            ssh::reveal_ssh_password,
            connection_transfer::preview_ssh_import,
            connection_transfer::import_ssh_connections,
            connection_transfer::export_ssh_connections
        ])
        .build(tauri::generate_context!())
        .expect("Unable to build Ultron")
        .run(|app, event| {
            if matches!(
                event,
                tauri::RunEvent::Exit
                    | tauri::RunEvent::WindowEvent {
                        event: tauri::WindowEvent::Destroyed,
                        ..
                    }
            ) {
                app.state::<terminal::Sessions>().shutdown();
            }
        });
}
