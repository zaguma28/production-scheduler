//! kintone API クライアントモジュール
//! kintoneとの双方向連携を実現

use reqwest::{Client, header};
use serde::{Deserialize, Serialize};
use anyhow::Result;
use chrono::{DateTime, Utc};

/// kintone接続設定
#[derive(Clone, Debug, Serialize, Deserialize)]

pub struct KintoneConfig {
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

/// 生産スケジュールレコード
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProductionRecord {
    pub record_number: Option<u32>,
    pub product_name: String,
    pub product_display_name: Option<String>,
    pub category: Option<String>,
    pub start_datetime: DateTime<Utc>,
    pub end_datetime: Option<DateTime<Utc>>,
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
    pub line: Option<String>,
}

/// kintone APIクライアント
#[derive(Clone)]
pub struct KintoneClient {
    client: Client,
    config: KintoneConfig,
}

impl KintoneClient {
    /// 新しいクライアントを作成
    pub fn new(config: KintoneConfig) -> Result<Self> {
        let client = Client::builder()
            .build()?;

        Ok(Self { client, config })
    }

    /// kintoneのベースURL
    fn base_url(&self) -> String {
        format!("https://{}.cybozu.com/k/v1", self.config.subdomain)
    }

    /// 対象のアプリIDとトークンを取得
    pub fn get_app_credentials(&self, is_memo: bool) -> (u32, String) {
        if is_memo {
            (
                self.config.memo_app_id.unwrap_or(self.config.app_id),
                self.config.memo_api_token.clone().unwrap_or(self.config.api_token.clone())
            )
        } else {
            (self.config.app_id, self.config.api_token.clone())
        }
    }

    /// レコードを取得
    pub async fn get_records(&self, query: Option<&str>, is_memo: bool) -> Result<serde_json::Value> {
        let url = format!("{}/records.json", self.base_url());
        let (app_id, api_token) = self.get_app_credentials(is_memo);

        let mut params = vec![
            ("app", app_id.to_string()),
        ];

        if let Some(q) = query {
            params.push(("query", q.to_string()));
        }

        let response = self.client
            .get(&url)
            .header("X-Cybozu-API-Token", &api_token)
            .query(&params)
            .send()
            .await?;

        let status = response.status();
        let text = response.text().await?;
        
        eprintln!("=== kintone API Response ===");
        eprintln!("Status: {}", status);
        eprintln!("Body: {}", &text[..text.len().min(2000)]);
        eprintln!("============================");

        let json: serde_json::Value = serde_json::from_str(&text)?;

        Ok(json)
    }

    /// レコードを追加
    pub async fn add_record(&self, record: serde_json::Value, is_memo: bool) -> Result<u32> {
        let url = format!("{}/record.json", self.base_url());
        let (app_id, api_token) = self.get_app_credentials(is_memo);

        let body = serde_json::json!({
            "app": app_id,
            "record": record
        });

        eprintln!("=== kintone add_record request ===");
        eprintln!("URL: {}", url);
        eprintln!("Body: {}", serde_json::to_string_pretty(&body).unwrap_or_default());

        let response = self.client
            .post(&url)
            .header("X-Cybozu-API-Token", &api_token)
            .header(header::CONTENT_TYPE, "application/json")
            .json(&body)
            .send()
            .await?;

        let status = response.status();
        let text = response.text().await?;
        
        eprintln!("=== kintone add_record response ===");
        eprintln!("Status: {}", status);
        eprintln!("Body: {}", text);

        if !status.is_success() {
            return Err(anyhow::anyhow!("kintone API error: {} - {}", status, text));
        }

        let json: serde_json::Value = serde_json::from_str(&text)?;
        let id = json["id"].as_str().unwrap_or("0").parse().unwrap_or(0);
        
        eprintln!("=== Created record ID: {} ===", id);
        Ok(id)
    }

