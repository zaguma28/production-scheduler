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
    #[serde(default)]
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
    pub notes: Option<String>,
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

/// スケジュールを追加（kintone即時同期版）
/// kintone-immediate-sync feature が有効な場合はkintoneに即座に追加
/// 無効な場合はローカルDBのみに保存（後でsync_to_kintoneで同期）
#[tauri::command]
pub async fn add_schedule(request: AddScheduleRequest, state: State<'_, AppState>) -> Result<ApiResponse<i64>, ()> {
    #[cfg(feature = "kintone-immediate-sync")]
    {
        // 方法B: kintone即時同期
        add_schedule_with_kintone_sync(request, state).await
    }
    
    #[cfg(not(feature = "kintone-immediate-sync"))]
    {
        // 方法A: ローカルのみ保存（後で同期）
        add_schedule_local_only(request, state)
    }
}

/// 方法B: kintone即時同期版
#[cfg(feature = "kintone-immediate-sync")]
async fn add_schedule_with_kintone_sync(request: AddScheduleRequest, state: State<'_, AppState>) -> Result<ApiResponse<i64>, ()> {
    // kintoneクライアントを取得
    let client_opt = {
        let kintone = state.kintone_client.lock().unwrap();
        kintone.clone()
    };

    let client = match client_opt {
        Some(c) => c,
        None => {
            return Ok(ApiResponse {
                success: false,
                data: None,
                error: Some("kintone設定が未設定です。先にkintoneから取得してください。".to_string()),
            });
        }
    };

    // スケジュール番号を生成
    let schedule_number = {
        let db = state.db.lock().unwrap();
        db.generate_schedule_number().unwrap_or_else(|_| "000000_000".to_string())
    };
    eprintln!("=== Generated schedule number: {} ===", schedule_number);

    // kintoneにレコードを追加（スケジュール番号含む）
    let record = serde_json::json!({
        "product_name": { "value": request.product_name },
        "line": { "value": request.line },
        "start_datetime": { "value": request.start_datetime },
        "end_datetime": { "value": request.end_datetime },
        "quantity": { "value": request.quantity1.map(|v| v.to_string()) },
        "total_quantity": { "value": request.total_quantity.map(|v| v.to_string()) },
        "status": { "value": request.production_status.clone().unwrap_or("未生産".to_string()) },
        "schedule_number": { "value": schedule_number.clone() },
    });

    let kintone_id = match client.add_record(record).await {
        Ok(id) => id,
        Err(e) => {
            eprintln!("kintone add_record error: {}", e);
            return Ok(ApiResponse {
                success: false,
                data: None,
                error: Some(format!("kintoneへの追加に失敗しました: {}", e)),
            });
        }
    };

    eprintln!("=== kintone record created: id={} ===", kintone_id);

    // ローカルDBに保存
    let now = chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();
    let schedule = LocalSchedule {
        id: None,
        kintone_record_id: Some(kintone_id),
        schedule_number: Some(schedule_number),
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
        efficiency1: None,
        efficiency2: None,
        efficiency3: None,
        efficiency4: None,
        efficiency5: None,
        efficiency6: None,
        efficiency7: None,
        efficiency8: None,
        production_status: request.production_status.unwrap_or("未生産".to_string()),
        notes: request.notes,
        sync_status: "synced".to_string(),
        created_at: now.clone(),
        updated_at: now,
    };

    let db = state.db.lock().unwrap();
    eprintln!("=== Saving to local DB: {} ===", schedule.product_name);
    match db.add_schedule(&schedule) {
        Ok(id) => {
            eprintln!("=== Local DB saved: id={} ===", id);
            Ok(ApiResponse {
                success: true,
                data: Some(id),
                error: None,
            })
        },
        Err(e) => {
            eprintln!("=== Local DB error: {} ===", e);
            Ok(ApiResponse {
                success: false,
                data: None,
                error: Some(e.to_string()),
            })
        },
    }
}

