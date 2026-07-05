// ============================================================
// GSYNC.JS v4 — 自動同步（全部改用 POST，解決 CORS 問題）
// ============================================================

let _syncUrl = '';
let _autoSaveTimer = null;
let _isSyncing = false;
let _suppressWrite = false;

// ─── 初始化 ──────────────────────────────────────────────
async function syncInit() {
  const cfg = S.config();
  _syncUrl = cfg.gsWebhook || '';
  if (!_syncUrl) { updateSyncUI('none', '☁️ 未設定'); return; }
  updateSyncUI('loading', '讀取中...');
  await syncLoad(true);
  // 自動接收最新：每 60 秒背景讀取一次 + 切回分頁時立即讀取
  if(!window._autoPollTimer){
    window._autoPollTimer = setInterval(()=>{ if(_syncUrl && !_isSyncing) syncLoad(true); }, 60000);
    document.addEventListener('visibilitychange', ()=>{
      if(document.visibilityState==='visible' && _syncUrl && !_isSyncing) syncLoad(true);
    });
  }
}

// ─── 讀取（POST 方式，避免 CORS）────────────────────────
async function syncLoad(silent) {
  if (!_syncUrl) {
    if (!silent) toast('請先設定 Webhook URL', 'err');
    return;
  }
  updateSyncUI('loading', '讀取中...');
  try {
    // 改用 POST 傳送 action=load，解決 GET CORS 問題
    const res = await fetch(_syncUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: 'load', mode: CUR_MODE }),
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);

    let data;
    try { data = await res.json(); }
    catch(_) { throw new Error('回應格式錯誤，請確認 Apps Script 已重新部署最新版本'); }

    if (data && data.error) throw new Error(data.error);
    if (!data) throw new Error('無資料回應');

    // 暫停寫入攔截，避免讀取觸發再寫入無限循環
    _suppressWrite = true;
    let needPushBack = false; // 雲端為空但本機有資料 → 保留本機並回寫雲端
    try {
      const apply = (incoming, getLocal, write) => {
        if (!Array.isArray(incoming)) return;
        if (incoming.length === 0 && (getLocal()||[]).length > 0) { needPushBack = true; return; }
        write(incoming);
      };
      apply(data.members,  ()=>S.members(),  _writeMembers);
      if (Array.isArray(data.skillList)  && data.skillList.length)  _writeSkillList(data.skillList);
      if (Array.isArray(data.baijiaList) && data.baijiaList.length) _writeBaijiaList(data.baijiaList);
      apply(data.events,   ()=>S.events(),   _writeEvents);
      apply(data.matches,  ()=>S.matches(),  _writeMatches);
      if (data.signups && (Object.keys(data.signups).length || !Object.keys(S.signups()||{}).length)) _writeSignups(data.signups);
    } finally {
      _suppressWrite = false;
    }
    if (needPushBack) syncWrite();
    // 自癒：成員為空但有比賽紀錄 → 自動重建成員（並自動回寫雲端）
    try{ if (typeof autoHealMembers==='function' && autoHealMembers()) needPushBack = true; }catch(_){}

    const now = _nowStr();
    S.setConfig({ ...S.config(), lastSync: now, gsWebhook: _syncUrl });
    updateSyncUI('ok', '✅ ' + now.slice(5, 16));

    if (!silent) {
      toast('✅ 已載入最新資料', 'ok');
      const active = document.querySelector('.nav-btn.active');
      if (active) renderPane(active.dataset.tab, document.getElementById('pane-' + active.dataset.tab));
    } else {
      // 靜默模式也要刷新當前頁面
      setTimeout(() => {
        const active = document.querySelector('.nav-btn.active');
        if (active) renderPane(active.dataset.tab, document.getElementById('pane-' + active.dataset.tab));
      }, 100);
    }
  } catch (err) {
    console.warn('syncLoad error:', err.message);
    updateSyncUI('err', '❌ 讀取失敗');
    if (!silent) toast('讀取失敗：' + err.message, 'err');
  }
}

// ─── 防抖寫入 ────────────────────────────────────────────
function syncWrite() {
  if (!_syncUrl || _suppressWrite) return;
  clearTimeout(_autoSaveTimer);
  _autoSaveTimer = setTimeout(_doWrite, 2000);
}

