// ============================================================
// GSYNC.JS v5 — 自動同步（改為逐筆ID合併＋刪除墓碑＋失敗自動重試）
// ============================================================

// ★★ 固定 Apps Script 網址：以後不用每次手動輸入 URL ★★
// 若未來重新建立「全新部署」導致網址改變，只需更新這裡即可（一般部署新版本網址不會變）。
const GS_URL = 'https://script.google.com/macros/s/AKfycbzUbENAetEStUbi5c6UILSM4Q9LjF4C_u88YeMvcHvEC6LL6CshzQ1TB9ZHiQzEYeBJ/exec';

let _syncUrl = '';
let _autoSaveTimer = null;
let _isSyncing = false;
let _suppressWrite = false;
let _pendingWrite = false;   // 是否有尚未成功送出雲端的變更
let _writeRetryTimer = null;

// ─── 刪除墓碑：記錄「本機剛刪除的ID」，避免被雲端舊資料復活 ──
// 只需存在本機即可：只要刪除的寫入最終成功送達雲端，資料就會一致；
// 墓碑只是在那之前，擋住舊資料被讀回來蓋掉本機的刪除結果。
function _tombKey(coll){ return S.k('tomb_'+coll); }
function _getTomb(coll){ return S.g(_tombKey(coll), {}); }
function _addTomb(coll,id){
  if(!id) return;
  const t=_getTomb(coll); t[id]=Date.now();
  S.s(_tombKey(coll), t);
}
// 墓碑保留 48 小時後自動清除，避免無限增長
function _cleanTomb(coll){
  const t=_getTomb(coll); const now=Date.now(); let changed=false;
  Object.keys(t).forEach(id=>{ if(now-t[id]>172800000){ delete t[id]; changed=true; } });
  if(changed) S.s(_tombKey(coll), t);
  return t;
}

// ─── 依 id 合併本機與雲端資料（聯集＋新舊比對＋套用刪除墓碑）──
// stats（可選）：傳入物件時會累加 stats.cloudWins ＝ 有幾筆是「雲端版本比本機新」而採用雲端的，
// 代表其他裝置（例如另一位管理員）在你編輯期間也改過同一筆資料，可用於衝突提醒
function _mergeById(localArr, cloudArr, tombIds, stats){
  localArr = Array.isArray(localArr)?localArr:[];
  cloudArr = Array.isArray(cloudArr)?cloudArr:[];
  const map = new Map();
  cloudArr.forEach(item=>{ if(item&&item.id) map.set(item.id, item); });
  localArr.forEach(item=>{
    if(!item||!item.id) return;
    const cloudItem = map.get(item.id);
    if(!cloudItem){ map.set(item.id, item); return; } // 本機獨有（例如剛新增，雲端還沒同步到）
    // 兩邊都有同一筆：有時間戳記的話新的優先，否則保留本機版本
    const lu=item.updatedAt||0, cu=cloudItem.updatedAt||0;
    if(cu>lu && stats) stats.cloudWins=(stats.cloudWins||0)+1;
    map.set(item.id, cu>lu ? cloudItem : item);
  });
  tombIds.forEach(id=>map.delete(id)); // 本機剛刪除的，即使雲端還留著也要濾掉
  return Array.from(map.values());
}

