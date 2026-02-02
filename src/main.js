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
let appMode = "admin"; // "admin" or "worker"

// DOM要素
const elements = {};

// 初期化
document.addEventListener("DOMContentLoaded", async () => {
    await initAppMode();
    createTooltipElement();
    initElements();
    initEventListeners();
    await loadSchedules();
    updateGanttDate();
    renderGantt();
    setStatus("準備完了");
});

// アプリモードを取得して適用
async function initAppMode() {
    try {
        const response = await invoke("get_app_mode");
        if (response.success && response.data) {
            appMode = response.data;
            console.log("App mode:", appMode);
            applyAppMode();
        }
    } catch (error) {
        console.error("Failed to get app mode:", error);
        appMode = "admin"; // fallback
    }
}

// モードに応じてUIを切り替え
function applyAppMode() {
    const isWorker = appMode === "worker";
    
    // 作業者モードで非表示にする要素
    const adminOnlyElements = [
        "btn-test-data",
        "btn-sync-to-kintone",
        "btn-settings"
    ];
    
    // タブを制御（新規追加タブは作業者モードで非表示）
    const addTab = document.querySelector('.tab[data-tab="add"]');
    if (addTab && isWorker) {
        addTab.style.display = "none";
    }
    
    // ヘッダーボタンを制御
    adminOnlyElements.forEach(id => {
        const el = document.getElementById(id);
        if (el && isWorker) {
            el.style.display = "none";
        }
    });
    
    // ヘッダータイトルを更新
    const headerTitle = document.querySelector("header h1");
    if (headerTitle) {
        if (isWorker) {
            headerTitle.textContent = "🏭 生産計画スケジューラー【作業者】";
        } else {
            headerTitle.textContent = "🏭 生産計画スケジューラー【管理者】";
        }
    }
}
// カスタムツールチップ要素を作成
function createTooltipElement() {
    const tooltip = document.createElement("div");
    tooltip.className = "custom-tooltip";
    tooltip.id = "custom-tooltip";
    document.body.appendChild(tooltip);
}

// ツールチップを表示
function showTooltip(e, schedule, qty) {
    const tooltip = document.getElementById("custom-tooltip");
    if (!tooltip) return;
    
    const schedNo = schedule.schedule_number || schedule.kintone_record_id || "-";
    const statusText = schedule.production_status || "未生産";
    const statusMap = {
        "予定": "未生産",
        "未生産": "未生産",
        "生産中": "生産中",
        "生産終了": "生産終了",
        "完了": "生産終了"
    };
    const displayStatus = statusMap[statusText] || statusText;
    
    let statusClass = "status-pending";
    if (statusText === "生産中") statusClass = "status-inprogress";
    else if (statusText === "生産終了" || statusText === "完了") statusClass = "status-completed";
    
    tooltip.innerHTML = `
        <div class="tooltip-header">[${schedNo}] ${schedule.product_name}</div>
        <div class="tooltip-row">
            <span class="tooltip-label">開始:</span>
            <span class="tooltip-value">${formatDateTime(schedule.start_datetime)}</span>
        </div>
        <div class="tooltip-row">
            <span class="tooltip-label">終了:</span>
            <span class="tooltip-value">${formatDateTime(schedule.end_datetime)}</span>
        </div>
        <div class="tooltip-row">
            <span class="tooltip-label">個数:</span>
            <span class="tooltip-value">${qty || "-"} 個</span>
        </div>
        ${schedule.notes ? `<div class="tooltip-row"><span class="tooltip-label">備考:</span><span class="tooltip-value">${schedule.notes}</span></div>` : ""}
        <div class="tooltip-status ${statusClass}">${displayStatus}</div>
    `;
    
    // 位置を計算
    const x = e.clientX + 15;
    const y = e.clientY + 15;
    
    // 画面からはみ出さないように調整
    const rect = tooltip.getBoundingClientRect();
    const maxX = window.innerWidth - 420;
    const maxY = window.innerHeight - 250;
    
    tooltip.style.left = Math.min(x, maxX) + "px";
    tooltip.style.top = Math.min(y, maxY) + "px";
    tooltip.classList.add("visible");
}

