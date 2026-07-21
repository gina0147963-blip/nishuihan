// ============================================================
// GSYNC.JS v5 — 自動同步（修正版，解決 updatedAt 覆蓋問題）
// ============================================================

const GS_URL = 'https://script.google.com/macros/s/AKfycbzUbENAetEStUbi5c6UILSM4Q9LjF4C_u88YeMvcHvEC6LL6CshzQ1TB9ZHiQzEYeBJ/exec';

let _syncUrl = '';
let _autoSaveTimer = null;
let _isSyncing = false;
let _suppressWrite = false;
let _pendingWrite = false;   
let _writeRetryTimer = null;

function _tombKey(coll){ return S.k('tomb_'+coll); }
function _allTombRows(){
  const rows=[];
  ['members','events','matches'].forEach(coll=>{
    const t=_cleanTomb(coll);
    Object.entries(t).forEach(([id,ts])=>rows.push({coll,id,ts}));
  });
  return rows;
}
function _getTomb(coll){ return S.g(_tombKey(coll), {}); }
function _addTomb(coll,id){
  if(!id) return;
  const t=_getTomb(coll); t[id]=Date.now();
  S.s(_tombKey(coll), t);
}
function _cleanTomb(coll){
  const t=_getTomb(coll); const now=Date.now(); let changed=false;
  Object.keys(t).forEach(id=>{ if(now-t[id]>2592000000){ delete t[id]; changed=true; } });
  if(changed) S.s(_tombKey(coll), t);
  return t;
}

function _mergeById(localArr, cloudArr, tombIds, stats){
  localArr = Array.isArray(localArr)?localArr:[];
  cloudArr = Array.isArray(cloudArr)?cloudArr:[];
  const map = new Map();
  cloudArr.forEach(item=>{ if(item&&item.id) map.set(item.id, item); });
  localArr.forEach(item=>{
    if(!item||!item.id) return;
    const cloudItem = map.get(item.id);
    if(!cloudItem){ map.set(item.id, item); return; } 
    const lu=item.updatedAt||0, cu=cloudItem.updatedAt||0;
    if(cu>lu && stats) stats.cloudWins=(stats.cloudWins||0)+1;
    map.set(item.id, cu>lu ? cloudItem : item);
  });
  tombIds.forEach(id=>map.delete(id)); 
  return Array.from(map.values());
}

async function syncInit() {
  _syncUrl = GS_URL;
  S.setConfig({ ...S.config(), gsWebhook: GS_URL });
  updateSyncUI('loading', '讀取中...');
  await syncLoad(true);
  if(!window._autoPollTimer){
    window._autoPollTimer = setInterval(()=>{ if(_syncUrl && !_isSyncing) syncLoad(true); }, 30000);
    document.addEventListener('visibilitychange', ()=>{
      if(document.visibilityState==='visible' && _syncUrl && !_isSyncing) syncLoad(true);
    });
  }
}

