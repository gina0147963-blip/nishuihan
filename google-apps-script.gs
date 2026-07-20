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
const ORGS = [
  { id:'bycx',    name:'白月燦星', mode:'guild', spreadsheetId:SHARED_SPREADSHEET_ID, prefix:'幫戰_',
    pwSha256:'615ed7fb1504b0c724a296d7a69e6c7b2f9ea2c57c1d8206c5afdf392ebdfd25' },
  { id:'jinzhao', name:'今朝',     mode:'club',  spreadsheetId:SHARED_SPREADSHEET_ID, prefix:'俱樂部_',
    pwSha256:'615ed7fb1504b0c724a296d7a69e6c7b2f9ea2c57c1d8206c5afdf392ebdfd25' },
  { id:'byfx',    name:'白月梵星', mode:'guild', spreadsheetId:'1MZo6OXOnz7R5lVbMcMnJ9jAaW1eMS81_khWKlvtXyBc', prefix:'白月梵星_',
    pwSha256:'94edf28c6d6da38fd35d7ad53e485307f89fbeaf120485c8d17a43f323deee71' },
  { id:'jj',      name:'劍姬',     mode:'club',  spreadsheetId:'1WEMwFS-ODIe1GYZisbRG8KHKf1pdHcutKzbsoTN38To', prefix:'劍姬_',
    pwSha256:'94edf28c6d6da38fd35d7ad53e485307f89fbeaf120485c8d17a43f323deee71' },
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

// ============================================================
// ★★ 維護模式 ★★
// 你要更新網站/後端前，先在 Apps Script 編輯器選 maintenanceOn 按執行▶，
// 所有裝置會立刻（30秒內）看到「系統維護中」橫幅，期間成員的修改
// 只會保存在各自裝置本機、不會寫入雲端（避免寫進更新到一半的狀態）。
// 更新完成後執行 maintenanceOff，各裝置累積的變更會自動上傳合併。
// ============================================================
function maintenanceOn(msg) {
  var props = PropertiesService.getScriptProperties();
  props.setProperty('maintenance', '1');
  props.setProperty('maintenance_msg', String(msg || '系統維護更新中，您的修改已保存在此裝置，維護結束後會自動上傳，請勿清除瀏覽器資料'));
  console.log('🛠 維護模式已開啟。更新完成後記得執行 maintenanceOff()');
}
function maintenanceOff() {
  var props = PropertiesService.getScriptProperties();
  props.deleteProperty('maintenance');
  props.deleteProperty('maintenance_msg');
  console.log('✅ 維護模式已關閉，各裝置的變更會自動上傳合併。');
}
function _maintInfo() {
  var props = PropertiesService.getScriptProperties();
  var on = props.getProperty('maintenance') === '1';
  return { on: on, msg: on ? (props.getProperty('maintenance_msg') || '系統維護中') : '' };
}

// ── 資料版本號：每次資料真的有變動時 +1（存 Script Properties，查詢極快）──
// 前端每 5 秒問一次版本號（不必讀試算表），有變才抓完整資料，
// 讓「別人改了 → 我看到」的延遲從最久 30 秒縮短到 5～10 秒
function _getRev(orgId) {
  return PropertiesService.getScriptProperties().getProperty('rev_' + orgId) || '0';
}
function _bumpRev(orgId) {
  PropertiesService.getScriptProperties().setProperty('rev_' + orgId, String(Date.now()));
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

    if (action === 'ver') {
      // 超輕量版本查詢：只讀 Script Properties，不碰試算表，0.5秒內回應
      var vOrg = _resolveOrg(payload);
      var vmi = _maintInfo();
      return _out({ ok: true, rev: _getRev(vOrg.id), maintenance: vmi.on, maintenanceMsg: vmi.msg });
    }

    if (action === 'load') {
      // 讀取資料：依組織路由到各自的試算表（附帶維護狀態讓前端顯示橫幅）
      const loadOrg = _resolveOrg(payload);
      const data = loadData(loadOrg);
      const mi = _maintInfo();
      data.maintenance    = mi.on;
      data.maintenanceMsg = mi.msg;
      data.rev            = _getRev(loadOrg.id);
      return _out(data);
    }

    if (action === 'sync') {
      // 維護模式中：拒絕寫入（前端會把變更留在本機並自動重試，維護結束後補上傳）
      const mi2 = _maintInfo();
      if (mi2.on) return _out({ ok: false, maintenance: true, maintenanceMsg: mi2.msg });

      // ★ 上鎖：多台裝置同時同步時排隊寫入，避免「清空分頁→重寫」互相踩掉
      const lock = LockService.getScriptLock();
      if (!lock.tryLock(25000)) {
        // 排隊超過25秒拿不到鎖，回報失敗讓前端稍後自動重試（比寫壞資料好）
        return _out({ ok: false, busy: true, error: '伺服器忙碌中，請稍後自動重試' });
      }
      var syncOrg = _resolveOrg(payload);
      var changed = false;
      try {
        changed = saveData(syncOrg, payload);
      } finally {
        lock.releaseLock();
      }
      if (changed) _bumpRev(syncOrg.id); // 有實際變動才遞增版本號，其他裝置的 ver 輪詢才會觸發抓取
      return _out({ ok: true, timestamp: payload.timestamp, rev: _getRev(syncOrg.id) });
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
  // 技能清單是跨組織共用資源，刪除紀錄也存在共用試算表，讓任何組織刪除的技能，
  // 在所有組織的合併邏輯裡都能正確排除，不會被別的組織的舊資料復活
  const skillTombstones = readSheet(shared, '共用_技能刪除紀錄');
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
           events: events, matches: matches, signups: signups, tombstones: tombstones,
           skillTombstones: skillTombstones };
}

// ── 寫入資料 ─────────────────────────────────────────────
function saveData(org, payload) {
  const ss     = _orgSS(org);
  const prefix = org.prefix || '';
  var _changed = false; // 只要有任何一張分頁真的被改寫就為 true，用來決定是否遞增版本號

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

  // ★ 後端逐筆合併（以最新版本為主）：
  // 不再無條件用上傳的整包資料覆蓋試算表，而是先讀出雲端現有資料，
  // 依 id 比對 updatedAt，「較新的那筆」勝出（同時間以這次上傳為準）。
  // 這樣即使某台裝置快取過舊（例如網站更新後、或許久未開啟的手機），
  // 它上傳的舊資料也蓋不掉雲端較新的紀錄；雲端獨有的資料也不會因為
  // 上傳包裡沒有而消失（刪除一律必須走「刪除紀錄」墓碑，不能靠缺漏）。
  function _mergeNewest(existingRows, incomingRows, coll) {
    var map = {}, order = [];
    function put(item, isIncoming) {
      if (!item || !item.id) return;
      var id = String(item.id);
      if (deletedIds[coll] && deletedIds[coll][id]) return; // 已刪除的一律排除
      var prev = map[id];
      if (!prev) { map[id] = item; order.push(id); return; }
      var pu = Number(prev.updatedAt) || 0, iu = Number(item.updatedAt) || 0;
      if (isIncoming ? iu >= pu : iu > pu) map[id] = item; // 新的優先；平手以這次上傳為準
    }
    (existingRows || []).forEach(function(r){ put(r, false); });
    (incomingRows || []).forEach(function(r){ put(r, true); });
    return order.map(function(id){ return map[id]; });
  }

  var MEMBER_JSON = ['skills','baijia','aliases','changeLog'];
  var EVENT_JSON  = ['teams','roles','squadRoles','assignedSkills','assignedBaijia','teamNames','plannedRoster'];
  var MATCH_JSON  = ['participants','players','videos'];

  if (writeSheet(ss, prefix + '成員清單',
    _mergeNewest(readSheet(ss, prefix + '成員清單', MEMBER_JSON), _filterDeleted(payload.members, 'members'), 'members'), [
    'id','name','jobId','team','status','note','skills','baijia','aliases','changeLog','createdAt','updatedAt'
  ])) _changed = true;
  // 絕技/群俠技能清單為所有組織共用，固定寫入共用試算表；
  // 寫入前先合併「共用_技能刪除紀錄」，任何組織刪除的技能都會被過濾掉，
  // 不會因為另一個組織還沒同步到最新狀態而被寫回來
  const shared = _sharedSS();
  var skillDeletedNames = {};
  try {
    var incomingSkillTomb = Array.isArray(payload.skillTombstones) ? payload.skillTombstones : [];
    var existingSkillTomb = readSheet(shared, '共用_技能刪除紀錄');
    var skMap = {};
    existingSkillTomb.concat(incomingSkillTomb).forEach(function(t){
      if (!t || !t.name) return;
      var ts = Number(t.ts) || Date.now();
      if (!skMap[t.name] || ts > skMap[t.name].ts) skMap[t.name] = { name: String(t.name), ts: ts };
    });
    var skCutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
    var skMerged = Object.keys(skMap).map(function(k){ return skMap[k]; }).filter(function(t){ return t.ts >= skCutoff; });
    skMerged.forEach(function(t){ skillDeletedNames[t.name] = true; });
    writeSheet(shared, '共用_技能刪除紀錄', skMerged, ['name','ts']);
  } catch (e) { /* 技能刪除紀錄處理失敗不影響主要資料儲存 */ }
  if (writeSheet(shared, '共用_絕技清單',
    (payload.skillList || []).filter(function(s){ return !skillDeletedNames[s]; }).map(function(s){ return { name: s }; }), ['name'])) _changed = true;
  if (writeSheet(shared, '共用_群俠技能清單',
    (payload.baijiaList || []).filter(function(s){ return !skillDeletedNames[s]; }).map(function(s){ return { name: s }; }), ['name'])) _changed = true;
  if (writeSheet(ss, prefix + '活動場次',
    _mergeNewest(readSheet(ss, prefix + '活動場次', EVENT_JSON), _filterDeleted(payload.events, 'events'), 'events'), [
    'id','name','date','type','eventTime','matchFormat','teamNames','teams','roles','squadRoles','assignedSkills','assignedBaijia','plannedRoster','planSavedAt','createdAt','updatedAt'
  ])) _changed = true;
  if (writeSheet(ss, prefix + '比賽紀錄',
    _mergeNewest(readSheet(ss, prefix + '比賽紀錄', MATCH_JSON), _filterDeleted(payload.matches, 'matches'), 'matches'), [
    'id','date','type','enemy','result','ourCount','enemyCount',
    'notes','videos','participants','players','createdAt','updatedAt'
  ])) _changed = true;
  if (writeSheet(ss, prefix + '報名紀錄',
    flattenSignups(payload.signups), ['eventId','playerName','status'])) _changed = true;
  // 同步紀錄只在資料真的有變動時記一筆，沒變動的輪詢寫入不再花時間記錄
  if (_changed) logSync(ss, org, payload.timestamp);
  return _changed;
}

// ── 工具：寫分頁 ─────────────────────────────────────────
// 回傳 true=內容有變動已重寫 / false=內容完全相同，跳過重寫。
// 跳過不必要的「清空+重寫+格式化」是同步提速的關鍵之一：
// 每次同步通常只有一兩張分頁真的有變，其他分頁原本也全部重寫，白白多花數秒。
function writeSheet(ss, name, data, headers) {
  var sheet = ss.getSheetByName(name);
  var isNew = false;
  if (!sheet) { sheet = ss.insertSheet(name); isNew = true; }

  var rows = (data || []).map(function(item) {
    return headers.map(function(h) {
      var v = item[h];
      if (v === null || v === undefined) return '';
      if (typeof v === 'object') return JSON.stringify(v);
      return String(v);
    });
  });

  // 內容比對：現有分頁與要寫入的內容完全相同 → 直接跳過
  if (!isNew) {
    try {
      var cur = sheet.getDataRange().getValues();
      var same = (cur.length === rows.length + 1) && (cur[0].length === headers.length);
      if (same) {
        for (var c = 0; c < headers.length && same; c++) {
          if (String(cur[0][c] === null || cur[0][c] === undefined ? '' : cur[0][c]) !== headers[c]) same = false;
        }
      }
      for (var r = 0; r < rows.length && same; r++) {
        for (var c2 = 0; c2 < headers.length && same; c2++) {
          var cv = cur[r + 1][c2];
          if (String(cv === null || cv === undefined ? '' : cv) !== rows[r][c2]) same = false;
        }
      }
      if (same) return false;
    } catch (e) { /* 比對失敗就照常重寫，安全優先 */ }
  }

  sheet.clear();
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  if (rows.length) {
    var range = sheet.getRange(2, 1, rows.length, headers.length);
    // 強制整個資料範圍為純文字格式，避免試算表把 "20:00" 之類的字串
    // 自動解讀成時間序號（會導致約戰活動時間讀回來變成 1899-12-30）
    range.setNumberFormat('@');
    range.setValues(rows);
  }
  // 自動調整欄寬很花時間，只在分頁第一次建立時做一次（純視覺用途，不影響資料）
  if (isNew) { try { sheet.autoResizeColumns(1, headers.length); } catch(e) {} }
  return true;
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

// ============================================================
// ★★ 自動備份系統 ★★
// 每個試算表（含共用試算表）各自輪替3個備份槽位，每2天檢查一次、
// 有需要就備份一次；備份滿3份後，第4次備份（即第8天）會覆寫最舊的那一份，
// 永遠只保留「最近3份、間隔約2天」的完整複本，避免Drive被無限塞爆。
// 備份是「整份試算表的完整複本」，存在Drive一個專屬資料夾裡，
// 網站更新出問題時可直接打開對應複本，把資料複製/匯出回主要試算表救回來。
//
// ★ 設定方式（只需要做「一次」）：
//   1. 把這整份 .gs 貼上 Apps Script 編輯器、存檔
//   2. 上方函式選單選擇「installBackupTrigger」
//   3. 按執行▶，會跳出 Google 授權視窗（因為要新增 Drive 存取權限），
//      照著點「檢閱權限」→ 選帳號 →（若顯示未驗證）點「進階」→「前往...（不安全）」→「允許」
//   4. 執行完成後，之後每天都會自動檢查、視需要備份，永久不用再手動操作
//   5. 之後不管重新部署幾次網頁版（部署→新版本），這個每日排程都不受影響，
//      會持續運作，只要函式名稱 dailyBackupCheck 保持不變即可
// ============================================================
const BACKUP_INTERVAL_DAYS = 2;
const BACKUP_SLOT_COUNT = 3;
const BACKUP_FOLDER_NAME = '逆水寒系統_自動備份';

function _getOrCreateBackupFolder() {
  var it = DriveApp.getFoldersByName(BACKUP_FOLDER_NAME);
  if (it.hasNext()) return it.next();
  return DriveApp.createFolder(BACKUP_FOLDER_NAME);
}

// 每天由時間驅動觸發器呼叫一次：檢查每份試算表距離上次備份是否已滿3天，
// 滿了就備份一次（輪流寫入3個槽位；同一槽位再次使用時會先刪除舊複本再建新的）
function dailyBackupCheck() {
  // 用物件去重：白月燦星／今朝共用同一份試算表時，只需要備份一次
  var targets = {};
  ORGS.forEach(function(o){
    if (o.spreadsheetId && o.spreadsheetId.indexOf('請貼入') !== 0) targets[o.spreadsheetId] = true;
  });
  targets[SHARED_SPREADSHEET_ID] = true; // 共用試算表（絕技/群俠技能清單等）也一併備份

  var props = PropertiesService.getScriptProperties();
  var folder = _getOrCreateBackupFolder();
  var now = new Date();

  Object.keys(targets).forEach(function(ssId){
    try {
      var lastStr = props.getProperty('backup_last_' + ssId);
      if (lastStr) {
        var elapsedDays = (now - new Date(lastStr)) / (24 * 60 * 60 * 1000);
        if (elapsedDays < BACKUP_INTERVAL_DAYS) return; // 還沒到2天，這份先跳過
      }
      var slot = parseInt(props.getProperty('backup_slot_' + ssId) || '0', 10);
      var ss = SpreadsheetApp.openById(ssId);
      var slotName = '備份_' + ss.getName() + '_slot' + (slot + 1);

      // 同一槽位若已有舊複本，先丟進垃圾桶（覆寫），再建立最新的完整複本
      var oldFiles = folder.getFilesByName(slotName);
      while (oldFiles.hasNext()) { oldFiles.next().setTrashed(true); }
      var srcFile = DriveApp.getFileById(ssId);
      var newFile = srcFile.makeCopy(slotName, folder);
      newFile.setDescription('自動備份時間：' + Utilities.formatDate(now, 'Asia/Taipei', 'yyyy-MM-dd HH:mm') + '｜來源ID:' + ssId);

      props.setProperty('backup_last_' + ssId, now.toISOString());
      props.setProperty('backup_slot_' + ssId, String((slot + 1) % BACKUP_SLOT_COUNT));
    } catch (e) {
      console.error('備份失敗（' + ssId + '）：' + e.message);
    }
  });
}

// 安裝每日排程觸發器（只需手動執行這一個函式一次，見上方說明）
function installBackupTrigger() {
  ScriptApp.getProjectTriggers().forEach(function(t){
    if (t.getHandlerFunction() === 'dailyBackupCheck') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('dailyBackupCheck')
    .timeBased()
    .everyDays(1)
    .atHour(3) // 每天凌晨3點檢查（依專案時區設定）
    .create();
  console.log('✅ 每日備份排程已安裝，之後會自動每天檢查並視需要備份。');
}

// 如果之後想暫停自動備份，執行這個函式即可移除排程
function uninstallBackupTrigger() {
  var removed = 0;
  ScriptApp.getProjectTriggers().forEach(function(t){
    if (t.getHandlerFunction() === 'dailyBackupCheck') { ScriptApp.deleteTrigger(t); removed++; }
  });
  console.log('已移除 ' + removed + ' 個備份排程。');
}

// ============================================================
// ★★ 一鍵還原系統（從自動備份救回遺失資料）★★
// 資料遺失時的救援流程（都在 Apps Script 編輯器操作）：
//   1. 上方函式選單選「listBackups」按執行▶ → 查看「執行紀錄」，
//      會列出目前所有備份檔名稱與備份時間，挑一份遺失前的備份
//   2. 打開下方 RESTORE_BACKUP_NAME，把挑好的備份檔名稱貼進引號裡
//   3. 函式選單選「restoreFromBackup」按執行▶
//
// 還原採「合併」而非「覆蓋」：逐筆比對備份與現有資料，
// ▸ 只存在備份裡的（＝遺失的資料）→ 補回來
// ▸ 兩邊都有的 → 比對 updatedAt，【以較新的版本為主】，
//   所以還原「不會」把成員在遺失後新增/修改的內容洗掉
// ▸ 30天內走正常流程刪除的資料 → 預設不復活（尊重刪除紀錄）；
//   若連刪除的也要救回，把 RESTORE_REVIVE_DELETED 改成 true
// ============================================================
var RESTORE_BACKUP_NAME   = '';    // ← 貼入 listBackups 列出的備份檔名稱
var RESTORE_REVIVE_DELETED = false; // true = 連「刪除紀錄」內的資料也一併復活

function listBackups() {
  var folder = _getOrCreateBackupFolder();
  var files = folder.getFiles();
  var found = 0;
  while (files.hasNext()) {
    var f = files.next();
    console.log('📦 ' + f.getName() + '｜' + (f.getDescription() || '(無描述)'));
    found++;
  }
  if (!found) console.log('（目前沒有任何備份檔，請先確認 installBackupTrigger 已執行過）');
  else console.log('共 ' + found + ' 份。複製要還原的檔名，貼入 RESTORE_BACKUP_NAME 後執行 restoreFromBackup');
}

function restoreFromBackup() {
  if (!RESTORE_BACKUP_NAME) throw new Error('請先把備份檔名稱貼入程式碼上方的 RESTORE_BACKUP_NAME，儲存後再執行');
  var folder = _getOrCreateBackupFolder();
  var it = folder.getFilesByName(RESTORE_BACKUP_NAME);
  if (!it.hasNext()) throw new Error('找不到備份檔「' + RESTORE_BACKUP_NAME + '」，請先執行 listBackups 確認名稱');
  var bakFile = it.next();

  // 從備份檔描述取出來源試算表ID，自動對應要還原到哪一份主試算表
  var desc = bakFile.getDescription() || '';
  var m = desc.match(/來源ID:([A-Za-z0-9_\-]+)/);
  if (!m) throw new Error('這份備份缺少來源ID標記（較舊的備份檔）。請等新備份產生後再用，或手動開啟備份複本比對救回');
  var targetId = m[1];

  var bak = SpreadsheetApp.openById(bakFile.getId());
  var main = SpreadsheetApp.openById(targetId);

  // 讀取主表的刪除紀錄，決定哪些 id 不復活
  var deletedByColl = { members:{}, events:{}, matches:{} };
  if (!RESTORE_REVIVE_DELETED) {
    main.getSheets().forEach(function(sh){
      if (sh.getName().indexOf('刪除紀錄') === -1) return;
      readSheet(main, sh.getName()).forEach(function(t){
        if (t && t.coll && t.id && deletedByColl[t.coll]) deletedByColl[t.coll][String(t.id)] = true;
      });
    });
  }

  var JSON_FIELDS = {
    '成員清單': ['skills','baijia','aliases','changeLog'],
    '活動場次': ['teams','roles','squadRoles','assignedSkills','assignedBaijia','teamNames','plannedRoster'],
    '比賽紀錄': ['participants','players','videos'],
  };
  var HEADERS = {
    '成員清單': ['id','name','jobId','team','status','note','skills','baijia','aliases','changeLog','createdAt','updatedAt'],
    '活動場次': ['id','name','date','type','eventTime','matchFormat','teamNames','teams','roles','squadRoles','assignedSkills','assignedBaijia','plannedRoster','planSavedAt','createdAt','updatedAt'],
    '比賽紀錄': ['id','date','type','enemy','result','ourCount','enemyCount','notes','videos','participants','players','createdAt','updatedAt'],
  };
  var COLL = { '成員清單':'members', '活動場次':'events', '比賽紀錄':'matches' };

  var lock = LockService.getScriptLock();
  lock.waitLock(30000); // 還原期間擋住同步寫入，避免互相干擾
  try {
    bak.getSheets().forEach(function(sh){
      var name = sh.getName();

      // 逐筆合併類：成員清單／活動場次／比賽紀錄（含各組織前綴的分頁）
      Object.keys(COLL).forEach(function(suffix){
        if (name.indexOf(suffix) === -1) return;
        var coll = COLL[suffix];
        var bakRows  = readSheet(bak,  name, JSON_FIELDS[suffix]);
        var mainRows = readSheet(main, name, JSON_FIELDS[suffix]);
        var map = {}, order = [];
        function put(item){
          if (!item || !item.id) return;
          var id = String(item.id);
          if (deletedByColl[coll][id]) return;
          var prev = map[id];
          if (!prev) { map[id] = item; order.push(id); return; }
          var pu = Number(prev.updatedAt)||0, iu = Number(item.updatedAt)||0;
          if (iu > pu) map[id] = item; // 以較新版本為主（現有較新→保留現有，不會洗掉新資料）
        }
        bakRows.forEach(put);
        mainRows.forEach(put);
        writeSheet(main, name, order.map(function(id){ return map[id]; }), HEADERS[suffix]);
        console.log('✅ ' + name + '：合併完成，共 ' + order.length + ' 筆（備份補回或較新者已套用）');
      });

      // 報名紀錄：只補缺（現有回覆一律視為較新，不覆蓋）
      if (name.indexOf('報名紀錄') !== -1) {
        var bakS  = readSheet(bak,  name);
        var mainS = readSheet(main, name);
        var have = {};
        mainS.forEach(function(r){ if(r.eventId && r.playerName) have[r.eventId+'|'+r.playerName] = true; });
        var merged = mainS.slice(), fill = 0;
        bakS.forEach(function(r){
          if (!r.eventId || !r.playerName) return;
          if (!have[r.eventId+'|'+r.playerName]) { merged.push(r); fill++; }
        });
        if (fill) writeSheet(main, name, merged, ['eventId','playerName','status']);
        console.log('✅ ' + name + '：補回 ' + fill + ' 筆報名');
      }

      // 技能清單：聯集（備份有、現在沒有的補回）
      if (name.indexOf('絕技清單') !== -1 || name.indexOf('群俠技能清單') !== -1) {
        var bakN  = readSheet(bak,  name).map(function(r){ return String(r.name||''); }).filter(Boolean);
        var mainN = readSheet(main, name).map(function(r){ return String(r.name||''); }).filter(Boolean);
        var set = {}; var out = [];
        mainN.concat(bakN).forEach(function(n){ if(!set[n]){ set[n]=1; out.push({name:n}); } });
        if (out.length > mainN.length) writeSheet(main, name, out, ['name']);
        console.log('✅ ' + name + '：補回 ' + (out.length - mainN.length) + ' 個技能');
      }
      // 刪除紀錄、同步紀錄：不還原（保持現況）
    });
    console.log('🎉 還原完成！各裝置最慢 30 秒內會自動同步到合併後的資料。');
    console.log('提醒：還原後建議把 RESTORE_BACKUP_NAME 清回空字串，避免日後誤按重複還原。');
  } finally {
    lock.releaseLock();
  }
}
