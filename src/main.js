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

    // タイムラインヘッダー
    timeline.innerHTML = '<div style="width:100px;padding:8px;font-weight:bold;">ライン</div>';
    for (let h = 0; h < 24; h++) {
        timeline.innerHTML += `<div style="width:60px;text-align:center;padding:8px;border-left:1px solid #dee2e6;">${h}:00</div>`;
    }

    // 各ラインの行
    rows.innerHTML = "";
    for (let line = 1; line <= 3; line++) {
        const row = document.createElement("div");
        row.className = "gantt-row";
        row.innerHTML = `
            <div class="gantt-row-label">ライン${line}</div>
            <div class="gantt-row-content" id="gantt-line-${line}"></div>
        `;
        rows.appendChild(row);

        // この日のスケジュールをフィルタ
        const dateStr = currentDate.toISOString().split("T")[0];
        const lineSchedules = schedules.filter(s => 
            s.line === String(line) && 
            s.start_datetime && 
            s.start_datetime.startsWith(dateStr)
        );

        const content = document.getElementById(`gantt-line-${line}`);
        lineSchedules.forEach(schedule => {
            const bar = createGanttBar(schedule);
            content.appendChild(bar);
        });
    }
}

function createGanttBar(schedule) {
    const bar = document.createElement("div");
    bar.className = "gantt-bar";
    
    // 時間位置計算
    const startTime = new Date(schedule.start_datetime);
    const endTime = schedule.end_datetime ? new Date(schedule.end_datetime) : new Date(startTime.getTime() + 60*60*1000);
    
    const startMinutes = startTime.getHours() * 60 + startTime.getMinutes();
    const endMinutes = endTime.getHours() * 60 + endTime.getMinutes();
    const duration = endMinutes - startMinutes;

    const left = 100 + (startMinutes / 60) * 60; // 100px for label
    const width = Math.max((duration / 60) * 60, 30);

    bar.style.left = left + "px";
    bar.style.width = width + "px";
    
    // ステータスに応じた色
    if (schedule.production_status === "完了") {
        bar.classList.add("status-completed");
    } else if (schedule.production_status === "生産中") {
        bar.classList.add("status-inprogress");
    } else {
        bar.classList.add("status-pending");
    }

    bar.textContent = schedule.product_name;
    bar.title = `${schedule.product_name}\n${formatDateTime(schedule.start_datetime)} - ${formatDateTime(schedule.end_datetime)}\n総個数: ${schedule.total_quantity || "-"}`;

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
            setStatus(`${response.data.length}件のレコードを取得しました`);
            // TODO: ローカルDBに保存
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