async function syncLoad(silent) {
  if (!_syncUrl) {
    if (!silent) toast('請先設定 Webhook URL', 'err');
    return;
  }
  const reqMode = CUR_MODE;
  const reqOrg  = CUR_ORG;
  if (_pendingWrite) {
    clearTimeout(_autoSaveTimer);
    await _doWrite();
  }
  updateSyncUI('loading', '讀取中...');
  try {
    const res = await fetch(_syncUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: 'load', mode: reqMode, org: reqOrg }),
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);

    let data;
    try { data = await res.json(); }
    catch(_) { throw new Error('回應格式錯誤'); }

    if (data && data.error) throw new Error(data.error);
    if (!data) throw new Error('無資料回應');
    if (CUR_MODE !== reqMode || CUR_ORG !== reqOrg) return;

    if (Array.isArray(data.tombstones)) {
      data.tombstones.forEach(t=>{
        if(!t||!t.coll||!t.id) return;
        const store=_getTomb(t.coll);
        const ts=Number(t.ts)||Date.now();
        if(!store[t.id]||ts>store[t.id]){ store[t.id]=ts; S.s(_tombKey(t.coll), store); }
      });
    }
    if (Array.isArray(data.skillTombstones)) {
      const store=_getSkillTomb();
      data.skillTombstones.forEach(t=>{
        if(!t||!t.name) return;
        const ts=Number(t.ts)||Date.now();
        if(!store[t.name]||ts>store[t.name]) store[t.name]=ts;
      });
      S.s(_SKILL_TOMB_KEY, store);
    }

    const _beforeSnap = JSON.stringify([S.members(),S.events(),S.matches(),S.signups()]);
    _suppressWrite = true;
    let needPushBack = false; 
    try {
      const applyMerged = (incoming, getLocal, write, collName) => {
        if (!Array.isArray(incoming)) return;
        const local = getLocal()||[];
        if (incoming.length === 0 && local.length > 0) { needPushBack = true; return; }
        const tomb = _cleanTomb(collName);
        const merged = _mergeById(local, incoming, Object.keys(tomb));
        if (JSON.stringify(merged) !== JSON.stringify(incoming)) needPushBack = true;
        write(merged);
      };
      applyMerged(data.members, ()=>S.members(), _writeMembers, 'members');
      if (Array.isArray(data.skillList)  && data.skillList.length)  _writeSkillList(data.skillList);
      if (Array.isArray(data.baijiaList) && data.baijiaList.length) _writeBaijiaList(data.baijiaList);
      applyMerged(data.events,  ()=>S.events(),  _writeEvents,  'events');
      applyMerged(data.matches, ()=>S.matches(), _writeMatches, 'matches');

      if (data.signups && typeof data.signups==='object') {
        const localSignups = S.signups()||{};
        const dirty=(typeof S.signupDirty==='function')?S.signupDirty():{};
        const mergedSignups={};
        const allEvIds=new Set([...Object.keys(data.signups||{}),...Object.keys(localSignups)]);
        allEvIds.forEach(evId=>{
          const cloudS=(data.signups||{})[evId]||{};
          const localS=localSignups[evId]||{};
          const merged={...cloudS};
          Object.keys(localS).forEach(n=>{ if(dirty[evId+'|'+n]!==undefined) merged[n]=localS[n]; });
          Object.keys(cloudS).forEach(n=>{ if(dirty[evId+'|'+n]!==undefined && localS[n]===undefined) delete merged[n]; });
          mergedSignups[evId]=merged;
        });
        if (Object.keys(data.signups).length || !Object.keys(localSignups).length) _writeSignups(mergedSignups);
      }
      if (_migrateAliasSignups()) needPushBack = true;
    } finally {
      _suppressWrite = false;
    }
    if (needPushBack) syncWrite();
    try{ if (typeof autoHealMembers==='function' && autoHealMembers()) needPushBack = true; }catch(_){}

    const now = _nowStr();
    S.setConfig({ ...S.config(), lastSync: now, gsWebhook: _syncUrl });
    updateSyncUI('ok', '✅ ' + now.slice(5, 16));

    try{
      const loginScreen=document.getElementById('screen-login');
      if(loginScreen && !loginScreen.classList.contains('hidden')){
        const input=document.getElementById('player-name-input');
        if(input && typeof loginSuggest==='function') loginSuggest(input.value||'');
      }
    }catch(_){}

    const _afterSnap = JSON.stringify([S.members(),S.events(),S.matches(),S.signups()]);
    const _dataChanged = _beforeSnap !== _afterSnap;
    if (!silent) {
      toast('✅ 已載入最新資料', 'ok');
      const active = document.querySelector('.nav-btn.active');
      if (active) renderPane(active.dataset.tab, document.getElementById('pane-' + active.dataset.tab));
    } else if (_dataChanged) {
      setTimeout(() => {
        const active = document.querySelector('.nav-btn.active');
        if (active) renderPane(active.dataset.tab, document.getElementById('pane-' + active.dataset.tab));
      }, 100);
    }
  } catch (err) {
    updateSyncUI('err', '❌ 讀取失敗');
    if (!silent) toast('讀取失敗：' + err.message, 'err');
  }
}

function syncWrite() {
  if (!_syncUrl || _suppressWrite) return;
  _pendingWrite = true;
  clearTimeout(_autoSaveTimer);
  _autoSaveTimer = setTimeout(_doWrite, 2000);
}

function _buildSyncPayload(mode, org){
  return {
    action:    'sync',
    mode:      mode,
    org:       org,
    timestamp: new Date().toISOString(),
    members:    _dedupeMembersByName(S.members()),
    tombstones: _allTombRows(),
    skillList:  S.skillList(),
    baijiaList: S.baijiaList(),
    skillTombstones: _allSkillTombRows(),
    events:     _normEvents(S.events()),
    signups:    S.signups(),
    matches:    S.matches(),
  };
}

