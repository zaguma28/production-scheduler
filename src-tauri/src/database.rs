//! ローカルデータベースモジュール
//! SQLiteでスケジュールデータを管理

use rusqlite::{Connection, Result, params};
use serde::{Deserialize, Serialize};

/// ローカルスケジュールレコード
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LocalSchedule {
    pub id: Option<i64>,
    pub kintone_record_id: Option<u32>,
    pub schedule_number: Option<String>,
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
    pub efficiency1: Option<String>,  // 製綿能率1 (DROP_DOWN)
    pub efficiency2: Option<String>,  // 製綿能率2
    pub efficiency3: Option<String>,  // 製綿能率3
    pub efficiency4: Option<String>,  // 製綿能率4
    pub efficiency5: Option<String>,  // 製綿能率5
    pub efficiency6: Option<String>,  // 製綿能率6
    pub efficiency7: Option<String>,  // 製綿能率7
    pub efficiency8: Option<String>,  // 製綿能率8
    pub production_status: String,
    pub notes: Option<String>,
    pub sync_status: String,
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
                schedule_number TEXT,
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
                efficiency1 TEXT,
                efficiency2 TEXT,
                efficiency3 TEXT,
                efficiency4 TEXT,
                efficiency5 TEXT,
                efficiency6 TEXT,
                efficiency7 TEXT,
                efficiency8 TEXT,
                production_status TEXT DEFAULT '予定',
                notes TEXT,
                sync_status TEXT DEFAULT 'pending',
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )",
            [],
        )?;

        // 既存テーブルにカラム追加（エラーは無視）
        let _ = self.conn.execute("ALTER TABLE schedules ADD COLUMN schedule_number TEXT", []);
        let _ = self.conn.execute("ALTER TABLE schedules ADD COLUMN efficiency1 TEXT", []);
        let _ = self.conn.execute("ALTER TABLE schedules ADD COLUMN efficiency2 TEXT", []);
        let _ = self.conn.execute("ALTER TABLE schedules ADD COLUMN efficiency3 TEXT", []);
        let _ = self.conn.execute("ALTER TABLE schedules ADD COLUMN efficiency4 TEXT", []);
        let _ = self.conn.execute("ALTER TABLE schedules ADD COLUMN efficiency5 TEXT", []);
        let _ = self.conn.execute("ALTER TABLE schedules ADD COLUMN efficiency6 TEXT", []);
        let _ = self.conn.execute("ALTER TABLE schedules ADD COLUMN efficiency7 TEXT", []);
        let _ = self.conn.execute("ALTER TABLE schedules ADD COLUMN efficiency8 TEXT", []);

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

    /// 採番を生成（MMDDYY_XXX形式、日毎リセット）
    pub fn generate_schedule_number(&self) -> Result<String> {
        use chrono::Local;
        
        let now = Local::now();
        let date_prefix = now.format("%m%d%y").to_string();  // MMDDYY形式
        
        // 今日の日付プレフィックスで始まるスケジュール番号をカウント
        let mut stmt = self.conn.prepare(
            "SELECT COUNT(*) FROM schedules WHERE schedule_number LIKE ?1"
        )?;
        let pattern = format!("{}_%%", date_prefix);
        let count: i32 = stmt.query_row([pattern], |row| row.get(0))?;
        
        // 連番は001から開始（3桁、ゼロ埋め）
        let seq = count + 1;
        let schedule_number = format!("{}_{:03}", date_prefix, seq);
        
        Ok(schedule_number)
    }

    /// スケジュールを追加（自動採番）
    pub fn add_schedule(&self, schedule: &LocalSchedule) -> Result<i64> {
        // 採番を生成
        let schedule_number = if schedule.schedule_number.is_none() {
            Some(self.generate_schedule_number()?)
        } else {
            schedule.schedule_number.clone()
        };
        
        self.conn.execute(
            "INSERT INTO schedules (
                kintone_record_id, schedule_number, product_name, line, start_datetime, end_datetime,
                quantity1, quantity2, quantity3, quantity4, quantity5, quantity6, quantity7, quantity8,
                total_quantity, efficiency1, efficiency2, efficiency3, efficiency4, efficiency5, efficiency6, efficiency7, efficiency8,
                production_status, notes, sync_status, created_at, updated_at
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21, ?22, ?23, ?24, ?25, ?26, ?27, ?28)",
            params![
                schedule.kintone_record_id,
                schedule_number,
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
                schedule.efficiency1,
                schedule.efficiency2,
                schedule.efficiency3,
                schedule.efficiency4,
                schedule.efficiency5,
                schedule.efficiency6,
                schedule.efficiency7,
                schedule.efficiency8,
                schedule.production_status,
                schedule.notes,
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
            "SELECT id, kintone_record_id, schedule_number, product_name, line, start_datetime, end_datetime,
                    quantity1, quantity2, quantity3, quantity4, quantity5, quantity6, quantity7, quantity8,
                    total_quantity, efficiency1, efficiency2, efficiency3, efficiency4, efficiency5, efficiency6, efficiency7, efficiency8,
                    production_status, notes, sync_status, created_at, updated_at
             FROM schedules ORDER BY start_datetime"
        )?;

        let schedules = stmt.query_map([], |row| {
            Ok(LocalSchedule {
                id: row.get(0)?,
                kintone_record_id: row.get(1)?,
                schedule_number: row.get(2)?,
                product_name: row.get(3)?,
                line: row.get(4)?,
                start_datetime: row.get(5)?,
                end_datetime: row.get(6)?,
                quantity1: row.get(7)?,
                quantity2: row.get(8)?,
                quantity3: row.get(9)?,
                quantity4: row.get(10)?,
                quantity5: row.get(11)?,
                quantity6: row.get(12)?,
                quantity7: row.get(13)?,
                quantity8: row.get(14)?,
                total_quantity: row.get(15)?,
                efficiency1: row.get(16)?,
                efficiency2: row.get(17)?,
                efficiency3: row.get(18)?,
                efficiency4: row.get(19)?,
                efficiency5: row.get(20)?,
                efficiency6: row.get(21)?,
                efficiency7: row.get(22)?,
                efficiency8: row.get(23)?,
                production_status: row.get(24)?,
                notes: row.get(25)?,
                sync_status: row.get(26)?,
                created_at: row.get(27)?,
                updated_at: row.get(28)?,
            })
        })?;

        schedules.collect()
    }

    /// 同期待ちスケジュールを取得
    pub fn get_pending_schedules(&self) -> Result<Vec<LocalSchedule>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, kintone_record_id, schedule_number, product_name, line, start_datetime, end_datetime,
                    quantity1, quantity2, quantity3, quantity4, quantity5, quantity6, quantity7, quantity8,
                    total_quantity, efficiency1, efficiency2, efficiency3, efficiency4, efficiency5, efficiency6, efficiency7, efficiency8,
                    production_status, notes, sync_status, created_at, updated_at
             FROM schedules WHERE sync_status = 'pending' OR sync_status = 'modified'"
        )?;

        let schedules = stmt.query_map([], |row| {
            Ok(LocalSchedule {
                id: row.get(0)?,
                kintone_record_id: row.get(1)?,
                schedule_number: row.get(2)?,
                product_name: row.get(3)?,
                line: row.get(4)?,
                start_datetime: row.get(5)?,
                end_datetime: row.get(6)?,
                quantity1: row.get(7)?,
                quantity2: row.get(8)?,
                quantity3: row.get(9)?,
                quantity4: row.get(10)?,
                quantity5: row.get(11)?,
                quantity6: row.get(12)?,
                quantity7: row.get(13)?,
                quantity8: row.get(14)?,
                total_quantity: row.get(15)?,
                efficiency1: row.get(16)?,
                efficiency2: row.get(17)?,
                efficiency3: row.get(18)?,
                efficiency4: row.get(19)?,
                efficiency5: row.get(20)?,
                efficiency6: row.get(21)?,
                efficiency7: row.get(22)?,
                efficiency8: row.get(23)?,
                production_status: row.get(24)?,
                notes: row.get(25)?,
                sync_status: row.get(26)?,
                created_at: row.get(27)?,
                updated_at: row.get(28)?,
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

    /// スケジュールを削除
    pub fn delete_schedule(&self, id: i64) -> Result<()> {
        self.conn.execute(
            "DELETE FROM schedules WHERE id = ?1",
            params![id],
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

    /// kintoneからのデータをインポート（存在すれば更新、なければ追加）
    pub fn import_from_kintone(&self, schedule: &LocalSchedule) -> Result<()> {
        let exists: bool = if let Some(kid) = schedule.kintone_record_id {
            let mut stmt = self.conn.prepare("SELECT EXISTS(SELECT 1 FROM schedules WHERE kintone_record_id = ?)")?;
            stmt.query_row([kid], |row| row.get(0))?
        } else {
            false
        };

        if exists {
            self.conn.execute(
                "UPDATE schedules SET
                    schedule_number = ?1, product_name = ?2, line = ?3, start_datetime = ?4, end_datetime = ?5,
                    quantity1 = ?6, quantity2 = ?7, quantity3 = ?8, quantity4 = ?9, quantity5 = ?10, quantity6 = ?11, quantity7 = ?12, quantity8 = ?13,
                    total_quantity = ?14, efficiency1 = ?15, efficiency2 = ?16, efficiency3 = ?17, efficiency4 = ?18, efficiency5 = ?19, efficiency6 = ?20, efficiency7 = ?21, efficiency8 = ?22,
                    production_status = ?23, notes = ?24, sync_status = 'synced', updated_at = datetime('now')
                WHERE kintone_record_id = ?25",
                params![
                    schedule.schedule_number, schedule.product_name, schedule.line, schedule.start_datetime, schedule.end_datetime,
                    schedule.quantity1, schedule.quantity2, schedule.quantity3, schedule.quantity4, schedule.quantity5, schedule.quantity6, schedule.quantity7, schedule.quantity8,
                    schedule.total_quantity, schedule.efficiency1, schedule.efficiency2, schedule.efficiency3, schedule.efficiency4, schedule.efficiency5, schedule.efficiency6, schedule.efficiency7, schedule.efficiency8,
                    schedule.production_status, schedule.notes, schedule.kintone_record_id
                ],
            )?;
        } else {
            self.conn.execute(
                "INSERT INTO schedules (
                    kintone_record_id, schedule_number, product_name, line, start_datetime, end_datetime,
                    quantity1, quantity2, quantity3, quantity4, quantity5, quantity6, quantity7, quantity8,
                    total_quantity, efficiency1, efficiency2, efficiency3, efficiency4, efficiency5, efficiency6, efficiency7, efficiency8,
                    production_status, notes, sync_status, created_at, updated_at
                ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21, ?22, ?23, ?24, ?25, 'synced', datetime('now'), datetime('now'))",
                params![
                    schedule.kintone_record_id,
                    schedule.schedule_number,
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
                    schedule.efficiency1,
                    schedule.efficiency2,
                    schedule.efficiency3,
                    schedule.efficiency4,
                    schedule.efficiency5,
                    schedule.efficiency6,
                    schedule.efficiency7,
                    schedule.efficiency8,
                    schedule.production_status,
                    schedule.notes
                ],
            )?;
        }
        Ok(())
    }
}