async function _doWrite() {
  if (!_syncUrl || _isSyncing) return;
  _isSyncing = true;
  updateSyncUI('loading', '儲存中...');
  try {
    const res = await fetch(_syncUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        action:    'sync',
        mode:      CUR_MODE,
        timestamp: new Date().toISOString(),
        members:    S.members(),
        skillList:  S.skillList(),
        baijiaList: S.baijiaList(),
        events:     S.events(),
        signups:    S.signups(),
        matches:    S.matches(),
      }),
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const now = _nowStr();
    S.setConfig({ ...S.config(), lastSync: now });
    updateSyncUI('ok', '✅ ' + now.slice(5, 16));
  } catch (err) {
    console.warn('syncWrite error:', err.message);
    updateSyncUI('offline', '📴 待同步');
  } finally {
    _isSyncing = false;
  }
}

// ─── 手動同步 ────────────────────────────────────────────
async function manualSyncNow() {
  if (!_syncUrl) { openGoogleModal(); return; }
  updateSyncUI('loading', '同步中...');
  await _doWrite();
  await syncLoad(false);
}

// ─── UI ──────────────────────────────────────────────────
function updateSyncUI(state, text) {
  const el = document.getElementById('topbar-sync-status');
  if (el) { el.textContent = text; el.className = 'sync-status ' + state; }
}

// ─── 設定 Modal ──────────────────────────────────────────
function openGoogleModal() {
  const cfg = S.config();
  const el = document.getElementById('gs-webhook');
  if (el) el.value = cfg.gsWebhook || '';
  const lastEl = document.getElementById('gs-last-sync');
  if (lastEl) lastEl.textContent = cfg.lastSync ? '上次同步：' + cfg.lastSync : '尚未同步過';
  openModal('modal-google');
}

async function saveGoogleConfig() {
  const url = (document.getElementById('gs-webhook').value || '').trim();
  if (!url) { toast('請輸入 Webhook URL', 'err'); return; }
  _syncUrl = url;
  S.setConfig({ ...S.config(), gsWebhook: url });
  closeModal('modal-google');
  toast('URL 已儲存，正在載入資料...', '');
  await syncLoad(false);
}

async function googleImportNow() {
  if (!_syncUrl) { toast('請先設定 Webhook URL', 'err'); return; }
  if (!confirm('確定從 Google 試算表覆蓋本機資料？')) return;
  await syncLoad(false);
}

function _nowStr() {
  return new Date().toLocaleString('zh-TW', { hour12: false });
}

// ─── Store 直接寫 localStorage（不走 S.setXxx 避免遞迴）──
function _writeMembers(v)   { S.s(S.k('members'), v); }
function _writeSkillList(v) { S.s('skill_list', v); }
function _writeBaijiaList(v){ S.s('baijia_list', v); }
function _writeEvents(v)    { S.s(S.k('events'), v); }
function _writeMatches(v)   { S.s(S.k('matches'), v); }
function _writeSignups(v)   { S.s(S.k('signups'), v); }

// ─── 攔截 S.setXxx（用戶操作後自動觸發防抖寫入）─────────
// 直接呼叫 S.s() 而非 S.setXxx()，避免無限遞迴
S.setMembers    = v => { S.s(S.k('members'), v);    syncWrite(); };
S.setEvents     = v => { S.s(S.k('events'), v);     syncWrite(); };
S.setMatches    = v => { S.s(S.k('matches'), v);    syncWrite(); };
S.setSignups    = v => { S.s(S.k('signups'), v);    syncWrite(); };
S.setSkillList  = v => { S.s('skill_list', v);      syncWrite(); };
S.setBaijiaList = v => { S.s('baijia_list', v);     syncWrite(); };

// 測試連線：直接檢查 Apps Script 是否回應（診斷用）
async function testConnection(){
  const url=(document.getElementById('gs-webhook').value||'').trim()||_syncUrl;
  if(!url){ toast('請先輸入 URL','err'); return; }
  toast('測試中...','');
  try{
    const res=await fetch(url,{method:'GET',cache:'no-store'});
    const data=await res.json();
    if(data.ok&&data.sheetOk){ toast('✅ 連線成功，已綁定試算表：'+data.sheet,'ok'); }
    else if(data.ok){ toast('⚠️ 腳本正常但未綁定試算表：'+(data.sheet||'請在程式碼填入SPREADSHEET_ID'),'err'); }
    else { toast('⚠️ 回應異常：'+JSON.stringify(data).slice(0,80),'err'); }
  }catch(err){
    toast('❌ 連線失敗：'+err.message,'err');
  }
}
