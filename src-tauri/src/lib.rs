//! 生産計画スケジューラー
//! kintone連携対応のデスクトップアプリケーション

mod kintone_client;
mod database;
mod commands;

use std::sync::Mutex;
use commands::AppState;
use database::Database;
use kintone_client::{KintoneClient, KintoneConfig};

/// 固定のkintone接続設定
fn get_default_kintone_config() -> KintoneConfig {
    KintoneConfig {
        subdomain: "jfe-rockfiber".to_string(),
        app_id: 351,
        api_token: "xZ85wdaTlqTnSpOxvaLEJrR8E5pCaJaX0jDcdpd7".to_string(),
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // データベースを初期化
    let db_path = dirs::data_local_dir()
        .map(|p| p.join("production-scheduler").join("schedules.db"))
        .unwrap_or_else(|| std::path::PathBuf::from("schedules.db"));

    // ディレクトリを作成
    if let Some(parent) = db_path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }

    let db = Database::open(db_path.to_str().unwrap())
        .expect("データベースの初期化に失敗しました");

    // kintoneクライアントを初期化（固定設定）
    let kintone_client = KintoneClient::new(get_default_kintone_config())
        .expect("kintoneクライアントの初期化に失敗しました");

    let state = AppState {
        db: Mutex::new(db),
        kintone_client: Mutex::new(Some(kintone_client)),
    };

    // ウィンドウタイトルをモードに応じて設定
    #[cfg(feature = "admin-mode")]
    let app_title = "生産計画スケジューラー【管理者】";
    #[cfg(feature = "worker-mode")]
    let app_title = "生産計画スケジューラー【作業者】";
    #[cfg(not(any(feature = "admin-mode", feature = "worker-mode")))]
    let app_title = "生産計画スケジューラー【管理者】";

    eprintln!("=== Starting app: {} ===", app_title);

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(state)
        .invoke_handler(tauri::generate_handler![
            commands::get_schedules,
            commands::add_schedule,
            commands::update_schedule,
            commands::save_kintone_config,
            commands::fetch_from_kintone,
            commands::sync_to_kintone,
            commands::get_product_weight,
            commands::delete_schedule,
            commands::get_app_mode,
        ])
        .run(tauri::generate_context!())
        .expect("アプリケーションの実行中にエラーが発生しました");
}
