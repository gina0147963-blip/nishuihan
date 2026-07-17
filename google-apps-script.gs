/**
 * 逆水寒管理系統 — Google Apps Script 後端 v5
 *
 * ★v5 重要修正：成員清單改為依模式（幫戰/俱樂部）分開讀取，
 *   修正舊版「讀取時一律讀共用_成員清單」導致兩個模式成員互相污染的問題。
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
// ★★ 共用試算表 ID（絕技/群俠技能清單存放處，所有組織共用）★★
// 也是白月燦星的資料試算表（沿用既有資料）
const SHARED_SPREADSHEET_ID = '1MNFrYwfjdsNGCNhUL14-pFIO5pQBRnGay6SmAq5W_F0';

// ★★ 組織設定表：要新增幫會/俱樂部，只要在這裡加一行＋重新部署 ★★
// - id:            組織代號（英文小寫，網址和內部識別用，設定後勿再更改）
// - name:          顯示名稱
// - mode:          'guild'（幫戰）或 'club'（俱樂部）
// - spreadsheetId: 該組織專屬試算表的ID（開一份新的 Google 試算表，從網址取得ID貼入）
// - prefix:        分頁名稱前綴。新組織留空 ''；白月燦星沿用舊資料所以是 '幫戰_'
// - pwSha256:      該組織管理員密碼的 SHA-256 雜湊（每個組織可各自不同）
//                  產生方式：https://emn178.github.io/online-tools/sha256.html 輸入密碼後複製結果
//                  ↓ 以下四個預設密碼都是「88888888」，正式使用前請各自改掉！
const ORGS = [
  { id:'bycx',    name:'白月燦星', mode:'guild', spreadsheetId:SHARED_SPREADSHEET_ID, prefix:'幫戰_',
    pwSha256:'615ed7fb1504b0c724a296d7a69e6c7b2f9ea2c57c1d8206c5afdf392ebdfd25' },
  { id:'jinzhao', name:'今朝',     mode:'club',  spreadsheetId:SHARED_SPREADSHEET_ID, prefix:'俱樂部_',
    pwSha256:'615ed7fb1504b0c724a296d7a69e6c7b2f9ea2c57c1d8206c5afdf392ebdfd25' },
  // ── 要新增幫會或俱樂部時，複製下面這行範本、取消註解並填入資料 ──────────
  // 步驟：1) 開一份新的空白 Google 試算表（同一個帳號），從網址複製ID
  //       2) id 取一個獨一無二的英文小寫代號（設定後就不要再改）
  //       3) 到 https://emn178.github.io/online-tools/sha256.html 產生該組織管理密碼的雜湊
  //       4) 儲存後「部署 → 管理部署作業 → 編輯 → 新版本 → 部署」
  // { id:'neworg', name:'新組織名稱', mode:'guild或club', spreadsheetId:'貼入新試算表ID', prefix:'',
  //   pwSha256:'貼入密碼雜湊' },
];

function _orgById(id){
  for (var i=0;i<ORGS.length;i++){ if(ORGS[i].id===id) return ORGS[i]; }
  return null;
}
// 舊版前端相容：只帶 mode 沒帶 org 的請求，對應到該模式的第一個組織
function _orgByModeFallback(mode){
  for (var i=0;i<ORGS.length;i++){ if(ORGS[i].mode===mode) return ORGS[i]; }
  return null;
}
function _resolveOrg(payload){
  var org = payload.org ? _orgById(payload.org) : null;
  if (!org && payload.mode) org = _orgByModeFallback(payload.mode);
  if (!org) throw new Error('未知的組織：' + (payload.org||payload.mode||'(未指定)'));
  if (!org.spreadsheetId || org.spreadsheetId.indexOf('請貼入') === 0){
    throw new Error('「' + org.name + '」尚未設定試算表ID，請在 Apps Script 的 ORGS 設定表填入後重新部署');
  }
  return org;
}

function _sha256Hex(str) {
  var raw = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, str, Utilities.Charset.UTF_8);
  return raw.map(function(b){ var v=(b+256)%256; return ('0'+v.toString(16)).slice(-2); }).join('');
}

function _orgSS(org) {
  return SpreadsheetApp.openById(org.spreadsheetId);
}
function _sharedSS() {
  return SpreadsheetApp.openById(SHARED_SPREADSHEET_ID);
}

function _out(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// ── GET：保留作為健康檢查 ─────────────────────────────────
function doGet(e) {
  let sheetOk=false, sheetName='';
  try { const ss=_sharedSS(); sheetOk=true; sheetName=ss.getName(); } catch(e) { sheetName=e.message; }
  return _out({ ok: true, message: 'Apps Script v7 (multi-org) is running', sheetOk: sheetOk, sheet: sheetName,
                orgs: ORGS.length, time: new Date().toISOString() });
}

// ── POST：處理所有請求（orgs + adminAuth + load + sync）──
function doPost(e) {
  try {
    const body    = e && e.postData ? e.postData.contents : '{}';
    const payload = JSON.parse(body);
    const action  = payload.action || '';

    if (action === 'orgs') {
      // 回傳組織清單給前端的選擇畫面（只給公開資訊，不含密碼雜湊與試算表ID）
      return _out({ ok: true, orgs: ORGS.map(function(o){ return { id:o.id, name:o.name, mode:o.mode }; }) });
    }

    if (action === 'adminAuth') {
      // 管理員登入驗證：比對「該組織」的密碼雜湊，每個組織密碼各自獨立
      var authOrg = payload.org ? _orgById(payload.org) : _orgByModeFallback(payload.mode||'');
      if (!authOrg) return _out({ ok: true, valid: false, reason: '未知的組織' });
      var ok = _sha256Hex(String(payload.pw || '')) === authOrg.pwSha256;
      return _out({ ok: true, valid: ok });
    }

    if (action === 'load') {
      // 讀取資料：依組織路由到各自的試算表
      const data = loadData(_resolveOrg(payload));
      return _out(data);
    }

    if (action === 'sync') {
      // 寫入資料：依組織路由到各自的試算表
      saveData(_resolveOrg(payload), payload);
      return _out({ ok: true, timestamp: payload.timestamp });
    }

    return _out({ error: 'unknown action: ' + action });
  } catch (err) {
    return _out({ error: err.message, stack: err.stack });
  }
}

// ── 讀取資料 ─────────────────────────────────────────────
function loadData(org) {
  const ss     = _orgSS(org);
  const prefix = org.prefix || '';

  var members = readSheet(ss, prefix + '成員清單', ['skills','baijia','aliases','changeLog']);
  // 相容處理（僅白月燦星沿用舊資料時有意義）：新分頁不存在時退回讀舊的共用分頁一次
  if (!members.length && prefix) {
    var legacy = readSheet(ss, '共用_成員清單', ['skills','baijia','aliases','changeLog']);
    if (legacy.length) members = legacy;
  }
  // 絕技/群俠技能清單為所有組織共用，固定存放在共用試算表
  const shared = _sharedSS();
  const skillList  = readSheet(shared, '共用_絕技清單').map(r => String(r.name||'')).filter(Boolean);
  const baijiaList = readSheet(shared, '共用_群俠技能清單').map(r => String(r.name||'')).filter(Boolean);
  const events     = readSheet(ss, prefix + '活動場次',      ['teams','roles','squadRoles','assignedSkills','assignedBaijia','teamNames','plannedRoster']);
  const matches    = readSheet(ss, prefix + '比賽紀錄',      ['participants','players','videos']);
  const signupRows = readSheet(ss, prefix + '報名紀錄');
  // 刪除紀錄（雲端墓碑）：讓所有裝置都知道哪些資料已被刪除，
  // 舊裝置的快取才不會在同步時把已刪除的成員/場次「復活」回來
  const tombstones = readSheet(ss, prefix + '刪除紀錄');

  const signups = {};
  signupRows.forEach(function(row) {
    if (!row.eventId || !row.playerName) return;
    if (!signups[row.eventId]) signups[row.eventId] = {};
    signups[row.eventId][row.playerName] = row.status;
  });

  return { members: members, skillList: skillList, baijiaList: baijiaList,
           events: events, matches: matches, signups: signups, tombstones: tombstones };
}

// ── 寫入資料 ─────────────────────────────────────────────
function saveData(org, payload) {
  const ss     = _orgSS(org);
  const prefix = org.prefix || '';

  // ★ 後端把關（防止舊裝置/舊版程式復活已刪資料）：
  // 先把「這次上傳的刪除紀錄」與「雲端既有的刪除紀錄」合併，
  // 再用合併後的完整刪除清單過濾這次要寫入的成員/場次/比賽——
  // 任何裝置（包含還在跑舊版程式、完全不認識刪除紀錄的裝置）
  // 都不可能把 30 天內已刪除的資料寫回雲端。
  var deletedIds = { members: {}, events: {}, matches: {} };
  try {
    var incoming = Array.isArray(payload.tombstones) ? payload.tombstones : [];
    var existing = readSheet(ss, prefix + '刪除紀錄');
    var map = {};
    existing.concat(incoming).forEach(function(t){
      if (!t || !t.coll || !t.id) return;
      var k = t.coll + '|' + t.id;
      var ts = Number(t.ts) || Date.now();
      if (!map[k] || ts > map[k].ts) map[k] = { coll: String(t.coll), id: String(t.id), ts: ts };
    });
    var cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
    var merged = Object.keys(map).map(function(k){ return map[k]; }).filter(function(t){ return t.ts >= cutoff; });
    merged.forEach(function(t){ if (deletedIds[t.coll]) deletedIds[t.coll][t.id] = true; });
    writeSheet(ss, prefix + '刪除紀錄', merged, ['coll','id','ts']);
  } catch (e) { /* 刪除紀錄處理失敗不影響主要資料儲存 */ }
  function _filterDeleted(list, coll) {
    return (list || []).filter(function(item){ return !(item && item.id && deletedIds[coll][String(item.id)]); });
  }

  writeSheet(ss, prefix + '成員清單', _filterDeleted(payload.members, 'members'), [
    'id','name','jobId','team','status','note','skills','baijia','aliases','changeLog','createdAt','updatedAt'
  ]);
  // 絕技/群俠技能清單為所有組織共用，固定寫入共用試算表
  const shared = _sharedSS();
  writeSheet(shared, '共用_絕技清單',
    (payload.skillList || []).map(function(s){ return { name: s }; }), ['name']);
  writeSheet(shared, '共用_群俠技能清單',
    (payload.baijiaList || []).map(function(s){ return { name: s }; }), ['name']);
  writeSheet(ss, prefix + '活動場次', _filterDeleted(payload.events, 'events'), [
    'id','name','date','type','eventTime','matchFormat','teamNames','teams','roles','squadRoles','assignedSkills','assignedBaijia','plannedRoster','planSavedAt','createdAt','updatedAt'
  ]);
  writeSheet(ss, prefix + '比賽紀錄', _filterDeleted(payload.matches, 'matches'), [
    'id','date','type','enemy','result','ourCount','enemyCount',
    'notes','videos','participants','players','createdAt','updatedAt'
  ]);
  writeSheet(ss, prefix + '報名紀錄',
    flattenSignups(payload.signups), ['eventId','playerName','status']);
  logSync(ss, org, payload.timestamp);
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
  var range = sheet.getRange(2, 1, rows.length, headers.length);
  // 強制整個資料範圍為純文字格式，避免試算表把 "20:00" 之類的字串
  // 自動解讀成時間序號（會導致約戰活動時間讀回來變成 1899-12-30）
  range.setNumberFormat('@');
  range.setValues(rows);
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
          // Google 試算表把「純時間」存成 1899-12-30 的日期物件，
          // 這種要格式化成 HH:mm（否則約戰的活動時間會變成 1899-12-30）；一般日期照舊
          v = (v.getFullYear() < 1970)
            ? Utilities.formatDate(v, Session.getScriptTimeZone(), 'HH:mm')
            : Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd');
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
function logSync(ss, org, ts) {
  var sheet = ss.getSheetByName('同步紀錄');
  if (!sheet) { sheet = ss.insertSheet('同步紀錄'); sheet.appendRow(['組織','時間']); }
  var last = sheet.getLastRow();
  if (last > 200) sheet.deleteRows(2, last - 200);
  sheet.appendRow([org.name || org.id, ts || new Date().toISOString()]);
}
