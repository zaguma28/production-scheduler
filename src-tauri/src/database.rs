//! ローカルデータベースモジュール
//! SQLiteでスケジュールデータを管理

use rusqlite::{Connection, Result, params};
use serde::{Deserialize, Serialize};
use chrono::{DateTime, Utc};

/// ローカルスケジュールレコード
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LocalSchedule {
    pub id: Option<i64>,
    pub kintone_record_id: Option<u32>,
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
    pub production_status: String,
    pub sync_status: String, // "pending", "synced", "modified"
    pub created_at: String,
    pub updated_at: String,
}

/// データベース管理
pub struct Database {
    conn: Connection,
}

impl Database {
    /// データベースを開く（なければ作成）
    pub fn open(db_path: &str) -> Result<Self> {
        let conn = Connection::open(db_path)?;
        let db = Self { conn };
        db.init_tables()?;
        Ok(db)
    }

    /// テーブルを初期化
    fn init_tables(&self) -> Result<()> {
        self.conn.execute(
            "CREATE TABLE IF NOT EXISTS schedules (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                kintone_record_id INTEGER,
                product_name TEXT NOT NULL,
                line TEXT NOT NULL,
                start_datetime TEXT NOT NULL,
                end_datetime TEXT,
                quantity1 REAL,
                quantity2 REAL,
                quantity3 REAL,
                quantity4 REAL,
                quantity5 REAL,
                quantity6 REAL,
                quantity7 REAL,
                quantity8 REAL,
                total_quantity REAL,
                production_status TEXT DEFAULT '予定',
                sync_status TEXT DEFAULT 'pending',
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )",
            [],
        )?;