// ツールチップを非表示
function hideTooltip() {
    const tooltip = document.getElementById("custom-tooltip");
    if (tooltip) {
        tooltip.classList.remove("visible");
    }
}

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
    elements.tabs.forEach(tab => {
        tab.addEventListener("click", () => switchTab(tab.dataset.tab));
    });

    elements.prevDate.addEventListener("click", () => changeDate(-1));
    elements.nextDate.addEventListener("click", () => changeDate(1));
    elements.ganttDate.addEventListener("change", (e) => {
        currentDate = new Date(e.target.value);
        renderGantt();
    });

    elements.addForm.addEventListener("submit", handleAddSchedule);

    const quantityInput = document.getElementById("quantity1");
    if (quantityInput) {
        quantityInput.addEventListener("input", calculateTotals);
    }

    document.getElementById("product-name").addEventListener("change", calculateTotals);
    document.getElementById("start-datetime").addEventListener("change", calculateTotals);
    document.getElementById("efficiency").addEventListener("change", calculateTotals);

    elements.btnSettings.addEventListener("click", () => {
        elements.settingsModal.classList.add("active");
    });

    document.querySelector(".modal-close").addEventListener("click", () => {
        elements.settingsModal.classList.remove("active");
    });

    elements.settingsForm.addEventListener("submit", handleSaveSettings);
    elements.btnSyncFrom.addEventListener("click", handleSyncFromKintone);
    elements.btnSyncTo.addEventListener("click", handleSyncToKintone);

    if (elements.btnTestData) {
        elements.btnTestData.addEventListener("click", handleGenerateTestData);
    }

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
    startY: 0,
    initialLeft: 0,
    durationMs: 0,
    barWidth: 0,
    dayStart6AM: null,
    originalRow: null,
    dropPreview: null
};

// ドラッグ有効化
function setupDraggable(element, schedule, durationMs, dayStart6AM) {
    element.addEventListener('mousedown', (e) => {
        if (dragState.isDragging) return;

        dragState.isDragging = true;
        dragState.element = element;
        dragState.schedule = schedule;
        dragState.durationMs = durationMs;
        dragState.barWidth = element.offsetWidth;
        dragState.dayStart6AM = dayStart6AM;
        dragState.startX = e.clientX;
        dragState.startY = e.clientY;
        dragState.initialLeft = parseFloat(element.style.left);
        dragState.originalRow = element.closest('.gantt-row');

        const ghost = element.cloneNode(true);
        ghost.classList.add('gantt-ghost');
        ghost.style.opacity = '0.6';
        ghost.style.border = '2px dashed #333';
        ghost.style.zIndex = '1000';
        ghost.style.pointerEvents = 'none';
        ghost.style.position = 'fixed';
        ghost.style.top = (e.clientY - 30) + 'px';
        ghost.style.left = (e.clientX - 50) + 'px';
        ghost.style.width = element.offsetWidth + 'px';
        document.body.appendChild(ghost);
        dragState.ghost = ghost;

        const preview = document.createElement('div');
        preview.className = 'drop-preview';
        preview.style.position = 'absolute';
        preview.style.height = '110px';
        preview.style.width = element.offsetWidth + 'px';
        preview.style.borderRadius = '8px';
        preview.style.border = '3px solid #007bff';
        preview.style.backgroundColor = 'rgba(0, 123, 255, 0.2)';
        preview.style.pointerEvents = 'none';
        preview.style.zIndex = '100';
        preview.style.display = 'none';

        const timeLabel = document.createElement('div');
        timeLabel.className = 'preview-time-label';
        timeLabel.style.position = 'absolute';
        timeLabel.style.top = '-35px';
        timeLabel.style.left = '0';
        timeLabel.style.backgroundColor = '#007bff';
        timeLabel.style.color = 'white';
        timeLabel.style.padding = '4px 10px';
        timeLabel.style.borderRadius = '6px';
        timeLabel.style.fontSize = '13px';
        timeLabel.style.fontWeight = 'bold';
        timeLabel.style.whiteSpace = 'nowrap';
        preview.appendChild(timeLabel);

        dragState.dropPreview = preview;
        element.style.opacity = '0.3';
        e.preventDefault();
    });
}