// ─── 初始化 ──────────────────────────────────────────────
async function syncInit() {
  // 固定使用寫死的網址，不再需要使用者手動輸入
  _syncUrl = GS_URL;
  S.setConfig({ ...S.config(), gsWebhook: GS_URL });
  updateSyncUI('loading', '讀取中...');
  await syncLoad(true);
  // 自動接收最新：每 60 秒背景讀取一次 + 切回分頁時立即讀取
  if(!window._autoPollTimer){
    window._autoPollTimer = setInterval(()=>{ if(_syncUrl && !_isSyncing) syncLoad(true); }, 30000);
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
  // 關鍵：把「這次要同步的模式」在一開始就固定下來，不要在中途改用即時的 CUR_MODE。
  // 如果請求送出後、回應回來前，使用者切換了模式（俱樂部⇄幫戰、登出重登、或延遲重試），
  // CUR_MODE 會變成別的模式，若還是照當下的 CUR_MODE 寫入，就會把這個模式抓到的資料
  // 寫進另一個模式的欄位裡，造成兩個模式的資料互相污染。
  const reqMode = CUR_MODE;
  const reqOrg  = CUR_ORG;
  // 若本機還有尚未送出的變更，先送出，避免等一下被雲端舊資料覆蓋回來
  if (_pendingWrite) {
    clearTimeout(_autoSaveTimer);
    await _doWrite();
  }
  updateSyncUI('loading', '讀取中...');
  try {
    // 改用 POST 傳送 action=load，解決 GET CORS 問題
    const res = await fetch(_syncUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: 'load', mode: reqMode, org: reqOrg }),
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);

    let data;
    try { data = await res.json(); }
    catch(_) { throw new Error('回應格式錯誤，請確認 Apps Script 已重新部署最新版本'); }

    if (data && data.error) throw new Error(data.error);
    if (!data) throw new Error('無資料回應');

    // 安全檢查：如果在等待雲端回應期間，模式已經被切換了，這批資料就不能再套用，
    // 直接放棄這次結果（下次同步輪到該模式時會重新抓一次），避免寫錯地方
    if (CUR_MODE !== reqMode || CUR_ORG !== reqOrg) {
      console.warn('syncLoad: 模式或組織已於同步期間變更，放棄套用此次結果，避免資料寫錯地方');
      return;
    }

    // 暫停寫入攔截，避免讀取觸發再寫入無限循環
    _suppressWrite = true;
    let needPushBack = false; // 合併後與雲端原始資料不同（例如濾掉了已刪除項目、或補回本機獨有項目）→ 需回寫雲端
    try {
      // 依 id 逐筆合併（聯集＋新舊比對＋套用刪除墓碑），取代原本「整包覆蓋」
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
      // signups 是巢狀物件（依場次→依人名），用淺層合併即可保留兩邊的回報紀錄
      if (data.signups && typeof data.signups==='object') {
        const localSignups = S.signups()||{};
        const mergedSignups = {...localSignups};
        Object.keys(data.signups).forEach(evId=>{
          mergedSignups[evId] = {...(data.signups[evId]||{}), ...(localSignups[evId]||{})};
        });
        if (Object.keys(data.signups).length || !Object.keys(localSignups).length) _writeSignups(mergedSignups);
      }
    } finally {
      _suppressWrite = false;
    }
    if (needPushBack) syncWrite();
    // 自癒：成員為空但有比賽紀錄 → 自動重建成員（並自動回寫雲端）
    try{ if (typeof autoHealMembers==='function' && autoHealMembers()) needPushBack = true; }catch(_){}

    const now = _nowStr();
    S.setConfig({ ...S.config(), lastSync: now, gsWebhook: _syncUrl });
    updateSyncUI('ok', '✅ ' + now.slice(5, 16));

    // 若目前正停留在登入頁（例如剛掃QR碼進來的全新裝置），同步完成後
    // 立即重新整理搜尋建議清單，避免使用者在資料還沒到位前就搜尋而誤以為找不到人
    try{
      const loginScreen=document.getElementById('screen-login');
      if(loginScreen && !loginScreen.classList.contains('hidden')){
        const input=document.getElementById('player-name-input');
        if(input && typeof loginSuggest==='function') loginSuggest(input.value||'');
      }
    }catch(_){}

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

// ─── 防抖寫入（背景自動同步用）──────────────────────────
function syncWrite() {
  if (!_syncUrl || _suppressWrite) return;
  _pendingWrite = true;
  clearTimeout(_autoSaveTimer);
  _autoSaveTimer = setTimeout(_doWrite, 2000);
}

// 把「要送出的模式」和「當下的資料」在同一個時間點一起打包，避免兩者在跨越
// await（等待網路回應）的過程中，被使用者切換模式的動作拆散成不一致的組合
// （例如：標籤寫著A模式，但裡面的資料其實已經是切換後的B模式）
function _buildSyncPayload(mode, org){
  return {
    action:    'sync',
    mode:      mode,
    org:       org,
    timestamp: new Date().toISOString(),
    members:    S.members(),
    skillList:  S.skillList(),
    baijiaList: S.baijiaList(),
    events:     S.events(),
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
  const payload = _buildSyncPayload(CUR_MODE, CUR_ORG); // 在任何 await 之前，同一瞬間打包好模式+組織標籤與資料內容
  try {
    await _pushToCloud(payload);
    _pendingWrite = false;
    clearTimeout(_writeRetryTimer);
    const now = _nowStr();
    S.setConfig({ ...S.config(), lastSync: now });
    updateSyncUI('ok', '✅ ' + now.slice(5, 16));
  } catch (err) {
    console.warn('syncWrite error:', err.message);
    updateSyncUI('offline', '📴 待同步（將自動重試）');
    // 自動重試，避免變更因為一時網路問題而遺失、甚至被舊資料覆蓋回來
    clearTimeout(_writeRetryTimer);
    _writeRetryTimer = setTimeout(()=>{ if (_pendingWrite) _doWrite(); }, 15000);
  } finally {
    _isSyncing = false;
  }
}

// ─── 快速立即寫入（玩家自助操作用，優化速度）──
// 與 syncWriteNow 的差別：省略「寫入前先讀雲端再合併」那一趟（那是1-2分鐘延遲的主因）。
// 為什麼可以省略仍然安全：
//  1. 玩家自助操作只會改「自己這一筆成員」或「自己的報名」，不會動到別人的資料；
//  2. 送出的整包資料裡，自己這筆有帶最新的 updatedAt，其他人那幾筆是本機既有的舊資料；
//  3. 伺服器端／其他裝置下次讀取時，會用 updatedAt 做逐筆合併——別人若在雲端有更新的版本，
//     會以較新的為準，所以不會因為這次略過預先合併而蓋掉別人的最新資料。
// 這樣單一玩家的儲存就只需要「一趟寫入」，速度大幅提升。
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
    console.warn('syncWriteNowFast failed:', err.message);
    updateSyncUI('offline', '📴 待同步（背景自動重試）');
    // 失敗不卡使用者，改由背景每15秒自動重試，直到成功
    clearTimeout(_writeRetryTimer);
    _writeRetryTimer = setTimeout(()=>{ if (_pendingWrite) _doWrite(); }, 15000);
    return false;
  }
}

