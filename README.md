# 生産計画スケジューラー

kintone連携対応のデスクトップ生産計画管理アプリケーション

## 機能

- **ガントチャート表示**: 日別・ライン別の生産スケジュール可視化
- **スケジュール管理**: 生産予定の追加・編集・削除
- **自動計算**: 製品重量と製綿能率から終了時刻を自動計算
- **kintone双方向連携**:
  - kintoneからスケジュールを取得
  - 作成したスケジュールをkintoneへ送信
  - 生産状況（生産中・完了など）の更新反映
- **ローカルDB**: オフラインでも作業可能

## 技術スタック

- **バックエンド**: Rust + Tauri 2.0
- **フロントエンド**: HTML/CSS/JavaScript
- **データベース**: SQLite (rusqlite)
- **API連携**: reqwest (HTTP Client)

## セットアップ

### 必要条件

- Rust 1.70以上
- Node.js 18以上
- npm

### インストール

```powershell
cd production-scheduler
npm install
```

### 開発モードで実行

```powershell
npm run tauri dev
```

### ビルド（exe作成）

```powershell
npm run tauri build
```

ビルド後、`src-tauri/target/release/production-scheduler.exe` が生成されます。

## 使い方

1. **初回設定**: 右上の ⚙️ ボタンからkintone接続設定を行う
   - サブドメイン: お使いのkintoneサブドメイン
   - アプリID: 351 (生産計画アプリ)
   - APIトークン: kintoneで発行したAPIトークン

2. **スケジュール作成**: 「新規追加」タブからスケジュールを登録

3. **kintone同期**: 
   - 「kintoneから取得」: kintoneの最新データを取得
   - 「kintoneへ送信」: 作成したスケジュールをkintoneに送信

## ディレクトリ構成

```
production-scheduler/
├── src/                    # フロントエンド
│   ├── index.html
│   ├── styles.css
│   └── main.js
├── src-tauri/             # Rustバックエンド
│   ├── src/
│   │   ├── lib.rs         # メインエントリ
│   │   ├── commands.rs    # Tauriコマンド
│   │   ├── database.rs    # SQLite操作
│   │   └── kintone_client.rs  # kintone API
│   └── Cargo.toml
└── package.json
```

## kintoneフィールド対応

| アプリフィールド | ローカルDB |
|----------------|-----------|
| 製品名 | product_name |
| 開始日時1 | start_datetime |
| 総終了日時 | end_datetime |
| 生産数量1-8 | quantity1-8 |
| 総個数 | total_quantity |
| ライン名 | line |

## ライセンス

MIT License
