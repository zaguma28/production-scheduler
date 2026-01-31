//! Tauriコマンド
//! フロントエンドから呼び出せるAPI

use tauri::State;
use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use crate::database::{Database, LocalSchedule};
use crate::kintone_client::{KintoneClient, KintoneConfig};

/// アプリケーション状態
pub struct AppState {
    pub db: Mutex<Database>,
    pub kintone_client: Mutex<Option<KintoneClient>>,
}

/// スケジュール追加リクエスト
#[derive(Debug, Deserialize)]
pub struct AddScheduleRequest {
    pub product_name: String,
    pub line: String,
    pub start_datetime: String,
    pub end_datetime: Option<String>,
    pub quantity1: Option<f64>,
    pub quantity2: Option<f64>,
    pub quantity3: Option<f64>,
    pub quantity4: Option<f64>,
    pub quantity5: Option<f64>,
    pub quantity6: Option<f64>,
    pub quantity7: Option<f64>,
    pub quantity8: Option<f64>,
    pub total_quantity: Option<f64>,
    pub production_status: Option<String>,
}

/// kintone設定リクエスト
#[derive(Debug, Deserialize)]
pub struct KintoneConfigRequest {
    pub subdomain: String,
    pub app_id: u32,
    pub api_token: String,
}

/// スケジュール更新リクエスト
#[derive(Debug, Deserialize)]
pub struct UpdateScheduleRequest {
    pub id: i64,
    pub start_datetime: String,
    pub end_datetime: Option<String>,
}

/// レスポンス
#[derive(Debug, Serialize)]
pub struct ApiResponse<T> {
    pub success: bool,
    pub data: Option<T>,
    pub error: Option<String>,
}

/// スケジュール一覧を取得
#[tauri::command]
pub fn get_schedules(state: State<AppState>) -> ApiResponse<Vec<LocalSchedule>> {
    let db = state.db.lock().unwrap();
    match db.get_all_schedules() {
        Ok(schedules) => ApiResponse {
            success: true,
            data: Some(schedules),
            error: None,
        },
        Err(e) => ApiResponse {
            success: false,
            data: None,
            error: Some(e.to_string()),
        },
    }
}

/// スケジュールを追加
#[tauri::command]
pub fn add_schedule(request: AddScheduleRequest, state: State<AppState>) -> ApiResponse<i64> {
    let db = state.db.lock().unwrap();
    let now = chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();
    
    let schedule = LocalSchedule {
        id: None,
        kintone_record_id: None,
        product_name: request.product_name,
        line: request.line,
        start_datetime: request.start_datetime,
        end_datetime: request.end_datetime,
        quantity1: request.quantity1,
        quantity2: request.quantity2,
        quantity3: request.quantity3,
        quantity4: request.quantity4,
        quantity5: request.quantity5,
        quantity6: request.quantity6,
        quantity7: request.quantity7,
        quantity8: request.quantity8,
        total_quantity: request.total_quantity,
        production_status: request.production_status.unwrap_or("予定".to_string()),
        sync_status: "pending".to_string(),
        created_at: now.clone(),
        updated_at: now,
    };

    match db.add_schedule(&schedule) {
        Ok(id) => ApiResponse {
            success: true,
            data: Some(id),
            error: None,
        },
        Err(e) => ApiResponse {
            success: false,
            data: None,
            error: Some(e.to_string()),
        },
    }
}

/// スケジュールを更新
#[tauri::command]
pub fn update_schedule(request: UpdateScheduleRequest, state: State<AppState>) -> ApiResponse<()> {
    let db = state.db.lock().unwrap();
    match db.update_schedule_datetime(request.id, &request.start_datetime, request.end_datetime.as_deref()) {
        Ok(_) => ApiResponse {
            success: true,
            data: Some(()),
            error: None,
        },
        Err(e) => ApiResponse {
            success: false,
            data: None,
            error: Some(e.to_string()),
        },
    }
}

