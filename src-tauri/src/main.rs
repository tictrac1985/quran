// نقطة دخول تطبيق ورتل القرآن (سطح المكتب — Tauri).
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    quran_app_lib::run();
}
