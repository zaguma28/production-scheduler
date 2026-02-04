console.log('Main.js loaded v=RFACTORD');

// 生産計画スケジューラー - メインJavaScript

const { invoke } = window.__TAURI__.core;



// 製品��量�スタ

const productWeights = {

    "FS450D": 450, "FS450K": 450, "FS450NR": 450, "FS450S": 450,

    "FS250C": 250, "FS250C": 250,

    "FS360F": 360,

    "FS021B": 20, "FS021F": 20, "FS021P": 20, "FS021NR": 20, "FS021": 20,

    "FS021S": 20, "FS021PF": 20, "FS021PS": 20,

    "FS021MF": 20, "FS021MS": 20, "FS021NRF": 20, "FS021NRS": 20,

    "小袋": 20,

};

// 日時フォーマット関数（早期定義）
function formatDateTime(dateStr) {
    if (!dateStr) return "-";
    const date = new Date(dateStr);
    return `${date.getMonth()+1}/${date.getDate()} ${String(date.getHours()).padStart(2,"0")}:${String(date.getMinutes()).padStart(2,"0")}`;
}

// 同期ステータステキスト関数（早期定義）
function getSyncStatusText(status) {
    const map = {
        "pending": "未同期",
        "synced": "同期済み",
        "modified": "変更あり"
    };
    return map[status] || status;
}

// アプリケーション状慁

function setStatus(message, isrror = false) {

    elements.statusMessage.textContent = message;

    elements.statusMessage.style.color = isrror ? "#FF3B30" : "#8893";

}



// メモモーダル初期化

function initMemoModal() {

    const memoModal = document.getElementById("memo-modal");

    const memoForm = document.getElementById("memo-form");

    const memoClose = document.getElementById("memo-modal-close");

    const memoCancel = document.getElementById("memo-modal-cancel");



    if (!memoModal || !memoForm) return;



    // 閉じる�タン

    memoClose?.addEventListener("click", () => {

        memoModal.classList.remove("active");

    });

    memoCancel?.addEventListener("click", () => {

        memoModal.classList.remove("active");

    });



    // フォーム送信

    memoForm.addEventListener("submit", async (e) => {

        e.preventDefault();

        // 現在時刻を使用（日時選択はなし）
        const startDate = new Date();
        const duration = 2; // デフォルト2時間

        const text = document.getElementById("memo-text").value;



        if (!text) return;


        const endDate = new Date(startDate.getTime() + duration * 60 * 60 * 1000);



        const formatIso = (d) => {

            const pad = (n) => n.toString().padStart(2, '0');

            return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;

        };



        const formData = {

            product_name: "MMO",

            line: "",

            start_datetime: formatIso(startDate),

            end_datetime: formatIso(endDate),

            quantity1: null,

            total_quantity: null,

            production_status: "未生産",

            notes: text

        };



        try {

            const response = await invoke("add_schedule", { request: formData });

            if (response.success) {

                setStatus("メモを追加しました");

                memoModal.classList.remove("active");

                memoForm.reset();

                await loadSchedules();

                renderGantt();

            } else {

                setStatus("メモ追加エラー: " + response.error, true);

            }

        } catch (error) {

            setStatus("メモ追加エラー: " + error, true);

        }

    });



    // コンテ��ストメニュー用の変数

    let contextClickedTime = null;

    const contextMenu = document.getElementById("context-menu");

    

    // クリック��でコンテ��ストメニューを閉じる

    document.addEventListener("click", () => {

        if (contextMenu) contextMenu.style.display = "none";

    });

    

    // コンテ��ストメニューのホバー効果

    document.querySelectorAll(".context-menu-item").forEach(item => {

        item.addEventListener("mouseenter", () => item.style.backgroundColor = "rgba(0,122,255,0.1)");

        item.addEventListener("mouseleave", () => item.style.backgroundColor = "transparent");

    });

    

    // コンテ��ストメニューのアクション

    document.querySelector('[data-action="add-memo"]')?.addEventListener("click", () => {

        document.getElementById("memo-text").value = "";

        memoModal.classList.add("active");

    });

    

    document.querySelector('[data-action="add-shape"]')?.addEventListener("click", () => {

        document.getElementById("shape-text").value = "";

        document.getElementById("shape-modal").classList.add("active");

    });



    // ガントチャートに右クリック��でコンテ��ストメニュー表示

    document.getElementById("gantt-container")?.addEventListener("contextmenu", (e) => {

        e.preventDefault();



        // クリック��位置から日時を計算

        const row = e.target.closest(".gantt-row");

        if (!row) return;



        const dateStr = row.dataset.date;

        const contentDiv = row.querySelector(".gantt-row-content");

        if (!contentDiv) return;



        const rect = contentDiv.getBoundingClientRect();

        const relativeX = e.clientX - rect.left;

        const minutesFromStart = Math.round(relativeX / 60 * 60);

        const snappedMinutes = Math.round(minutesFromStart / 15) * 15;



        const rowDate = new Date(dateStr);

        rowDate.setHours(6, 0, 0, 0);

        contextClickedTime = new Date(rowDate.getTime() + snappedMinutes * 60 * 1000);



        // コンテ��ストメニューを表示

        if (contextMenu) {

            contextMenu.style.display = "block";

            contextMenu.style.left = e.clientX + "px";

            contextMenu.style.top = e.clientY + "px";

        }

    });

}



// 図形モーダル初期化

