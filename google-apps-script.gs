/**
 * 逆水寒管理系統 — Google Apps Script 後端 v3
 *
 * 更新後需重新部署：部署 → 管理部署作業 → 編輯 → 版本選「新版本」→ 部署
 * 網址維持不變，不需要重新設定 PWA
 */

// ── CORS 輸出工具 ─────────────────────────────────────────
function _jsonOut(obj) {
  // ContentService 本身不支援自訂 header，
  // 需改用 HtmlService 回傳 JSON 才能加 CORS header
  const json = JSON.stringify(obj);
  return HtmlService.createHtmlOutput(json)
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// Apps Script Web App 的 GET/POST 回應必須用 TextOutput
// CORS 透過「誰可以存取：任何人」部署設定處理（不需要 header）
// 正確做法：直接用 ContentService，瀏覽器會自動允許
function _out(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// ── GET：讀取資料 ─────────────────────────────────────────
function doGet(e) {
  try {
    const params = e && e.parameter ? e.parameter : {};
    const action = params.action || '';
    const mode   = params.mode   || 'club';

    if (action === 'load') {
      return _out(loadData(mode));
    }
    return _out({ ok: true, message: 'Apps Script is running' });
  } catch (err) {
    return _out({ error: err.message });
  }
}

// ── POST：寫入資料 ────────────────────────────────────────
function doPost(e) {
  try {
    const body    = e && e.postData ? e.postData.contents : '{}';
    const payload = JSON.parse(body);

    if (payload.action === 'sync') {
      saveData(payload);
      return _out({ ok: true, timestamp: payload.timestamp });
    }
    return _out({ error: 'unknown action: ' + payload.action });
  } catch (err) {
    return _out({ error: err.message });
  }
}

// ── 儲存資料到試算表 ─────────────────────────────────────
function saveData(payload) {
  const ss     = SpreadsheetApp.getActiveSpreadsheet();
  const mode   = payload.mode || 'club';
  const prefix = mode === 'guild' ? '幫戰_' : '俱樂部_';

  writeSheet(ss, '共用_成員清單', payload.members || [], [
    'id','name','jobId','team','status','note','skills','baijia','createdAt'
  ]);
  writeSheet(ss, '共用_絕技清單',
    (payload.skillList || []).map(s => ({ name: s })), ['name']);
  writeSheet(ss, '共用_群俠技能清單',
    (payload.baijiaList || []).map(s => ({ name: s })), ['name']);

  writeSheet(ss, prefix + '活動場次', payload.events || [], [
    'id','name','date','type','teams','roles','createdAt'
  ]);
  writeSheet(ss, prefix + '比賽紀錄', payload.matches || [], [
    'id','date','type','enemy','result','ourCount','enemyCount',
    'notes','participants','players','createdAt'
  ]);
  writeSheet(ss, prefix + '報名紀錄',
    flattenSignups(payload.signups), ['eventId','playerName','status']);

  logSync(ss, mode, payload.timestamp);
}

// ── 從試算表讀取資料 ─────────────────────────────────────
function loadData(mode) {
  const ss     = SpreadsheetApp.getActiveSpreadsheet();
  const prefix = mode === 'guild' ? '幫戰_' : '俱樂部_';

  const members    = readSheet(ss, '共用_成員清單',     ['skills','baijia']);
  const skillList  = readSheet(ss, '共用_絕技清單').map(r => r.name).filter(Boolean);
  const baijiaList = readSheet(ss, '共用_群俠技能清單').map(r => r.name).filter(Boolean);
  const events     = readSheet(ss, prefix + '活動場次', ['teams','roles']);
  const matches    = readSheet(ss, prefix + '比賽紀錄', ['participants','players']);
  const signupRows = readSheet(ss, prefix + '報名紀錄');

  const signups = {};
  signupRows.forEach(row => {
    if (!row.eventId || !row.playerName) return;
    if (!signups[row.eventId]) signups[row.eventId] = {};
    signups[row.eventId][row.playerName] = row.status;
  });

  return { members, skillList, baijiaList, events, matches, signups };
}

// ── 寫入分頁 ─────────────────────────────────────────────
function writeSheet(ss, name, data, headers) {
  let sheet = ss.getSheetByName(name);
  if (!sheet) sheet = ss.insertSheet(name);
  else sheet.clear();

  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  if (!data || !data.length) return;

  const rows = data.map(item =>
    headers.map(h => {
      const v = item[h];
      if (v === null || v === undefined) return '';
      if (typeof v === 'object') return JSON.stringify(v);
      return String(v);
    })
  );
  sheet.getRange(2, 1, rows.length, headers.length).setValues(rows);
  try { sheet.autoResizeColumns(1, headers.length); } catch(e) {}
}

// ── 讀取分頁 ─────────────────────────────────────────────
function readSheet(ss, name, jsonFields) {
  const sheet = ss.getSheetByName(name);
  if (!sheet) return [];
  const vals = sheet.getDataRange().getValues();
  if (vals.length < 2) return [];

  const headers = vals[0].map(h => String(h).trim());
  return vals.slice(1)
    .filter(row => row.some(c => c !== ''))
    .map(row => {
      const obj = {};
      headers.forEach((h, i) => {
        let v = row[i];
        if (jsonFields && jsonFields.includes(h) && typeof v === 'string' && v.trim()) {
          try { v = JSON.parse(v); } catch(_) {}
        }
        if ((h === 'skills' || h === 'baijia') && v === '') v = [];
        obj[h] = v;
      });
      return obj;
    });
}

// ── 攤平報名資料 ─────────────────────────────────────────
function flattenSignups(signups) {
  if (!signups) return [];
  const rows = [];
  Object.keys(signups).forEach(evId => {
    const map = signups[evId] || {};
    Object.keys(map).forEach(name => {
      rows.push({ eventId: evId, playerName: name, status: map[name] });
    });
  });
  return rows;
}

// ── 同步紀錄 ─────────────────────────────────────────────
function logSync(ss, mode, ts) {
  let sheet = ss.getSheetByName('同步紀錄');
  if (!sheet) {
    sheet = ss.insertSheet('同步紀錄');
    sheet.appendRow(['模式', '時間']);
  }
  const last = sheet.getLastRow();
  if (last > 200) sheet.deleteRows(2, last - 200);
  sheet.appendRow([mode === 'guild' ? '幫戰' : '俱樂部', ts]);
}
