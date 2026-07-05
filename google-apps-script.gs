/**
 * 逆水寒管理系統 — Google Apps Script 後端 v4
 *
 * 重要：讀取(load)和寫入(sync)都改用 POST，解決 CORS 問題
 *
 * 更新步驟：
 * 1. 全選貼上這份程式碼，Ctrl+S 儲存
 * 2. 部署 → 管理部署作業 → 鉛筆編輯 → 版本選「新版本」→ 部署
 * 3. 網址不變，不需重新設定 PWA
 */

// ★★ 請把你的 Google 試算表 ID 貼在下面引號內 ★★
// 取得方式：打開你的試算表，網址長這樣：
// https://docs.google.com/spreadsheets/d/【這一段就是ID】/edit
const SPREADSHEET_ID = '1MNFrYwfjdsNGCNhUL14-pFIO5pQBRnGay6SmAq5W_F0';

function _ss() {
  if (SPREADSHEET_ID) return SpreadsheetApp.openById(SPREADSHEET_ID);
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error('未綁定試算表：請在程式碼頂部 SPREADSHEET_ID 填入試算表ID後重新部署');
  return ss;
}

function _out(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// ── GET：保留作為健康檢查 ─────────────────────────────────
function doGet(e) {
  let sheetOk=false, sheetName='';
  try { const ss=_ss(); sheetOk=true; sheetName=ss.getName(); } catch(e) { sheetName=e.message; }
  return _out({ ok: true, message: 'Apps Script v6 is running', sheetOk: sheetOk, sheet: sheetName, time: new Date().toISOString() });
}

// ── POST：處理所有請求（load + sync）────────────────────
function doPost(e) {
  try {
    const body    = e && e.postData ? e.postData.contents : '{}';
    const payload = JSON.parse(body);
    const action  = payload.action || '';

    if (action === 'load') {
      // 讀取資料（之前是 GET，現在改成 POST 避免 CORS）
      const data = loadData(payload.mode || 'club');
      return _out(data);
    }

    if (action === 'sync') {
      // 寫入資料
      saveData(payload);
      return _out({ ok: true, timestamp: payload.timestamp });
    }

    return _out({ error: 'unknown action: ' + action });
  } catch (err) {
    return _out({ error: err.message, stack: err.stack });
  }
}

// ── 讀取資料 ─────────────────────────────────────────────
function loadData(mode) {
  const ss     = _ss();
  const prefix = mode === 'guild' ? '幫戰_' : '俱樂部_';

  const members    = readSheet(ss, '共用_成員清單',          ['skills','baijia']);
  const skillList  = readSheet(ss, '共用_絕技清單').map(r => String(r.name||'')).filter(Boolean);
  const baijiaList = readSheet(ss, '共用_群俠技能清單').map(r => String(r.name||'')).filter(Boolean);
  const events     = readSheet(ss, prefix + '活動場次',      ['teams','roles']);
  const matches    = readSheet(ss, prefix + '比賽紀錄',      ['participants','players']);
  const signupRows = readSheet(ss, prefix + '報名紀錄');

  const signups = {};
  signupRows.forEach(function(row) {
    if (!row.eventId || !row.playerName) return;
    if (!signups[row.eventId]) signups[row.eventId] = {};
    signups[row.eventId][row.playerName] = row.status;
  });

  return { members: members, skillList: skillList, baijiaList: baijiaList,
           events: events, matches: matches, signups: signups };
}

// ── 寫入資料 ─────────────────────────────────────────────
function saveData(payload) {
  const ss     = _ss();
  const mode   = payload.mode || 'club';
  const prefix = mode === 'guild' ? '幫戰_' : '俱樂部_';

  writeSheet(ss, prefix + '成員清單', payload.members || [], [
    'id','name','jobId','team','status','note','skills','baijia','aliases','changeLog','createdAt'
  ]);
  writeSheet(ss, '共用_絕技清單',
    (payload.skillList || []).map(function(s){ return { name: s }; }), ['name']);
  writeSheet(ss, '共用_群俠技能清單',
    (payload.baijiaList || []).map(function(s){ return { name: s }; }), ['name']);
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

// ── 工具：寫分頁 ─────────────────────────────────────────
function writeSheet(ss, name, data, headers) {
  var sheet = ss.getSheetByName(name);
  if (!sheet) sheet = ss.insertSheet(name);
  else sheet.clear();

  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  if (!data || !data.length) return;

  var rows = data.map(function(item) {
    return headers.map(function(h) {
      var v = item[h];
      if (v === null || v === undefined) return '';
      if (typeof v === 'object') return JSON.stringify(v);
      return String(v);
    });
  });
  sheet.getRange(2, 1, rows.length, headers.length).setValues(rows);
  try { sheet.autoResizeColumns(1, headers.length); } catch(e) {}
}

// ── 工具：讀分頁 ─────────────────────────────────────────
function readSheet(ss, name, jsonFields) {
  var sheet = ss.getSheetByName(name);
  if (!sheet) return [];
  var vals = sheet.getDataRange().getValues();
  if (vals.length < 2) return [];

  var headers = vals[0].map(function(h){ return String(h).trim(); });
  return vals.slice(1)
    .filter(function(row){ return row.some(function(c){ return c !== ''; }); })
    .map(function(row) {
      var obj = {};
      headers.forEach(function(h, i) {
        var v = row[i];
        if (v instanceof Date) {
          v = Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd');
        }
        if (jsonFields && jsonFields.indexOf(h) >= 0 && typeof v === 'string' && v.trim()) {
          try { v = JSON.parse(v); } catch(_) {}
        }
        if ((h === 'skills' || h === 'baijia') && v === '') v = [];
        obj[h] = v;
      });
      return obj;
    });
}

// ── 工具：攤平報名 ───────────────────────────────────────
function flattenSignups(signups) {
  if (!signups) return [];
  var rows = [];
  Object.keys(signups).forEach(function(evId) {
    var map = signups[evId] || {};
    Object.keys(map).forEach(function(name) {
      rows.push({ eventId: evId, playerName: name, status: map[name] });
    });
  });
  return rows;
}

// ── 工具：同步紀錄 ───────────────────────────────────────
function logSync(ss, mode, ts) {
  var sheet = ss.getSheetByName('同步紀錄');
  if (!sheet) { sheet = ss.insertSheet('同步紀錄'); sheet.appendRow(['模式','時間']); }
  var last = sheet.getLastRow();
  if (last > 200) sheet.deleteRows(2, last - 200);
  sheet.appendRow([mode === 'guild' ? '幫戰' : '俱樂部', ts || new Date().toISOString()]);
}
