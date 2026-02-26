//! 生産計画スケジューラー
//! kintone連携対応のデスクトップアプリケーション

mod kintone_client;
mod database;
mod commands;

use std::sync::Mutex;
use commands::AppState;
use database::Database;
use kintone_client::{KintoneClient, KintoneConfig};

/// kintone接続設定を読み込み（ファイルがあればそこから、なければデフォルト）
fn load_kintone_config() -> KintoneConfig {
    // まずファイルから読み込みを試みる
    if let Some(config_dir) = dirs::data_local_dir() {
        let config_path = config_dir.join("production-scheduler").join("kintone_config.json");
        if config_path.exists() {
            if let Ok(content) = std::fs::read_to_string(&config_path) {
                if let Ok(config) = serde_json::from_str::<KintoneConfig>(&content) {
                    eprintln!("設定ファイルから読み込みました: {:?}", config_path);
                    return config;
                }
            }
        }
    }
    
    // ファイルがなければデフォルト値
    eprintln!("デフォルト設定を使用します");
    KintoneConfig {
        subdomain: "jfe-rockfiber".to_string(),
        app_id: 506,
        api_token: "3CakeA8SORFDrOawAcL3Y2UEY8TogZkLw52U5RBo".to_string(),
        memo_app_id: Some(507),
        memo_api_token: Some("hkVvZfY6j5dgNSda9OE8WPnLefezfrIoGsR387gL".to_string()),
        yamazumi_app_id: Some(354),
        yamazumi_api_token: Some("Qig2MiwdI0McEcbPZNbP2ORkg3UQoB15wx6bBJqC".to_string()),
        kobukuro_app_id: Some(368),
        kobukuro_api_token: Some("4U3hAsfb1bLbww5XT0ppcz4f9AcdOmp1SLIfyAIS".to_string()),
        tsumikomi_app_id: Some(514),
        tsumikomi_api_token: Some("nU2EcpjY1f7CQxKNs0PoPCnRRcdpl2xgnlK4GCOA".to_string()),
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

    // kintoneクライアントを初期化（ファイルから読み込み）
    let kintone_client = KintoneClient::new(load_kintone_config())
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
            commands::add_schedule_with_kintone_sync,
            commands::update_schedule,
            commands::save_kintone_config,
            commands::fetch_from_kintone,
            commands::sync_to_kintone,
            commands::get_product_weight,
            commands::delete_schedule,
            commands::get_app_mode,
            commands::fetch_kintone_records,
        ])
        .run(tauri::generate_context!())
        .expect("アプリケーションの実行中にエラーが発生しました");
}
