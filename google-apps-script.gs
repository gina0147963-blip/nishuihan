/**
 * 逆水寒管理系統 — Google Apps Script 後端 v8
 * 
 * ★v8 重要修正：支援多組織、積分機制、維護模式，以及「依 updatedAt 逐筆合併」
 */

const SHARED_SPREADSHEET_ID = '1MNFrYwfjdsNGCNhUL14-pFIO5pQBRnGay6SmAq5W_F0';

const ORGS = [
  { id:'bycx',    name:'白月燦星', mode:'guild', spreadsheetId:SHARED_SPREADSHEET_ID, prefix:'幫戰_',
    pwSha256:'615ed7fb1504b0c724a296d7a69e6c7b2f9ea2c57c1d8206c5afdf392ebdfd25' },
  { id:'jinzhao', name:'今朝',     mode:'club',  spreadsheetId:SHARED_SPREADSHEET_ID, prefix:'俱樂部_',
    pwSha256:'8c1cdb9cb4dbac6dbb6ebd118ec8f9523d22e4e4cb8cc9df5f7e1e499bba3c10' },
  { id:'byfx',    name:'白月梵星', mode:'guild', spreadsheetId:'1MZo6OXOnz7R5lVbMcMnJ9jAaW1eMS81_khWKlvtXyBc', prefix:'白月梵星_',
    pwSha256:'94edf28c6d6da38fd35d7ad53e485307f89fbeaf120485c8d17a43f323deee71' },
  { id:'jj',      name:'劍姬',     mode:'club',  spreadsheetId:'1WEMwFS-ODIe1GYZisbRG8KHKf1pdHcutKzbsoTN38To', prefix:'劍姬_',
    pwSha256:'94edf28c6d6da38fd35d7ad53e485307f89fbeaf120485c8d17a43f323deee71' }
];

function _orgById(id){
  for (var i=0;i<ORGS.length;i++){ if(ORGS[i].id===id) return ORGS[i]; }
  return null;
}
function _orgByModeFallback(mode){
  for (var i=0;i<ORGS.length;i++){ if(ORGS[i].mode===mode) return ORGS[i]; }
  return null;
}
function _resolveOrg(payload){
  var org = payload.org ? _orgById(payload.org) : null;
  if (!org && payload.mode) org = _orgByModeFallback(payload.mode);
  if (!org) throw new Error('未知的組織：' + (payload.org||payload.mode||'(未指定)'));
  return org;
}

function _sha256Hex(str) {
  var raw = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, str, Utilities.Charset.UTF_8);
  return raw.map(function(b){ var v=(b+256)%256; return ('0'+v.toString(16)).slice(-2); }).join('');
}

function _orgSS(org) { return SpreadsheetApp.openById(org.spreadsheetId); }
function _sharedSS() { return SpreadsheetApp.openById(SHARED_SPREADSHEET_ID); }

