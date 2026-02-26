console.log('Main.js loaded v=RFACTORD');

// 生産計画スケジューラー - メインJavaScript

const { invoke } = window.__TAURI__.core;



// 製品重量マスタ

const productWeights = {

    "FS450D": 450, "FS450K": 450, "FS450NR": 450, "FS450S": 450,

    "FS250C": 250, "FS250C": 250,

    "FS360F": 360,

    "FS021B": 20, "FS021F": 20, "FS021P": 20, "FS021NR": 20, "FS021": 20,

    "FS021S": 20, "FS021PF": 20, "FS021PS": 20,

    "FS021MF": 20, "FS021MS": 20, "FS021NRF": 20, "FS021NRS": 20,

    "小袋": 20,

};

// 視認性のための最小表示時間（45分）
const MIN_VISUAL_DURATION_MS = 45 * 60 * 1000;

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

// アプリケーション状態

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



    // 閉じるボタン

    memoClose?.addEventListener("click", () => {

        memoModal.classList.remove("active");

    });

    memoCancel?.addEventListener("click", () => {

        memoModal.classList.remove("active");

    });



    // フォーム送信

    memoForm.addEventListener("submit", async (e) => {

        e.preventDefault();

        // コンテキストメニューでクリックされた日時があればそれを使用、なければ現在時刻
        const startDate = contextClickedTime ? new Date(contextClickedTime) : new Date();
        const duration = 4; // デフォルト4時間 (二回り大きく)

        const text = document.getElementById("memo-text").value;



        if (!text) return;


        const endDate = new Date(startDate.getTime() + duration * 60 * 60 * 1000);



        const formatIso = (d) => d.toISOString();



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



    // コンテキストメニュー用の変数

    // let contextClickedTime = null; // Removed: Now global

    const contextMenu = document.getElementById("context-menu");

    

    // クリック時でコンテキストメニューを閉じる

    document.addEventListener("click", () => {

        if (contextMenu) contextMenu.style.display = "none";

    });

    

    // コンテキストメニューのホバー効果

    document.querySelectorAll(".context-menu-item").forEach(item => {

        item.addEventListener("mouseenter", () => item.style.backgroundColor = "rgba(0,122,255,0.1)");

        item.addEventListener("mouseleave", () => item.style.backgroundColor = "transparent");

    });

    

    // コンテキストメニューのアクション

    document.querySelector('[data-action="add-memo"]')?.addEventListener("click", () => {

        document.getElementById("memo-text").value = "";

        memoModal.classList.add("active");

    });

    

    document.querySelector('[data-action="add-shape"]')?.addEventListener("click", () => {

        document.getElementById("shape-text").value = "";

        document.getElementById("shape-modal").classList.add("active");

    });



    // ガントチャートに右クリック時でコンテキストメニュー表示

    document.getElementById("gantt-container")?.addEventListener("contextmenu", (e) => {

        e.preventDefault();



        // クリック時位置から日時を計算

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



        // コンテキストメニューを表示

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

        // コンテキストメニューでクリックされた日時があればそれを使用、なければ現在時刻
        const startDate = contextClickedTime ? new Date(contextClickedTime) : new Date();
        const duration = 4; // デフォルト4時間 (二回り大きく)

        const shapeType = document.getElementById("shape-type").value;

        const shapeColor = 'transparent'; // 背景透明

        const shapeText = document.getElementById("shape-text").value;


        const endDate = new Date(startDate.getTime() + duration * 60 * 60 * 1000);



        const formatIso = (d) => d.toISOString();



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

// ガントチャートの1時間あたりのピクセル数（動的に変更される）
let currentHourPx = 60;

let currentDate = new Date();

let appMode = "admin"; // "admin" or "worker"



// DOM要素

const elements = {};



// 初期化

document.addEventListener("DOMContentLoaded", async () => {

    await initAppMode();

    await initKintoneConfig();

    createTooltipElement();

    initElements();

    initEventListeners();

    await loadSchedules();

    updateGanttDate();

    renderGantt();

    setStatus("準備完了");

});



// アプリモードを取得して適用（パスワード式）
const ADMIN_PASSWORD = "admin69";
let pollingInterval = null;

async function initAppMode() {
    const modeDialog = document.getElementById('mode-dialog');
    const btnWorker = document.getElementById('btn-worker-mode');
    const btnAdmin = document.getElementById('btn-admin-mode');
    const passwordInput = document.getElementById('admin-password');
    const modeError = document.getElementById('mode-error');

    // 保存されたモードがあれば復元（オプション）
    const savedMode = localStorage.getItem('appMode');
    if (savedMode === 'admin') {
        appMode = 'admin';
        modeDialog.style.display = 'none';
        applyAppMode();
        return;
    } else if (savedMode === 'worker') {
        appMode = 'worker';
        modeDialog.style.display = 'none';
        applyAppMode();
        startPolling();
        return;
    }

    return new Promise((resolve) => {
        // 作業者モードボタン
        btnWorker.addEventListener('click', () => {
            appMode = 'worker';
            localStorage.setItem('appMode', 'worker');
            modeDialog.style.display = 'none';
            applyAppMode();
            startPolling(); // 作業者は自動更新開始
            resolve();
        });

        // 管理者モードボタン
        btnAdmin.addEventListener('click', () => {
            if (passwordInput.value === ADMIN_PASSWORD) {
                appMode = 'admin';
                localStorage.setItem('appMode', 'admin');
                modeDialog.style.display = 'none';
                applyAppMode();
                resolve();
            } else {
                modeError.style.display = 'block';
                passwordInput.value = '';
                passwordInput.focus();
            }
        });

        // Enterキーでログイン
        passwordInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') btnAdmin.click();
        });
    });
}

// 3分間隔でkintoneからデータを自動取得（作業者モード用）
function startPolling() {
    if (pollingInterval) clearInterval(pollingInterval);
    
    const POLLING_INTERVAL_MS = 3 * 60 * 1000; // 3分
    
    pollingInterval = setInterval(async () => {
        console.log('自動更新: kintoneからデータ取得中...');
        try {
            await handleSyncFromKintone();
            console.log('自動更新: 完了');
        } catch (err) {
            console.error('自動更新エラー:', err);
        }
    }, POLLING_INTERVAL_MS);
    
    console.log('自動更新開始: 3分間隔');
}

function stopPolling() {
    if (pollingInterval) {
        clearInterval(pollingInterval);
        pollingInterval = null;
        console.log('自動更新停止');
    }
}

// kintone設定を初期化（デフォルト値を設定！

async function initKintoneConfig() {

    const defaultConfig = {

        subdomain: "jfe-rockfiber",

        app_id: 506,

        api_token: "3CakeA8SORFDrOawAcL3Y2UEY8TogZkLw52U5RBo",

        memo_app_id: 507,

        memo_api_token: "hkVvZfY6j5dgNSda9OE8WPnLefezfrIoGsR387gL",

        yamazumi_app_id: 354,

        yamazumi_api_token: "Qig2MiwdI0McEcbPZNbP2ORkg3UQoB15wx6bBJqC",

        kobukuro_app_id: 368,

        kobukuro_api_token: "4U3hAsfb1bLbww5XT0ppcz4f9AcdOmp1SLIfyAIS",

        tsumikomi_app_id: 514,

        tsumikomi_api_token: "nU2EcpjY1f7CQxKNs0PoPCnRRcdpl2xgnlK4GCOA"

    };

    

    // フォームに初期値を設定

    const subdomainl = document.getElementById("subdomain");

    const appIdl = document.getElementById("app-id");

    const apiTokenl = document.getElementById("api-token");

    const memoAppIdl = document.getElementById("memo-app-id");

    const memoApiTokenl = document.getElementById("memo-api-token");

    const tsumikomiAppIdl = document.getElementById("tsumikomi-app-id");

    const tsumikomiApiTokenl = document.getElementById("tsumikomi-api-token");

    

    if (subdomainl) subdomainl.value = defaultConfig.subdomain;

    if (appIdl) appIdl.value = defaultConfig.app_id;

    if (apiTokenl) apiTokenl.value = defaultConfig.api_token;

    if (memoAppIdl) memoAppIdl.value = defaultConfig.memo_app_id;

    if (memoApiTokenl) memoApiTokenl.value = defaultConfig.memo_api_token;

    if (tsumikomiAppIdl) tsumikomiAppIdl.value = defaultConfig.tsumikomi_app_id;

    if (tsumikomiApiTokenl) tsumikomiApiTokenl.value = defaultConfig.tsumikomi_api_token;

    

    // 自動的にkintone設定を保存

    try {

        const response = await invoke("save_kintone_config", { config: defaultConfig });

        if (response.success) {

            console.log("kintone設定を初期化しました");

        }

    } catch (error) {

        console.error("kintone設定�初期化に失敗", error);

    }

}



// モードに応じてUIを�り替ぁ

function applyAppMode() {

    const isWorker = appMode === "worker";

    

    // 作業者ードで非表示にする要素

    const adminOnlyElements = [

        "btn-test-data",

        "btn-sync-to-kintone",
        "btn-copy-prev-shapes",
        "btn-settings"

    ];

    

    // タブを制御新規追加タブ�作業者ードで非表示

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
    // ヘッダータイトルを更新
    const headerTitle = document.querySelector("header h1");
    if (headerTitle) {
        if (isWorker) {
            headerTitle.textContent = "🏭 生産計画スケジューラー【作業者】";
            document.body.classList.add("mode-worker");
            
            // 下部のモード切替ボタンを表示（作業者用）
            const switchBtn = document.getElementById("worker-mode-switch-btn");
            if (switchBtn) {
                switchBtn.style.display = "block";
                switchBtn.onclick = () => {
                   if(confirm("モード選択画面に戻りますか？")) {
                       localStorage.removeItem("appMode");
                       window.location.reload();
                   }
                };
            }

        } else {
            headerTitle.textContent = "🏭 生産計画スケジューラー【管理者】";
            document.body.classList.remove("mode-worker");
            
            // 下部のボタンを隠す
            const switchBtn = document.getElementById("worker-mode-switch-btn");
            if (switchBtn) switchBtn.style.display = "none";
        }
    }

    // ヘッダー内の共通「モード切替」ボタンのイベントハンドラ
    const headerSwitchBtn = document.getElementById("btn-switch-mode");
    if (headerSwitchBtn) {
        headerSwitchBtn.onclick = () => {
            if(confirm("モード選択画面に戻りますか？")) {
                localStorage.removeItem("appMode");
                window.location.reload();
            }
        };
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

            <span class="tooltip-label">開始</span>

            <span class="tooltip-value">${formatDateTime(schedule.start_datetime)}</span>

        </div>

        <div class="tooltip-row">

            <span class="tooltip-label">終了</span>

            <span class="tooltip-value">${formatDateTime(schedule.end_datetime)}</span>

        </div>

        <div class="tooltip-row">

            <span class="tooltip-label">個数:</span>

            <span class="tooltip-value">${qty || "-"} 個</span>

        </div>

        ${schedule.notes ? `<div class="tooltip-row"><span class="tooltip-label">備考</span><span class="tooltip-value">${schedule.notes}</span></div>` : ""}

        <div class="tooltip-status ${statusClass}">${displayStatus}</div>

    `;

    

    // 位置を計算

    const x = e.clientX + 15;

    const y = e.clientY + 15;

    

    // 画面からはみ出さないない調整

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
    elements.btnCopyPrevShapes = document.getElementById("btn-copy-prev-shapes");
}





async function handleSaveSettings(e) {

    e.preventDefault();



    const config = {

        subdomain: document.getElementById("subdomain").value,

        app_id: parseInt(document.getElementById("app-id").value),

        api_token: document.getElementById("api-token").value,

        memo_app_id: parseInt(document.getElementById("memo-app-id").value || "0"),

        memo_api_token: document.getElementById("memo-api-token").value,

        yamazumi_app_id: 354,

        yamazumi_api_token: "Qig2MiwdI0McEcbPZNbP2ORkg3UQoB15wx6bBJqC",

        kobukuro_app_id: 368,

        kobukuro_api_token: "4U3hAsfb1bLbww5XT0ppcz4f9AcdOmp1SLIfyAIS",

        tsumikomi_app_id: parseInt(document.getElementById("tsumikomi-app-id").value || "514"),

        tsumikomi_api_token: document.getElementById("tsumikomi-api-token").value || ""

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

// 前日の図形・メモをコピー
async function handleCopyPrevShapes() {
    if (!confirm('前日（昨日）のメモ・図形を、現在表示中の日付にコピーしますか？')) return;

    setStatus("コピー処理中...");

    try {
        // 現在の日付（表示中の日付）
        const targetDate = new Date(currentDate);
        
        // 前日
        const prevDate = new Date(currentDate);
        prevDate.setDate(prevDate.getDate() - 1);
        console.log('Copy Target Date:', targetDate.toLocaleDateString(), 'Prev Date:', prevDate.toLocaleDateString());

        // 前日のMMO/SHAPを探す
        const prevItems = schedules.filter(s => {
            if (s.product_name !== 'MMO' && s.product_name !== 'SHAP') return false;
            if (!s.start_datetime) return false;
            
            const sDate = new Date(s.start_datetime);
            const isMatch = sDate.getFullYear() === prevDate.getFullYear() &&
                   sDate.getMonth() === prevDate.getMonth() &&
                   sDate.getDate() === prevDate.getDate();
            if (isMatch) console.log('Found Prev Item:', s);
            return isMatch;
        });

        if (prevItems.length === 0) {
            alert("前日のメモ・図形が見つかりませんでした");
            setStatus("前日のメモ・図形なし", true);
            return;
        }

        let successCount = 0;

        for (const item of prevItems) {
            // 日付をターゲット（今日）に書き換える
            const newStart = new Date(item.start_datetime);
            newStart.setFullYear(targetDate.getFullYear());
            newStart.setMonth(targetDate.getMonth());
            newStart.setDate(targetDate.getDate());
            
            const newEnd = item.end_datetime ? new Date(item.end_datetime) : new Date(newStart);
            if (item.end_datetime) {
                newEnd.setFullYear(targetDate.getFullYear());
                newEnd.setMonth(targetDate.getMonth());
                newEnd.setDate(targetDate.getDate());
            }

            //フォーマット関数 (ISO 8601)
            const fmt = (d) => d.toISOString();

            const request = {
                product_name: item.product_name,
                line: item.line || 'Line1', // Lineが必須ならデフォルト値
                start_datetime: fmt(newStart),
                end_datetime: fmt(newEnd),
                quantity1: item.quantity1 || 0,
                total_quantity: item.total_quantity || 0,
                notes: item.notes,
                remarks: item.remarks,
                production_status: "未生産" // ステータスは未生産にリセット
            };

            // ここでkintone同期付き追加を呼ぶ
            const res = await invoke('add_schedule_with_kintone_sync', { request });
            console.log('Copy Result:', JSON.stringify(res));
            if (!res.success) {
                console.error('Copy Failed:', res.error);
                setStatus('コピー失敗: ' + res.error, true);
            }
            successCount++;
        }

        setStatus(`${successCount}件のメモ・図形をコピーしました`);
        await loadSchedules();
        renderGantt();

    } catch (err) {
        console.error("コピーエラー:", err);
        setStatus("コピーに失敗しました: " + err, true);
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

            production_status: "未生産",

            notes: `テスト{i + 1}`

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



    setStatus(`${successCount}件のストデータを追加しました`);

    await loadSchedules();

    renderGantt();

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

    elements.btnSyncFrom.addEventListener("click", handleSyncFromKintone); // Bound

    elements.btnSyncTo.addEventListener("click", handleSyncToKintone);
    if (elements.btnCopyPrevShapes) {
        elements.btnCopyPrevShapes.addEventListener("click", handleCopyPrevShapes);
    }

    // バランスビュー更新ボタン
    const btnRefreshBalance = document.getElementById("btn-refresh-balance");
    if (btnRefreshBalance) {
        btnRefreshBalance.addEventListener("click", async () => {
            balanceData = null;
            await renderBalanceView();
        });
    }



    if (elements.btnTestData) {

        elements.btnTestData.addEventListener("click", handleGenerateTestData);

    }



    document.addEventListener('mousemove', handleGlobalMouseMove);

    document.addEventListener('mouseup', handleGlobalMouseUp);



    // メモモーダル関連

    initMemoModal();

    initShapeModal();

    // ウィンドウリサイズ時にガントチャートを再描画
    let resizeTimeout;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(() => {
            if (document.getElementById("gantt-view").classList.contains("active")) {
                renderGantt();
            }
        }, 200);
    });

}



// ドラッグ状態管理

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



// ドラッグ有効化

function setupDraggable(element, schedule, durationMs, dayStart6AM) {

    element.addEventListener('mousedown', (e) => {

        if (dragState.isDragging) return;



        // ドラッグの準備まだ開始しなぁ

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



// ドラッグを実際に開始する関数

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

    // ドラッグの準備中で、まだ開始していない吁

    if (dragState.pendingDrag && !dragState.isDragging) {

        const dx = Math.abs(e.clientX - dragState.startX);

        const dy = Math.abs(e.clientY - dragState.startY);

        // 5px以上移動したらドラッグ開始

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

    // pendingDragのみの場合（クリック時だけでドラッグ開始していない�リセテして終了

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

        const newEnd = new Date(newStart.getTime() + durationMs);

        // Memo/Shape specific logic: Reset Y offset if moving to a new row to prevents vertical jumping
        if (schedule.product_name === 'MMO' || schedule.product_name === 'SHAP') {
            try {
                let parsed = JSON.parse(schedule.notes || '{}');
                if (parsed.x !== undefined) {
                     // Update internal X to match new time (optional, but good for consistency)
                     // But critical: Reset Y if it was an absolute offset that is now wrong
                     // However, the main render logic calculates topPx = rowTop + pixelPos.y
                     // If we moved rows, pixelPos.y should be small (relative to row).
                     // If it was large, it stays large. 
                     // Let's reset it to a default '10' if we detected a date change?
                     // For now, simpler to just let the update_schedule handle the date change.
                     // But we should probably clear the 'y' from notes if we can, or update it.
                     // IMPORTANT: The update_schedule below updates start/end time.
                     // It does NOT update 'notes' (where x/y are stored).
                     // We need to ALSO update notes with new X/y?
                     // Actually, if we just update the date, the renderOverlayItems uses the date to find the row.
                     // And uses pixelPos.y from notes.
                     // If pixelPos.y was 10, it renders at 10px from top of New Row. Correct.
                }
            } catch(e) {}
        }



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

    } else if (tabName === "balance") {

        renderBalanceView();

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

        production_status: document.getElementById("initial-status").value || "未生産",

        notes: document.getElementById("notes").value || null,
        efficiency: document.getElementById("efficiency").value || null
    };



    try {

        const response = await invoke("add_schedule", { request: formData });

        if (response.success) {

            setStatus("スケジュールを追加しました");

            // 次の入力のために終了時間を保持
            const nextStartTime = document.getElementById("end-datetime").value;
            // 遷移するかどうかを保持（リセット前に取得）
            const goToList = document.getElementById("go-to-list-after-add").checked;

            elements.addForm.reset();

            // 保持した終了時間を次の開始時間にセット
            if (nextStartTime) {
                document.getElementById("start-datetime").value = nextStartTime;
                // 自動計算をトリガーするために日付変更イベントを発火したほうが親切かもだが、とりあえず値セットのみ
            }

            await loadSchedules();

            // チェックボックスの状態を確認して遷移
            if (goToList) {
                switchTab("schedule");
            }

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

    

    // フォーム要素の親div非表示切替え用

    const quantityGroup = quantityInput.closest('.form-group');

    const efficiencyGroup = efficiencySelect.closest('.form-group');

    const endDatetimeGroup = endDatetimeInput.closest('.form-group');

    const notesGroup = notesInput.closest('.form-group');



    const quantity = parseFloat(quantityInput.value) || 0;

    const productName = productNameSelect.value;

    const efficiency = parseFloat(efficiencySelect.value) || 1;

    const weight = productWeights[productName] || 0;



    // MMOモードの場合のUI切替ぁ

    if (productName === "MMO") {

        if (quantityGroup) quantityGroup.style.display = "none";

        if (efficiencyGroup) efficiencyGroup.style.display = "none";

        

        // 終了時�入力可能にする期間指定のため

        if (endDatetimeInput) endDatetimeInput.readOnly = false;

        

        // 備考ベルを変更

        const notesLabel = notesGroup ? notesGroup.querySelector('label') : null;

        if (notesLabel) notesLabel.textContent = "コメント�容";

        

        // 終了時が未入力なら開始時間�1時間後に設定

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



        // 自動計算ロジック

        if (startDatetime && quantity > 0 && weight > 0 && efficiency > 0) {

            const productionTime = (quantity * weight / 1000) / efficiency * 60;

            const startDate = new Date(startDatetime);

            const endDate = new Date(startDate.getTime() + productionTime * 60 * 1000);



            const endStr = formatDateTimeForInput(endDate);

            endDatetimeInput.value = endStr;

        }

    }

}



// スケジュールテ�ブル描画chedule_numberを使用

function renderScheduleTable() {

    const tbody = elements.scheduleTbody;

    tbody.innerHTML = "";



    schedules.forEach(schedule => {
        // MMOとSHAPは一覧に表示しない
        if (schedule.product_name === "MMO" || schedule.product_name === "SHAP") return;

        const tr = document.createElement("tr");

        tr.dataset.id = schedule.id;
        
        // 作業者モード用: ステータスに応じたクラスを追加
        if (schedule.production_status === "生産中") {
            tr.classList.add("row-production");
        } else if (schedule.production_status === "生産終了") {
            tr.classList.add("row-completed");
        } else {
            tr.classList.add("row-pending");
        }

        // schedule_numberを優先、なければkintone_record_id

        const schedNo = schedule.schedule_number || schedule.kintone_record_id || "-";

        tr.innerHTML = `

            <td>${schedNo}</td>

            <td>${schedule.product_name}</td>

            <td>${formatDateTime(schedule.start_datetime)}</td>

            <td>${formatDateTime(schedule.end_datetime)}</td>

            <td>${schedule.total_quantity || schedule.quantity1 || "-"}</td>

            <td>${schedule.notes || "-"}</td>

            <td><span class="status-badge ${getStatusBadgeClass(schedule.production_status)}">${schedule.production_status}</span></td>

            <td><span class="status-badge ${schedule.sync_status}">${getSyncStatusText(schedule.sync_status)}</span></td>

            <td class="action-buttons">

                ${appMode === "admin" ? `

                    <button class="btn btn-small btn-primary btn-edit" data-id="${schedule.id}">編集</button>

                    <button class="btn btn-small btn-danger btn-delete" data-id="${schedule.id}">削除</button>

                ` : "-"}

            </td>

        `;

        tbody.appendChild(tr);

        

        // 管理者モードのみ編集と削除イベントを設定

        if (appMode === "admin") {

            tr.querySelector(".btn-edit").addEventListener("click", () => openEditModal(schedule));

            tr.querySelector(".btn-delete").addEventListener("click", () => handleDeleteSchedule(schedule.id, schedule.product_name));

        }

    });

}

// ステータスに応じたバッジクラスを取得
function getStatusBadgeClass(status) {
    if (status === "生産中") return "status-production";
    if (status === "生産終了") return "status-completed";
    return "status-scheduled";
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

    document.getElementById("edit-status").value = schedule.production_status || "未生産";

    

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

                            <option value="未生産">未生産</option>

                            <option value="生産中">生産中</option>

                            <option value="生産終了</option>

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



// 編集保存

async function handleEditSchedule(e) {

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



    // コンテナの有効幅を取得（ラベル幅140pxを除く）
    const containerWidth = container.clientWidth;
    const availableWidth = Math.max(0, containerWidth - 140);
    
    // 24時間で分割、ただし最小60pxは維持
    currentHourPx = Math.max(60, availableWidth / 24);

    // タイムラインの幅を設定
    timeline.style.minWidth = `${140 + currentHourPx * 24}px`;
    
    timeline.innerHTML = '<div style="width:140px;padding:10px;font-weight:bold;flex-shrink:0;">日付</div>';

    // 24時間分（6:00〜翌5:00）を表示
    for (let h = 6; h < 30; h++) {

        const hour = h % 24;

        timeline.innerHTML += `<div style="width:${currentHourPx}px;text-align:center;padding:10px;border-left:1px solid rgba(255,255,255,0.2);flex-shrink:0;">${hour}:00</div>`;

    }



    rows.innerHTML = "";
    
    // 行コンテナ（gantt-rows）の幅も合わせる
    rows.style.minWidth = `${140 + currentHourPx * 24}px`;

    const startDate = new Date(currentDate);

    startDate.setDate(startDate.getDate() - 1); // 1日前から表示



    for (let i = 0; i < 6; i++) { // 6日切示前日、日後！

        const rowDate = new Date(startDate);

        rowDate.setDate(startDate.getDate() + i);



        const dateStr = formatIsoDate(rowDate);

        const dayOfWeek = ["日", "月", "火", "水", "木", "金", "土"][rowDate.getDay()];
        const displayDate = `${rowDate.getMonth() + 1}/${rowDate.getDate()} (${dayOfWeek})`;



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
        
        // グリッドのサイズを動的に更新
        contentDiv.style.width = `${currentHourPx * 24}px`;
        contentDiv.style.backgroundSize = `${currentHourPx}px 100%`;
        contentDiv.style.backgroundImage = `repeating-linear-gradient(90deg, transparent, transparent ${currentHourPx-1}px, #F5F5F7 ${currentHourPx-1}px, #F5F5F7 ${currentHourPx}px)`;

        row.appendChild(contentDiv);



        rows.appendChild(row);



        const rowStart = new Date(rowDate);

        rowStart.setHours(6, 0, 0, 0);



        const rowEnd = new Date(rowStart);
        rowEnd.setDate(rowEnd.getDate() + 1); // 翌日6:00

        // MMO/SHAPを除外
        const daySchedules = schedules.filter(s => {

            if (s.product_name === "MMO" || s.product_name === "SHAP") return false;

            if (!s.start_datetime) return false;

            const sStart = new Date(s.start_datetime);
            // 終了日時がない場合はデフォルト1時間として扱う（表示ロジックに合わせる）
            const sEnd = s.end_datetime ? new Date(s.end_datetime) : new Date(sStart.getTime() + 60*60*1000);

            // 行の期間（rowStart ~ rowEnd）と重複しているかチェック
            // Start < RowEnd AND End > RowStart
            return sStart < rowEnd && sEnd > rowStart;

        });



        const lanes = calculateLanes(daySchedules);

        const laneCount = lanes.length > 0 ? lanes.length : 1;

        row.style.height = `${Math.max(140, laneCount * 120 + 20)}px`;



        lanes.forEach((laneSchedules, laneIndex) => {

            laneSchedules.forEach(schedule => {

                const bar = createGanttBar(schedule, rowStart, laneIndex);

                if (bar) {
                    contentDiv.appendChild(bar);
                }

            });

        });





    // MMO/SHAPをオーバ�レイとして描画xcel図形風

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

        // 文字列の日付を取得
        const itemStart = new Date(item.start_datetime);
        const itemDateStr = getProductionDateStr(itemStart);
        
        // その日付の行（row）を探す
        const rowElement = container.querySelector(`.gantt-row[data-date="${itemDateStr}"]`);
        
        // 行が存在しなければ（画面外ならば）表示しない
        if (!rowElement) return;

        // 行の位置基準
        const rowTop = rowElement.offsetTop;

        // ピクセル位置をnotesから取得（存在すれば）
        let pixelPos = null;
        let notesData = item.notes || '';
        if (item.product_name === 'MMO') {
            try {
                const parsed = JSON.parse(notesData);
                if (parsed.x !== undefined) {
                     // Y座標は無視してrowTop基準にする（日付ズレ防止）
                    pixelPos = { x: parsed.x, y: 10, w: parsed.w, h: parsed.h, scale: parsed.scale || 1.0 };
                    notesData = parsed.text || '';
                }
            } catch(e) { /* テキスト形式 */ }
        } else if (item.product_name === 'SHAP') {
            try {
                const parsed = JSON.parse(notesData);
                if (parsed.x !== undefined) {
                    pixelPos = { x: parsed.x, y: 10, w: parsed.w, h: parsed.h, scale: parsed.scale || 1.0 };
                }
            } catch(e) {}
        }

        let leftPx, topPx, widthPx, heightPx;
        
        // Debug logging
        // console.log(`Item ${item.id} (${item.product_name}): pixelPos=`, pixelPos);
        
        if (pixelPos) {
            // 保存されたX位置を使用
            leftPx = pixelPos.x;
            // Y位置は行基準に強制
            topPx = rowTop + (pixelPos.y || 10);
            widthPx = pixelPos.w || 240; // Default width 240
            heightPx = pixelPos.h || 120; // Default height 120
        } else {
            // 保存されていなければ日時から計算
            if (itemStart.getHours() < 6) itemStart.setDate(itemStart.getDate() - 1);
            
            const dayStart = new Date(itemStart);
            dayStart.setHours(6, 0, 0, 0);
            
    // 行の範囲内（当日6:00〜翌6:00）にクランプする
    const rowStartMs = dayStart.getTime(); // Assuming dayStart here is the 6AM start of the row
    const rowEndMs = rowStartMs + 24 * 60 * 60 * 1000;

    const itemStartRaw = new Date(item.start_datetime); // Changed from schedule to item
    const itemEndRaw = item.end_datetime 
        ? new Date(item.end_datetime) 
        : new Date(itemStartRaw.getTime() + 60*60*1000); // endがなければとりあえず1時間

    // クランプ処理
    const clampStart = itemStartRaw.getTime() < rowStartMs ? new Date(rowStartMs) : itemStartRaw;
    const clampEnd = itemEndRaw.getTime() > rowEndMs ? new Date(rowEndMs) : itemEndRaw;

    const msFrom6AM = clampStart.getTime() - rowStartMs; 
    // cssの.gantt-row-label width: 140pxに合わせてオフセットを調整
    leftPx = 140 + (msFrom6AM / (60 * 60 * 1000)) * currentHourPx;
    topPx = rowTop + 10; // This was already calculated as rowTop + 10
    
    const durationMs = clampEnd.getTime() - clampStart.getTime();
    widthPx = Math.max(currentHourPx, (durationMs / (60 * 60 * 1000)) * currentHourPx); // 念のためmax(0)
    heightPx = 120; // Default height increased
        }
        
        const itemEnd = item.end_datetime ? new Date(item.end_datetime) : new Date(itemStart.getTime() + 2*60*60*1000);

    // Force min sizes if they are small (catch old defaults 120x80 or similar)
    // New default target: 240x120
    if (!pixelPos || (widthPx > 0 && widthPx < 200)) {
        // console.log(`Resizing Item ${item.id} from ${widthPx} to 240`);
        widthPx = 240;
    }
    if (!pixelPos || (heightPx > 0 && heightPx < 100)) {
         heightPx = 120;
    }

    const iteml = document.createElement('div');
    
    // VISUAL DEBUG: Add a red border to indicate this rendered via relevant code
    // iteml.style.border = '2px solid red';

        // Debug logging for drag
        if (appMode !== 'worker') {
             iteml.addEventListener('mousedown', (e) => {
                 console.log('MouseDown on item:', item.id);
             });
        }

        // Center content and add transition for hover effect
        iteml.style.cssText = 'position:absolute;left:' + leftPx + 'px;top:' + topPx + 'px;width:' + widthPx + 'px;height:' + heightPx + 'px;pointer-events:auto;cursor:move;padding:4px;display:flex;flex-direction:column;align-items:center;justify-content:center;z-index:1001;background:rgba(255,255,255,0.1);border:1px solid rgba(0,0,0,0.2);border-radius:8px;overflow:visible;box-sizing:border-box;transform-origin:top left;transition:border-color 0.2s, box-shadow 0.2s, background-color 0.2s;';
        
        iteml.addEventListener('mouseenter', () => {
             iteml.style.borderColor = 'rgba(0,122,255,0.8)';
             iteml.style.boxShadow = '0 2px 8px rgba(0,0,0,0.1)';
        });
        iteml.addEventListener('mouseleave', () => {
             iteml.style.borderColor = 'rgba(0,0,0,0.2)';
             iteml.style.boxShadow = 'none';
        });

    // Drag logic for overlay items
    // TODO: Implement logic to update start_datetime when dropped on a different row
    if (pixelPos && pixelPos.scale && pixelPos.scale !== 1.0) {
        iteml.style.transform = `scale(${pixelPos.scale})`;
    }

        if (item.product_name === 'MMO') {
            // ... (Memo content generation - no changes needed, it appends to iteml)
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

            textSpan.style.cssText = 'color:#333;font-size:22px;font-weight:500;white-space:pre-wrap;word-break:break-word;flex:1;cursor:text;text-align:center;width:100%;display:flex;align-items:center;justify-content:center;';
            textSpan.textContent = memoText;

            iteml.appendChild(textSpan);

            // ダブルクリックで編集モード（管理者モードのみ）
            if (appMode !== 'worker') {
                textSpan.addEventListener('dblclick', function(e) {
                    e.stopPropagation();
                const input = document.createElement('textarea');
                input.value = textSpan.textContent;
                input.style.cssText = 'width:100%;height:100%;border:1px solid #007AFF;border-radius:4px;padding:4px;font-size:14px;resize:none;outline:none;';
                textSpan.style.display = 'none';
                iteml.insertBefore(input, textSpan);
                input.addEventListener('mousedown', (e) => e.stopPropagation());
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
            } // ダブルクリック編集のifブロック終了

        } else if (item.product_name === 'SHAP') {

            let shapeInfo = { type: 'circle', color: 'blue', text: '' };

            try { shapeInfo = JSON.parse(item.notes || '{}'); } catch(e) {}

            const colorMap = { red: 'rgba(255,59,48,0.6)', blue: 'rgba(0,122,255,0.6)', green: 'rgba(52,199,89,0.6)', yellow: 'rgba(255,204,0,0.7)', purple: 'rgba(175,82,222,0.6)', orange: 'rgba(255,149,0,0.6)' };

            // 背景色はcssTextで設定済み（リサイズ確認用）

            const iconMap = { 'arrow-right': '➡', 'arrow-down': '⬇', 'star': '★', 'warning': '⚠️', 'check': '✅', 'important': '❗', 'circle': '🔴' };

            const icon = iconMap[shapeInfo.type] || '🔷';

            const contentSpan = document.createElement('span');

            contentSpan.style.cssText = 'font-size:64px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:0px;flex:1;line-height:1;width:100%;';

            contentSpan.innerHTML = icon + ' <span style="font-size:22px;font-weight:600;color:#333;margin-top:4px;">' + (shapeInfo.text || '') + '</span>';

            iteml.appendChild(contentSpan);

        }

        // 右クリックで削除メニュー（管理者モードのみ）
        if (appMode !== 'worker') {
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
        }

        // リサイズハンドル（右下）- 管理者モードのみ表示
        if (appMode !== 'worker') {
            const resizeHandle = document.createElement('div');
            resizeHandle.className = 'resize-handle';
            // Round circle handle, distinct look
            resizeHandle.style.cssText = 'position:absolute;right:-8px;bottom:-8px;width:24px;height:24px;cursor:se-resize;background:#007AFF;border:2px solid white;border-radius:50%;box-shadow:0 2px 4px rgba(0,0,0,0.2);pointer-events:auto;z-index:20;display:flex;align-items:center;justify-content:center;color:white;font-size:12px;';
            resizeHandle.innerHTML = '⤡'; // Icon inside circle

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
        } // リサイズハンドルのifブロック終了

        // ドラッグ機能を追加（管理者モードのみ）
        iteml.addEventListener('mousedown', function(e) {
            // 作業者モードではドラッグ無効
            if (appMode === 'worker') return;
            
            // リサイズハンドルがあればそれは除外
            const resizeEl = iteml.querySelector('.resize-handle');
            if (resizeEl && resizeEl.contains(e.target)) return;
            
            const startX = e.clientX;
            const startY = e.clientY;
            const origLeft = parseInt(iteml.style.left) || 0;
            const origTop = parseInt(iteml.style.top) || 0;
            const itemId = item.id;
            const duration = itemEnd.getTime() - itemStart.getTime();
            
            iteml.style.cursor = 'grabbing';
            iteml.style.zIndex = '2000';
            e.stopPropagation();
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

            // 視認性確保のため、終了判定には最小表示時間を考慮する
            const effectiveEnd = Math.max(
                lastSchedule.end_datetime 
                    ? new Date(lastSchedule.end_datetime).getTime() 
                    : new Date(lastSchedule.start_datetime).getTime() + 60*60*1000,
                new Date(lastSchedule.start_datetime).getTime() + MIN_VISUAL_DURATION_MS
            );

            if (start >= effectiveEnd) {

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

    // 行の範囲（当日6:00〜翌6:00）
    const rowStartMs = dayStart6AM.getTime();
    const rowEndMs = rowStartMs + 24 * 60 * 60 * 1000;

    // スケジュールの本来の開始・終了日時
    const itemStartRaw = new Date(schedule.start_datetime);
    const itemEndRaw = schedule.end_datetime 
        ? new Date(schedule.end_datetime) 
        : new Date(itemStartRaw.getTime() + 60*60*1000);

    // クランプ処理（行の範囲内に収める）
    const clampStart = itemStartRaw.getTime() < rowStartMs ? new Date(rowStartMs) : itemStartRaw;
    const clampEnd = itemEndRaw.getTime() > rowEndMs ? new Date(rowEndMs) : itemEndRaw;

    // 開始位置の計算 (6:00基準)
    const msFrom6AM = clampStart.getTime() - rowStartMs; 
    // .gantt-row-contentはlabel(140px)の後に配置されるため、内部座標0が6:00と一致する
    // したがってオフセット140は不要
    const leftPx = (msFrom6AM / (60 * 60 * 1000)) * currentHourPx;
    
    // 幅の計算
    const durationMs = clampEnd.getTime() - clampStart.getTime();
    // 最小幅（45分相当 = 0.75時間）を確保
    // 45分 = 0.75時間 -> currentHourPx * 0.75
    const MIN_WIDTH_PX = currentHourPx * 0.75; 
    const widthPx = Math.max(MIN_WIDTH_PX, (durationMs / (60 * 60 * 1000)) * currentHourPx);

    // 幅が0以下（表示不能）の場合は描画しない
    if (widthPx <= 0) return null;

    // 高さ・垂直位置の計算
    const topPx = 10 + (laneIndex * 120);

    bar.style.left = `${leftPx}px`;
    bar.style.width = `${widthPx}px`;
    bar.style.top = `${topPx}px`;
    bar.style.height = '110px';



    // 分割バーのスタイル適用
    // 前日から続いている（開始時刻がクランプされている）
    if (itemStartRaw.getTime() < rowStartMs) {
        bar.classList.add("split-start"); // 左側を直角に
    }
    // 翌日に続く（終了時刻がクランプされている）
    if (itemEndRaw.getTime() > rowEndMs) {
        bar.classList.add("split-end"); // 右側を直角に
    }

    // ステータスに応じたクラス適用（分割判定とは独立させる）
    if (schedule.production_status === "生産終了") {
        bar.classList.add("status-completed");
    } else if (schedule.production_status === "生産中") {
        bar.classList.add("status-inprogress");
    } else {
        bar.classList.add("status-pending");
    }



if (schedule.product_name === "MMO") {

          bar.classList.add("is-memo");

          // xcel風スタイルを直接適用枠なし�半透�・重なり可

          bar.style.background = "rgba(255, 243, 128, 0.8)";

          bar.style.border = "none";

          bar.style.boxShadow = "none";

          bar.style.zIndex = "500";

          

          // メモコンテ

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

          // 色の設定- xcel風枠なし、半透�背景のみ

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



          

          // 図形コンテ

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

          // schedule_numberを優先、なければkintone_record_id
          // schedule_numberを優先、なければkintone_record_id
          const schedNo = schedule.schedule_number || schedule.kintone_record_id || "";

          // 1. 製品名 (個数)
          const qty = schedule.total_quantity || schedule.quantity1;
          const productSpan = document.createElement("span");
          productSpan.className = "bar-product";
          productSpan.style.fontWeight = "normal"; // 製品名は通常（指示なしだがバランス的に）
          productSpan.textContent = qty ? `${schedule.product_name} (${qty})` : schedule.product_name;
          bar.appendChild(productSpan);

          // 2. 備考 (notes) ← 太字
          const notes = schedule.notes;
          if (notes) {
              const notesSpan = document.createElement("span");
              notesSpan.className = "bar-notes";
              notesSpan.style.fontSize = "17px"; // 製品名(17px)に合わせる
              notesSpan.style.fontWeight = "bold"; // 太字
              notesSpan.style.marginTop = "2px";
              notesSpan.style.overflow = "hidden";
              notesSpan.style.textOverflow = "ellipsis";
              notesSpan.textContent = notes;
              bar.appendChild(notesSpan);
          }

          // 3. スケジュール番号 ← 小さく
          if (schedNo) {
              const noSpan = document.createElement("span");
              noSpan.style.fontSize = "9px"; // より小さく
              noSpan.style.opacity = "0.7";
              noSpan.style.marginTop = "4px"; // autoをやめて固定マージンに
              noSpan.textContent = schedNo;
              bar.appendChild(noSpan);
          }

    }



    // スデータスラベルを追加
    // 不要なので削除（バーの色で状態を表すため）
    /*
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
    */

    // 重複していたnotes追加ブロックを削除



    // カスタムツールチップイベント！MOの場合�スキテ�

    if (schedule.product_name !== "MMO") {

        const tooltipQty = schedule.total_quantity || schedule.quantity1;

        bar.addEventListener("mouseenter", (e) => showTooltip(e, schedule, tooltipQty));

        bar.addEventListener("mousemove", (e) => showTooltip(e, schedule, tooltipQty));

        bar.addEventListener("mouseleave", hideTooltip);

    }



    // 管理者モードのみドラッグ可能
    if (appMode !== 'worker') {
        setupDraggable(bar, schedule, durationMs, dayStart6AM);
    }



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

// ========== 需給バランスビュー ==========

// 追跡対象の主要製品
const BALANCE_PRODUCTS = ['FS450NR', 'FS450K', 'FS450S', 'FS450D', 'FS250C', 'FS250CE', 'FS360F'];

// 積込予定 item → 在庫品番 マッピング
const SHIPPING_PRODUCT_MAP = {
    '450NR': 'FS450NR',
    '450K': 'FS450K',
    '高ダイ': 'FS450K',
    '低ショット': 'FS450S',
    '大建': 'FS450D',
    'FS250CE': 'FS250CE',
    'FS250C': 'FS250C',
    'FS360F': 'FS360F'
};

// バランスデータ状態
let balanceData = null;

/**
 * セル値から出荷数量を抽出（shipping_check_plugin.js と同じロジック）
 */
function extractShippingTotal(cellVal) {
    if (!cellVal) return 0;
    let texts = [];
    if (typeof cellVal === 'object' && !Array.isArray(cellVal)) {
        texts.push(String(cellVal.left || ''));
        texts.push(String(cellVal.center || ''));
        texts.push(String(cellVal.right || ''));
    } else {
        texts.push(String(cellVal || ''));
    }
    let total = 0;
    texts.forEach(t => {
        const cleaned = t.replace(/※/g, ' ').replace(/　/g, ' ');
        const matches = cleaned.match(/[+-]?\d[\d,]*(?:\.\d+)?/g) || [];
        matches.forEach(m => {
            const num = Number(m.replace(/,/g, ''));
            if (!isNaN(num)) total += num;
        });
    });
    return total;
}

/**
 * kintone Apps 354/514 + ローカルスケジュールからバランスデータを取得
 */
async function fetchBalanceData() {
    const statusEl = document.getElementById('balance-status');
    if (statusEl) statusEl.textContent = '読込中...';

    try {
        // 1. 在庫データ取得 (App 354)
        const invResponse = await invoke('fetch_kintone_records', {
            appName: 'yamazumi',
            query: '山状況 in ("出荷待ち", "一部出荷済") order by $id asc limit 500'
        });

        // 2. 出荷予定データ取得 (App 514)
        const shipResponse = await invoke('fetch_kintone_records', {
            appName: 'tsumikomi',
            query: 'order by planDate desc limit 10'
        });

        // 3. 生産データ = ローカルschedules（loadSchedulesで取得済み）
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        // === 在庫集計 ===
        const inventory = {};
        BALANCE_PRODUCTS.forEach(p => inventory[p] = 0);

        if (invResponse.success && invResponse.data && invResponse.data.records) {
            invResponse.data.records.forEach(r => {
                const product = (r['品番'] && r['品番'].value || '').trim();
                const status = r['山状況'] && r['山状況'].value;
                let qty = 0;
                if (status === '一部出荷済') {
                    qty = parseInt(r['総個数_数値'] && r['総個数_数値'].value || 0) || 0;
                } else {
                    qty = parseInt(r['総個数'] && r['総個数'].value || 0) || 0;
                }
                // 製品マッチング
                BALANCE_PRODUCTS.forEach(bp => {
                    if (product === bp || product.indexOf(bp) >= 0) {
                        inventory[bp] += qty;
                    }
                });
            });
        }

        // === 出荷予定集計 ===
        const shipping = {};
        BALANCE_PRODUCTS.forEach(p => shipping[p] = new Array(14).fill(0));

        if (shipResponse.success && shipResponse.data && shipResponse.data.records) {
            shipResponse.data.records.forEach(record => {
                const pd = record['planDate'] && record['planDate'].value;
                if (!pd) return;
                const planDate = new Date(pd + 'T00:00:00');
                if (isNaN(planDate.getTime())) return;

                const jsonStr = record['scheduleJson'] && record['scheduleJson'].value;
                if (!jsonStr) return;

                try {
                    const parsed = JSON.parse(jsonStr);
                    if (!parsed || !Array.isArray(parsed.rows)) return;

                    parsed.rows.forEach(row => {
                        if (row.group === '日本ロック') return;
                        const item = (row.item || '').trim();
                        if (!item) return;

                        let productCode = null;
                        for (const [key, code] of Object.entries(SHIPPING_PRODUCT_MAP)) {
                            if (item === key || item.indexOf(key) >= 0) {
                                productCode = code;
                                break;
                            }
                        }
                        if (!productCode || !shipping[productCode]) return;

                        const values = Array.isArray(row.values) ? row.values : [];
                        for (let col = 0; col < 7 && col < values.length; col++) {
                            const dayDate = new Date(planDate);
                            dayDate.setDate(dayDate.getDate() + col);
                            const diffDays = Math.floor((dayDate - today) / 86400000);
                            if (diffDays >= 0 && diffDays < 14) {
                                shipping[productCode][diffDays] += extractShippingTotal(values[col]);
                            }
                        }
                    });
                } catch (e) {
                    console.error('[Balance] scheduleJson解析エラー:', e);
                }
            });
        }

        // === 生産予定集計 ===
        const production = {};
        BALANCE_PRODUCTS.forEach(p => production[p] = new Array(14).fill(0));

        schedules.forEach(s => {
            const product = s.product_name;
            if (!BALANCE_PRODUCTS.includes(product)) return;
            // 完了済みは在庫に反映済みなのでスキップ
            if (s.production_status === '完了') return;

            const startDate = new Date(s.start_datetime);
            if (isNaN(startDate.getTime())) return;
            const diffDays = Math.floor((startDate - today) / 86400000);

            if (diffDays >= 0 && diffDays < 14) {
                const qty = s.total_quantity || s.quantity1 || 0;
                production[product][diffDays] += qty;
            }
        });

        // === 日付ラベル生成 ===
        const dayNames = ['日', '月', '火', '水', '木', '金', '土'];
        const dates = [];
        for (let i = 0; i < 14; i++) {
            const d = new Date(today);
            d.setDate(d.getDate() + i);
            dates.push({
                date: d,
                label: `${d.getMonth()+1}/${d.getDate()}`,
                dayName: dayNames[d.getDay()],
                isToday: i === 0,
                isWeekend: d.getDay() === 0 || d.getDay() === 6
            });
        }

        balanceData = { inventory, production, shipping, dates };
        if (statusEl) statusEl.textContent = '取得完了';
        setTimeout(() => { if (statusEl) statusEl.textContent = ''; }, 2000);
        return balanceData;

    } catch (error) {
        console.error('[Balance] データ取得エラー:', error);
        if (statusEl) {
            statusEl.textContent = 'エラー: ' + (error.message || error);
            statusEl.style.color = '#ff3b30';
        }
        throw error;
    }
}

/**
 * バランスビューをレンダリング
 */
async function renderBalanceView() {
    const content = document.getElementById('balance-content');
    if (!content) return;

    if (!balanceData) {
        content.innerHTML = '<p style="text-align:center;color:#86868b;padding:40px;">データを取得中...</p>';
        try {
            await fetchBalanceData();
        } catch (error) {
            content.innerHTML = `<div style="text-align:center;padding:40px;">
                <p style="color:#ff3b30;font-size:14px;margin-bottom:8px;">データ取得に失敗しました</p>
                <p style="color:#86868b;font-size:12px;">${error}</p>
                <p style="color:#86868b;font-size:11px;margin-top:12px;">
                    Rust側に fetch_kintone_records コマンドが必要です。<br>
                    balance_rust_patch.md を参照して変更を適用してください。
                </p>
            </div>`;
            return;
        }
    }

    const { inventory, production, shipping, dates } = balanceData;

    let html = '<table class="balance-table">';

    // ===== ヘッダー =====
    html += '<thead><tr>';
    html += '<th class="balance-product-col">製品</th>';
    html += '<th class="balance-inv-col">現在庫</th>';
    dates.forEach(d => {
        const cls = d.isToday ? 'balance-today' : (d.isWeekend ? 'balance-weekend' : '');
        html += `<th class="${cls}">${d.label}<br><span class="balance-day-name">${d.dayName}</span></th>`;
    });
    html += '</tr></thead>';

    // ===== ボディ =====
    html += '<tbody>';
    BALANCE_PRODUCTS.forEach(product => {
        const inv = inventory[product] || 0;
        let runningBalance = inv;

        html += '<tr class="balance-row">';
        html += `<td class="balance-product-col"><strong>${product}</strong></td>`;
        html += `<td class="balance-inv-col">${inv.toLocaleString()}</td>`;

        dates.forEach((d, i) => {
            const prod = production[product][i] || 0;
            const ship = shipping[product][i] || 0;
            runningBalance += prod - ship;

            const dayCls = d.isToday ? 'balance-today' : (d.isWeekend ? 'balance-weekend' : '');
            const valCls = runningBalance < 0 ? 'balance-negative'
                : (runningBalance < inv * 0.3 ? 'balance-warning' : 'balance-positive');

            const tooltip = `${product} ${d.label}(${d.dayName})\n在庫: ${inv}\n生産: +${prod}\n出荷: -${ship}\n残: ${runningBalance}`;

            html += `<td class="${dayCls} ${valCls}" title="${tooltip}">`;
            html += '<div class="balance-cell">';
            html += `<span class="balance-val">${runningBalance.toLocaleString()}</span>`;
            if (prod > 0 || ship > 0) {
                html += '<span class="balance-detail">';
                if (prod > 0) html += `<span class="balance-prod">+${prod}</span>`;
                if (ship > 0) html += `<span class="balance-ship">-${ship}</span>`;
                html += '</span>';
            }
            html += '</div></td>';
        });

        html += '</tr>';
    });
    html += '</tbody></table>';

    // ===== 凡例 =====
    html += '<div class="balance-legend">';
    html += '<span class="balance-legend-item"><span class="balance-dot" style="background:#34c759;"></span> 充足</span>';
    html += '<span class="balance-legend-item"><span class="balance-dot" style="background:#ff9500;"></span> 注意 (&lt;30%)</span>';
    html += '<span class="balance-legend-item"><span class="balance-dot" style="background:#ff3b30;"></span> 不足</span>';
    html += '<span class="balance-legend-info">セル: 残在庫予測 / <span class="balance-prod">+生産</span> <span class="balance-ship">-出荷</span></span>';
    html += '</div>';

    content.innerHTML = html;
}

}





