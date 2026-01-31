// 生産計画スケジューラー - メインJavaScript
const { invoke } = window.__TAURI__.core;

// 製品重量マスタ
const productWeights = {
    "FS450D": 450, "FS450K": 450, "FS450NR": 450, "FS450S": 450,
    "FS250C": 250, "FS250CE": 250,
    "FS360F": 360,
    "FS021B": 20, "FS021F": 20, "FS021P": 20, "FS021NR": 20, "FS021": 20, 
    "FS021S": 20, "FS021PF": 20, "FS021PS": 20,
    "FS021EMF": 20, "FS021EMS": 20, "FS021NRF": 20, "FS021NRS": 20, 
    "小袋": 20
};

// アプリケーション状態
let schedules = [];
let currentDate = new Date();

// DOM要素
const elements = {};

// 初期化
document.addEventListener("DOMContentLoaded", async () => {
    initElements();
    initEventListeners();
    await loadSchedules();
    updateGanttDate();
    renderGantt();
    setStatus("準備完了");
});

// DOM要素の初期化
function initElements() {
    elements.tabs = document.querySelectorAll(".tab");
    elements.views = document.querySelectorAll(".view");
    elements.ganttDate = document.getElementById("gantt-date");
    elements.prevDate = document.getElementById("prev-date");
    elements.nextDate = document.getElementById("next-date");
    elements.scheduleTbody = document.getElementById("schedule-tbody");
    elements.addForm = document.getElementById("add-schedule-form");
    elements.settingsModal = document.getElementById("settings-modal");
    elements.settingsForm = document.getElementById("settings-form");
    elements.btnSettings = document.getElementById("btn-settings");
    elements.btnSyncFrom = document.getElementById("btn-sync-from-kintone");
    elements.btnSyncTo = document.getElementById("btn-sync-to-kintone");
    elements.statusMessage = document.getElementById("status-message");
    elements.syncStatus = document.getElementById("sync-status");
    elements.btnTestData = document.getElementById("btn-test-data");
}

// イベントリスナーの設定
function initEventListeners() {
    // タブ切り替え
    elements.tabs.forEach(tab => {
        tab.addEventListener("click", () => switchTab(tab.dataset.tab));
    });

    // 日付ナビゲーション
    elements.prevDate.addEventListener("click", () => changeDate(-1));
    elements.nextDate.addEventListener("click", () => changeDate(1));
    elements.ganttDate.addEventListener("change", (e) => {
        currentDate = new Date(e.target.value);
        renderGantt();
    });

    // フォーム送信
    elements.addForm.addEventListener("submit", handleAddSchedule);

    // 数量入力で総個数を自動計算
    for (let i = 1; i <= 8; i++) {
        const input = document.getElementById(`quantity${i}`);
        if (input) {
            input.addEventListener("input", calculateTotals);
        }
    }

    // 製品選択で終了時刻を計算
    document.getElementById("product-name").addEventListener("change", calculateTotals);
    document.getElementById("start-datetime").addEventListener("change", calculateTotals);
    document.getElementById("efficiency").addEventListener("change", calculateTotals);

    // 設定モーダル
    elements.btnSettings.addEventListener("click", () => {
        elements.settingsModal.classList.add("active");
    });
    
    document.querySelector(".modal-close").addEventListener("click", () => {
        elements.settingsModal.classList.remove("active");
    });

    elements.settingsForm.addEventListener("submit", handleSaveSettings);

    // kintone同期
    elements.btnSyncFrom.addEventListener("click", handleSyncFromKintone);
    elements.btnSyncTo.addEventListener("click", handleSyncToKintone);

    // テストデータ作成
    if (elements.btnTestData) {
        elements.btnTestData.addEventListener("click", handleGenerateTestData);
    }

    // グローバルドラッグイベント（1回だけ登録）
    document.addEventListener('mousemove', handleGlobalMouseMove);
    document.addEventListener('mouseup', handleGlobalMouseUp);
}

// ドラッグ状態管理
const dragState = {
    isDragging: false,
    element: null,
    ghost: null,
    schedule: null,
    startX: 0,
    initialLeft: 0,
    durationMs: 0,
    dayStart6AM: null
};



