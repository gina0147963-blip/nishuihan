// ============================================================
// GSYNC.JS — 自動同步模組（修正版）
// 架構：
//   - 登入後自動從試算表讀取（不觸發寫入）
//   - 每次使用者修改資料後，防抖 2 秒自動寫入
//   - syncLoad 時暫停攔截，避免讀取觸發再寫入的無限循環
// ============================================================

let _syncUrl = '';
let _autoSaveTimer = null;
let _isSyncing = false;
let _suppressWrite = false; // 讀取資料時暫停攔截，防止無限循環

// ─── 初始化（登入後呼叫）────────────────────────────────
async function syncInit() {
  const cfg = S.config();
  _syncUrl = cfg.gsWebhook || '';
  if (!_syncUrl) {
    updateSyncUI('none', '☁️ 未設定');
    return;
  }
  updateSyncUI('loading', '讀取中...');
  await syncLoad(true);
}

// ─── 從試算表讀取（不觸發寫入）─────────────────────────
async function syncLoad(silent) {
  if (!_syncUrl) {
    if (!silent) toast('請先設定 Webhook URL', 'err');
    return;
  }
  updateSyncUI('loading', '讀取中...');
  try {
    const url = _syncUrl
      + (_syncUrl.includes('?') ? '&' : '?')
      + 'action=load&mode=' + CUR_MODE
      + '&t=' + Date.now();

    const res = await fetch(url, { method: 'GET', cache: 'no-store' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    if (data.error) throw new Error(data.error);

    // 暫停寫入攔截，避免讀取觸發再寫入
    _suppressWrite = true;
    try {
      if (Array.isArray(data.members))   _origSetMembers(data.members);
      if (Array.isArray(data.skillList) && data.skillList.length)  _origSetSkillList(data.skillList);
      if (Array.isArray(data.baijiaList) && data.baijiaList.length) _origSetBaijiaList(data.baijiaList);
      if (Array.isArray(data.events))    _origSetEvents(data.events);
      if (data.signups)                  _origSetSignups(data.signups);
      if (Array.isArray(data.matches))   _origSetMatches(data.matches);
    } finally {
      _suppressWrite = false;
    }

    const now = _nowStr();
    S.setConfig({ ...S.config(), lastSync: now });
    updateSyncUI('ok', '✅ ' + now.slice(5, 16));

    if (!silent) {
      toast('✅ 已載入最新資料', 'ok');
      const active = document.querySelector('.nav-btn.active');
      if (active) renderPane(active.dataset.tab, document.getElementById('pane-' + active.dataset.tab));
    }
  } catch (err) {
    console.warn('syncLoad failed:', err.message);
    updateSyncUI('err', '❌ 讀取失敗');
    if (!silent) toast('讀取失敗：' + err.message, 'err');
  }
}

// ─── 防抖寫入（使用者操作後 2 秒觸發）──────────────────
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
    const payload = {
      action: 'sync',
      mode: CUR_MODE,
      timestamp: new Date().toISOString(),
      members:    S.members(),
      skillList:  S.skillList(),
      baijiaList: S.baijiaList(),
      events:     S.events(),
      signups:    S.signups(),
      matches:    S.matches(),
    };
    await fetch(_syncUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload),
    });
    const now = _nowStr();
    S.setConfig({ ...S.config(), lastSync: now });
    updateSyncUI('ok', '✅ ' + now.slice(5, 16));
  } catch (err) {
    console.warn('syncWrite failed:', err.message);
    updateSyncUI('offline', '📴 待同步');
  } finally {
    _isSyncing = false;
  }
}

// ─── 手動點選同步 ────────────────────────────────────────
async function manualSyncNow() {
  if (!_syncUrl) { openGoogleModal(); return; }
  // 先寫入最新，再讀回確認
  await _doWrite();
  await syncLoad(false);
}

// ─── UI 狀態 ─────────────────────────────────────────────
function updateSyncUI(state, text) {
  const el = document.getElementById('topbar-sync-status');
  if (!el) return;
  el.textContent = text;
  el.className = 'sync-status ' + state;
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
  const cfg = S.config();
  cfg.gsWebhook = url;
  S.setConfig(cfg);
  _syncUrl = url;
  closeModal('modal-google');
  toast('設定已儲存，正在讀取最新資料...', '');
  await syncLoad(false);
}

async function googleImportNow() {
  if (!_syncUrl) { toast('請先設定 Webhook URL', 'err'); return; }
  if (!confirm('確定要從 Google 試算表覆蓋本機資料？')) return;
  await syncLoad(false);
}

function _nowStr() {
  return new Date().toLocaleString('zh-TW', { hour12: false });
}

// ─── 攔截 Store 寫入操作（自動觸發防抖同步）────────────
// 重要：先儲存原始方法的參考，再替換 S 上的方法
// 必須直接呼叫 S.s() 而非 S.setXxx()，避免自我遞迴

function _origSetMembers(v)   { return S.s('members', v); }
function _origSetSkillList(v) { return S.s('skill_list', v); }
function _origSetBaijiaList(v){ return S.s('baijia_list', v); }
function _origSetEvents(v)    { return S.s(S.k('events'), v); }
function _origSetMatches(v)   { return S.s(S.k('matches'), v); }
function _origSetSignups(v)   { return S.s(S.k('signups'), v); }

// 替換 S 上的方法，加入自動同步
S.setMembers    = v => { const r=_origSetMembers(v);    syncWrite(); return r; };
S.setEvents     = v => { const r=_origSetEvents(v);     syncWrite(); return r; };
S.setMatches    = v => { const r=_origSetMatches(v);    syncWrite(); return r; };
S.setSignups    = v => { const r=_origSetSignups(v);    syncWrite(); return r; };
S.setSkillList  = v => { const r=_origSetSkillList(v);  syncWrite(); return r; };
S.setBaijiaList = v => { const r=_origSetBaijiaList(v); syncWrite(); return r; };