async function _pushToCloud(payload){
  const res = await fetch(_syncUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error('HTTP ' + res.status);
}

async function _doWrite() {
  if (!_syncUrl) return;
  if (_isSyncing) { clearTimeout(_autoSaveTimer); _autoSaveTimer = setTimeout(_doWrite, 1000); return; }
  _isSyncing = true;
  updateSyncUI('loading', '儲存中...');
  const payload = _buildSyncPayload(CUR_MODE, CUR_ORG); 
  try {
    await _pushToCloud(payload);
    _pendingWrite = false;
    clearTimeout(_writeRetryTimer);
    const now = _nowStr();
    S.setConfig({ ...S.config(), lastSync: now });
    updateSyncUI('ok', '✅ ' + now.slice(5, 16));
  } catch (err) {
    updateSyncUI('offline', '📴 待同步（將自動重試）');
    clearTimeout(_writeRetryTimer);
    _writeRetryTimer = setTimeout(()=>{ if (_pendingWrite) _doWrite(); }, 15000);
  } finally {
    _isSyncing = false;
  }
}

async function syncWriteNowFast(){
  if (!_syncUrl) return 'nosync';
  const reqMode = CUR_MODE;
  const reqOrg  = CUR_ORG;
  clearTimeout(_autoSaveTimer);
  clearTimeout(_writeRetryTimer);
  _pendingWrite = true;
  updateSyncUI('loading', '同步中...');
  try{
    if (CUR_MODE !== reqMode || CUR_ORG !== reqOrg){ _pendingWrite=false; return false; }
    const payload = _buildSyncPayload(reqMode, reqOrg);
    await _pushToCloud(payload);
    _pendingWrite = false;
    const now = _nowStr();
    S.setConfig({ ...S.config(), lastSync: now });
    updateSyncUI('ok', '✅ ' + now.slice(5, 16));
    return true;
  }catch(err){
    updateSyncUI('offline', '📴 待同步（背景自動重試）');
    clearTimeout(_writeRetryTimer);
    _writeRetryTimer = setTimeout(()=>{ if (_pendingWrite) _doWrite(); }, 15000);
    return false;
  }
}

async function syncWriteNow(maxRetries){
  maxRetries = maxRetries || 3;
  if (!_syncUrl) return 'nosync'; 
  const reqMode = CUR_MODE; 
  const reqOrg  = CUR_ORG;
  clearTimeout(_autoSaveTimer);
  clearTimeout(_writeRetryTimer);
  _pendingWrite = true;
  for (let i=0; i<maxRetries; i++){
    updateSyncUI('loading', i===0 ? '同步中...' : '重試中(' + (i+1) + ')...');
    try{
      try{
        const loadRes = await fetch(_syncUrl, {
          method:'POST',
          headers:{'Content-Type':'text/plain;charset=utf-8'},
          body: JSON.stringify({ action:'load', mode:reqMode, org:reqOrg }),
        });
        if (loadRes.ok && CUR_MODE===reqMode && CUR_ORG===reqOrg){
          const cloud = await loadRes.json();
          if (cloud && !cloud.error && CUR_MODE===reqMode && CUR_ORG===reqOrg){
            if (Array.isArray(cloud.tombstones)) {
              cloud.tombstones.forEach(t=>{
                if(!t||!t.coll||!t.id) return;
                const store=_getTomb(t.coll);
                const ts=Number(t.ts)||Date.now();
                if(!store[t.id]||ts>store[t.id]){ store[t.id]=ts; S.s(_tombKey(t.coll), store); }
              });
            }
            const tombM = _cleanTomb('members'), tombE = _cleanTomb('events'), tombMt = _cleanTomb('matches');
            const mstats={cloudWins:0};
            const mergedMembers = _mergeById(S.members(), Array.isArray(cloud.members)?cloud.members:[], Object.keys(tombM), mstats);
            const mergedEvents  = _mergeById(S.events(),  Array.isArray(cloud.events)?cloud.events:[],   Object.keys(tombE), mstats);
            const mergedMatches = _mergeById(S.matches(), Array.isArray(cloud.matches)?cloud.matches:[], Object.keys(tombMt), mstats);
            _suppressWrite = true;
            try{ _writeMembers(mergedMembers); _writeEvents(mergedEvents); _writeMatches(mergedMatches); }
            finally{ _suppressWrite = false; }
            if(mstats.cloudWins>0 && typeof IS_ADMIN!=='undefined' && IS_ADMIN){
              toast('⚠️ 偵測到其他裝置同時編輯了 '+mstats.cloudWins+' 筆資料，已自動合併較新版本','err');
            }
          }
        }
      }catch(_){ }

      if (CUR_MODE !== reqMode || CUR_ORG !== reqOrg){
        _pendingWrite = false;
        return false;
      }
      const payload = _buildSyncPayload(reqMode, reqOrg); 
      await _pushToCloud(payload);
      _pendingWrite = false;
      const now = _nowStr();
      S.setConfig({ ...S.config(), lastSync: now });
      updateSyncUI('ok', '✅ ' + now.slice(5, 16));
      return true;
    }catch(err){
      if (i < maxRetries-1) await new Promise(r=>setTimeout(r, 700*(i+1)));
    }
  }
  updateSyncUI('offline', '📴 同步失敗（將自動重試）');
  clearTimeout(_writeRetryTimer);
  _writeRetryTimer = setTimeout(()=>{ if (_pendingWrite) _doWrite(); }, 15000);
  return false;
}

async function manualSyncNow() {
  if (!_syncUrl) return;
  updateSyncUI('loading', '同步中...');
  await _doWrite();
  await syncLoad(false);
}

function updateSyncUI(state, text) {
  const el = document.getElementById('topbar-sync-status');
  if (el) { el.textContent = text; el.className = 'sync-status ' + state; }
}

function _nowStr() {
  return new Date().toLocaleString('zh-TW', { hour12: false });
}

function _dedupeMembersByName(arr){
  if(!Array.isArray(arr)) return [];
  const byName=new Map();
  const order=[];
  const score=m=>((m.jobId&&m.jobId!=='unknown')?2:0)+((m.skills||[]).length)+((m.baijia||[]).length?1:0);
  const _numJunk=s=>/^[\d,\.\s%]+$/.test(String(s)); 
  arr.forEach(m=>{
    if(!m||!m.name) return;
    if(Array.isArray(m.skills)&&m.skills.some(_numJunk)) m={...m, skills:m.skills.filter(s=>!_numJunk(s))};
    if(Array.isArray(m.baijia)&&m.baijia.some(_numJunk)) m={...m, baijia:m.baijia.filter(s=>!_numJunk(s))};
    const prev=byName.get(m.name);
    if(!prev){ byName.set(m.name,{...m}); order.push(m.name); return; }
    const main=(score(m)>score(prev)||(score(m)===score(prev)&&(m.updatedAt||0)>(prev.updatedAt||0)))?{...m}:prev;
    const other=main===prev?m:prev;
    main.skills=[...new Set([...(main.skills||[]),...(other.skills||[])])];
    main.baijia=[...new Set([...(main.baijia||[]),...(other.baijia||[])])];
    main.aliases=[...new Set([...(main.aliases||[]),...(other.aliases||[])])];
    if(!main.note&&other.note) main.note=other.note;
    if(main.status!=='固定團'&&other.status==='固定團') main.status='固定團';
    byName.set(m.name, main);
  });
  const aliasOwner=new Map(); 
  byName.forEach(m=>{ (m.aliases||[]).forEach(a=>{
    if(a===m.name) return;
    const prev=aliasOwner.get(a);
    if(!prev || (m.updatedAt||0)>(byName.get(prev)?.updatedAt||0)) aliasOwner.set(a, m.name);
  }); });
  const absorbed=new Set();
  aliasOwner.forEach((ownerName, oldName)=>{
    const oldRec=byName.get(oldName);
    const owner=byName.get(ownerName);
    if(!oldRec||!owner||oldName===ownerName) return;
    owner.skills=[...new Set([...(owner.skills||[]),...(oldRec.skills||[])])];
    owner.baijia=[...new Set([...(owner.baijia||[]),...(oldRec.baijia||[])])];
    owner.aliases=[...new Set([...(owner.aliases||[]),...(oldRec.aliases||[]),oldName])].filter(a=>a!==owner.name);
    if(!owner.note&&oldRec.note) owner.note=oldRec.note;
    if(owner.status!=='固定團'&&oldRec.status==='固定團') owner.status='固定團';
    absorbed.add(oldName);
  });
  return order.filter(n=>!absorbed.has(n)).map(n=>byName.get(n));
}
function _writeMembers(v)   { S.s(S.k('members'), _dedupeMembersByName(v)); }
function _writeEvents(v)    { S.s(S.k('events'), v); }
function _writeMatches(v)   { S.s(S.k('matches'), v); }
function _writeSignups(v)   { S.s(S.k('signups'), v); }

function _migrateAliasSignups(){
  const members=S.members();
  const aliasOwner=new Map();
  members.forEach(m=>{ (m.aliases||[]).forEach(a=>{ if(a!==m.name) aliasOwner.set(a, m.name); }); });
  if(!aliasOwner.size) return false;
  const signups=S.signups();
  let changed=false;
  const out={};
  Object.entries(signups).forEach(([evId,evS])=>{
    const ns={...(evS||{})};
    Object.keys(ns).forEach(key=>{
      const owner=aliasOwner.get(key);
      if(!owner) return;
      if(ns[owner]===undefined) ns[owner]=ns[key]; 
      delete ns[key];                               
      changed=true;
    });
    out[evId]=ns;
  });
  if(changed) _writeSignups(out);
  return changed;
}
const _SKILL_TOMB_KEY='tomb_skillnames';
function _getSkillTomb(){ return S.g(_SKILL_TOMB_KEY, {}); }
function _addSkillTomb(name){
  const t=_getSkillTomb(); t[name]=Date.now();
  S.s(_SKILL_TOMB_KEY, t);
}
function _cleanSkillTomb(){
  const t=_getSkillTomb(); const now=Date.now(); let changed=false;
  Object.keys(t).forEach(k=>{ if(now-t[k]>2592000000){ delete t[k]; changed=true; } }); 
  if(changed) S.s(_SKILL_TOMB_KEY, t);
  return t;
}
function _allSkillTombRows(){
  const t=_cleanSkillTomb();
  return Object.entries(t).map(([name,ts])=>({name,ts}));
}
function _writeSkillList(v) {
  const tomb=_cleanSkillTomb();
  const merged=[...new Set([...(Array.isArray(S.skillList())?S.skillList():[]), ...(Array.isArray(v)?v:[])])].filter(s=>!tomb[s]);
  S.s('skill_list', merged);
}
function _writeBaijiaList(v){
  const tomb=_cleanSkillTomb();
  const merged=[...new Set([...(Array.isArray(S.baijiaList())?S.baijiaList():[]), ...(Array.isArray(v)?v:[])])].filter(s=>!tomb[s]);
  S.s('baijia_list', merged);
}
function _normEventTime(t){
  if(!t) return '';
  const s=String(t);
  if(/^\d{1,2}:\d{2}$/.test(s)) return s;              
  const m=s.match(/(\d{1,2}:\d{2})/);
  if(m) return m[1];                                      
  return '';                                              
}
function _normEvents(v){
  if(!Array.isArray(v)) return [];
  return v.map(e=>({...e, eventTime:_normEventTime(e.eventTime)}));
}

// 修正：在 Store 層修改時不再將整個 Array 所有項目的 updatedAt 覆寫為 Date.now()
// 而是由前端操作時，對變動的那一筆指定更新時間，或者比對資料變更後才更新時間
S.setEvents = function(newEvents) {
  const oldEvents = S.events() || [];
  const oldMap = new Map(oldEvents.map(e => [e.id, e]));
  
  const stamped = Array.isArray(newEvents) ? newEvents.map(e => {
    if (e && typeof e === 'object') {
      const oldE = oldMap.get(e.id);
      if (!oldE) return { ...e, updatedAt: e.updatedAt || Date.now() }; 
      
      const tmpE = { ...e, updatedAt: 0 };
      const tmpOld = { ...oldE, updatedAt: 0 };
      if (JSON.stringify(tmpE) !== JSON.stringify(tmpOld)) {
        return { ...e, updatedAt: Date.now() }; 
      }
      return { ...e, updatedAt: oldE.updatedAt }; 
    }
    return e;
  }) : newEvents;

  const ok = S.s(S.k('events'), stamped);
  syncWrite();
  return ok;
};