// ─── 立即寫入（玩家自助操作專用：編輯個人資料、報名/請假、切換固定團）──
// 跟背景防抖寫入不同，這裡會：
// 1. 取消排隊中的延遲寫入，馬上執行，不等2秒
// 2. 寫入前先讀一次雲端最新資料，跟本機做逐筆合併，降低「幾十個裝置同時動作」互相覆蓋的機率
// 3. 若失敗會在幾秒內自動重試數次，並回傳成功與否，讓呼叫端可以據此顯示正確的成功/失敗訊息，
//    避免使用者看到「已更新」的假象後就關閉頁面，結果雲端其實沒收到
async function syncWriteNow(maxRetries){
  maxRetries = maxRetries || 3;
  if (!_syncUrl) return 'nosync'; // 這台裝置根本沒設定雲端同步，資料只會留在本機，不能算「已同步」
  const reqMode = CUR_MODE; // 從頭到尾都用這組模式+組織，不管中途有沒有被切換
  const reqOrg  = CUR_ORG;
  clearTimeout(_autoSaveTimer);
  clearTimeout(_writeRetryTimer);
  _pendingWrite = true;
  for (let i=0; i<maxRetries; i++){
    updateSyncUI('loading', i===0 ? '同步中...' : '重試中(' + (i+1) + ')...');
    try{
      // 寫入前先讀雲端最新資料並合併，避免蓋掉其他裝置剛寫入、本機還沒同步到的變更
      try{
        const loadRes = await fetch(_syncUrl, {
          method:'POST',
          headers:{'Content-Type':'text/plain;charset=utf-8'},
          body: JSON.stringify({ action:'load', mode:reqMode, org:reqOrg }),
        });
        // 安全檢查：等待讀取回應期間，如果模式被切換了，這個合併結果就不能再套用
        if (loadRes.ok && CUR_MODE===reqMode && CUR_ORG===reqOrg){
          const cloud = await loadRes.json();
          if (cloud && !cloud.error && CUR_MODE===reqMode && CUR_ORG===reqOrg){
            const tombM = _cleanTomb('members'), tombE = _cleanTomb('events'), tombMt = _cleanTomb('matches');
            const mstats={cloudWins:0};
            const mergedMembers = _mergeById(S.members(), Array.isArray(cloud.members)?cloud.members:[], Object.keys(tombM), mstats);
            const mergedEvents  = _mergeById(S.events(),  Array.isArray(cloud.events)?cloud.events:[],   Object.keys(tombE), mstats);
            const mergedMatches = _mergeById(S.matches(), Array.isArray(cloud.matches)?cloud.matches:[], Object.keys(tombMt), mstats);
            _suppressWrite = true;
            try{ _writeMembers(mergedMembers); _writeEvents(mergedEvents); _writeMatches(mergedMatches); }
            finally{ _suppressWrite = false; }
            // 衝突提醒：偵測到其他裝置在這段期間也編輯過資料（例如另一位管理員同時在排表），
            // 已自動以較新版本合併，但提醒使用者重新確認畫面內容，避免以為自己的修改被吃掉
            if(mstats.cloudWins>0 && typeof IS_ADMIN!=='undefined' && IS_ADMIN){
              toast('⚠️ 偵測到其他裝置同時編輯了 '+mstats.cloudWins+' 筆資料，已自動合併較新版本，請確認畫面內容','err');
            }
          }
        }
      }catch(_){ /* 合併失敗就直接用本機現有資料寫入，不中斷流程 */ }

      // 若模式在過程中被切換了，這次寫入的內容已經不可信，直接放棄，避免寫錯地方
      if (CUR_MODE !== reqMode || CUR_ORG !== reqOrg){
        console.warn('syncWriteNow: 模式或組織已於同步期間變更，放棄這次寫入');
        _pendingWrite = false;
        return false;
      }
      const payload = _buildSyncPayload(reqMode, reqOrg); // 在送出前的最後一刻，同一瞬間打包標籤+資料內容
      await _pushToCloud(payload);
      _pendingWrite = false;
      const now = _nowStr();
      S.setConfig({ ...S.config(), lastSync: now });
      updateSyncUI('ok', '✅ ' + now.slice(5, 16));
      return true;
    }catch(err){
      console.warn('syncWriteNow attempt ' + (i+1) + ' failed:', err.message);
      if (i < maxRetries-1) await new Promise(r=>setTimeout(r, 700*(i+1)));
    }
  }
  updateSyncUI('offline', '📴 同步失敗（將自動重試）');
  clearTimeout(_writeRetryTimer);
  _writeRetryTimer = setTimeout(()=>{ if (_pendingWrite) _doWrite(); }, 15000);
  return false;
}

