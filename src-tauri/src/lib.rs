mod terminal;
use tauri::Manager;
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(terminal::Sessions::default())
        .invoke_handler(tauri::generate_handler![
            terminal::open_terminal,
            terminal::write_terminal,
            terminal::resize_terminal,
            terminal::ack_terminal,
            terminal::close_terminal
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