function initShapeModal() {

    const shapeModal = document.getElementById("shape-modal");

    const shapeForm = document.getElementById("shape-form");

    const shapeClose = document.getElementById("shape-modal-close");

    const shapeCancel = document.getElementById("shape-modal-cancel");



    if (!shapeModal || !shapeForm) return;



    shapeClose?.addEventListener("click", () => shapeModal.classList.remove("active"));

    shapeCancel?.addEventListener("click", () => shapeModal.classList.remove("active"));



    shapeForm.addEventListener("submit", async (e) => {

        e.preventDefault();

        // 現在時刻を使用（日時選択はなし）
        const startDate = new Date();
        const duration = 2; // デフォルト2時間

        const shapeType = document.getElementById("shape-type").value;

        const shapeColor = 'transparent'; // 背景透明

        const shapeText = document.getElementById("shape-text").value;


        const endDate = new Date(startDate.getTime() + duration * 60 * 60 * 1000);



        const formatIso = (d) => {

            const pad = (n) => n.toString().padStart(2, '0');

            return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;

        };



        // 図形データをnotesにJSON形式で保存

        const shapeData = JSON.stringify({ type: shapeType, color: shapeColor, text: shapeText });



        const formData = {

            product_name: "SHAP",

            line: "",

            start_datetime: formatIso(startDate),

            end_datetime: formatIso(endDate),

            quantity1: null,

            total_quantity: null,

            production_status: "未生産",

            notes: shapeData

        };



        try {

            const response = await invoke("add_schedule", { request: formData });

            if (response.success) {

                setStatus("図形を追加しました");

                shapeModal.classList.remove("active");

                shapeForm.reset();

                await loadSchedules();

                renderGantt();

            } else {

                setStatus("図形追加エラー: " + response.error, true);

            }

        } catch (error) {

            setStatus("図形追加エラー: " + error, true);

        }

    });

}

let schedules = [];

let currentDate = new Date();

let appMode = "admin"; // "admin" or "worker"



// DOM要素

const elements = {};



// 初期化

