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
    pub product_display_name: Option<String>,
    pub category: Option<String>,
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
    pub efficiency: Option<String>,
}

/// kintone設定リクエスト
#[derive(Debug, Deserialize)]
pub struct KintoneConfigRequest {
    pub subdomain: String,
    pub app_id: u32,
    pub api_token: String,
    pub memo_app_id: Option<u32>,
    pub memo_api_token: Option<String>,
    pub yamazumi_app_id: Option<u32>,
    pub yamazumi_api_token: Option<String>,
    pub kobukuro_app_id: Option<u32>,
    pub kobukuro_api_token: Option<String>,
    pub tsumikomi_app_id: Option<u32>,
    pub tsumikomi_api_token: Option<String>,
}

/// スケジュール更新リクエスト
#[derive(Debug, Deserialize)]
pub struct UpdateScheduleRequest {
    pub id: i64,
    pub start_datetime: Option<String>,
    pub end_datetime: Option<String>,
    pub notes: Option<String>,
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
#[tauri::command]
pub async fn add_schedule_with_kintone_sync(request: AddScheduleRequest, state: State<'_, AppState>) -> Result<ApiResponse<i64>, ()> {
    // MMO（メモ）とSHAP（図形）もkintone同期する
    // if request.product_name == "MMO" || request.product_name == "SHAP" {
    //    return add_memo_local_only(request, state);
    // }

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

    let is_memo = request.product_name == "MMO" || request.product_name == "SHAP";
    let record = if is_memo {
        // ID 507: メモ・図形用
        serde_json::json!({
            "product_name": { "value": request.product_name }, // 種別
            "notes": { "value": request.notes.clone().unwrap_or_default() }, // 内容
            "start_datetime": { "value": request.start_datetime },
            "end_datetime": { "value": request.end_datetime },
            "production_status": { "value": request.production_status.clone().unwrap_or("未生産".to_string()) },
        })
    } else {
        // ID 506: スケジュール用
        serde_json::json!({
            "product_name": { "value": request.product_name },
            "start_datetime": { "value": request.start_datetime },
            "end_datetime": { "value": request.end_datetime },
            "quantity": { "value": request.quantity1.map(|v| v.to_string()) },
            "status": { "value": request.production_status.clone().unwrap_or("未生産".to_string()) },
            "schedule_number": { "value": schedule_number.clone() },
            "製造備考": { "value": request.notes.clone().unwrap_or_default() },
            "製綿能率": { "value": request.efficiency.clone().unwrap_or_default() },
        })
    };

    let kintone_id = match client.add_record(record, is_memo).await {
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

    // 分類に応じてID354（山積表）またはID368（小袋実績）に送信
    if let Some(ref category) = request.category {
        if let Some(ref prod_status) = request.production_status {
            if prod_status == "未生産" {
                let is_kobukuro = category == "小袋";
                let is_baler = category == "ベーラー";

                if is_kobukuro || is_baler {
                    let secondary_record = if is_kobukuro {
                        // ID368（小袋実績）用のレコード
                        serde_json::json!({
                            "品番": { "value": request.product_name.clone() },
                            "品名": { "value": request.product_display_name.clone().unwrap_or_default() },
                            "製造予定日時": { "value": request.start_datetime.clone() },
                            "製造数量": { "value": request.quantity1.map(|v| v.to_string()).unwrap_or_default() },
                            "生産状況": { "value": prod_status.clone() },
                            "スケジュール番号": { "value": schedule_number.clone() },
                            "製造備考": { "value": request.notes.clone().unwrap_or_default() },
                        })
                    } else {
                        // ID354（山積表）用のレコード
                        serde_json::json!({
                            "品番": { "value": request.product_name.clone() },
                            "品名": { "value": request.product_display_name.clone().unwrap_or_default() },
                            "製造予定日時": { "value": request.start_datetime.clone() },
                            "生産状況": { "value": prod_status.clone() },
                            "スケジュール番号": { "value": schedule_number.clone() },
                            "コメント": { "value": request.notes.clone().unwrap_or_default() },
                        })
                    };

                    eprintln!("=== Syncing to {} ===", if is_kobukuro { "ID368（小袋実績）" } else { "ID354（山積表）" });
                    
                    if let Err(e) = client.sync_to_yamazumi_or_kobukuro(&schedule_number, secondary_record, is_kobukuro).await {
                        eprintln!("=== Secondary sync warning: {} ===", e);
                        // エラーがあっても処理は続行（メインのID506は成功しているため）
                    }
                }
            }
        }
    }

    // ローカルDBに保存
    let now = chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();
    let schedule = LocalSchedule {
        id: None,
        kintone_record_id: Some(kintone_id),
        schedule_number: Some(schedule_number),
        product_name: request.product_name,
        product_display_name: request.product_display_name,
        category: request.category,
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
        efficiency1: request.efficiency,
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

/// MEMO専用: kintone同期せずローカルのみ保存
fn add_memo_local_only(request: AddScheduleRequest, state: State<'_, AppState>) -> Result<ApiResponse<i64>, ()> {
    let now = chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();
    let schedule = LocalSchedule {
        id: None,
        kintone_record_id: None,
        schedule_number: None,
        product_name: request.product_name,
        product_display_name: request.product_display_name,
        category: request.category,
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
        sync_status: "local_only".to_string(),
        created_at: now.clone(),
        updated_at: now,
    };

    let db = state.db.lock().unwrap();
    eprintln!("=== Saving MEMO to local DB only ===");
    match db.add_schedule(&schedule) {
        Ok(id) => {
            eprintln!("=== MEMO saved: id={} ===", id);
            Ok(ApiResponse {
                success: true,
                data: Some(id),
                error: None,
            })
        },
        Err(e) => {
            eprintln!("=== MEMO save error: {} ===", e);
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
        product_display_name: request.product_display_name,
        category: request.category,
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
        efficiency1: request.efficiency,
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
    
    // 日時の更新
    if let Some(ref start) = request.start_datetime {
        if let Err(e) = db.update_schedule_datetime(request.id, start, request.end_datetime.as_deref()) {
            return ApiResponse {
                success: false,
                data: None,
                error: Some(e.to_string()),
            };
        }
    }
    
    // notesの更新
    if let Some(ref notes) = request.notes {
        if let Err(e) = db.update_schedule_notes(request.id, notes) {
            return ApiResponse {
                success: false,
                data: None,
                error: Some(e.to_string()),
            };
        }
    }
    
    ApiResponse {
        success: true,
        data: Some(()),
        error: None,
    }
}

/// kintone設定を保存
#[tauri::command]
pub fn save_kintone_config(config: KintoneConfigRequest, state: State<AppState>) -> ApiResponse<()> {
    let kintone_config = KintoneConfig {
        subdomain: config.subdomain.clone(),
        app_id: config.app_id,
        api_token: config.api_token.clone(),
        memo_app_id: config.memo_app_id,
        memo_api_token: config.memo_api_token.clone(),
        yamazumi_app_id: config.yamazumi_app_id,
        yamazumi_api_token: config.yamazumi_api_token.clone(),
        kobukuro_app_id: config.kobukuro_app_id,
        kobukuro_api_token: config.kobukuro_api_token.clone(),
        tsumikomi_app_id: config.tsumikomi_app_id,
        tsumikomi_api_token: config.tsumikomi_api_token.clone(),
    };

    // 設定をJSONファイルに保存
    if let Some(config_dir) = dirs::data_local_dir() {
        let config_path = config_dir.join("production-scheduler").join("kintone_config.json");
        if let Ok(json) = serde_json::to_string_pretty(&kintone_config) {
            if let Err(e) = std::fs::write(&config_path, json) {
                eprintln!("設定ファイルの保存に失敗: {}", e);
            } else {
                eprintln!("設定を保存しました: {:?}", config_path);
            }
        }
    }

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
    
    // Hardcoded migration source (App 351)
    let migration_config = KintoneConfig {
        subdomain: "jfe-rockfiber".to_string(),
        app_id: 351,
        api_token: "xZ85wdaTlqTnSpOxvaLEJrR8E5pCaJaX0jDcdpd7".to_string(),
        memo_app_id: None,
        memo_api_token: None,
        yamazumi_app_id: None,
        yamazumi_api_token: None,
        kobukuro_app_id: None,
        kobukuro_api_token: None,
        tsumikomi_app_id: None,
        tsumikomi_api_token: None,
    };

    eprintln!("=== MIGRATION START: Fetching from App 351 ===");

    // 0. 既存データを全削除
    {
        let db = state.db.lock().unwrap();
        eprintln!("=== Clearing local database before fetch ===");
        if let Err(e) = db.delete_all_schedules() {
            eprintln!("Failed to clear database: {}", e);
            return Ok(ApiResponse { success: false, data: None, error: Some(e.to_string()) });
        }
    }

    // 1. App 351から取得
    let src_client = match KintoneClient::new(migration_config) {
        Ok(c) => c,
        Err(e) => return Ok(ApiResponse { success: false, data: None, error: Some(e.to_string()) }),
    };

    let mut all_records = Vec::new();

    // Limit to recent/active records if possible, but fetching all for now
    match src_client.get_records(None, false).await {
        Ok(json) => {
            if let Some(records) = json["records"].as_array() {
                eprintln!("=== App 351: Found {} records ===", records.len());
                all_records.extend(records.clone());
            }
        }
        Err(e) => {
            eprintln!("App 351 fetch error: {}", e);
            return Ok(ApiResponse { success: false, data: None, error: Some(e.to_string()) });
        }
    }

    {
        let records = all_records;
        eprintln!("=== Processing {} records for migration ===", records.len());

        let mut count = 0;
        let db = state.db.lock().unwrap();

        for (i, record) in records.iter().enumerate() {
            if i % 10 == 0 {
                eprintln!("Processing record {}/{}", i, records.len());
            }
            // Field mapping (Legacy 351 -> LocalSchedule)
            
            // Product Name: 製品名 (FS450K etc) or 製品名_アプリ (品番)
            let mut product_name = get_string_value(&record, "製品名");
            if product_name.is_empty() { product_name = get_string_value(&record, "製品名_アプリ"); }
            if product_name.is_empty() { continue; } // Skip invalid

            // Product Display Name: 品名
            let product_display_name = get_optional_string_value(&record, "品名");

            // Category: 分類 (ベーラー/小袋)
            let category = get_optional_string_value(&record, "分類");

            // Dates: 開始日時1, 総終了日時, 内終了日時1
            let start_datetime = get_string_value(&record, "開始日時1");
            
            let mut end_datetime = get_optional_string_value(&record, "総終了日時");
            if end_datetime.is_none() { end_datetime = get_optional_string_value(&record, "内終了日時1"); }

            // Status: 生産状況 (未生産 etc)
            let mut status = get_string_value(&record, "生産状況");
            if status.is_empty() { status = "未生産".to_string(); }

            // Quantity: 総個数 or 生産数量1
            let qty_val = get_number_value(&record, "総個数")
                .or(get_number_value(&record, "生産数量1"));
            
            // Notes: 製造備考 or 特記事項
            let mut notes = get_optional_string_value(&record, "製造備考");
            if notes.is_none() { notes = get_optional_string_value(&record, "特記事項"); }

            // Efficiency: 製綿能率1
            let efficiency = get_optional_string_value(&record, "製綿能率1");

            // Schedule Number: スケジュール番号
            let schedule_number = get_optional_string_value(&record, "スケジュール番号");

            let now = chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();

            let schedule = LocalSchedule {
                id: None,
                kintone_record_id: None, // Reset ID for migration (New record for 506)
                schedule_number: schedule_number,
                product_name: product_name.clone(),
                product_display_name: product_display_name,
                category: category,
                line: "".to_string(),
                start_datetime: start_datetime,
                end_datetime: end_datetime,
                quantity1: qty_val,
                quantity2: None, quantity3: None, quantity4: None, 
                quantity5: None, quantity6: None, quantity7: None, quantity8: None,
                total_quantity: None,
                efficiency1: efficiency,
                efficiency2: None, efficiency3: None, efficiency4: None,
                efficiency5: None, efficiency6: None, efficiency7: None, efficiency8: None,
                production_status: status,
                notes: notes,
                sync_status: "pending".to_string(), // Mark as pending to sync to 506
                created_at: now.clone(),
                updated_at: now,
            };

            // Don't use import_from_kintone (it checks kintone_id), use add_schedule directly
            if let Ok(_) = db.add_schedule(&schedule) {
                count += 1;
            }
        }
        
        eprintln!("=== Migrated {} records ===", count);
        Ok(ApiResponse {
            success: true,
            data: Some(count),
            error: None,
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
            let is_memo = schedule.product_name == "MMO" || schedule.product_name == "SHAP";
            
            let record = if is_memo {
                serde_json::json!({
                    "product_name": { "value": schedule.product_name },
                    "notes": { "value": schedule.notes.clone().unwrap_or_default() },
                    "start_datetime": { "value": schedule.start_datetime },
                    "end_datetime": { "value": schedule.end_datetime },
                    "production_status": { "value": schedule.production_status.clone() },
                })
            } else {
                serde_json::json!({
                    "product_name": { "value": schedule.product_name },
                    "start_datetime": { "value": schedule.start_datetime },
                    "end_datetime": { "value": schedule.end_datetime },
                    "quantity": { "value": schedule.quantity1.map(|v| v.to_string()) },
                    "status": { "value": schedule.production_status.clone() },
                    "製造備考": { "value": schedule.notes.clone().unwrap_or_default() },
                    "製綿能率": { "value": schedule.efficiency1.clone().unwrap_or_default() },
                })
            };

            if let Some(kintone_id) = schedule.kintone_record_id {
                if client.update_record(kintone_id, record, is_memo).await.is_ok() {
                    let db = state.db.lock().unwrap();
                    let _ = db.update_sync_status(schedule.id.unwrap(), "synced", Some(kintone_id));
                    synced_count += 1;
                }
            } else {
                if let Ok(new_id) = client.add_record(record, is_memo).await {
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
        // メモ/図形かどうかを判定するためにproduct_nameが必要
        // すでに削除済みかもしれないが、DBにはあるはず
        // ここでは簡単な判定として、DBから取得しておいた product_name (MMO/SHAP) を使うなどのロジックが必要だが
        // 現状の delete_scheduleシグネチャでは id しかわからないため
        // まずDBから取得する
        let product_name = {
            let db = state.db.lock().unwrap();
            db.get_product_name_for_schedule(id).ok().flatten().unwrap_or_default()
        };

        let is_memo = product_name == "MMO" || product_name == "SHAP";

        let client_opt = {
            let kintone = state.kintone_client.lock().unwrap();
            kintone.clone()
        };

        if let Some(client) = client_opt {
            if let Err(e) = client.delete_record(kintone_id, is_memo).await {
                eprintln!("Failed to delete from kintone: {}", e);
                // kintone削除失敗でもローカルは削除を進める（不整合防止のため）
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


/// 汎用kintoneレコード取得（アプリ名指定）
#[tauri::command]
pub async fn fetch_kintone_records(
    app_name: String,
    query: Option<String>,
    state: State<'_, AppState>
) -> Result<ApiResponse<serde_json::Value>, ()> {
    let client_opt = {
        let kintone = state.kintone_client.lock().unwrap();
        kintone.clone()
    };

    match client_opt {
        Some(client) => {
            match client.get_records_by_name(&app_name, query.as_deref()).await {
                Ok(json) => Ok(ApiResponse {
                    success: true,
                    data: Some(json),
                    error: None,
                }),
                Err(e) => Ok(ApiResponse {
                    success: false,
                    data: None,
                    error: Some(e.to_string()),
                })
            }
        },
        None => Ok(ApiResponse {
            success: false,
            data: None,
            error: Some("kintone設定が未設定です".into()),
        })
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