    /// レコードを更新
    pub async fn update_record(&self, record_id: u32, record: serde_json::Value, is_memo: bool) -> Result<()> {
        let url = format!("{}/record.json", self.base_url());
        let (app_id, api_token) = self.get_app_credentials(is_memo);

        let body = serde_json::json!({
            "app": app_id,
            "id": record_id,
            "record": record
        });

        self.client
            .put(&url)
            .header("X-Cybozu-API-Token", &api_token)
            .header(header::CONTENT_TYPE, "application/json")
            .json(&body)
            .send()
            .await?;

        Ok(())
    }

    /// 複数レコードを一括更新
    pub async fn update_records(&self, records: Vec<serde_json::Value>) -> Result<()> {
        let url = format!("{}/records.json", self.base_url());

        let body = serde_json::json!({
            "app": self.config.app_id,
            "records": records
        });

        self.client
            .put(&url)
            .header("X-Cybozu-API-Token", &self.config.api_token)
            .header(header::CONTENT_TYPE, "application/json")
            .json(&body)
            .send()
            .await?;

        Ok(())
    }

    /// 単一レコードを取得
    pub async fn get_record(&self, record_id: u32) -> Result<serde_json::Value> {
        let url = format!("{}/record.json", self.base_url());

        let response = self.client
            .get(&url)
            .header("X-Cybozu-API-Token", &self.config.api_token)
            .query(&[
                ("app", self.config.app_id.to_string()),
                ("id", record_id.to_string()),
            ])
            .send()
            .await?;    let json: serde_json::Value = response.json().await?;
        Ok(json)
    }

    /// レコードを削除
    pub async fn delete_record(&self, record_id: u32, is_memo: bool) -> Result<()> {
        let url = format!("{}/records.json", self.base_url());
        let (app_id, api_token) = self.get_app_credentials(is_memo);

        let body = serde_json::json!({
            "app": app_id,
            "ids": [record_id]
        });

        eprintln!("=== kintone delete_record request ===");
        eprintln!("URL: {}", url);
        eprintln!("Body: {}", serde_json::to_string_pretty(&body).unwrap());

        let response = self.client
            .delete(&url)
            .header("X-Cybozu-API-Token", &api_token)
            .header(reqwest::header::CONTENT_TYPE, "application/json")
            .json(&body)
            .send()
            .await?;

        let status = response.status();
        let text = response.text().await?;
        eprintln!("=== kintone delete_record response ===");
        eprintln!("Status: {}", status);
        eprintln!("Body: {}", text);

        if status.is_success() {
            Ok(())
        } else {
            Err(anyhow::anyhow!("Delete failed: {}", text))
        }
    }

    /// 名前指定でアプリ認証情報を取得
    pub fn get_app_credentials_by_name(&self, name: &str) -> Option<(u32, String)> {
        match name {
            "main" | "schedule" => Some((self.config.app_id, self.config.api_token.clone())),
            "memo" => Some((
                self.config.memo_app_id.unwrap_or(0),
                self.config.memo_api_token.clone().unwrap_or_default()
            )),
            "yamazumi" => Some((
                self.config.yamazumi_app_id.unwrap_or(354),
                self.config.yamazumi_api_token.clone().unwrap_or_default()
            )),
            "kobukuro" => Some((
                self.config.kobukuro_app_id.unwrap_or(368),
                self.config.kobukuro_api_token.clone().unwrap_or_default()
            )),
            "tsumikomi" => Some((
                self.config.tsumikomi_app_id.unwrap_or(514),
                self.config.tsumikomi_api_token.clone().unwrap_or_default()
            )),
            _ => None
        }
    }