        self.conn.execute(
            "CREATE TABLE IF NOT EXISTS kintone_config (
                id INTEGER PRIMARY KEY,
                subdomain TEXT NOT NULL,
                app_id INTEGER NOT NULL,
                api_token TEXT NOT NULL
            )",
            [],
        )?;

        self.conn.execute(
            "CREATE TABLE IF NOT EXISTS product_master (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                product_name TEXT NOT NULL UNIQUE,
                weight_kg REAL NOT NULL
            )",
            [],
        )?;

        // 製品マスタの初期データ
        let products = vec![
            ("FS450D", 450.0), ("FS450K", 450.0), ("FS450NR", 450.0), ("FS450S", 450.0),
            ("FS250C", 250.0), ("FS250CE", 250.0),
            ("FS360F", 360.0),
            ("FS021B", 20.0), ("FS021F", 20.0), ("FS021P", 20.0), ("FS021NR", 20.0),
            ("FS021", 20.0), ("FS021S", 20.0), ("FS021PF", 20.0), ("FS021PS", 20.0),
            ("FS021EMF", 20.0), ("FS021EMS", 20.0), ("FS021NRF", 20.0), ("FS021NRS", 20.0),
            ("小袋", 20.0),
        ];

        for (name, weight) in products {
            let _ = self.conn.execute(
                "INSERT OR IGNORE INTO product_master (product_name, weight_kg) VALUES (?1, ?2)",
                params![name, weight],
            );
        }

        Ok(())
    }

    /// スケジュールを追加
    pub fn add_schedule(&self, schedule: &LocalSchedule) -> Result<i64> {
        self.conn.execute(
            "INSERT INTO schedules (
                kintone_record_id, product_name, line, start_datetime, end_datetime,
                quantity1, quantity2, quantity3, quantity4, quantity5, quantity6, quantity7, quantity8,
                total_quantity, production_status, sync_status, created_at, updated_at
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18)",
            params![
                schedule.kintone_record_id,
                schedule.product_name,
                schedule.line,
                schedule.start_datetime,
                schedule.end_datetime,
                schedule.quantity1,
                schedule.quantity2,
                schedule.quantity3,
                schedule.quantity4,
                schedule.quantity5,
                schedule.quantity6,
                schedule.quantity7,
                schedule.quantity8,
                schedule.total_quantity,
                schedule.production_status,
                schedule.sync_status,
                schedule.created_at,
                schedule.updated_at,
            ],
        )?;
        Ok(self.conn.last_insert_rowid())
    }

    /// すべてのスケジュールを取得
    pub fn get_all_schedules(&self) -> Result<Vec<LocalSchedule>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, kintone_record_id, product_name, line, start_datetime, end_datetime,
                    quantity1, quantity2, quantity3, quantity4, quantity5, quantity6, quantity7, quantity8,
                    total_quantity, production_status, sync_status, created_at, updated_at
             FROM schedules ORDER BY start_datetime"
        )?;
        
        let schedules = stmt.query_map([], |row| {
            Ok(LocalSchedule {
                id: row.get(0)?,
                kintone_record_id: row.get(1)?,
                product_name: row.get(2)?,
                line: row.get(3)?,
                start_datetime: row.get(4)?,
                end_datetime: row.get(5)?,
                quantity1: row.get(6)?,
                quantity2: row.get(7)?,
                quantity3: row.get(8)?,
                quantity4: row.get(9)?,
                quantity5: row.get(10)?,
                quantity6: row.get(11)?,
                quantity7: row.get(12)?,
                quantity8: row.get(13)?,
                total_quantity: row.get(14)?,
                production_status: row.get(15)?,
                sync_status: row.get(16)?,
                created_at: row.get(17)?,
                updated_at: row.get(18)?,
            })
        })?;

        schedules.collect()
    }

    /// 同期待ちスケジュールを取得
    pub fn get_pending_schedules(&self) -> Result<Vec<LocalSchedule>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, kintone_record_id, product_name, line, start_datetime, end_datetime,
                    quantity1, quantity2, quantity3, quantity4, quantity5, quantity6, quantity7, quantity8,
                    total_quantity, production_status, sync_status, created_at, updated_at
             FROM schedules WHERE sync_status = 'pending' OR sync_status = 'modified'"
        )?;
        
        let schedules = stmt.query_map([], |row| {
            Ok(LocalSchedule {
                id: row.get(0)?,
                kintone_record_id: row.get(1)?,
                product_name: row.get(2)?,
                line: row.get(3)?,
                start_datetime: row.get(4)?,
                end_datetime: row.get(5)?,
                quantity1: row.get(6)?,
                quantity2: row.get(7)?,
                quantity3: row.get(8)?,
                quantity4: row.get(9)?,
                quantity5: row.get(10)?,
                quantity6: row.get(11)?,
                quantity7: row.get(12)?,
                quantity8: row.get(13)?,
                total_quantity: row.get(14)?,
                production_status: row.get(15)?,
                sync_status: row.get(16)?,
                created_at: row.get(17)?,
                updated_at: row.get(18)?,
            })
        })?;

        schedules.collect()
    }

    /// 同期ステータスを更新
    pub fn update_sync_status(&self, id: i64, status: &str, kintone_id: Option<u32>) -> Result<()> {
        self.conn.execute(
            "UPDATE schedules SET sync_status = ?1, kintone_record_id = ?2, updated_at = datetime('now') WHERE id = ?3",
            params![status, kintone_id, id],
        )?;
        Ok(())
    }

    /// 製品の重量を取得
    pub fn get_product_weight(&self, product_name: &str) -> Result<Option<f64>> {
        let mut stmt = self.conn.prepare(
            "SELECT weight_kg FROM product_master WHERE product_name = ?1"
        )?;
        
        let weight: Option<f64> = stmt.query_row(params![product_name], |row| row.get(0)).ok();
        Ok(weight)
    }

    /// スケジュールの日時を更新
    pub fn update_schedule_datetime(&self, id: i64, start: &str, end: Option<&str>) -> Result<()> {
        self.conn.execute(
            "UPDATE schedules SET start_datetime = ?1, end_datetime = ?2, sync_status = 'modified', updated_at = datetime('now') WHERE id = ?3",
            params![start, end, id],
        )?;
        Ok(())
    }
}