// ドラッグ有効化（要素側）
function setupDraggable(element, schedule, durationMs, dayStart6AM) {
    element.addEventListener('mousedown', (e) => {
        // 既存のドラッグがあればキャンセル
        if (dragState.isDragging) return;

        dragState.isDragging = true;
        dragState.element = element;
        dragState.schedule = schedule;
        dragState.durationMs = durationMs;
        dragState.dayStart6AM = dayStart6AM;
        dragState.startX = e.clientX;
        dragState.initialLeft = parseFloat(element.style.left);
        
        // ゴースト作成
        const ghost = element.cloneNode(true);
        ghost.classList.add('gantt-ghost');
        ghost.style.opacity = '0.5';
        ghost.style.border = '2px dashed #333';
        ghost.style.zIndex = '1000';
        ghost.style.pointerEvents = 'none'; // マウスイベントを透過
        element.parentNode.appendChild(ghost); // 同じコンテナに追加
        dragState.ghost = ghost;

        element.style.opacity = '0.3';
        e.preventDefault();
    });
}

function handleGlobalMouseMove(e) {
    if (!dragState.isDragging || !dragState.ghost) return;

    const deltaX = e.clientX - dragState.startX;
    let newLeft = dragState.initialLeft + deltaX;
    
    // 左端制限
    if (newLeft < 100) newLeft = 100;
    
    // グリッドスナップ (15分単位 = 15px)
    const snap = 15;
    const offset = newLeft - 100;
    const snappedOffset = Math.round(offset / snap) * snap;
    const snappedLeft = 100 + snappedOffset;

    dragState.ghost.style.left = snappedLeft + "px";

    // 行ハイライト
    const dropY = e.clientY;
    document.querySelectorAll('.gantt-row').forEach(row => {
        const rect = row.getBoundingClientRect();
        if (dropY >= rect.top && dropY <= rect.bottom) {
            row.style.backgroundColor = 'rgba(0,0,0,0.05)';
        } else {
            row.style.backgroundColor = '';
        }
    });
}

async function handleGlobalMouseUp(e) {
    if (!dragState.isDragging) return;

    const { element, ghost, schedule, durationMs } = dragState;

    // ハイライト解除
    document.querySelectorAll('.gantt-row').forEach(r => r.style.backgroundColor = '');

    // ドロップ判定
    const dropY = e.clientY;
    let targetRow = null;
    document.querySelectorAll('.gantt-row').forEach(row => {
        const rect = row.getBoundingClientRect();
        if (dropY >= rect.top && dropY <= rect.bottom) {
            targetRow = row;
        }
    });

    if (targetRow && ghost) {
        const dateStr = targetRow.dataset.date;
        const finalLeft = parseFloat(ghost.style.left);
        const minutesFromStart = Math.round(finalLeft - 100);
        
        const targetDate6AM = new Date(dateStr);
        targetDate6AM.setHours(6, 0, 0, 0);
        
        const newStart = new Date(targetDate6AM.getTime() + minutesFromStart * 60 * 1000);
        const newEnd = new Date(newStart.getTime() + durationMs);

        // API呼び出し
        try {
            const request = {
                id: schedule.id,
                start_datetime: formatIsoString(newStart),
                end_datetime: formatIsoString(newEnd)
            };
            const response = await invoke("update_schedule", { request });
            if (response.success) {
                setStatus("スケジュールを変更しました");
                await loadSchedules();
            } else {
                setStatus("変更エラー: " + response.error, true);
                renderGantt();
            }
        } catch (error) {
            setStatus("通信エラー: " + error, true);
            renderGantt();
        }
    } else {
        renderGantt();
    }

    // クリーンアップ
    if (ghost) ghost.remove();
    if (element) element.style.opacity = '';
    
    // 状態リセット
    dragState.isDragging = false;
    dragState.element = null;
    dragState.ghost = null;
    dragState.schedule = null;
    dragState.dayStart6AM = null;
}