/// 方法A: ローカルのみ保存版（後でsync_to_kintoneで同期）
#[cfg(not(feature = "kintone-immediate-sync"))]
fn add_schedule_local_only(request: AddScheduleRequest, state: State<'_, AppState>) -> Result<ApiResponse<i64>, ()> {
    let now = chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();
    let schedule = LocalSchedule {
        id: None,
        kintone_record_id: None,
        schedule_number: None,
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
        efficiency1: None,
        efficiency2: None,
        efficiency3: None,
        efficiency4: None,
        efficiency5: None,
        efficiency6: None,
        efficiency7: None,
        efficiency8: None,
        production_status: request.production_status.unwrap_or("未生産".to_string()),
        notes: request.notes,
        sync_status: "pending".to_string(),
        created_at: now.clone(),
        updated_at: now,
    };

    let db = state.db.lock().unwrap();
    eprintln!("=== Saving to local DB: {} ===", schedule.product_name);
    match db.add_schedule(&schedule) {
        Ok(id) => {
            eprintln!("=== Local DB saved: id={} ===", id);
            Ok(ApiResponse {
                success: true,
                data: Some(id),
                error: None,
            })
        },
        Err(e) => {
            eprintln!("=== Local DB error: {} ===", e);
            Ok(ApiResponse {
                success: false,
                data: None,
                error: Some(e.to_string()),
            })
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

/// 文字列またはnullの値を取得するヘルパー
fn get_string_value(record: &serde_json::Value, field: &str) -> String {
    if let Some(field_obj) = record.get(field) {
        if let Some(val) = field_obj.get("value") {
            match val {
                serde_json::Value::String(s) => return s.clone(),
                serde_json::Value::Null => return String::new(),
                _ => return val.to_string(),
            }
        }
    }
    String::new()
}

/// 文字列またはnullの値を取得するヘルパー（Option版）
fn get_optional_string_value(record: &serde_json::Value, field: &str) -> Option<String> {
    let val = get_string_value(record, field);
    if val.is_empty() { None } else { Some(val) }
}

/// 数値フィールドの値を取得するヘルパー
fn get_number_value(record: &serde_json::Value, field: &str) -> Option<f64> {
    if let Some(field_obj) = record.get(field) {
        if let Some(val) = field_obj.get("value") {
            match val {
                serde_json::Value::String(s) if !s.is_empty() => return s.parse().ok(),
                serde_json::Value::Number(n) => return n.as_f64(),
                _ => return None,
            }
        }
    }
    None
}

/// kintoneからスケジュールを取得して保存
#[tauri::command]
pub async fn fetch_from_kintone(state: State<'_, AppState>) -> Result<ApiResponse<u32>, ()> {
    let client_opt = {
        let kintone = state.kintone_client.lock().unwrap();
        kintone.clone()
    };

    if let Some(client) = client_opt {
        match client.get_records(None).await {
            Ok(json) => {
                let records = json["records"].as_array().cloned().unwrap_or_default();

                eprintln!("=== Processing {} records ===", records.len());

                // 最初のレコードの全フィールドを出力
                if let Some(first_record) = records.first() {
                    eprintln!("=== First record fields ===");
                    if let Some(obj) = first_record.as_object() {
                        for (key, _) in obj.iter() {
                            eprintln!("  Field: {}", key);
                        }
                    }
                }

                let mut count = 0;
                let db = state.db.lock().unwrap();

                for record in records {
                    let kintone_id: u32 = get_string_value(&record, "$id").parse().unwrap_or(0);

                    // スケジュール番号フィールドを取得
                    let schedule_number = get_optional_string_value(&record, "schedule_number");

                    // 製品名を取得（SINGLE_LINE_TEXT）
                    let product_name = get_string_value(&record, "product_name");

                    // 製品名が空なら品名を試す
                    let product_name = if product_name.is_empty() {
                        get_string_value(&record, "product_name")
                    } else {
                        product_name
                    };

                    if product_name.is_empty() {
                        eprintln!("  Record {}: skipped (empty product name)", kintone_id);
                        continue;
                    }

                    // 分類（ライン名）- SINGLE_LINE_TEXT
                    let line = get_string_value(&record, "line");

                    // 開始日時1 - DATETIME
                    let start_datetime = get_string_value(&record, "start_datetime");

                    // 総終了日時 - DATETIME
                    let end_datetime = get_optional_string_value(&record, "end_datetime");

                    // 生産状況 - DROP_DOWN (nullの場合がある)
                    let production_status = get_string_value(&record, "status");
                    let production_status = if production_status.is_empty() { "予定".to_string() } else { production_status };

                    // 内製造備考1 - SINGLE_LINE_TEXT
                    let notes = get_optional_string_value(&record, "内製造備考1");

                    // 製綿能率1-8 - DROP_DOWN (kintoneドロップダウン値)
                    let efficiency1 = get_optional_string_value(&record, "製綿能率1");
                    let efficiency2 = get_optional_string_value(&record, "製綿能率2");
                    let efficiency3 = get_optional_string_value(&record, "製綿能率3");
                    let efficiency4 = get_optional_string_value(&record, "製綿能率4");
                    let efficiency5 = get_optional_string_value(&record, "製綿能率5");
                    let efficiency6 = get_optional_string_value(&record, "製綿能率6");
                    let efficiency7 = get_optional_string_value(&record, "製綿能率7");
                    let efficiency8 = get_optional_string_value(&record, "製綿能率8");

                    let now = chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();

                    let schedule = LocalSchedule {
                        id: None,
                        kintone_record_id: Some(kintone_id),
                        schedule_number: schedule_number.clone(),
                        product_name: product_name.clone(),
                        line,
                        start_datetime,
                        end_datetime,
                        quantity1: get_number_value(&record, "quantity"),
                        quantity2: get_number_value(&record, "生産数量2"),
                        quantity3: get_number_value(&record, "生産数量3"),
                        quantity4: get_number_value(&record, "生産数量4"),
                        quantity5: get_number_value(&record, "生産数量5"),
                        quantity6: get_number_value(&record, "生産数量6"),
                        quantity7: get_number_value(&record, "生産数量7"),
                        quantity8: get_number_value(&record, "生産数量8"),
                        total_quantity: get_number_value(&record, "total_quantity"),
                        efficiency1: efficiency1.clone(),
                        efficiency2,
                        efficiency3,
                        efficiency4,
                        efficiency5,
                        efficiency6,
                        efficiency7,
                        efficiency8,
                        production_status,
                        notes,
                        sync_status: "synced".to_string(),
                        created_at: now.clone(),
                        updated_at: now,
                    };

                    if db.import_from_kintone(&schedule).is_ok() {
                        count += 1;
                        eprintln!("  Record {}: imported ({}) schedule_no={:?} efficiency1={:?}", kintone_id, product_name, schedule_number, efficiency1);
                    }
                }

                eprintln!("=== Imported {} records ===", count);

                Ok(ApiResponse {
                    success: true,
                    data: Some(count),
                    error: None,
                })
            },
            Err(e) => {
                eprintln!("=== kintone API Error: {} ===", e);
                Ok(ApiResponse {
                    success: false,
                    data: None,
                    error: Some(e.to_string()),
                })
            }
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
            let record = serde_json::json!({
                "product_name": { "value": schedule.product_name },
                "line": { "value": schedule.line },
                "start_datetime": { "value": schedule.start_datetime },
                "end_datetime": { "value": schedule.end_datetime },
                "quantity": { "value": schedule.quantity1.map(|v| v.to_string()) },
                "total_quantity": { "value": schedule.total_quantity.map(|v| v.to_string()) },
                "status": { "value": schedule.production_status.clone() },
            });

            if let Some(kintone_id) = schedule.kintone_record_id {
                if client.update_record(kintone_id, record).await.is_ok() {
                    let db = state.db.lock().unwrap();
                    let _ = db.update_sync_status(schedule.id.unwrap(), "synced", Some(kintone_id));
                    synced_count += 1;
                }
            } else {
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

/// スケジュールを削除
#[tauri::command]
pub async fn delete_schedule(id: i64, state: State<'_, AppState>) -> Result<ApiResponse<()>, ()> {
    // まずkintone_record_idを取得
    let kintone_record_id = {
        let db = state.db.lock().unwrap();
        db.get_kintone_record_id(id).unwrap_or(None)
    };

    // kintoneからも削除（kintone-immediate-sync feature有効時）
    #[cfg(feature = "kintone-immediate-sync")]
    if let Some(kintone_id) = kintone_record_id {
        let client_opt = {
            let kintone = state.kintone_client.lock().unwrap();
            kintone.clone()
        };

        if let Some(client) = client_opt {
            if let Err(e) = client.delete_record(kintone_id).await {
                eprintln!("kintone delete error: {}", e);
            }
        }
    }

    // ローカルDBから削除
    let db = state.db.lock().unwrap();
    match db.delete_schedule(id) {
        Ok(_) => Ok(ApiResponse {
            success: true,
            data: Some(()),
            error: None,
        }),
        Err(e) => Ok(ApiResponse {
            success: false,
            data: None,
            error: Some(e.to_string()),
        }),
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


/// アプリモードを取得
#[tauri::command]
pub fn get_app_mode() -> ApiResponse<String> {
    #[cfg(feature = "admin-mode")]
    let mode = "admin".to_string();
    
    #[cfg(feature = "worker-mode")]
    let mode = "worker".to_string();
    
    #[cfg(not(any(feature = "admin-mode", feature = "worker-mode")))]
    let mode = "admin".to_string();
    
    ApiResponse {
        success: true,
        data: Some(mode),
        error: None,
    }
}