function handleGlobalMouseMove(e) {
    if (!dragState.isDragging || !dragState.ghost) return;

    dragState.ghost.style.top = (e.clientY - 30) + 'px';
    dragState.ghost.style.left = (e.clientX - 50) + 'px';

    const dropY = e.clientY;
    let targetRow = null;

    document.querySelectorAll('.gantt-row').forEach(row => {
        const rect = row.getBoundingClientRect();
        if (dropY >= rect.top && dropY <= rect.bottom) {
            targetRow = row;
            row.style.backgroundColor = 'rgba(0, 123, 255, 0.08)';
        } else {
            row.style.backgroundColor = '';
        }
    });

    if (targetRow && dragState.dropPreview) {
        const contentDiv = targetRow.querySelector('.gantt-row-content');
        const contentRect = contentDiv.getBoundingClientRect();
        const relativeX = e.clientX - contentRect.left;
        const minutesFromStart = Math.round(relativeX / 60 * 60);
        const snappedMinutes = Math.round(minutesFromStart / 15) * 15;
        const previewLeft = (snappedMinutes / 60) * 60;

        const dateStr = targetRow.dataset.date;
        const targetDate6AM = new Date(dateStr);
        targetDate6AM.setHours(6, 0, 0, 0);
        const previewStart = new Date(targetDate6AM.getTime() + snappedMinutes * 60 * 1000);
        const previewEnd = new Date(previewStart.getTime() + dragState.durationMs);

        const formatTime = (d) => `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
        const timeText = `${formatTime(previewStart)} - ${formatTime(previewEnd)}`;

        if (dragState.dropPreview.parentNode !== contentDiv) {
            if (dragState.dropPreview.parentNode) {
                dragState.dropPreview.parentNode.removeChild(dragState.dropPreview);
            }
            contentDiv.appendChild(dragState.dropPreview);
        }

        dragState.dropPreview.style.left = previewLeft + 'px';
        dragState.dropPreview.style.top = '15px';
        dragState.dropPreview.style.display = 'block';
        dragState.dropPreview.querySelector('.preview-time-label').textContent = timeText;
    } else if (dragState.dropPreview) {
        dragState.dropPreview.style.display = 'none';
    }
}

async function handleGlobalMouseUp(e) {
    if (!dragState.isDragging) return;

    const { element, ghost, schedule, durationMs, dropPreview } = dragState;

    document.querySelectorAll('.gantt-row').forEach(r => r.style.backgroundColor = '');

    if (dropPreview && dropPreview.parentNode) {
        dropPreview.parentNode.removeChild(dropPreview);
    }

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
        const contentDiv = targetRow.querySelector('.gantt-row-content');
        const contentRect = contentDiv.getBoundingClientRect();
        const relativeX = e.clientX - contentRect.left;
        const minutesFromStart = Math.round(relativeX / 60 * 60);
        const snappedMinutes = Math.round(minutesFromStart / 15) * 15;

        const targetDate6AM = new Date(dateStr);
        targetDate6AM.setHours(6, 0, 0, 0);

        const newStart = new Date(targetDate6AM.getTime() + snappedMinutes * 60 * 1000);
        const newEnd = new Date(newStart.getTime() + durationMs);

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
                renderGantt();
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

    if (ghost) ghost.remove();
    if (element) element.style.opacity = '';

    dragState.isDragging = false;
    dragState.element = null;
    dragState.ghost = null;
    dragState.schedule = null;
    dragState.dayStart6AM = null;
    dragState.originalRow = null;
    dragState.dropPreview = null;
}

function formatIsoString(date) {
    const pad = (n) => n.toString().padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

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

function changeDate(delta) {
    currentDate.setDate(currentDate.getDate() + delta);
    updateGanttDate();
    renderGantt();
}

function updateGanttDate() {
    elements.ganttDate.value = currentDate.toISOString().split("T")[0];
}

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

async function handleAddSchedule(e) {
    e.preventDefault();

    const quantity = parseFloat(document.getElementById("quantity1").value) || null;

    const formData = {
        product_name: document.getElementById("product-name").value,
        line: "",
        start_datetime: document.getElementById("start-datetime").value,
        end_datetime: document.getElementById("end-datetime").value || null,
        quantity1: quantity,
        quantity2: null,
        quantity3: null,
        quantity4: null,
        quantity5: null,
        quantity6: null,
        quantity7: null,
        quantity8: null,
        total_quantity: quantity,
        production_status: "予定",
        notes: document.getElementById("notes").value || null
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

function calculateTotals() {
    const quantity = parseFloat(document.getElementById("quantity1").value) || 0;
    const productName = document.getElementById("product-name").value;
    const startDatetime = document.getElementById("start-datetime").value;
    const efficiency = parseFloat(document.getElementById("efficiency").value) || 1;
    const weight = productWeights[productName] || 0;

    if (startDatetime && quantity > 0 && weight > 0 && efficiency > 0) {
        const productionTime = (quantity * weight / 1000) / efficiency * 60;
        const startDate = new Date(startDatetime);
        const endDate = new Date(startDate.getTime() + productionTime * 60 * 1000);

        const endStr = endDate.toISOString().slice(0, 16);
        document.getElementById("end-datetime").value = endStr;
    }
}

// スケジュールテーブル描画（schedule_numberを使用）
function renderScheduleTable() {
    const tbody = elements.scheduleTbody;
    tbody.innerHTML = "";

    schedules.forEach(schedule => {
        const tr = document.createElement("tr");
        tr.dataset.id = schedule.id;
        // schedule_numberを優先、なければkintone_record_id
        const schedNo = schedule.schedule_number || schedule.kintone_record_id || "-";
        tr.innerHTML = `
            <td>${schedNo}</td>
            <td>${schedule.product_name}</td>
            <td>${formatDateTime(schedule.start_datetime)}</td>
            <td>${formatDateTime(schedule.end_datetime)}</td>
            <td>${schedule.total_quantity || schedule.quantity1 || "-"}</td>
            <td>${schedule.notes || "-"}</td>
            <td><span class="status-badge">${schedule.production_status}</span></td>
            <td><span class="status-badge ${schedule.sync_status}">${getSyncStatusText(schedule.sync_status)}</span></td>
            <td class="action-buttons">
                ${appMode === "admin" ? `
                    <button class="btn btn-small btn-primary btn-edit" data-id="${schedule.id}">編集</button>
                    <button class="btn btn-small btn-danger btn-delete" data-id="${schedule.id}">削除</button>
                ` : "-"}
            </td>
        `;
        tbody.appendChild(tr);
        
        // 管理者モードのみ編集・削除イベントを設定
        if (appMode === "admin") {
            tr.querySelector(".btn-edit").addEventListener("click", () => openEditModal(schedule));
            tr.querySelector(".btn-delete").addEventListener("click", () => handleDeleteSchedule(schedule.id, schedule.product_name));
        }
    });
}

// 編集モーダルを開く
function openEditModal(schedule) {
    const modal = document.getElementById("edit-modal");
    if (!modal) {
        createEditModal();
    }
    
    document.getElementById("edit-id").value = schedule.id;
    document.getElementById("edit-product-name").value = schedule.product_name;
    document.getElementById("edit-start-datetime").value = formatDateTimeForInput(schedule.start_datetime);
    document.getElementById("edit-end-datetime").value = formatDateTimeForInput(schedule.end_datetime);
    document.getElementById("edit-quantity").value = schedule.total_quantity || schedule.quantity1 || "";
    document.getElementById("edit-notes").value = schedule.notes || "";
    document.getElementById("edit-status").value = schedule.production_status || "予定";
    
    document.getElementById("edit-modal").classList.add("active");
}

// 日時をinput用にフォーマット
function formatDateTimeForInput(dateStr) {
    if (!dateStr) return "";
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return "";
    const pad = (n) => n.toString().padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

// 編集モーダルを作成
function createEditModal() {
    const modal = document.createElement("div");
    modal.id = "edit-modal";
    modal.className = "modal";
    modal.innerHTML = `
        <div class="modal-content">
            <div class="modal-header">
                <h2>📝 スケジュール編集</h2>
                <button class="modal-close" id="edit-modal-close">&times;</button>
            </div>
            <form id="edit-schedule-form" class="form" style="padding: 24px;">
                <input type="hidden" id="edit-id">
                <div class="form-group">
                    <label for="edit-product-name">製品名</label>
                    <input type="text" id="edit-product-name" readonly style="background: #f0f0f0;">
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label for="edit-start-datetime">開始日時</label>
                        <input type="datetime-local" id="edit-start-datetime" required>
                    </div>
                    <div class="form-group">
                        <label for="edit-end-datetime">終了日時</label>
                        <input type="datetime-local" id="edit-end-datetime">
                    </div>
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label for="edit-quantity">個数</label>
                        <input type="number" id="edit-quantity" min="0">
                    </div>
                    <div class="form-group">
                        <label for="edit-status">生産状況</label>
                        <select id="edit-status">
                            <option value="予定">未生産</option>
                            <option value="生産中">生産中</option>
                            <option value="生産終了">生産終了</option>
                        </select>
                    </div>
                </div>
                <div class="form-group">
                    <label for="edit-notes">備考</label>
                    <input type="text" id="edit-notes" placeholder="備考を入力">
                </div>
                <div class="form-actions">
                    <button type="submit" class="btn btn-primary">💾 保存</button>
                    <button type="button" class="btn btn-secondary" id="edit-modal-cancel">キャンセル</button>
                </div>
            </form>
        </div>
    `;
    document.body.appendChild(modal);
    
    // イベントリスナーを設定
    document.getElementById("edit-modal-close").addEventListener("click", closeEditModal);
    document.getElementById("edit-modal-cancel").addEventListener("click", closeEditModal);
    document.getElementById("edit-schedule-form").addEventListener("submit", handleEditSchedule);
}

// 編集モーダルを閉じる
function closeEditModal() {
    document.getElementById("edit-modal").classList.remove("active");
}

// 編集を保存
async function handleEditSchedule(e) {
    e.preventDefault();
    
    const id = parseInt(document.getElementById("edit-id").value);
    const startDatetime = document.getElementById("edit-start-datetime").value;
    const endDatetime = document.getElementById("edit-end-datetime").value || null;
    
    console.log("Edit schedule:", { id, startDatetime, endDatetime });
    
    if (!id || !startDatetime) {
        setStatus("ID または開始日時が無効です", true);
        return;
    }
    
    try {
        // datetime-localの値は "2026-02-02T08:00" 形式
        const formatDT = (dt) => {
            if (!dt) return null;
            return dt.replace("T", " ") + ":00";
        };
        
        const request = {
            id: id,
            start_datetime: formatDT(startDatetime),
            end_datetime: formatDT(endDatetime)
        };
        
        console.log("Sending request:", request);
        
        const response = await invoke("update_schedule", { request });
        console.log("Response:", response);
        
        if (response.success) {
            setStatus("スケジュールを更新しました");
            closeEditModal();
            await loadSchedules();
            renderGantt();
        } else {
            setStatus("更新エラー: " + (response.error || "不明なエラー"), true);
        }
    } catch (error) {
        console.error("Edit error:", error);
        setStatus("更新エラー: " + error, true);
    }
}

// スケジュールを削除
async function handleDeleteSchedule(id, productName) {
    if (!confirm(`「${productName}」のスケジュールを削除しますか？\nこの操作は取り消せません。`)) {
        return;
    }
    
    try {
        const response = await invoke("delete_schedule", { id: id });
        if (response.success) {
            setStatus("スケジュールを削除しました");
            await loadSchedules();
            renderGantt();
        } else {
            setStatus("削除エラー: " + response.error, true);
        }
    } catch (error) {
        setStatus("削除エラー: " + error, true);
    }
}

// ガントチャート描画
function renderGantt() {
    const container = document.getElementById("gantt-container");
    const timeline = container.querySelector(".gantt-timeline");
    const rows = container.querySelector(".gantt-rows");

    timeline.innerHTML = '<div style="width:100px;padding:10px;font-weight:bold;">日付</div>';
    for (let h = 6; h < 30; h++) {
        const hour = h % 24;
        timeline.innerHTML += `<div style="width:60px;text-align:center;padding:10px;border-left:1px solid rgba(255,255,255,0.2);">${hour}:00</div>`;
    }

    rows.innerHTML = "";
    const startDate = new Date(currentDate);
    startDate.setDate(startDate.getDate() - 1); // 1日前から表示

    for (let i = 0; i < 6; i++) { // 6日分表示（前日〜4日後）
        const rowDate = new Date(startDate);
        rowDate.setDate(startDate.getDate() + i);

        const dateStr = formatIsoDate(rowDate);
        const displayDate = `${rowDate.getMonth() + 1}/${rowDate.getDate()}`;

        const row = document.createElement("div");
        row.className = "gantt-row";
        row.dataset.date = dateStr;

        const labelDiv = document.createElement("div");
        labelDiv.className = "gantt-row-label";
        labelDiv.textContent = displayDate;
        row.appendChild(labelDiv);

        const contentDiv = document.createElement("div");
        contentDiv.className = "gantt-row-content";
        contentDiv.id = `gantt-date-${dateStr}`;
        row.appendChild(contentDiv);

        rows.appendChild(row);

        const rowStart = new Date(rowDate);
        rowStart.setHours(6, 0, 0, 0);

        const daySchedules = schedules.filter(s => {
            if (!s.start_datetime) return false;
            const sTime = new Date(s.start_datetime);
            return getProductionDateStr(sTime) === dateStr;
        });

        const lanes = calculateLanes(daySchedules);
        const laneCount = lanes.length > 0 ? lanes.length : 1;
        row.style.height = `${Math.max(140, laneCount * 120 + 20)}px`;

        lanes.forEach((laneSchedules, laneIndex) => {
            laneSchedules.forEach(schedule => {
                const bar = createGanttBar(schedule, rowStart, laneIndex);
                contentDiv.appendChild(bar);
            });
        });
    }
}

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

function calculateLanes(schedules) {
    if (schedules.length === 0) return [];

    const sorted = [...schedules].sort((a, b) => new Date(a.start_datetime) - new Date(b.start_datetime));
    const lanes = [];

    for (const schedule of sorted) {
        const start = new Date(schedule.start_datetime).getTime();
        let placed = false;
        for (const lane of lanes) {
            const lastSchedule = lane[lane.length - 1];
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

    const startTime = new Date(schedule.start_datetime);
    const endTime = schedule.end_datetime ? new Date(schedule.end_datetime) : new Date(startTime.getTime() + 60*60*1000);

    const diffMs = startTime.getTime() - dayStart6AM.getTime();
    const startMinutes = diffMs / (1000 * 60);

    const durationMs = endTime.getTime() - startTime.getTime();
    const durationMinutes = durationMs / (1000 * 60);

    const left = (startMinutes / 60) * 60;
    const width = Math.max((durationMinutes / 60) * 60, 60);
    const top = 10 + laneIndex * 120;

    bar.style.left = left + "px";
    bar.style.width = width + "px";
    bar.style.top = top + "px";
    bar.style.height = '110px';

    if (schedule.production_status === "生産終了") {
        bar.classList.add("status-completed");
    } else if (schedule.production_status === "生産中") {
        bar.classList.add("status-inprogress");
    } else {
        bar.classList.add("status-pending");
    }

    // schedule_numberを優先、なければkintone_record_id
    const schedNo = schedule.schedule_number || schedule.kintone_record_id || "";
    const productSpan = document.createElement("span");
    productSpan.className = "bar-product";
    productSpan.textContent = schedNo ? `[${schedNo}] ${schedule.product_name}` : schedule.product_name;
    bar.appendChild(productSpan);

    const qty = schedule.total_quantity || schedule.quantity1;
    if (qty) {
        const qtySpan = document.createElement("span");
        qtySpan.className = "bar-quantity";
        qtySpan.textContent = `${qty}個`;
        bar.appendChild(qtySpan);
    }

    // ステータスラベルを追加
    const statusSpan = document.createElement("span");
    statusSpan.className = "bar-status";
    const statusText = schedule.production_status || "未生産";
    const statusMap = {
        "予定": "未生産",
        "未生産": "未生産",
        "生産中": "生産中",
        "生産終了": "生産終了",
        "完了": "生産終了"
    };
    statusSpan.textContent = `【${statusMap[statusText] || statusText}】`;
    bar.appendChild(statusSpan);

    if (schedule.notes) {
        const notesSpan = document.createElement("span");
        notesSpan.className = "bar-notes";
        notesSpan.textContent = schedule.notes;
        bar.appendChild(notesSpan);
    }

    // カスタムツールチップイベント
    bar.addEventListener("mouseenter", (e) => showTooltip(e, schedule, qty));
    bar.addEventListener("mousemove", (e) => showTooltip(e, schedule, qty));
    bar.addEventListener("mouseleave", hideTooltip);

    setupDraggable(bar, schedule, durationMs, dayStart6AM);

    return bar;
}

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

async function handleSyncFromKintone() {
    setStatus("kintoneからデータを取得中...");
    try {
        const response = await invoke("fetch_from_kintone");
        if (response.success) {
            setStatus(`${response.data}件のレコードを同期しました`);
            await loadSchedules();
            renderGantt();
        } else {
            setStatus("取得エラー: " + response.error, true);
        }
    } catch (error) {
        setStatus("同期エラー: " + error, true);
    }
}

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

async function handleGenerateTestData() {
    if (!confirm("テストデータを追加しますか？")) return;

    setStatus("テストデータを生成中...");

    const products = ["FS450D", "FS450K", "FS021", "小袋", "FS360F"];
    const baseDate = new Date();
    baseDate.setHours(8, 0, 0, 0);

    const testSchedules = [];

    for (let i = 0; i < 5; i++) {
        const dayOffset = Math.floor(i / 2);
        const date = new Date(baseDate);
        date.setDate(date.getDate() + dayOffset);
        date.setHours(8 + (i % 2) * 4);

        const product = products[i % products.length];
        const quantity = 100 * (i + 1);

        const durationHours = quantity / 100;
        const endDate = new Date(date);
        endDate.setTime(date.getTime() + durationHours * 60 * 60 * 1000);

        const pad = (n) => n.toString().padStart(2, '0');
        const fmt = (d) => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:00`;

        testSchedules.push({
            product_name: product,
            line: "",
            start_datetime: fmt(date),
            end_datetime: fmt(endDate),
            quantity1: quantity,
            total_quantity: quantity,
            production_status: "予定",
            notes: `テスト${i + 1}`
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