function formatIsoString(date) {
    const pad = (n) => n.toString().padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

// タブ切り替え
function switchTab(tabName) {
    elements.tabs.forEach(t => t.classList.remove("active"));
    elements.views.forEach(v => v.classList.remove("active"));
    
    document.querySelector(`[data-tab="${tabName}"]`).classList.add("active");
    document.getElementById(`${tabName}-view`).classList.add("active");

    if (tabName === "schedule") {
        renderScheduleTable();
    } else if (tabName === "gantt") {
        renderGantt();
    }
}

// 日付変更
function changeDate(delta) {
    currentDate.setDate(currentDate.getDate() + delta);
    updateGanttDate();
    renderGantt();
}

function updateGanttDate() {
    elements.ganttDate.value = currentDate.toISOString().split("T")[0];
}

// スケジュール読み込み
async function loadSchedules() {
    try {
        const response = await invoke("get_schedules");
        if (response.success) {
            schedules = response.data || [];
            renderScheduleTable();
        } else {
            console.error("スケジュール取得エラー:", response.error);
        }
    } catch (error) {
        console.error("スケジュール読み込みエラー:", error);
    }
}

// スケジュール追加
async function handleAddSchedule(e) {
    e.preventDefault();
    
    const formData = {
        product_name: document.getElementById("product-name").value,
        line: document.getElementById("line").value,
        start_datetime: document.getElementById("start-datetime").value,
        end_datetime: document.getElementById("end-datetime").value || null,
        quantity1: parseFloat(document.getElementById("quantity1").value) || null,
        quantity2: parseFloat(document.getElementById("quantity2").value) || null,
        quantity3: parseFloat(document.getElementById("quantity3").value) || null,
        quantity4: parseFloat(document.getElementById("quantity4").value) || null,
        quantity5: parseFloat(document.getElementById("quantity5").value) || null,
        quantity6: parseFloat(document.getElementById("quantity6").value) || null,
        quantity7: parseFloat(document.getElementById("quantity7").value) || null,
        quantity8: parseFloat(document.getElementById("quantity8").value) || null,
        total_quantity: parseFloat(document.getElementById("total-quantity").value) || null,
        production_status: "予定"
    };

    try {
        const response = await invoke("add_schedule", { request: formData });
        if (response.success) {
            setStatus("スケジュールを追加しました");
            elements.addForm.reset();
            await loadSchedules();
            switchTab("schedule");
        } else {
            setStatus("エラー: " + response.error, true);
        }
    } catch (error) {
        setStatus("追加エラー: " + error, true);
    }
}

// 総個数と終了時刻の計算
function calculateTotals() {
    let total = 0;
    for (let i = 1; i <= 8; i++) {
        const val = parseFloat(document.getElementById(`quantity${i}`).value) || 0;
        total += val;
    }
    document.getElementById("total-quantity").value = total;

    // 終了時刻計算
    const productName = document.getElementById("product-name").value;
    const startDatetime = document.getElementById("start-datetime").value;
    const efficiency = parseFloat(document.getElementById("efficiency").value) || 1;
    const weight = productWeights[productName] || 0;

    if (startDatetime && total > 0 && weight > 0 && efficiency > 0) {
        const productionTime = (total * weight / 1000) / efficiency * 60; // 分
        const startDate = new Date(startDatetime);
        const endDate = new Date(startDate.getTime() + productionTime * 60 * 1000);
        
        const endStr = endDate.toISOString().slice(0, 16);
        document.getElementById("end-datetime").value = endStr;
    }
}

// スケジュールテーブル描画
function renderScheduleTable() {
    const tbody = elements.scheduleTbody;
    tbody.innerHTML = "";

    schedules.forEach(schedule => {
        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td>${schedule.product_name}</td>
            <td>ライン${schedule.line}</td>
            <td>${formatDateTime(schedule.start_datetime)}</td>
            <td>${formatDateTime(schedule.end_datetime)}</td>
            <td>${schedule.total_quantity || "-"}</td>
            <td><span class="status-badge">${schedule.production_status}</span></td>
            <td><span class="status-badge ${schedule.sync_status}">${getSyncStatusText(schedule.sync_status)}</span></td>
            <td>
                <button class="btn btn-small btn-secondary">編集</button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

// ガントチャート描画
function renderGantt() {
    const container = document.getElementById("gantt-container");
    const timeline = container.querySelector(".gantt-timeline");
    const rows = container.querySelector(".gantt-rows");

    // タイムラインヘッダー (6:00 ～ 翌6:00)
    timeline.innerHTML = '<div style="width:100px;padding:8px;font-weight:bold;">日付</div>';
    for (let h = 6; h < 30; h++) {
        const hour = h % 24;
        timeline.innerHTML += `<div style="width:60px;text-align:center;padding:8px;border-left:1px solid #dee2e6;">${hour}:00</div>`;
    }

    // 日付ごとの行（5日分）
    rows.innerHTML = "";
    
    // currentDateを基準に表示開始日を設定（production date基準）
    const startDate = new Date(currentDate);

    for (let i = 0; i < 5; i++) {
        const rowDate = new Date(startDate);
        rowDate.setDate(startDate.getDate() + i);
        
        // production date文字列 (YYYY-MM-DD)
        const dateStr = formatIsoDate(rowDate);
        const displayDate = `${rowDate.getMonth() + 1}/${rowDate.getDate()}`;

        const row = document.createElement("div");
        row.className = "gantt-row";
        row.dataset.date = dateStr;
        
        // ラベルエリア
        const labelDiv = document.createElement("div");
        labelDiv.className = "gantt-row-label";
        labelDiv.textContent = displayDate;
        row.appendChild(labelDiv);

        // コンテンツエリア
        const contentDiv = document.createElement("div");
        contentDiv.className = "gantt-row-content";
        contentDiv.id = `gantt-date-${dateStr}`;
        row.appendChild(contentDiv);
        
        rows.appendChild(row);

        // この日のスケジュールをフィルタ（6:00始まり基準）
        // 判定ロジック: スケジュールの開始時間が、rowDateの6:00 ～ 翌6:00 に含まれるか
        // または、rowDateは「生産日」としての扱いで、実時間は判定が必要
        
        const rowStart = new Date(rowDate);
        rowStart.setHours(6, 0, 0, 0);
        const rowEnd = new Date(rowStart.getTime() + 24 * 60 * 60 * 1000);

        const daySchedules = schedules.filter(s => {
            if (!s.start_datetime) return false;
            const sTime = new Date(s.start_datetime);
            // 開始時間がこの日の範囲内にある、または
            // 前日から続いていて終了時間がこの日の範囲内にある（今回は開始時間基準で簡易化）
            // 厳密には productionDate(s.start_datetime) === rowDate
            return getProductionDateStr(sTime) === dateStr;
        });

        // 重なり計算とレーン割り当て
        const lanes = calculateLanes(daySchedules);
        
        // 行の高さを調整 (レーン数 * バーの高さ + マージン)
        // 基本高さ50px, 1レーン追加ごとに+40pxなど
        const laneCount = lanes.length > 0 ? lanes.length : 1;
        row.style.height = `${Math.max(50, laneCount * 36 + 10)}px`;

        lanes.forEach((laneSchedules, laneIndex) => {
            laneSchedules.forEach(schedule => {
                const bar = createGanttBar(schedule, rowStart, laneIndex);
                contentDiv.appendChild(bar);
            });
        });
    }
}

// 生産日判定（6:00区切り）
function getProductionDateStr(date) {
    const d = new Date(date);
    if (d.getHours() < 6) {
        d.setDate(d.getDate() - 1);
    }
    const pad = (n) => n.toString().padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
}

function formatIsoDate(date) {
    const pad = (n) => n.toString().padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}`;
}

// レーン計算（重なり制御）
function calculateLanes(schedules) {
    if (schedules.length === 0) return [];

    // 開始時間順にソート
    const sorted = [...schedules].sort((a, b) => new Date(a.start_datetime) - new Date(b.start_datetime));
    const lanes = []; // Array of arrays of schedules

    for (const schedule of sorted) {
        const start = new Date(schedule.start_datetime).getTime();
        
        // 既存のレーンに入れられるか確認
        let placed = false;
        for (const lane of lanes) {
            const lastSchedule = lane[lane.length - 1];
            // 終了時間取得（未設定なら+1時間）
            const lastEnd = lastSchedule.end_datetime 
                ? new Date(lastSchedule.end_datetime).getTime() 
                : new Date(lastSchedule.start_datetime).getTime() + 60*60*1000;
            
            if (start >= lastEnd) {
                lane.push(schedule);
                placed = true;
                break;
            }
        }

        if (!placed) {
            lanes.push([schedule]);
        }
    }
    return lanes;
}

function createGanttBar(schedule, dayStart6AM, laneIndex) {
    const bar = document.createElement("div");
    bar.className = "gantt-bar";
    bar.dataset.id = schedule.id;
    
    // 時間位置計算
    const startTime = new Date(schedule.start_datetime);
    const endTime = schedule.end_datetime ? new Date(schedule.end_datetime) : new Date(startTime.getTime() + 60*60*1000);
    
    // 基準時間(6:00)からの経過分
    const diffMs = startTime.getTime() - dayStart6AM.getTime();
    const startMinutes = diffMs / (1000 * 60);

    const durationMs = endTime.getTime() - startTime.getTime();
    const durationMinutes = durationMs / (1000 * 60);

    const left = 100 + (startMinutes / 60) * 60; // 100px for label, 60px per hour
    const width = Math.max((durationMinutes / 60) * 60, 10); // 最小幅10px
    const top = 4 + laneIndex * 36; // 上部マージン4px, 1段36px

    bar.style.left = left + "px";
    bar.style.width = width + "px";
    bar.style.top = top + "px";
    
    // ステータスに応じた色
    if (schedule.production_status === "完了") {
        bar.classList.add("status-completed");
    } else if (schedule.production_status === "生産中") {
        bar.classList.add("status-inprogress");
    } else {
        bar.classList.add("status-pending");
    }

    // テキスト表示
    bar.textContent = schedule.product_name;
    bar.title = `${schedule.product_name}\n${formatDateTime(schedule.start_datetime)} - ${formatDateTime(schedule.end_datetime)}\n総個数: ${schedule.total_quantity || "-"}`;

    // ドラッグアンドドロップ設定
    setupDraggable(bar, schedule, durationMs, dayStart6AM);

    return bar;
}




// kintone設定保存
async function handleSaveSettings(e) {
    e.preventDefault();
    
    const config = {
        subdomain: document.getElementById("subdomain").value,
        app_id: parseInt(document.getElementById("app-id").value),
        api_token: document.getElementById("api-token").value
    };

    try {
        const response = await invoke("save_kintone_config", { config });
        if (response.success) {
            setStatus("kintone設定を保存しました");
            elements.settingsModal.classList.remove("active");
            elements.syncStatus.textContent = "同期: 接続済み";
        } else {
            setStatus("設定エラー: " + response.error, true);
        }
    } catch (error) {
        setStatus("設定保存エラー: " + error, true);
    }
}

// kintoneから取得
async function handleSyncFromKintone() {
    setStatus("kintoneからデータを取得中...");
    try {
        const response = await invoke("fetch_from_kintone");
        if (response.success) {
            setStatus(`${response.data}件のレコードを同期しました`);
            await loadSchedules();
        } else {
            setStatus("取得エラー: " + response.error, true);
        }
    } catch (error) {
        setStatus("同期エラー: " + error, true);
    }
}

// kintoneへ送信
async function handleSyncToKintone() {
    setStatus("kintoneへデータを送信中...");
    try {
        const response = await invoke("sync_to_kintone");
        if (response.success) {
            setStatus(`${response.data}件のスケジュールを同期しました`);
            await loadSchedules();
        } else {
            setStatus("送信エラー: " + response.error, true);
        }
    } catch (error) {
        setStatus("同期エラー: " + error, true);
    }
}

// テストデータ生成
async function handleGenerateTestData() {
    if (!confirm("現在のデータを保持したままテストデータを追加しますか？")) return;

    setStatus("テストデータを生成中...");
    
    const products = ["FS450D", "FS450K", "FS021", "小袋", "FS360F"];
    const lines = ["1", "2", "3"];
    
    // 今日から3日間
    const baseDate = new Date();
    baseDate.setHours(8, 0, 0, 0);

    const testSchedules = [];

    for (let i = 0; i < 5; i++) { // 5件作成
        const dayOffset = Math.floor(i / 2); // 0, 0, 1, 1, 2...
        const date = new Date(baseDate);
        date.setDate(date.getDate() + dayOffset);
        
        // 開始時間をずらす
        date.setHours(8 + (i % 2) * 4); // 8:00, 12:00...

        const product = products[i % products.length];
        const line = lines[i % lines.length];
        const quantity = 100 * (i + 1);
        
        const durationHours = quantity / 100;
        const endDate = new Date(date);
        endDate.setTime(date.getTime() + durationHours * 60 * 60 * 1000);

        const pad = (n) => n.toString().padStart(2, '0');
        const fmt = (d) => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:00`;

        testSchedules.push({
            product_name: product,
            line: line,
            start_datetime: fmt(date),
            end_datetime: fmt(endDate),
            total_quantity: quantity,
            production_status: "予定"
        });
    }

    let successCount = 0;
    for (const s of testSchedules) {
        try {
            await invoke("add_schedule", { request: s });
            successCount++;
        } catch (e) {
            console.error(e);
        }
    }

    setStatus(`${successCount}件のテストデータを追加しました`);
    await loadSchedules();
    renderGantt();
}

// ユーティリティ関数
function formatDateTime(dateStr) {
    if (!dateStr) return "-";
    const date = new Date(dateStr);
    return `${date.getMonth()+1}/${date.getDate()} ${String(date.getHours()).padStart(2,"0")}:${String(date.getMinutes()).padStart(2,"0")}`;
}

function getSyncStatusText(status) {
    const map = {
        "pending": "未同期",
        "synced": "同期済",
        "modified": "変更あり"
    };
    return map[status] || status;
}

function setStatus(message, isError = false) {
    elements.statusMessage.textContent = message;
    elements.statusMessage.style.color = isError ? "#ff6b6b" : "#ccc";
}
