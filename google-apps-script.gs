/**
 * 逆水寒管理系統 — Google Apps Script 後端
 * 
 * 安裝步驟（僅需一次）：
 * 1. 開啟 Google 試算表 → 擴充功能 → Apps Script
 * 2. 刪除預設內容，貼上這整份程式碼，儲存
 * 3. 點「部署」→「新增部署作業」
 *    - 類型：網路應用程式
 *    - 執行身份：我
 *    - 誰可以存取：任何人
 * 4. 授權後取得網址（https://script.google.com/macros/s/.../exec）
 * 5. 在 PWA 頂部欄點同步圖示，貼上此網址儲存即可
 * 
 * 之後程式碼有更新：部署 → 管理部署作業 → 編輯 → 版本選「新版本」→ 部署
 * 網址維持不變，不需要重新設定 PWA
 */

// ── CORS headers ──────────────────────────────────────────
function _cors(output) {
  return output
    .setHeader('Access-Control-Allow-Origin', '*')
    .setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
    .setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function doOptions(e) {
  return _cors(ContentService.createTextOutput(''));
}

// ── GET: 讀取資料 ─────────────────────────────────────────
function doGet(e) {
  try {
    const action = (e.parameter || {}).action;
    const mode   = (e.parameter || {}).mode || 'club';

    if (action === 'load') {
      const data = loadData(mode);
      return _cors(ContentService.createTextOutput(JSON.stringify(data))
        .setMimeType(ContentService.MimeType.JSON));
    }

    return _cors(ContentService.createTextOutput(JSON.stringify({ error: 'unknown action' }))
      .setMimeType(ContentService.MimeType.JSON));
  } catch (err) {
    return _cors(ContentService.createTextOutput(JSON.stringify({ error: err.message }))
      .setMimeType(ContentService.MimeType.JSON));
  }
}

// ── POST: 寫入資料 ────────────────────────────────────────
function doPost(e) {
  try {
    const payload = JSON.parse(e.postData.contents);
    const action  = payload.action;

    if (action === 'sync') {
      saveData(payload);
      return _cors(ContentService.createTextOutput(JSON.stringify({ ok: true, ts: payload.timestamp }))
        .setMimeType(ContentService.MimeType.JSON));
    }

    return _cors(ContentService.createTextOutput(JSON.stringify({ error: 'unknown action' }))
      .setMimeType(ContentService.MimeType.JSON));
  } catch (err) {
    return _cors(ContentService.createTextOutput(JSON.stringify({ error: err.message }))
      .setMimeType(ContentService.MimeType.JSON));
  }
}

// ── 儲存資料到試算表 ─────────────────────────────────────
function saveData(payload) {
  const ss     = SpreadsheetApp.getActiveSpreadsheet();
  const mode   = payload.mode || 'club';
  const prefix = mode === 'guild' ? '幫戰_' : '俱樂部_';

  // 共用資料（兩個模式共用）
  writeSheet(ss, '共用_成員清單', payload.members || [], [
    'id','name','jobId','team','status','note','skills','baijia','createdAt'
  ]);
  writeSheet(ss, '共用_絕技清單', (payload.skillList || []).map(s => ({ name: s })), ['name']);
  writeSheet(ss, '共用_群俠技能清單', (payload.baijiaList || []).map(s => ({ name: s })), ['name']);

  // 模式專屬資料
  writeSheet(ss, prefix + '活動場次', payload.events || [], [
    'id','name','date','type','teams','roles','createdAt'
  ]);
  writeSheet(ss, prefix + '比賽紀錄', payload.matches || [], [
    'id','date','type','enemy','result','ourCount','enemyCount','notes','participants','players','createdAt'
  ]);
  writeSheet(ss, prefix + '報名紀錄', flattenSignups(payload.signups), [
    'eventId','playerName','status'
  ]);

  // 同步紀錄
  logSync(ss, mode, payload.timestamp);
}

// ── 讀取資料從試算表 ─────────────────────────────────────
function loadData(mode) {
  const ss     = SpreadsheetApp.getActiveSpreadsheet();
  const prefix = mode === 'guild' ? '幫戰_' : '俱樂部_';

  const members   = readSheet(ss, '共用_成員清單',        ['skills','baijia']);
  const skillList = readSheet(ss, '共用_絕技清單').map(r => r.name).filter(Boolean);
  const baijiaList= readSheet(ss, '共用_群俠技能清單').map(r => r.name).filter(Boolean);
  const events    = readSheet(ss, prefix + '活動場次',    ['teams','roles']);
  const matches   = readSheet(ss, prefix + '比賽紀錄',    ['participants','players']);
  const signupRows= readSheet(ss, prefix + '報名紀錄');

  const signups = {};
  signupRows.forEach(row => {
    if (!row.eventId || !row.playerName) return;
    if (!signups[row.eventId]) signups[row.eventId] = {};
    signups[row.eventId][row.playerName] = row.status;
  });

  return { members, skillList, baijiaList, events, matches, signups };
}

// ── 工具：寫入分頁 ───────────────────────────────────────
function writeSheet(ss, sheetName, dataArray, headers) {
  let sheet = ss.getSheetByName(sheetName);
  if (!sheet) sheet = ss.insertSheet(sheetName);
  else sheet.clear();

  // 標題列
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  if (!dataArray || !dataArray.length) return;

  const rows = dataArray.map(item =>
    headers.map(h => {
      const val = item[h];
      if (val === undefined || val === null) return '';
      if (typeof val === 'object') return JSON.stringify(val);
      return String(val);
    })
  );
  sheet.getRange(2, 1, rows.length, headers.length).setValues(rows);
  try { sheet.autoResizeColumns(1, headers.length); } catch(e) {}
}

// ── 工具：讀取分頁 ───────────────────────────────────────
function readSheet(ss, sheetName, jsonFields) {
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) return [];
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];

  const headers = values[0].map(h => String(h).trim());
  return values.slice(1)
    .filter(row => row.some(c => c !== ''))
    .map(row => {
      const obj = {};
      headers.forEach((h, i) => {
        let val = row[i];
        if (jsonFields && jsonFields.includes(h) && typeof val === 'string' && val.trim()) {
          try { val = JSON.parse(val); } catch (e) { /* 保持原始字串 */ }
        }
        // 空字串轉回空陣列（for skills/baijia）
        if ((h === 'skills' || h === 'baijia') && val === '') val = [];
        obj[h] = val;
      });
      return obj;
    });
}

// ── 工具：攤平報名資料 ───────────────────────────────────
function flattenSignups(signups) {
  const result = [];
  if (!signups) return result;
  Object.keys(signups).forEach(eventId => {
    const playerMap = signups[eventId] || {};
    Object.keys(playerMap).forEach(playerName => {
      result.push({ eventId, playerName, status: playerMap[playerName] });
    });
  });
  return result;
}

// ── 工具：寫入同步紀錄 ──────────────────────────────────
function logSync(ss, mode, timestamp) {
  let sheet = ss.getSheetByName('同步紀錄');
  if (!sheet) {
    sheet = ss.insertSheet('同步紀錄');
    sheet.appendRow(['模式', '同步時間']);
  }
  // 只保留最近 100 筆
  const lastRow = sheet.getLastRow();
  if (lastRow > 101) sheet.deleteRows(2, lastRow - 101);
  sheet.appendRow([mode === 'guild' ? '幫戰' : '俱樂部', timestamp]);
}