    /// 名前指定でレコード取得（汎用）
    pub async fn get_records_by_name(&self, app_name: &str, query: Option<&str>) -> Result<serde_json::Value> {
        let (app_id, api_token) = self.get_app_credentials_by_name(app_name)
            .ok_or_else(|| anyhow::anyhow!("Unknown app: {}", app_name))?;

        if api_token.is_empty() {
            return Err(anyhow::anyhow!("APIトークンが未設定: {}", app_name));
        }

        let url = format!("{}/records.json", self.base_url());
        let mut params = vec![("app", app_id.to_string())];
        if let Some(q) = query {
            params.push(("query", q.to_string()));
        }

        let response = self.client
            .get(&url)
            .header("X-Cybozu-API-Token", &api_token)
            .query(&params)
            .send()
            .await?;

        let status = response.status();
        let text = response.text().await?;

        eprintln!("=== kintone get_records_by_name({}) ===", app_name);
        eprintln!("Status: {}", status);
        eprintln!("Body: {}", &text[..text.len().min(500)]);

        if !status.is_success() {
            return Err(anyhow::anyhow!("kintone API error ({}): {} - {}", app_name, status, text));
        }

        let json: serde_json::Value = serde_json::from_str(&text)?;
        Ok(json)
    }

    /// ID354（山積表）またはID368（小袋実績）に送信
    /// スケジュール番号で検索し、未生産なら更新、なければ新規作成
    pub async fn sync_to_yamazumi_or_kobukuro(
        &self,
        schedule_number: &str,
        record_data: serde_json::Value,
        is_kobukuro: bool, // true=ID368, false=ID354
    ) -> Result<()> {
        let (app_id, api_token) = if is_kobukuro {
            (
                self.config.kobukuro_app_id.unwrap_or(368),
                self.config.kobukuro_api_token.clone().unwrap_or_default()
            )
        } else {
            (
                self.config.yamazumi_app_id.unwrap_or(354),
                self.config.yamazumi_api_token.clone().unwrap_or_default()
            )
        };

        if api_token.is_empty() {
            return Err(anyhow::anyhow!("APIトークンが設定されていません"));
        }

        // スケジュール番号で検索
        let query = format!("スケジュール番号 = \"{}\"", schedule_number);
        let search_url = format!("{}/records.json", self.base_url());
        
        let response = self.client
            .get(&search_url)
            .header("X-Cybozu-API-Token", &api_token)
            .query(&[
                ("app", app_id.to_string()),
                ("query", query),
            ])
            .send()
            .await?;

        let json: serde_json::Value = response.json().await?;
        let empty_vec = vec![];
        let records = json["records"].as_array().unwrap_or(&empty_vec);

        if let Some(existing_record) = records.first() {
            // 既存レコードがある場合
            let record_id = existing_record["レコード番号"]["value"]
                .as_str()
                .and_then(|s| s.parse::<u32>().ok())
                .ok_or_else(|| anyhow::anyhow!("レコードIDの取得に失敗"))?;

            let status = existing_record["生産状況"]["value"].as_str().unwrap_or("");

            if status == "未生産" {
                // 未生産なら更新
                let update_url = format!("{}/record.json", self.base_url());
                let body = serde_json::json!({
                    "app": app_id,
                    "id": record_id,
                    "record": record_data
                });

                eprintln!("=== Updating {} record: {} ===", if is_kobukuro { "ID368" } else { "ID354" }, record_id);

                let response = self.client
                    .put(&update_url)
                    .header("X-Cybozu-API-Token", &api_token)
                    .header(header::CONTENT_TYPE, "application/json")
                    .json(&body)
                    .send()
                    .await?;

                if !response.status().is_success() {
                    let text = response.text().await?;
                    return Err(anyhow::anyhow!("更新に失敗しました: {}", text));
                }

                eprintln!("=== Updated successfully ===");
            } else {
                eprintln!("=== Skipped (status: {}) ===", status);
            }
        } else {
            // 既存レコードがない場合は新規作成
            let add_url = format!("{}/record.json", self.base_url());
            let body = serde_json::json!({
                "app": app_id,
                "record": record_data
            });

            eprintln!("=== Adding new {} record ===", if is_kobukuro { "ID368" } else { "ID354" });

            let response = self.client
                .post(&add_url)
                .header("X-Cybozu-API-Token", &api_token)
                .header(header::CONTENT_TYPE, "application/json")
                .json(&body)
                .send()
                .await?;

            if !response.status().is_success() {
                let text = response.text().await?;
                return Err(anyhow::anyhow!("新規作成に失敗しました: {}", text));
            }

            eprintln!("=== Added successfully ===");
        }

        Ok(())
    }
}