/// kintone設定を保存
#[tauri::command]
pub fn save_kintone_config(config: KintoneConfigRequest, state: State<AppState>) -> ApiResponse<()> {
    let kintone_config = KintoneConfig {
        subdomain: config.subdomain,
        app_id: config.app_id,
        api_token: config.api_token,
    };

    match KintoneClient::new(kintone_config) {
        Ok(client) => {
            let mut kintone = state.kintone_client.lock().unwrap();
            *kintone = Some(client);
            ApiResponse {
                success: true,
                data: Some(()),
                error: None,
            }
        }
        Err(e) => ApiResponse {
            success: false,
            data: None,
            error: Some(e.to_string()),
        },
    }
}

/// kintoneからスケジュールを取得
#[tauri::command]
pub async fn fetch_from_kintone(state: State<'_, AppState>) -> Result<ApiResponse<Vec<serde_json::Value>>, ()> {
    let client_opt = {
        let kintone = state.kintone_client.lock().unwrap();
        kintone.clone()
    };
    
    if let Some(client) = client_opt {
        match client.get_records(None).await {
            Ok(records) => Ok(ApiResponse {
                success: true,
                data: Some(records),
                error: None,
            }),
            Err(e) => Ok(ApiResponse {
                success: false,
                data: None,
                error: Some(e.to_string()),
            }),
        }
    } else {
        Ok(ApiResponse {
            success: false,
            data: None,
            error: Some("kintone設定が未設定です".to_string()),
        })
    }
}

/// kintoneにスケジュールを送信
#[tauri::command]
pub async fn sync_to_kintone(state: State<'_, AppState>) -> Result<ApiResponse<u32>, ()> {
    let pending_schedules = {
        let db = state.db.lock().unwrap();
        db.get_pending_schedules().unwrap_or_default()
    };

    let client_opt = {
        let kintone = state.kintone_client.lock().unwrap();
        kintone.clone()
    };
    
    if let Some(client) = client_opt {
        let mut synced_count = 0u32;
        
        for schedule in pending_schedules {
            // kintoneレコード形式に変換
            let record = serde_json::json!({
                "製品名": { "value": schedule.product_name },
                "ライン名": { "value": schedule.line },
                "開始日時1": { "value": schedule.start_datetime },
                "総終了日時": { "value": schedule.end_datetime },
                "生産数量1": { "value": schedule.quantity1 },
                "生産数量2": { "value": schedule.quantity2 },
                "生産数量3": { "value": schedule.quantity3 },
                "生産数量4": { "value": schedule.quantity4 },
                "生産数量5": { "value": schedule.quantity5 },
                "生産数量6": { "value": schedule.quantity6 },
                "生産数量7": { "value": schedule.quantity7 },
                "生産数量8": { "value": schedule.quantity8 },
                "総個数": { "value": schedule.total_quantity },
            });

            if let Some(kintone_id) = schedule.kintone_record_id {
                // 既存レコードを更新
                if client.update_record(kintone_id, record).await.is_ok() {
                    let db = state.db.lock().unwrap();
                    let _ = db.update_sync_status(schedule.id.unwrap(), "synced", Some(kintone_id));
                    synced_count += 1;
                }
            } else {
                // 新規レコードを追加
                if let Ok(new_id) = client.add_record(record).await {
                    let db = state.db.lock().unwrap();
                    let _ = db.update_sync_status(schedule.id.unwrap(), "synced", Some(new_id));
                    synced_count += 1;
                }
            }
        }

        Ok(ApiResponse {
            success: true,
            data: Some(synced_count),
            error: None,
        })
    } else {
        Ok(ApiResponse {
            success: false,
            data: None,
            error: Some("kintone設定が未設定です".to_string()),
        })
    }
}

/// 製品の重量を取得
#[tauri::command]
pub fn get_product_weight(product_name: String, state: State<AppState>) -> ApiResponse<f64> {
    let db = state.db.lock().unwrap();
    match db.get_product_weight(&product_name) {
        Ok(Some(weight)) => ApiResponse {
            success: true,
            data: Some(weight),
            error: None,
        },
        Ok(None) => ApiResponse {
            success: false,
            data: None,
            error: Some(format!("製品 '{}' が見つかりません", product_name)),
        },
        Err(e) => ApiResponse {
            success: false,
            data: None,
            error: Some(e.to_string()),
        },
    }
}
