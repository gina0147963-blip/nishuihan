/**
 * ============================================================
 * 逆水寒管理系統 — Google 試算表同步 Apps Script
 * ============================================================
 *
 * 【用途】
 * 讓 PWA 可以把本機資料（成員、技能清單、活動、報名、比賽紀錄）
 * 寫入這份 Google 試算表，也可以反過來從試算表把資料讀回 PWA。
 *
 * 【安裝步驟】
 * 1. 打開（或新建）一份 Google 試算表
 * 2. 上方選單：擴充功能 → Apps Script
 * 3. 把編輯器裡原有的程式碼全部刪除，貼上這份檔案的全部內容
 * 4. 點擊「儲存」（floppy disk 圖示）
 * 5. 點擊右上角「部署」→「新增部署作業」
 *    - 類型選擇：網路應用程式
 *    - 說明：可填「逆水寒同步」
 *    - 執行身份：我（你的帳號）
 *    - 誰可以存取：任何人
 * 6. 點擊「部署」，第一次會要求授權，請點擊「授權存取權」並選擇你的 Google 帳號，
 *    若出現「未驗證應用程式」警告，點擊「進階」→「前往（專案名稱）(不安全)」即可繼續
 *    （這是正常現象，因為這是你自己寫的小工具，沒有經過 Google 正式審核）
 * 7. 部署完成後會出現一個網址，格式類似：
 *    https://script.google.com/macros/s/AKfycb.../exec
 *    複製這個網址
 * 8. 回到 PWA，點擊「Google同步」→ 貼上這個網址到「Apps Script Webhook URL」欄位 → 儲存設定
 *
 * 之後每次在 PWA 點擊「立即同步」，資料就會寫入這份試算表的分頁中。
 * 如果之後修改了這份程式碼，記得「部署」→「管理部署作業」→ 編輯 → 選「新版本」→ 部署，
 * 網址通常會維持不變。
 * ============================================================
 */

function doPost(e) {
  try {
    const payload = JSON.parse(e.postData.contents);
    const action = payload.action;

    if (action === 'sync') {
      return handleSync(payload);
    }

    return jsonResponse({ error: 'unknown action' });
  } catch (err) {
    return jsonResponse({ error: err.message });
  }
}

function doGet(e) {
  try {
    const action = e.parameter.action;
    const mode = e.parameter.mode || 'club';

    if (action === 'load') {
      return handleLoad(mode);
    }

    return jsonResponse({ error: 'unknown action' });
  } catch (err) {
    return jsonResponse({ error: err.message });
  }
}

function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// ============================================================
// SYNC: 寫入資料到試算表（每個模式 + 資料類型一個分頁）
// ============================================================
function handleSync(payload) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const mode = payload.mode || 'club';
  const prefix = mode === 'guild' ? '幫戰_' : '俱樂部_';

  writeSheet(ss, '共用_成員清單', payload.members, [
    'id','name','jobId','team','status','note','skills','baijia','createdAt'
  ]);
  writeSheet(ss, '共用_絕技清單', (payload.skillList || []).map(s => ({ name: s })), ['name']);
  writeSheet(ss, '共用_群俠技能清單', (payload.baijiaList || []).map(s => ({ name: s })), ['name']);

  writeSheet(ss, prefix + '活動場次', payload.events, [
    'id','name','date','type','teams','roles','createdAt'
  ]);
  writeSheet(ss, prefix + '比賽紀錄', payload.matches, [
    'id','date','type','enemy','result','ourCount','enemyCount','formation','notes','participants','players','createdAt'
  ]);
  writeSheet(ss, prefix + '報名紀錄', flattenSignups(payload.signups), [
    'eventId','playerName','status'
  ]);

  // 記錄同步時間到「同步紀錄」分頁
  logSyncTime(ss, mode, payload.timestamp);

  return jsonResponse({ ok: true, syncedAt: payload.timestamp });
}

function writeSheet(ss, sheetName, dataArray, headers) {
  let sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
  } else {
    sheet.clear();
  }

  if (!dataArray || dataArray.length === 0) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    return;
  }

  const rows = dataArray.map(item => {
    return headers.map(h => {
      let val = item[h];
      if (val === undefined || val === null) return '';
      if (typeof val === 'object') return JSON.stringify(val);
      return val;
    });
  });

  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  sheet.getRange(2, 1, rows.length, headers.length).setValues(rows);
  sheet.autoResizeColumns(1, headers.length);
}

function flattenSignups(signups) {
  const result = [];
  if (!signups) return result;
  Object.keys(signups).forEach(eventId => {
    const playerMap = signups[eventId];
    Object.keys(playerMap).forEach(playerName => {
      result.push({ eventId, playerName, status: playerMap[playerName] });
    });
  });
  return result;
}

function logSyncTime(ss, mode, timestamp) {
  let sheet = ss.getSheetByName('同步紀錄');
  if (!sheet) {
    sheet = ss.insertSheet('同步紀錄');
    sheet.getRange(1, 1, 1, 2).setValues([['模式', '同步時間']]);
  }
  sheet.appendRow([mode === 'guild' ? '幫戰' : '俱樂部', timestamp]);
}

// ============================================================
// LOAD: 從試算表讀回資料給 PWA
// ============================================================
function handleLoad(mode) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const prefix = mode === 'guild' ? '幫戰_' : '俱樂部_';

  const members = readSheet(ss, '共用_成員清單', ['skills','baijia']);
  const skillList = readSheet(ss, '共用_絕技清單').map(r => r.name).filter(Boolean);
  const baijiaList = readSheet(ss, '共用_群俠技能清單').map(r => r.name).filter(Boolean);
  const events = readSheet(ss, prefix + '活動場次', ['teams','roles']);
  const matches = readSheet(ss, prefix + '比賽紀錄', ['participants','players']);
  const signupRows = readSheet(ss, prefix + '報名紀錄');

  const signups = {};
  signupRows.forEach(row => {
    if (!row.eventId) return;
    if (!signups[row.eventId]) signups[row.eventId] = {};
    signups[row.eventId][row.playerName] = row.status;
  });

  return jsonResponse({ members, skillList, baijiaList, events, matches, signups });
}

function readSheet(ss, sheetName, jsonFields) {
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) return [];
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];

  const headers = values[0];
  const rows = values.slice(1);

  return rows
    .filter(row => row.some(cell => cell !== ''))
    .map(row => {
      const obj = {};
      headers.forEach((h, i) => {
        let val = row[i];
        if (jsonFields && jsonFields.includes(h) && typeof val === 'string' && val) {
          try { val = JSON.parse(val); } catch (e) { /* keep as string */ }
        }
        obj[h] = val;
      });
      return obj;
    });
}
