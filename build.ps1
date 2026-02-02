# 生産計画スケジューラー ビルドスクリプト
# 使い方: .\build.ps1 -Mode admin|worker|all

param(
    [Parameter(Mandatory=$false)]
    [ValidateSet("admin", "worker", "all")]
    [string]$Mode = "all"
)

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

function Build-Admin {
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host "管理者版をビルド中..." -ForegroundColor Cyan
    Write-Host "========================================" -ForegroundColor Cyan
    
    # tauri.conf.jsonを管理者用に置換
    Copy-Item "src-tauri\tauri.admin.conf.json" "src-tauri\tauri.conf.json" -Force
    
    # 管理者モードでビルド
    Set-Location "src-tauri"
    cargo build --release --no-default-features --features admin-mode
    Set-Location ..
    
    # ビルド成果物をリネーム
    $exePath = "src-tauri\target\release\production-scheduler.exe"
    $adminExePath = "dist\production-scheduler-admin.exe"
    
    if (-not (Test-Path "dist")) { New-Item -ItemType Directory -Path "dist" }
    if (Test-Path $exePath) {
        Copy-Item $exePath $adminExePath -Force
        Write-Host "✅ 管理者版: $adminExePath" -ForegroundColor Green
    }
}

function Build-Worker {
    Write-Host "========================================" -ForegroundColor Yellow
    Write-Host "作業者版をビルド中..." -ForegroundColor Yellow
    Write-Host "========================================" -ForegroundColor Yellow
    
    # tauri.conf.jsonを作業者用に置換
    Copy-Item "src-tauri\tauri.worker.conf.json" "src-tauri\tauri.conf.json" -Force
    
    # 作業者モードでビルド
    Set-Location "src-tauri"
    cargo build --release --no-default-features --features worker-mode
    Set-Location ..
    
    # ビルド成果物をリネーム
    $exePath = "src-tauri\target\release\production-scheduler.exe"
    $workerExePath = "dist\production-scheduler-worker.exe"
    
    if (-not (Test-Path "dist")) { New-Item -ItemType Directory -Path "dist" }
    if (Test-Path $exePath) {
        Copy-Item $exePath $workerExePath -Force
        Write-Host "✅ 作業者版: $workerExePath" -ForegroundColor Green
    }
}

switch ($Mode) {
    "admin" { Build-Admin }
    "worker" { Build-Worker }
    "all" {
        Build-Admin
        Build-Worker
        Write-Host ""
        Write-Host "========================================" -ForegroundColor Magenta
        Write-Host "全ビルド完了！" -ForegroundColor Magenta
        Write-Host "dist\production-scheduler-admin.exe  - 管理者用" -ForegroundColor Magenta
        Write-Host "dist\production-scheduler-worker.exe - 作業者用" -ForegroundColor Magenta
        Write-Host "========================================" -ForegroundColor Magenta
    }
}
