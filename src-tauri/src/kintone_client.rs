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
}

/// 生産スケジュールレコード
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProductionRecord {
    pub record_number: Option<u32>,
    pub product_name: String,
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

    /// レコードを取得
    pub async fn get_records(&self, query: Option<&str>) -> Result<Vec<serde_json::Value>> {
        let url = format!("{}/records.json", self.base_url());
        
        let mut params = vec![
            ("app", self.config.app_id.to_string()),
        ];
        
        if let Some(q) = query {
            params.push(("query", q.to_string()));
        }

        let response = self.client
            .get(&url)
            .header("X-Cybozu-API-Token", &self.config.api_token)
            .query(&params)
            .send()
            .await?;

        let json: serde_json::Value = response.json().await?;
        
        Ok(json["records"]
            .as_array()
            .cloned()
            .unwrap_or_default())
    }

    /// レコードを追加
    pub async fn add_record(&self, record: serde_json::Value) -> Result<u32> {
        let url = format!("{}/record.json", self.base_url());
        
        let body = serde_json::json!({
            "app": self.config.app_id,
            "record": record
        });

        let response = self.client
            .post(&url)
            .header("X-Cybozu-API-Token", &self.config.api_token)
            .header(header::CONTENT_TYPE, "application/json")
            .json(&body)
            .send()
            .await?;

        let json: serde_json::Value = response.json().await?;
        
        Ok(json["id"].as_str().unwrap_or("0").parse().unwrap_or(0))
    }

    /// レコードを更新
    pub async fn update_record(&self, record_id: u32, record: serde_json::Value) -> Result<()> {
        let url = format!("{}/record.json", self.base_url());
        
        let body = serde_json::json!({
            "app": self.config.app_id,
            "id": record_id,
            "record": record
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
}