function _out(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function doGet(e) {
  let sheetOk=false, sheetName='';
  try { const ss=_sharedSS(); sheetOk=true; sheetName=ss.getName(); } catch(e) { sheetName=e.message; }
  return _out({ ok: true, message: 'Apps Script v8 is running', sheetOk: sheetOk, sheet: sheetName,
                orgs: ORGS.length, time: new Date().toISOString() });
}

function maintenanceOn(msg) {
  var props = PropertiesService.getScriptProperties();
  props.setProperty('maintenance', '1');
  props.setProperty('maintenance_msg', String(msg || '系統維護更新中，您的修改已保存在此裝置，維護結束後會自動上傳，請勿清除瀏覽器資料'));
}
function maintenanceOff() {
  var props = PropertiesService.getScriptProperties();
  props.deleteProperty('maintenance');
  props.deleteProperty('maintenance_msg');
}
function _maintInfo() {
  var props = PropertiesService.getScriptProperties();
  var on = props.getProperty('maintenance') === '1';
  return { on: on, msg: on ? (props.getProperty('maintenance_msg') || '系統維護中') : '' };
}

function _getRev(orgId) { return PropertiesService.getScriptProperties().getProperty('rev_' + orgId) || '0'; }
function _bumpRev(orgId) { PropertiesService.getScriptProperties().setProperty('rev_' + orgId, String(Date.now())); }

function doPost(e) {
  try {
    const body    = e && e.postData ? e.postData.contents : '{}';
    const payload = JSON.parse(body);
    const action  = payload.action || '';

    if (action === 'orgs') return _out({ ok: true, orgs: ORGS.map(function(o){ return { id:o.id, name:o.name, mode:o.mode }; }) });
    if (action === 'adminAuth') {
      var authOrg = payload.org ? _orgById(payload.org) : _orgByModeFallback(payload.mode||'');
      if (!authOrg) return _out({ ok: true, valid: false, reason: '未知的組織' });
      var ok = _sha256Hex(String(payload.pw || '')) === authOrg.pwSha256;
      return _out({ ok: true, valid: ok });
    }
    if (action === 'ver') {
      var vOrg = _resolveOrg(payload);
      var vmi = _maintInfo();
      return _out({ ok: true, rev: _getRev(vOrg.id), maintenance: vmi.on, maintenanceMsg: vmi.msg });
    }
    if (action === 'load') {
      const loadOrg = _resolveOrg(payload);
      const data = loadData(loadOrg);
      const mi = _maintInfo();
      data.maintenance    = mi.on;
      data.maintenanceMsg = mi.msg;
      data.rev            = _getRev(loadOrg.id);
      return _out(data);
    }
    if (action === 'sync') {
      const mi2 = _maintInfo();
      if (mi2.on) return _out({ ok: false, maintenance: true, maintenanceMsg: mi2.msg });

      const lock = LockService.getScriptLock();
      if (!lock.tryLock(25000)) return _out({ ok: false, busy: true, error: '伺服器忙碌中，請稍後自動重試' });
      
      var syncOrg = _resolveOrg(payload);
      var changed = false;
      try {
        changed = saveData(syncOrg, payload);
      } finally {
        lock.releaseLock();
      }
      if (changed) _bumpRev(syncOrg.id);
      return _out({ ok: true, timestamp: payload.timestamp, rev: _getRev(syncOrg.id) });
    }
    return _out({ error: 'unknown action: ' + action });
  } catch (err) {
    return _out({ error: err.message, stack: err.stack });
  }
}

function loadData(org) {
  const ss     = _orgSS(org);
  const prefix = org.prefix || '';

  var members = readSheet(ss, prefix + '成員清單', ['skills','baijia','aliases','changeLog']);
  if (!members.length && prefix) {
    var legacy = readSheet(ss, '共用_成員清單', ['skills','baijia','aliases','changeLog']);
    if (legacy.length) members = legacy;
  }
  const shared = _sharedSS();
  const skillList  = readSheet(shared, '共用_絕技清單').map(r => String(r.name||'')).filter(Boolean);
  const baijiaList = readSheet(shared, '共用_群俠技能清單').map(r => String(r.name||'')).filter(Boolean);
  const skillTombstones = readSheet(shared, '共用_技能刪除紀錄');
  const events     = readSheet(ss, prefix + '活動場次',      ['teams','roles','squadRoles','assignedSkills','assignedBaijia','teamNames','plannedRoster']);
  const matches    = readSheet(ss, prefix + '比賽紀錄',      ['participants','players','videos']);
  const signupRows = readSheet(ss, prefix + '報名紀錄');
  const tombstones = readSheet(ss, prefix + '刪除紀錄');

  const signups = {};
  signupRows.forEach(function(row) {
    if (!row.eventId || !row.playerName) return;
    if (!signups[row.eventId]) signups[row.eventId] = {};
    signups[row.eventId][row.playerName] = row.status;
  });

  var scoreCfg = null;
  var cfgRows = readSheet(ss, prefix + '積分設定');
  if (cfgRows.length && cfgRows[0].json) {
    try { scoreCfg = JSON.parse(cfgRows[0].json); } catch(e) {}
  }
  const scoreLog = readSheet(ss, prefix + '積分紀錄');

  return { members: members, skillList: skillList, baijiaList: baijiaList,
           events: events, matches: matches, signups: signups, tombstones: tombstones,
           skillTombstones: skillTombstones, scoreCfg: scoreCfg, scoreLog: scoreLog };
}

function writeSheet(ss, name, data, headers) {
  var sheet = ss.getSheetByName(name);
  if (!sheet) sheet = ss.insertSheet(name);
  else sheet.clear();

  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  if (!data || !data.length) return true;

  var rows = data.map(function(item) {
    return headers.map(function(h) {
      var v = item[h];
      if (v === null || v === undefined) return '';
      if (typeof v === 'object') return JSON.stringify(v);
      return String(v);
    });
  });
  var range = sheet.getRange(2, 1, rows.length, headers.length);
  range.setNumberFormat('@');
  range.setValues(rows);
  try { sheet.autoResizeColumns(1, headers.length); } catch(e) {}
  return true;
}

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

function saveData(org, payload) {
  const ss     = _orgSS(org);
  const prefix = org.prefix || '';
  var _changed = false; 

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
  } catch (e) {}

  function _filterDeleted(list, coll) {
    return (list || []).filter(function(item){ return !(item && item.id && deletedIds[coll][String(item.id)]); });
  }

  function _mergeNewest(existingRows, incomingRows, coll) {
    var map = {}, order = [];
    function put(item, isIncoming) {
      if (!item || !item.id) return;
      var id = String(item.id);
      if (deletedIds[coll] && deletedIds[coll][id]) return;
      var prev = map[id];
      if (!prev) { map[id] = item; order.push(id); return; }
      var pu = Number(prev.updatedAt) || 0, iu = Number(item.updatedAt) || 0;
      if (isIncoming ? iu >= pu : iu > pu) map[id] = item;
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
  } catch (e) {}

  writeSheet(shared, '共用_絕技清單',
    (payload.skillList || []).filter(function(s){ return !skillDeletedNames[s]; }).map(function(s){ return { name: s }; }), ['name']);
  writeSheet(shared, '共用_群俠技能清單',
    (payload.baijiaList || []).filter(function(s){ return !skillDeletedNames[s]; }).map(function(s){ return { name: s }; }), ['name']);

  if (writeSheet(ss, prefix + '活動場次',
    _mergeNewest(readSheet(ss, prefix + '活動場次', EVENT_JSON), _filterDeleted(payload.events, 'events'), 'events'), [
    'id','name','date','type','eventTime','matchFormat','teamNames','teams','roles','squadRoles','assignedSkills','assignedBaijia','plannedRoster','planSavedAt','createdAt','updatedAt'
  ])) _changed = true;

  if (writeSheet(ss, prefix + '比賽紀錄',
    _mergeNewest(readSheet(ss, prefix + '比賽紀錄', MATCH_JSON), _filterDeleted(payload.matches, 'matches'), 'matches'), [
    'id','date','type','enemy','result','ourCount','enemyCount','notes','videos','participants','players','createdAt','updatedAt'
  ])) _changed = true;

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
  
  if (writeSheet(ss, prefix + '報名紀錄', flattenSignups(payload.signups), ['eventId','playerName','status'])) _changed = true;
  
  logSync(ss, org, payload.timestamp);
  return _changed;
}

function logSync(ss, org, ts) {
  var sheet = ss.getSheetByName('同步紀錄');
  if (!sheet) { sheet = ss.insertSheet('同步紀錄'); sheet.appendRow(['組織','時間']); }
  var last = sheet.getLastRow();
  if (last > 200) sheet.deleteRows(2, last - 200);
  sheet.appendRow([org.name || org.id, ts || new Date().toISOString()]);
}
