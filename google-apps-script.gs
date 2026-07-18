// 貼進 Google Apps Script 專案（建議用「擴充功能 > Apps Script」從目標 Sheet 直接開啟綁定腳本）。
// 部署前只需要改下面兩個常數，其他不用動：
//   SHEET_ID           -- 試算表網址 https://docs.google.com/spreadsheets/d/<這一段>/edit
//   CLEAR_CONFIRM_CODE -- 自己取一組不容易猜到的字串，跟 App 設定畫面的「清除確認碼」填一樣的值。
//                          這個常數如果留空，「清除」功能會直接失效（安全預設，不會變成任何人都能清空）。

const SHEET_ID = "貼上你的 Google Sheet ID";
const CLEAR_CONFIRM_CODE = "改成你自己的確認碼";

const RECORD_SHEET_NAME = "MJ牌局紀錄"; // 每次上傳都往下累加，可以用「清除」按鈕清空重來
const ME_SHEET_NAME = "我的紀錄"; // 只會一直累加，沒有清除功能，長期戰績用

const RECORD_HEADER = [
  "上傳時間", "sessionId", "開始時間", "結束時間", "局數", "底", "每台單價",
  "玩家", "損益", "繳東", "自摸", "胡牌", "被自摸", "放槍", "流局", "沒事",
];

function doPost(e) {
  try {
    const payload = JSON.parse(e.postData.contents);
    const action = payload.action || "upload"; // 沒帶 action 欄位的舊/意外請求，當作一般上傳處理
    const result = action === "clear" ? handleClear_(payload) : handleUpload_(payload);
    return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ ok: false, error: String(err) }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// 方便部署後直接用瀏覽器打開網址測試連線有沒有通
function doGet(e) {
  return ContentService.createTextOutput("MJ webhook is running").setMimeType(ContentService.MimeType.TEXT);
}

function handleUpload_(payload) {
  const recordSheet = getOrCreateSheet_(RECORD_SHEET_NAME, RECORD_HEADER);
  appendPlayerRows_(recordSheet, payload, payload.players);

  if (payload.me) {
    const meSheet = getOrCreateSheet_(ME_SHEET_NAME, RECORD_HEADER);
    appendPlayerRows_(meSheet, payload, [payload.me]);
  }
  return { ok: true };
}

// 清除只動「MJ牌局紀錄」的資料列（保留表頭），「我的紀錄」完全不受影響。
// 確認碼常數本身不能是空字串，否則視為未設定、一律拒絕清除（避免忘記設定變成無防護）。
function handleClear_(payload) {
  if (!CLEAR_CONFIRM_CODE || payload.confirmCode !== CLEAR_CONFIRM_CODE) {
    return { ok: false, error: "confirm code mismatch" };
  }
  const lock = LockService.getScriptLock();
  lock.waitLock(5000);
  try {
    const sheet = getOrCreateSheet_(RECORD_SHEET_NAME, RECORD_HEADER);
    if (sheet.getLastRow() > 1) {
      sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).clearContent();
    }
    return { ok: true };
  } finally {
    lock.releaseLock();
  }
}

function getOrCreateSheet_(name, header) {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    sheet.appendRow(header);
  }
  return sheet;
}

function appendPlayerRows_(sheet, payload, players) {
  const now = new Date();
  const rows = players.map((p) => [
    now,
    payload.sessionId,
    payload.startedAt,
    payload.endedAt,
    payload.roundCount,
    payload.settings.base,
    payload.settings.perTai,
    p.name,
    p.netResult,
    p.dongPaid || 0,
    p.stats.zimo,
    p.stats.hujiao,
    p.stats.beiZimo,
    p.stats.fangChong,
    p.stats.liuju,
    p.stats.meiShi,
  ]);
  sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
}
