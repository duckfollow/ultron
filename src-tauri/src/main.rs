#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
fn main() {
    if std::env::var("ULTRON_ASKPASS_HELPER").as_deref() == Ok("1") {
        std::process::exit(ultron_lib::credentials::run_askpass());
    }
    ultron_lib::run()
}