document.addEventListener("DOMContentLoaded", async () => {

    await initAppMode();

    await initKintoneConfig();

    createTooltiplement();

    initlements();

    initventListeners();

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



// kintone設定を初期化（デフォルト値を設定！

async function initKintoneConfig() {

    const defaultConfig = {

        subdomain: "jfe-rockfiber",

        app_id: 506,

        api_token: "3CakeA8SORFDrOawAcL3Y2UY8TogZkLw52U5RBo"

    };

    

    // フォームに初期値を設宁

    const subdomainl = document.getElementById("subdomain");

    const appIdl = document.getElementById("app-id");

    const apiTokenl = document.getElementById("api-token");

    

    if (subdomainl) subdomainl.value = defaultConfig.subdomain;

    if (appIdl) appIdl.value = defaultConfig.app_id;

    if (apiTokenl) apiTokenl.value = defaultConfig.api_token;

    

    // 自動的にkintone設定を保存

    try {

        const response = await invoke("save_kintone_config", { config: defaultConfig });

        if (response.success) {

            console.log("kintone設定を初期化しました");

        }

    } catch (error) {

        console.error("kintone設定�初期化に失敁", error);

    }

}



// モードに応じてUIを�り替ぁ

function applyAppMode() {

    const isWorker = appMode === "worker";

    

    // 作業老��ードで非表示にする要素

    const adminOnlyElements = [

        "btn-test-data",

        "btn-sync-to-kintone",

        "btn-settings"

    ];

    

    // タブを制御��新規追加タブ�作業老��ードで非表示��

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

// カスタムテ�ルチップ要素を作�

function createTooltiplement() {

    const tooltip = document.createElement("div");

    tooltip.className = "custom-tooltip";

    tooltip.id = "custom-tooltip";

    document.body.appendChild(tooltip);

}



// テ�ルチップを表示

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

            <span class="tooltip-label">開姁</span>

            <span class="tooltip-value">${formatDateTime(schedule.start_datetime)}</span>

        </div>

        <div class="tooltip-row">

            <span class="tooltip-label">終亁</span>

            <span class="tooltip-value">${formatDateTime(schedule.end_datetime)}</span>

        </div>

        <div class="tooltip-row">

            <span class="tooltip-label">個数:</span>

            <span class="tooltip-value">${qty || "-"} 倁/span>

        </div>

        ${schedule.notes ? `<div class="tooltip-row"><span class="tooltip-label">備老</span><span class="tooltip-value">${schedule.notes}</span></div>` : ""}

        <div class="tooltip-status ${statusClass}">${displayStatus}</div>

    `;

    

    // 位置を計算

    const x = e.clientX + 15;

    const y = e.clientY + 15;

    

    // 画面からはみ出さなぁ��ぁ��調整

    const rect = tooltip.getBoundingClientRect();

    const maxX = window.innerWidth - 420;

    const maxY = window.innerHeight - 250;

    

    tooltip.style.left = Math.min(x, maxX) + "px";

    tooltip.style.top = Math.min(y, maxY) + "px";

    tooltip.classList.add("visible");

}



// テ�ルチップを非表示

function hideTooltip() {

    const tooltip = document.getElementById("custom-tooltip");

    if (tooltip) {

        tooltip.classList.remove("visible");

    }

}



// DOM要素の初期化

function initlements() {

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

    setStatus("kintoneからテ�タを取得中...");

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

    setStatus("kintoneへテ�タを送信中...");

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

            production_status: "未生産",

            notes: `テ��テ{i + 1}`

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



    setStatus(`${successCount}件のテ��トデータを追加しました`);

    await loadSchedules();

    renderGantt();

}



// イベントリスナ�の設宁

function initventListeners() {

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

    elements.btnSyncFrom.addEventListener("click", handleSyncFromKintone); // Bound

    elements.btnSyncTo.addEventListener("click", handleSyncToKintone);



    if (elements.btnTestData) {

        elements.btnTestData.addEventListener("click", handleGenerateTestData);

    }



    document.addEventListener('mousemove', handleGlobalMouseMove);

    document.addEventListener('mouseup', handleGlobalMouseUp);



    // メモモーダル関連

    initMemoModal();

    initShapeModal();

}



// ドラテ��状態管琁

const dragState = {

    pendingDrag: false,

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



// ドラテ��有効匁

function setupDraggable(element, schedule, durationMs, dayStart6AM) {

    element.addEventListener('mousedown', (e) => {

        if (dragState.isDragging) return;



        // ドラテ��の準備��まだ開始しなぁ��

        dragState.pendingDrag = true;

        dragState.element = element;

        dragState.schedule = schedule;

        dragState.durationMs = durationMs;

        dragState.barWidth = element.offsetWidth;

        dragState.dayStart6AM = dayStart6AM;

        dragState.startX = e.clientX;

        dragState.startY = e.clientY;

        dragState.initialLeft = parseFloat(element.style.left);

        dragState.originalRow = element.closest('.gantt-row');

        e.preventDefault();

    });

}



// ドラテ��を実際に開始する関数

function startDrag(e) {

    const element = dragState.element;

    dragState.isDragging = true;

    dragState.pendingDrag = false;



    const ghost = element.cloneNode(true);

    ghost.classList.add('gantt-ghost');

    ghost.style.opacity = '0.8';

    ghost.style.border = 'none';

    ghost.style.boxShadow = '0 15px 40px rgba(0,0,0,0.2)';

    ghost.style.zIndex = '1000';

    ghost.style.pointervents = 'none';

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

    preview.style.borderRadius = '14px';

    preview.style.border = '2px dashed #007AFF';

    preview.style.backgroundColor = 'rgba(0, 122, 255, 0.1)';

    preview.style.pointervents = 'none';

    preview.style.zIndex = '100';

    preview.style.display = 'none';



    const timeLabel = document.createElement('div');

    timeLabel.className = 'preview-time-label';

    timeLabel.style.position = 'absolute';

    timeLabel.style.top = '-35px';

    timeLabel.style.left = '0';

    timeLabel.style.backgroundColor = '#007AFF';

    timeLabel.style.color = 'white';

    timeLabel.style.padding = '6px 16px';

    timeLabel.style.borderRadius = '20px';

    timeLabel.style.fontSize = '13px';

    timeLabel.style.fontWeight = 'bold';

    timeLabel.style.whiteSpace = 'nowrap';

    preview.appendChild(timeLabel);



    dragState.dropPreview = preview;

    element.style.opacity = '0.3';

}



function handleGlobalMouseMove(e) {

    // ドラテ��の準備中で、まだ開始してぁ��ぁ��吁

    if (dragState.pendingDrag && !dragState.isDragging) {

        const dx = Math.abs(e.clientX - dragState.startX);

        const dy = Math.abs(e.clientY - dragState.startY);

        // 5px以上移動したらドラテ��開姁

        if (dx > 5 || dy > 5) {

            startDrag(e);

        }

        return;

    }



    if (!dragState.isDragging || !dragState.ghost) return;



    dragState.ghost.style.top = (e.clientY - 30) + 'px';

    dragState.ghost.style.left = (e.clientX - 50) + 'px';



    const dropY = e.clientY;

    let targetRow = null;



    document.querySelectorAll('.gantt-row').forEach(row => {

        const rect = row.getBoundingClientRect();

        if (dropY >= rect.top && dropY <= rect.bottom) {

            targetRow = row;

            row.style.backgroundColor = 'rgba(0, 122, 255, 0.05)';

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

        const previewnd = new Date(previewStart.getTime() + dragState.durationMs);



        const formatTime = (d) => `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;

        const timeText = `${formatTime(previewStart)} - ${formatTime(previewnd)}`;



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

    // pendingDragのみの場合（クリック��だけでドラテ��開始してぁ��ぁ���リセテ��して終亁

    if (dragState.pendingDrag && !dragState.isDragging) {

        dragState.pendingDrag = false;

        dragState.element = null;

        dragState.schedule = null;

        return;

    }



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

        const newnd = new Date(newStart.getTime() + durationMs);



        try {

            const request = {

                id: schedule.id,

                start_datetime: formatIsoString(newStart),

                end_datetime: formatIsoString(newnd)

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



    dragState.pendingDrag = false;

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

        console.log("=== loadSchedules called ===");

        const response = await invoke("get_schedules");

        console.log("=== get_schedules response:", response);

        if (response.success) {

            schedules = response.data || [];

            console.log("=== Loaded schedules count:", schedules.length);

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

        production_status: "未生産",

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

    const quantityInput = document.getElementById("quantity1");

    const productNameSelect = document.getElementById("product-name");

    const startDatetime = document.getElementById("start-datetime").value;

    const endDatetimeInput = document.getElementById("end-datetime");

    const efficiencySelect = document.getElementById("efficiency");

    const notesInput = document.getElementById("notes");

    

    // フォーム要素の親div��非表示刁��替え用��

    const quantityGroup = quantityInput.closest('.form-group');

    const efficiencyGroup = efficiencySelect.closest('.form-group');

    const endDatetimeGroup = endDatetimeInput.closest('.form-group');

    const notesGroup = notesInput.closest('.form-group');



    const quantity = parseFloat(quantityInput.value) || 0;

    const productName = productNameSelect.value;

    const efficiency = parseFloat(efficiencySelect.value) || 1;

    const weight = productWeights[productName] || 0;



    // MMOモード�場合�UI刁��替ぁ

    if (productName === "MMO") {

        if (quantityGroup) quantityGroup.style.display = "none";

        if (efficiencyGroup) efficiencyGroup.style.display = "none";

        

        // 終亁��時�入力可能にする��期間指定�ため��

        if (endDatetimeInput) endDatetimeInput.readOnly = false;

        

        // 備老��ベルを変更

        const notesLabel = notesGroup ? notesGroup.querySelector('label') : null;

        if (notesLabel) notesLabel.textContent = "コメント�容";

        

        // 終亁��時が未入力なら開始時間�1時間後に設宁

        if (startDatetime && !endDatetimeInput.value) {

            const startDate = new Date(startDatetime);

            const endDate = new Date(startDate.getTime() + 60 * 60 * 1000);

            endDatetimeInput.value = formatDateTimeForInput(endDate);

        }

    } else {

        // 通常モード復帰

        if (quantityGroup) quantityGroup.style.display = "block";

        if (efficiencyGroup) efficiencyGroup.style.display = "block";

        if (endDatetimeInput) endDatetimeInput.readOnly = true;



        const notesLabel = notesGroup ? notesGroup.querySelector('label') : null;

        if (notesLabel) notesLabel.textContent = "備考";



        // 自動計算ロジック��

        if (startDatetime && quantity > 0 && weight > 0 && efficiency > 0) {

            const productionTime = (quantity * weight / 1000) / efficiency * 60;

            const startDate = new Date(startDatetime);

            const endDate = new Date(startDate.getTime() + productionTime * 60 * 1000);



            const endStr = formatDateTimeForInput(endDate);

            endDatetimeInput.value = endStr;

        }

    }

}



// スケジュールテ�ブル描画��chedule_numberを使用��

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

                    <button class="btn btn-small btn-primary btn-edit" data-id="${schedule.id}">編雁/button>

                    <button class="btn btn-small btn-danger btn-delete" data-id="${schedule.id}">削除</button>

                ` : "-"}

            </td>

        `;

        tbody.appendChild(tr);

        

        // 管琁����ード�み編雁�削除イベントを設宁

        if (appMode === "admin") {

            tr.querySelector(".btn-edit").addEventListener("click", () => openditModal(schedule));

            tr.querySelector(".btn-delete").addEventListener("click", () => handleDeleteSchedule(schedule.id, schedule.product_name));

        }

    });

}



// 編雁��ーダルを開ぁ

function openditModal(schedule) {

    const modal = document.getElementById("edit-modal");

    if (!modal) {

        createditModal();

    }

    

    document.getElementById("edit-id").value = schedule.id;

    document.getElementById("edit-product-name").value = schedule.product_name;

    document.getElementById("edit-start-datetime").value = formatDateTimeForInput(schedule.start_datetime);

    document.getElementById("edit-end-datetime").value = formatDateTimeForInput(schedule.end_datetime);

    document.getElementById("edit-quantity").value = schedule.total_quantity || schedule.quantity1 || "";

    document.getElementById("edit-notes").value = schedule.notes || "";

    document.getElementById("edit-status").value = schedule.production_status || "未生産";

    

    document.getElementById("edit-modal").classList.add("active");

}



// 日時をinput用にフォーマッテ

function formatDateTimeForInput(dateStr) {

    if (!dateStr) return "";

    const date = new Date(dateStr);

    if (isNaN(date.getTime())) return "";

    const pad = (n) => n.toString().padStart(2, "0");

    return `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;

}



// 編雁��ーダルを作�

function createditModal() {

    const modal = document.createElement("div");

    modal.id = "edit-modal";

    modal.className = "modal";

    modal.innerHTML = `

        <div class="modal-content">

            <div class="modal-header">

                <h2>📝 スケジュール編雁/h2>

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

                        <label for="edit-start-datetime">開始日晁/label>

                        <input type="datetime-local" id="edit-start-datetime" required>

                    </div>

                    <div class="form-group">

                        <label for="edit-end-datetime">終亁��晁/label>

                        <input type="datetime-local" id="edit-end-datetime">

                    </div>

                </div>

                <div class="form-row">

                    <div class="form-group">

                        <label for="edit-quantity">個数</label>

                        <input type="number" id="edit-quantity" min="0">

                    </div>

                    <div class="form-group">

                        <label for="edit-status">生産状況/label>

                        <select id="edit-status">

                            <option value="未生産">未生産</option>

                            <option value="生産中">生産中</option>

                            <option value="生産終亁>生産終亁/option>

                        </select>

                    </div>

                </div>

                <div class="form-group">

                    <label for="edit-notes">備老/label>

                    <input type="text" id="edit-notes" placeholder="備老��入劁>

                </div>

                <div class="form-actions">

                    <button type="submit" class="btn btn-primary">💾 保存/button>

                    <button type="button" class="btn btn-secondary" id="edit-modal-cancel">キャンセル</button>

                </div>

            </form>

        </div>

    `;

    document.body.appendChild(modal);

    

    // イベントリスナ�を設宁

    document.getElementById("edit-modal-close").addEventListener("click", closeditModal);

    document.getElementById("edit-modal-cancel").addEventListener("click", closeditModal);

    document.getElementById("edit-schedule-form").addEventListener("submit", handleditSchedule);

}



// 編雁��ーダルを閉じる

function closeditModal() {

    document.getElementById("edit-modal").classList.remove("active");

}



// 編雁��保存

async function handleditSchedule(e) {

    e.preventDefault();

    

    const id = parseInt(document.getElementById("edit-id").value);

    const startDatetime = document.getElementById("edit-start-datetime").value;

    const endDatetime = document.getElementById("edit-end-datetime").value || null;

    

    console.log("dit schedule:", { id, startDatetime, endDatetime });

    

    if (!id || !startDatetime) {

        setStatus("ID または開始日時が無効です", true);

        return;

    }

    

    try {

        // datetime-localの値は "2026-02-02T08:00" 形弁

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

            closeditModal();

            await loadSchedules();

            renderGantt();

        } else {

            setStatus("更新エラー: " + (response.error || "不�なエラー"), true);

        }

    } catch (error) {

        console.error("dit error:", error);

        setStatus("更新エラー: " + error, true);

    }

}



// スケジュールを削除

async function handleDeleteSchedule(id, productName) {
    if (!confirm("このスケジュールを削除しますか？")) return;

    

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



    timeline.innerHTML = '<div style="width:100px;padding:10px;font-weight:bold;">日仁/div>';

    for (let h = 6; h < 30; h++) {

        const hour = h % 24;

        timeline.innerHTML += `<div style="width:60px;text-align:center;padding:10px;border-left:1px solid rgba(255,255,255,0.2);">${hour}:00</div>`;

    }



    rows.innerHTML = "";

    const startDate = new Date(currentDate);

    startDate.setDate(startDate.getDate() - 1); // 1日前から表示



    for (let i = 0; i < 6; i++) { // 6日刁��示��前日、日後！

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



        // MMO/SHAPを除夁

        const daySchedules = schedules.filter(s => {

            if (s.product_name === "MMO" || s.product_name === "SHAP") return false;

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





    // MMO/SHAPをオーバ�レイとして描画��xcel図形風��

    renderOverlayItems(container, startDate);

}



// メモと図形をオーバ�レイとして描画

function renderOverlayItems(container, startDate) {

    let overlay = container.querySelector('.gantt-overlay');

    if (overlay) overlay.remove();



    overlay = document.createElement('div');

    overlay.className = 'gantt-overlay';

    overlay.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:1000;';

    container.style.position = 'relative';

    container.appendChild(overlay);



    const overlayItems = schedules.filter(s => s.product_name === 'MMO' || s.product_name === 'SHAP');



    overlayItems.forEach(item => {

        if (!item.start_datetime) return;

        // ピクセル位置をnotesから取得（存在すれば）
        let pixelPos = null;
        let notesData = item.notes || '';
        if (item.product_name === 'MMO') {
            // MMOのnotesはテキストまたは{text, x, y, scale}形式
            try {
                const parsed = JSON.parse(notesData);
                if (parsed.x !== undefined && parsed.y !== undefined) {
                    pixelPos = { x: parsed.x, y: parsed.y, w: parsed.w, h: parsed.h, scale: parsed.scale || 1.0 };
                    notesData = parsed.text || '';
                }
            } catch(e) { /* テキスト形式 */ }
        } else if (item.product_name === 'SHAP') {
            // SHAPのnotesは{type, color, text, x, y, scale}形式
            try {
                const parsed = JSON.parse(notesData);
                if (parsed.x !== undefined && parsed.y !== undefined) {
                    pixelPos = { x: parsed.x, y: parsed.y, w: parsed.w, h: parsed.h, scale: parsed.scale || 1.0 };
                }
            } catch(e) {}
        }

        let leftPx, topPx, widthPx, heightPx;
        
        if (pixelPos) {
            // ピクセル位置とサイズが保存されていればそれを使用
            leftPx = pixelPos.x;
            topPx = pixelPos.y;
            widthPx = pixelPos.w || 120;
            heightPx = pixelPos.h || 80;
        } else {
            // 保存されていなければ日時から計算
            const itemStart = new Date(item.start_datetime);
            const itemDateStr = getProductionDateStr(itemStart);
            const rowlement = container.querySelector('[data-date="' + itemDateStr + '"]');
            if (!rowlement) return;
            
            const rowTop = rowlement.offsetTop;
            const dayStart = new Date(itemStart);
            dayStart.setHours(6, 0, 0, 0);
            if (itemStart.getHours() < 6) dayStart.setDate(dayStart.getDate() - 1);
            const msFrom6AM = itemStart.getTime() - dayStart.getTime();
            leftPx = 100 + (msFrom6AM / (60 * 60 * 1000)) * 60;
            topPx = rowTop + 10;
            
            // デフォルトサイズ
            const itemStart2 = new Date(item.start_datetime);
            const itemnd = item.end_datetime ? new Date(item.end_datetime) : new Date(itemStart2.getTime() + 2*60*60*1000);
            const durationMs = itemnd.getTime() - itemStart2.getTime();
            widthPx = Math.max(60, (durationMs / (60 * 60 * 1000)) * 60);
            heightPx = 80;
        }

        const itemStart = new Date(item.start_datetime);
        const itemnd = item.end_datetime ? new Date(item.end_datetime) : new Date(itemStart.getTime() + 2*60*60*1000);

        const iteml = document.createElement('div');

        iteml.style.cssText = 'position:absolute;left:' + leftPx + 'px;top:' + topPx + 'px;width:' + widthPx + 'px;height:' + heightPx + 'px;pointer-events:auto;cursor:move;padding:10px;display:flex;align-items:flex-start;justify-content:space-between;z-index:1001;background:transparent;border:none;border-radius:4px;overflow:visible;box-sizing:border-box;transform-origin:top left;';

        // 保存されたスケール値を適用
        if (pixelPos && pixelPos.scale && pixelPos.scale !== 1.0) {
            iteml.style.transform = `scale(${pixelPos.scale})`;
        }

        if (item.product_name === 'MMO') {

            // 背景色はcssTextで設定済み（リサイズ確認用）

            // メモテキストをnotesDataから取得（JSON形式の場合はtextプロパティ）
            let memoText = notesData;
            if (!memoText) {
                try {
                    const parsed = JSON.parse(item.notes || '{}');
                    memoText = parsed.text || '📝 メモ';
                } catch(e) {
                    memoText = item.notes || '📝 メモ';
                }
            }

            const textSpan = document.createElement('span');

            textSpan.style.cssText = 'color:#333;font-size:14px;font-weight:500;white-space:pre-wrap;word-break:break-word;flex:1;cursor:text;';

            textSpan.textContent = memoText;

            iteml.appendChild(textSpan);

            // ダブルクリックで編集モード
            textSpan.addEventListener('dblclick', function(e) {
                e.stopPropagation();
                const input = document.createElement('textarea');
                input.value = textSpan.textContent;
                input.style.cssText = 'width:100%;height:100%;border:1px solid #007AFF;border-radius:4px;padding:4px;font-size:14px;resize:none;outline:none;';
                textSpan.style.display = 'none';
                iteml.insertBefore(input, textSpan);
                input.focus();
                input.select();
                
                async function saveEdit() {
                    const newText = input.value;
                    textSpan.textContent = newText;
                    textSpan.style.display = '';
                    input.remove();
                    
                    // DBに保存
                    const newX = parseInt(iteml.style.left) || 0;
                    const newY = parseInt(iteml.style.top) || 0;
                    const newW = parseInt(iteml.style.width) || 120;
                    const newH = parseInt(iteml.style.height) || 80;
                    const newNotes = JSON.stringify({ text: newText, x: newX, y: newY, w: newW, h: newH });
                    
                    try {
                        await window.__TAURI__.core.invoke('update_schedule', {
                            request: { id: item.id, notes: newNotes }
                        });
                        item.notes = newNotes;
                    } catch (err) {
                        console.error('メモ更新エラー:', err);
                    }
                }
                
                input.addEventListener('blur', saveEdit);
                input.addEventListener('keydown', function(ke) {
                    if (ke.key === 'Escape') {
                        textSpan.style.display = '';
                        input.remove();
                    } else if (ke.key === 'Enter' && ke.ctrlKey) {
                        saveEdit();
                    }
                });
            });

        } else if (item.product_name === 'SHAP') {

            let shapeInfo = { type: 'circle', color: 'blue', text: '' };

            try { shapeInfo = JSON.parse(item.notes || '{}'); } catch(e) {}

            const colorMap = { red: 'rgba(255,59,48,0.6)', blue: 'rgba(0,122,255,0.6)', green: 'rgba(52,199,89,0.6)', yellow: 'rgba(255,204,0,0.7)', purple: 'rgba(175,82,222,0.6)', orange: 'rgba(255,149,0,0.6)' };

            // 背景色はcssTextで設定済み（リサイズ確認用）

            const iconMap = { 'arrow-right': '➡', 'arrow-down': '⬇', 'star': '★', 'warning': '⚠️', 'check': '✅', 'important': '❗', 'circle': '🔴' };

            const icon = iconMap[shapeInfo.type] || '🔷';

            const contentSpan = document.createElement('span');

            contentSpan.style.cssText = 'font-size:28px;display:flex;align-items:center;gap:8px;flex:1;';

            contentSpan.innerHTML = icon + ' <span style="font-size:14px;font-weight:600;color:#333">' + (shapeInfo.text || '') + '</span>';

            iteml.appendChild(contentSpan);

        }

        // 右クリックで削除メニュー
        iteml.addEventListener('contextmenu', async (e) => {
            e.preventDefault();
            if (confirm('削除しますか？')) {
                try {
                    await window.__TAURI__.core.invoke('delete_schedule', { id: item.id });
                    await loadSchedules();
                    renderGantt();
                } catch (err) { alert('削除に失敗しました'); }
            }
        });

        // リサイズハンドル（右下）
        const resizeHandle = document.createElement('div');
        resizeHandle.className = 'resize-handle';
        resizeHandle.style.cssText = 'position:absolute;right:0;bottom:0;width:20px;height:20px;cursor:se-resize;background:rgba(0,122,255,0.5);border-radius:0 0 4px 0;pointer-events:auto;z-index:10;';
        resizeHandle.innerHTML = '⤡';
        resizeHandle.style.fontSize = '12px';
        resizeHandle.style.display = 'flex';
        resizeHandle.style.alignItems = 'center';
        resizeHandle.style.justifyContent = 'center';
        resizeHandle.style.color = '#fff';
        resizeHandle.style.fontWeight = 'bold';
        iteml.appendChild(resizeHandle);

        // リサイズ機能（transform: scaleで中身も拡大縮小）
        resizeHandle.addEventListener('mousedown', function(e) {
            e.stopPropagation();
            e.preventDefault();
            const startX = e.clientX;
            const startY = e.clientY;
            const origWidth = parseInt(iteml.style.width) || 100;
            const origHeight = parseInt(iteml.style.height) || 100;
            
            // 現在のscaleを取得（初期値1.0）
            const currentTransform = iteml.style.transform || '';
            const scaleMatch = currentTransform.match(/scale\(([\d.]+)\)/);
            const origScale = scaleMatch ? parseFloat(scaleMatch[1]) : 1.0;
            
            // transformOriginを左上に設定
            iteml.style.transformOrigin = 'top left';
            
            function onResizeMove(ev) {
                // ドラッグ距離からスケール係数を計算
                const deltaX = ev.clientX - startX;
                const deltaY = ev.clientY - startY;
                const delta = Math.max(deltaX, deltaY); // 大きい方を採用
                const scaleChange = delta / 100; // 100pxドラッグで1.0倍変化
                const newScale = Math.max(0.3, Math.min(3.0, origScale + scaleChange));
                
                iteml.style.transform = `scale(${newScale.toFixed(2)})`;
            }
            
            async function onResizeEnd(ev) {
                document.removeEventListener('mousemove', onResizeMove);
                document.removeEventListener('mouseup', onResizeEnd);
                
                // スケール値を取得してnotesに保存
                const transformStr = iteml.style.transform || '';
                const scaleMatch2 = transformStr.match(/scale\(([\d.]+)\)/);
                const finalScale = scaleMatch2 ? parseFloat(scaleMatch2[1]) : 1.0;
                
                const newX = parseInt(iteml.style.left) || 0;
                const newY = parseInt(iteml.style.top) || 0;
                
                let newNotes;
                if (item.product_name === 'MMO') {
                    let text = '';
                    try {
                        const parsed = JSON.parse(item.notes || '{}');
                        text = parsed.text || item.notes || '';
                    } catch(e) { text = item.notes || ''; }
                    newNotes = JSON.stringify({ text: text, x: newX, y: newY, scale: finalScale });
                } else {
                    let shapeData = { type: 'circle', color: 'blue', text: '' };
                    try { shapeData = JSON.parse(item.notes || '{}'); } catch(e) {}
                    shapeData.x = newX;
                    shapeData.y = newY;
                    shapeData.scale = finalScale;
                    newNotes = JSON.stringify(shapeData);
                }
                
                try {
                    await window.__TAURI__.core.invoke('update_schedule', {
                        request: { id: item.id, notes: newNotes }
                    });
                    item.notes = newNotes;
                } catch (err) {
                    console.error('サイズ更新エラー:', err);
                }
            }
            
            document.addEventListener('mousemove', onResizeMove);
            document.addEventListener('mouseup', onResizeEnd);
        });

        // ドラッグ機能を追加
        iteml.addEventListener('mousedown', function(e) {
            if (resizeHandle.contains(e.target)) return; // リサイズハンドルは除外
            
            const startX = e.clientX;
            const startY = e.clientY;
            const origLeft = parseInt(iteml.style.left) || 0;
            const origTop = parseInt(iteml.style.top) || 0;
            const itemId = item.id;
            const duration = itemnd.getTime() - itemStart.getTime();
            
            iteml.style.cursor = 'grabbing';
            iteml.style.zIndex = '2000';
            e.preventDefault();

            function onMouseMove(ev) {
                const deltaX = ev.clientX - startX;
                const deltaY = ev.clientY - startY;
                iteml.style.left = (origLeft + deltaX) + 'px';
                iteml.style.top = (origTop + deltaY) + 'px';
            }

            async function onMouseUp(ev) {
                document.removeEventListener('mousemove', onMouseMove);
                document.removeEventListener('mouseup', onMouseUp);
                iteml.style.cursor = 'move';
                iteml.style.zIndex = '1001';
                
                // 新しいピクセル位置を取得
                const newX = parseInt(iteml.style.left) || 0;
                const newY = parseInt(iteml.style.top) || 0;
                
                // notesにピクセル位置を追加して保存
                let newNotes;
                if (item.product_name === 'MMO') {
                    // MMO: {text, x, y}形式で保存
                    let text = notesData;
                    try {
                        const parsed = JSON.parse(item.notes || '{}');
                        text = parsed.text || item.notes || '';
                    } catch(e) {
                        text = item.notes || '';
                    }
                    newNotes = JSON.stringify({ text: text, x: newX, y: newY });
                } else {
                    // SHAP: {type, color, text, x, y}形式で保存
                    let shapeData = { type: 'circle', color: 'blue', text: '' };
                    try {
                        shapeData = JSON.parse(item.notes || '{}');
                    } catch(e) {}
                    shapeData.x = newX;
                    shapeData.y = newY;
                    newNotes = JSON.stringify(shapeData);
                }
                
                try {
                    await window.__TAURI__.core.invoke('update_schedule', {
                        request: {
                            id: itemId,
                            notes: newNotes
                        }
                    });
                    // ローカルのitem.notesも更新
                    item.notes = newNotes;
                } catch (err) {
                    console.error('位置更新エラー:', err);
                }
            }

            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
        });

        overlay.appendChild(iteml);

    });



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

            const lastnd = lastSchedule.end_datetime

                ? new Date(lastSchedule.end_datetime).getTime()

                : new Date(lastSchedule.start_datetime).getTime() + 60*60*1000;



            if (start >= lastnd) {

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



if (schedule.product_name === "MMO") {

          bar.classList.add("is-memo");

          // xcel風スタイルを直接適用��枠なし�半透�・重なり可��

          bar.style.background = "rgba(255, 243, 128, 0.8)";

          bar.style.border = "none";

          bar.style.boxShadow = "none";

          bar.style.zIndex = "500";

          

          // メモコンテ��

          const memoContent = document.createElement("div");

          memoContent.style.display = "flex";

          memoContent.style.alignItems = "flex-start";

          memoContent.style.justifyContent = "space-between";

          memoContent.style.width = "100%";

          memoContent.style.height = "100%";

          

          const noteSpan = document.createElement("span");

          noteSpan.className = "bar-product";

          noteSpan.style.whiteSpace = "normal";

          noteSpan.style.fontSize = "14px";

          noteSpan.style.flex = "1";

          noteSpan.textContent = schedule.notes || "📝 メモ";

          memoContent.appendChild(noteSpan);

          

          // 削除ボタン

          const deleteBtn = document.createElement("button");

          deleteBtn.className = "memo-delete-btn";

          deleteBtn.textContent = "×";

          deleteBtn.style.cssText = `

              background: rgba(255,59,48,0.8);

              color: white;

              border: none;

              border-radius: 50%;

              width: 22px;

              height: 22px;

              font-size: 14px;

              font-weight: bold;

              cursor: pointer;

              margin: 2px;

              flex-shrink: 0;

              display: flex;

              align-items: center;

              justify-content: center;

              opacity: 0.7;

              transition: opacity 0.2s;

          `;

          deleteBtn.addEventListener("mouseenter", () => deleteBtn.style.opacity = "1");

          deleteBtn.addEventListener("mouseleave", () => deleteBtn.style.opacity = "0.7");

          deleteBtn.addEventListener("click", async (e) => {

              e.stopPropagation();

              if (confirm("このメモを削除しますか？")) {

                  try {

                      await window.__TAURI__.core.invoke("delete_schedule", { id: schedule.id });

                      await loadSchedules(); renderGantt();

                  } catch (err) {

                      console.error("メモ削除エラー:", err);

                      alert("メモの削除に失敗しました");

                  }

              }

          });

          memoContent.appendChild(deleteBtn);

          bar.appendChild(memoContent);

      } else if (schedule.product_name === "SHAP") {

          // 図形の処琁

          bar.classList.add("is-shape");

          

          let shapeInfo = { type: "circle", color: "blue", text: "" };

          try {

              shapeInfo = JSON.parse(schedule.notes || "{}");

          } catch (e) {}

          // 色の設宁- xcel風��枠なし、半透�背景のみ��

          const colorMap = {

              red: "rgba(255,59,48,0.55)",

              blue: "rgba(0,122,255,0.55)",

              green: "rgba(52,199,89,0.55)",

              yellow: "rgba(255,204,0,0.65)",

              purple: "rgba(175,82,222,0.55)",

              orange: "rgba(255,149,0,0.55)"

          };

          bar.style.backgroundColor = colorMap[shapeInfo.color] || colorMap.blue;

          bar.style.border = "none";

          bar.style.boxShadow = "none";

          bar.style.zIndex = "500";



          

          // 図形コンテ��

          const shapeContent = document.createElement("div");

          shapeContent.style.display = "flex";

          shapeContent.style.alignItems = "center";

          shapeContent.style.justifyContent = "space-between";

          shapeContent.style.width = "100%";

          shapeContent.style.height = "100%";

          

          // 図形アイコン

          const iconMap = { 'arrow-right': '➡', 'arrow-down': '⬇', 'star': '★', 'warning': '⚠️', 'check': '✅', 'important': '❗', 'circle': '🔴' };

          const icon = iconMap[shapeInfo.type] || "🔷";

          

          const shapeSpan = document.createElement("span");

          shapeSpan.style.fontSize = "24px";

          shapeSpan.style.flex = "1";

          shapeSpan.style.display = "flex";

          shapeSpan.style.alignItems = "center";

          shapeSpan.style.gap = "8px";

          shapeSpan.innerHTML = `<span style="font-size:32px">${icon}</span><span style="font-size:14px;font-weight:600;color:#333">${shapeInfo.text || ""}</span>`;

          shapeContent.appendChild(shapeSpan);

          

          // 削除ボタン

          const deleteBtn = document.createElement("button");

          deleteBtn.textContent = "×";

          deleteBtn.style.cssText = `

              background: rgba(255,59,48,0.8);

              color: white;

              border: none;

              border-radius: 50%;

              width: 22px;

              height: 22px;

              font-size: 14px;

              font-weight: bold;

              cursor: pointer;

              margin: 2px;

              flex-shrink: 0;

              display: flex;

              align-items: center;

              justify-content: center;

              opacity: 0.7;

              transition: opacity 0.2s;

          `;

          deleteBtn.addEventListener("mouseenter", () => deleteBtn.style.opacity = "1");

          deleteBtn.addEventListener("mouseleave", () => deleteBtn.style.opacity = "0.7");

          deleteBtn.addEventListener("click", async (e) => {

              e.stopPropagation();

              if (confirm("この図形を削除しますか？")) {

                  try {

                      await window.__TAURI__.core.invoke("delete_schedule", { id: schedule.id });

                      await loadSchedules(); renderGantt();

                  } catch (err) {

                      console.error("図形削除エラー:", err);

                      alert("図形の削除に失敗しました");

                  }

              }

          });

          shapeContent.appendChild(deleteBtn);

          bar.appendChild(shapeContent);

      } else {

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

    }



    // ステ�タスラベルを追加

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

    statusSpan.textContent = `、{statusMap[statusText] || statusText}】`;

    bar.appendChild(statusSpan);



    if (schedule.notes) {

        const notesSpan = document.createElement("span");

        notesSpan.className = "bar-notes";

        notesSpan.textContent = schedule.notes;

        bar.appendChild(notesSpan);

    }



    // カスタムテ�ルチップイベント！MOの場合�スキテ���

    if (schedule.product_name !== "MMO") {

        const tooltipQty = schedule.total_quantity || schedule.quantity1;

        bar.addEventListener("mouseenter", (e) => showTooltip(e, schedule, tooltipQty));

        bar.addEventListener("mousemove", (e) => showTooltip(e, schedule, tooltipQty));

        bar.addEventListener("mouseleave", hideTooltip);

    }



    setupDraggable(bar, schedule, durationMs, dayStart6AM);



    return bar;

}



















function formatDateTime(dateStr) {

    if (!dateStr) return "-";

    const date = new Date(dateStr);

    return `${date.getMonth()+1}/${date.getDate()} ${String(date.getHours()).padStart(2,"0")}:${String(date.getMinutes()).padStart(2,"0")}`;

}



function getSyncStatusText(status) {

    const map = {

        "pending": "未同期",

        "synced": "同期済み",

        "modified": "変更あり"

    };

    return map[status] || status;

}
}
