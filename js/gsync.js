// ============================================================
// GSYNC.JS — 自動同步模組
// 架構：Google Apps Script 作為後端
//   - 打開網站 → 自動從試算表讀取最新資料
//   - 每次修改資料 → 自動寫入試算表（防抖 2 秒）
//   - localStorage 作為離線暫存
// ============================================================

let _syncUrl = '';          // Apps Script Webhook URL
let _autoSaveTimer = null;  // 防抖計時器
let _isSyncing = false;     // 防止重複同步
let _pendingWrite = false;  // 有待寫入的資料

// ============================================================
// 初始化 — 登入後呼叫
// ============================================================
async function syncInit() {
  // 先從 localStorage 讀 URL（快取）
  const cfg = S.config();
  _syncUrl = cfg.gsWebhook || '';

  updateSyncUI('loading', '讀取中...');

  if (!_syncUrl) {
    updateSyncUI('none', '☁️ 未設定');
    return;
  }

  // 自動從試算表載入最新資料
  await syncLoad(true); // true = 靜默模式（不彈 confirm）
}

// ============================================================
// 從試算表讀取資料（自動覆蓋本機）
// ============================================================
async function syncLoad(silent = false) {
  if (!_syncUrl) {
    if (!silent) toast('請先設定 Apps Script Webhook URL', 'err');
    return;
  }

  if (!silent) updateSyncUI('loading', '讀取中...');

  try {
    const url = _syncUrl + (_syncUrl.includes('?') ? '&' : '?') + 'action=load&mode=' + CUR_MODE + '&t=' + Date.now();
    const res = await fetch(url, { method: 'GET', cache: 'no-store' });

    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();

    if (data.error) throw new Error(data.error);

    // 寫入本機
    let hasData = false;
    if (data.members && data.members.length >= 0)   { S.setMembers(data.members); hasData = true; }
    if (data.skillList && data.skillList.length > 0) { S.setSkillList(data.skillList); }
    if (data.baijiaList && data.baijiaList.length > 0) { S.setBaijiaList(data.baijiaList); }
    if (data.events)  S.setEvents(data.events);
    if (data.signups) S.setSignups(data.signups);
    if (data.matches) S.setMatches(data.matches);

    const now = _nowStr();
    S.setConfig({ ...S.config(), lastSync: now, lastLoad: now });
    updateSyncUI('ok', '✅ ' + now.slice(5, 16));

    if (!silent) {
      toast('✅ 已載入最新資料', 'ok');
      // 重新渲染當前分頁
      const active = document.querySelector('.nav-btn.active');
      if (active) renderPane(active.dataset.tab, document.getElementById('pane-' + active.dataset.tab));
    }
  } catch (err) {
    console.warn('syncLoad failed:', err.message);
    if (!silent) {
      updateSyncUI('err', '❌ 讀取失敗');
      toast('讀取失敗：' + err.message, 'err');
    } else {
      // 靜默失敗：用本機資料繼續
      updateSyncUI('offline', '📴 離線模式');
    }
  }
}

// ============================================================
// 寫入試算表（防抖：2 秒後才真正寫入，避免連續操作重複寫）
// ============================================================
function syncWrite(immediate = false) {
  if (!_syncUrl) return; // 未設定則跳過

  _pendingWrite = true;
  clearTimeout(_autoSaveTimer);

  const delay = immediate ? 0 : 2000;
  _autoSaveTimer = setTimeout(async () => {
    if (!_pendingWrite) return;
    _pendingWrite = false;
    await _doWrite();
  }, delay);
}

async function _doWrite() {
  if (!_syncUrl || _isSyncing) return;
  _isSyncing = true;
  updateSyncUI('loading', '儲存中...');

  const payload = {
    action: 'sync',
    mode: CUR_MODE,
    timestamp: new Date().toISOString(),
    members: S.members(),
    skillList: S.skillList(),
    baijiaList: S.baijiaList(),
    events: S.events(),
    signups: S.signups(),
    matches: S.matches(),
  };

  try {
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
    // 標記待同步，網路恢復後可手動點選
    S.setConfig({ ...S.config(), pendingSync: true });
  } finally {
    _isSyncing = false;
  }
}

// ============================================================
// UI 更新
// ============================================================
function updateSyncUI(state, text) {
  const el = document.getElementById('topbar-sync-status');
  if (!el) return;
  el.textContent = text;
  el.className = 'sync-status ' + state;
}

// ============================================================
// 手動同步按鈕（頂部欄點擊）
// ============================================================
async function manualSyncNow() {
  if (!_syncUrl) {
    openGoogleModal();
    return;
  }
  // 先寫入最新資料，再讀回（確保看到最新）
  await _doWrite();
  await syncLoad(false);
}

// ============================================================
// Google 同步設定 Modal
// ============================================================
function openGoogleModal() {
  const cfg = S.config();
  document.getElementById('gs-webhook').value = cfg.gsWebhook || '';
  const lastEl = document.getElementById('gs-last-sync');
  if (lastEl) lastEl.textContent = cfg.lastSync ? '上次同步：' + cfg.lastSync : '尚未同步過';
  openModal('modal-google');
}

async function saveGoogleConfig() {
  const url = document.getElementById('gs-webhook').value.trim();
  const cfg = S.config();
  cfg.gsWebhook = url;
  S.setConfig(cfg);
  _syncUrl = url;
  closeModal('modal-google');
  toast('設定已儲存，正在載入資料...', '');
  await syncLoad(false);
}

// ============================================================
// 強制從試算表匯入（手動備份還原）
// ============================================================
async function googleImportNow() {
  if (!_syncUrl) { toast('請先設定 Webhook URL', 'err'); return; }
  if (!confirm('確定要從 Google 試算表覆蓋本機資料？')) return;
  await syncLoad(false);
}

// ============================================================
// 工具
// ============================================================
function _nowStr() {
  return new Date().toLocaleString('zh-TW', { hour12: false });
}

// ============================================================
// Store 的「攔截式」自動同步
// 所有 setXxx 呼叫後，自動觸發防抖寫入
// ============================================================
const _origSetMembers = S.setMembers.bind(S);
const _origSetEvents  = S.setEvents.bind(S);
const _origSetMatches = S.setMatches.bind(S);
const _origSetSignups = S.setSignups.bind(S);
const _origSetSkillList  = S.setSkillList.bind(S);
const _origSetBaijiaList = S.setBaijiaList.bind(S);

S.setMembers = function(v)  { const r=_origSetMembers(v);  syncWrite(); return r; };
S.setEvents  = function(v)  { const r=_origSetEvents(v);   syncWrite(); return r; };
S.setMatches = function(v)  { const r=_origSetMatches(v);  syncWrite(); return r; };
S.setSignups = function(v)  { const r=_origSetSignups(v);  syncWrite(); return r; };
S.setSkillList  = function(v){ const r=_origSetSkillList(v);  syncWrite(); return r; };
S.setBaijiaList = function(v){ const r=_origSetBaijiaList(v); syncWrite(); return r; };