// ─── 手動同步 ────────────────────────────────────────────
async function manualSyncNow() {
  if (!_syncUrl) return;
  updateSyncUI('loading', '同步中...');
  await _doWrite();
  await syncLoad(false);
}

// ─── 管理端「立即重新整理」：只讀取雲端最新資料並刷新畫面（抓玩家最新更新用）──
async function adminRefreshNow() {
  if (!_syncUrl) return;
  const btn = document.getElementById('topbar-refresh-btn');
  if (btn) { btn.style.transition='transform .6s'; btn.style.transform='rotate(360deg)'; }
  await syncLoad(false); // 非靜默：完成會顯示「已載入最新資料」，失敗會顯示實際錯誤
  if (btn) { setTimeout(()=>{ btn.style.transition=''; btn.style.transform=''; }, 650); }
}

// ─── UI ──────────────────────────────────────────────────
function updateSyncUI(state, text) {
  const el = document.getElementById('topbar-sync-status');
  if (el) { el.textContent = text; el.className = 'sync-status ' + state; }
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
S.setMembers    = v => { const ok=S.s(S.k('members'), v);    syncWrite(); return ok; };
S.setEvents     = v => {
  // 排表系統有許多不同編輯入口都會呼叫 setEvents，統一在這裡蓋上時間戳記，
  // 讓多裝置同步時可以正確比對「哪一份排表比較新」
  const stamped = Array.isArray(v) ? v.map(e => (e && typeof e==='object') ? {...e, updatedAt:Date.now()} : e) : v;
  const ok=S.s(S.k('events'), stamped);
  syncWrite();
  return ok;
};
S.setMatches    = v => { const ok=S.s(S.k('matches'), v);    syncWrite(); return ok; };
S.setSignups    = v => { const ok=S.s(S.k('signups'), v);    syncWrite(); return ok; };
S.setSkillList  = v => { const ok=S.s('skill_list', v);      syncWrite(); return ok; };
S.setBaijiaList = v => { const ok=S.s('baijia_list', v);     syncWrite(); return ok; };


// ─── 最後防線：頁面關閉/切走時，若還有未送達的變更，盡力送出一次 ──
// sendBeacon 是「送出不等回應」，無法重試或確認成功，但至少比什麼都不做好，
// 用來防止使用者看到「已更新」後太快關閉頁面，導致 syncWriteNow 還沒送達就被中斷。
window.addEventListener('pagehide', () => {
  if (_pendingWrite && _syncUrl && navigator.sendBeacon) {
    try {
      const payload = JSON.stringify(_buildSyncPayload(CUR_MODE, CUR_ORG));
      const blob = new Blob([payload], { type: 'text/plain;charset=utf-8' });
      navigator.sendBeacon(_syncUrl, blob);
    } catch (_) {}
  }
});
