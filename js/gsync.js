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
// 把本機三類墓碑攤平成 [{coll,id,ts}]，隨每次同步上傳到雲端刪除紀錄
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
// 墓碑保留 30 天後自動清除（與雲端刪除紀錄一致），避免無限增長
function _cleanTomb(coll){
  const t=_getTomb(coll); const now=Date.now(); let changed=false;
  Object.keys(t).forEach(id=>{ if(now-t[id]>2592000000){ delete t[id]; changed=true; } });
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
    // 兩邊都有同一筆 id：
    // ★ 改名保護——先比「改名/異動歷史(changeLog)」誰比較完整，較多異動的版本代表較新的真實狀態，
    //   優先勝出，避免某台裝置的舊快取（changeLog 較短、名字還是舊的）用較大的 updatedAt 把改名結果打回去。
    const lcl=(item.changeLog||[]).length, ccl=(cloudItem.changeLog||[]).length;
    if(lcl!==ccl){ map.set(item.id, lcl>ccl ? item : cloudItem); return; }
    // 異動歷史一樣多，才回到用時間戳記比新舊
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
  // 自動接收最新（提速版）：每 5 秒問一次超輕量「版本號」（不讀試算表，極快），
  // 版本有變才抓完整資料 → 別人改完到你看到，從最久 30 秒縮短為通常 5~10 秒。
  // 每第 12 次（約 60 秒）仍做一次完整讀取保底，涵蓋跨組織共用資料等邊角情況。
  if(!window._autoPollTimer){
    window._autoPollTimer = setInterval(_pollTick, 5000);
    document.addEventListener('visibilitychange', ()=>{
      if(document.visibilityState==='visible' && _syncUrl && !_isSyncing) syncLoad(true);
    });
  }
}

let _lastRev   = null;  // 最後一次看到的雲端資料版本號
let _pollCount = 0;
let _verOk     = true;  // 後端是否支援 ver 查詢（尚未更新後端時自動退回舊式輪詢）

async function _pollTick(){
  if(!_syncUrl || _isSyncing) return;
  _pollCount++;
  // 後端不支援 ver（還沒部署新版）→ 退回原本行為：每 30 秒完整讀取一次
  if(!_verOk){ if(_pollCount % 6 === 0) syncLoad(true); return; }
  // 每 60 秒完整讀取一次保底
  if(_pollCount % 12 === 0){ syncLoad(true); return; }
  try{
    const res = await fetch(_syncUrl, {
      method:'POST',
      headers:{'Content-Type':'text/plain;charset=utf-8'},
      body: JSON.stringify({ action:'ver', mode:CUR_MODE, org:CUR_ORG }),
    });
    if(!res.ok) return;
    const d = await res.json();
    if(d && d.error){
      if(/unknown action/.test(String(d.error))) _verOk=false; // 舊後端：改走退回模式
      return;
    }
    if(!d || !d.ok) return;
    // 維護狀態即時反映（最慢 5 秒就會看到橫幅出現/消失）
    if(d.maintenance) _showMaintBanner(d.maintenanceMsg);
    else { _hideMaintBanner(); if(_pendingWrite) syncWrite(); }
    if(d.rev !== undefined){
      if(_lastRev === null){ _lastRev = d.rev; return; }
      if(String(d.rev) !== String(_lastRev)){
        _lastRev = d.rev;
        syncLoad(true); // 版本變了 → 有人更新了資料，立即抓取
      }
    }
  }catch(_){ /* 網路暫時失敗就等下一輪 */ }
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

    if (data.rev !== undefined) _lastRev = data.rev; // 記錄目前資料版本號供輕量輪詢比對
    // 維護狀態橫幅：後端開啟維護→所有裝置顯示提醒；關閉→自動消失並補上傳
    if (data.maintenance) _showMaintBanner(data.maintenanceMsg);
    else {
      _hideMaintBanner();
      // 維護剛結束時，若本機還有累積未上傳的變更，馬上補送
      if (_pendingWrite) syncWrite();
    }

    // 安全檢查：如果在等待雲端回應期間，模式已經被切換了，這批資料就不能再套用，
    // 直接放棄這次結果（下次同步輪到該模式時會重新抓一次），避免寫錯地方
    if (CUR_MODE !== reqMode || CUR_ORG !== reqOrg) {
      console.warn('syncLoad: 模式或組織已於同步期間變更，放棄套用此次結果，避免資料寫錯地方');
      return;
    }

    // 雲端刪除紀錄：先合併進本機墓碑再套用資料，
    // 這樣「其他裝置刪除的成員/場次」在這台裝置也會被正確濾掉，不會復活
    if (Array.isArray(data.tombstones)) {
      data.tombstones.forEach(t=>{
        if(!t||!t.coll||!t.id) return;
        const store=_getTomb(t.coll);
        const ts=Number(t.ts)||Date.now();
        if(!store[t.id]||ts>store[t.id]){ store[t.id]=ts; S.s(_tombKey(t.coll), store); }
      });
    }
    // 技能刪除紀錄是跨組織共用的，也要先合併進本機，讓聯集合併時正確排除
    if (Array.isArray(data.skillTombstones)) {
      const store=_getSkillTomb();
      data.skillTombstones.forEach(t=>{
        if(!t||!t.name) return;
        const ts=Number(t.ts)||Date.now();
        if(!store[t.name]||ts>store[t.name]) store[t.name]=ts;
      });
      S.s(_SKILL_TOMB_KEY, store);
    }

    // 快照套用前的本機資料：套用後比對，若完全沒變就不重繪畫面，
    // 避免使用者停留在數據分析等頁面時，每60秒被無意義地整頁重置跳掉
    const _beforeSnap = JSON.stringify([S.members(),S.events(),S.matches(),S.signups(),S.g(S.k('score_log'),[]),S.g(S.k('score_cfg'),null)]);

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
      // 積分手動紀錄：逐筆 id+updatedAt 合併（作廢用 void 標記，不刪列，天然防復活）
      applyMerged(data.scoreLog, ()=>S.g(S.k('score_log'),[]), v=>S.s(S.k('score_log'),v), 'scores');
      // 積分設定：整包以 updatedAt 較新者為主（僅管理端會修改，衝突機率極低）
      if (data.scoreCfg && typeof data.scoreCfg==='object') {
        const localCfg=S.g(S.k('score_cfg'),null);
        const cu=Number(data.scoreCfg.updatedAt)||0, lu=localCfg?(Number(localCfg.updatedAt)||0):0;
        if (cu>=lu) S.s(S.k('score_cfg'), data.scoreCfg);
        else needPushBack=true;
      } else if (S.g(S.k('score_cfg'),null)) { needPushBack=true; }
      // signups 是巢狀物件（依場次→依人名），用淺層合併即可保留兩邊的回報紀錄
      if (data.signups && typeof data.signups==='object') {
        const localSignups = S.signups()||{};
        // 合併規則：以雲端為基底，只疊上「這台裝置真正改過」（dirty 清單內）的本機報名；
        // 沒改過的本機舊值一律以雲端為準——拿著舊資料的裝置不會再覆蓋別人較新的報名
        const dirty=(typeof S.signupDirty==='function')?S.signupDirty():{};
        const mergedSignups={};
        const allEvIds=new Set([...Object.keys(data.signups||{}),...Object.keys(localSignups)]);
        allEvIds.forEach(evId=>{
          const cloudS=(data.signups||{})[evId]||{};
          const localS=localSignups[evId]||{};
          const merged={...cloudS};
          Object.keys(localS).forEach(n=>{ if(dirty[evId+'|'+n]!==undefined) merged[n]=localS[n]; });
          // 本機 dirty 的「取消報名」（雲端有、本機沒有）也要生效
          Object.keys(cloudS).forEach(n=>{ if(dirty[evId+'|'+n]!==undefined && localS[n]===undefined) delete merged[n]; });
          mergedSignups[evId]=merged;
        });
        if (Object.keys(data.signups).length || !Object.keys(localSignups).length) _writeSignups(mergedSignups);
      }
      // 改名遷移：把舊名字的報名搬到新名字名下（有變動會在後續資料快照比對中觸發畫面更新與回寫）
      if (_migrateAliasSignups()) needPushBack = true;
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

    // 只有資料真的有變動才重繪畫面（沒變就完全不動，使用者的瀏覽狀態不受打擾）
    const _afterSnap = JSON.stringify([S.members(),S.events(),S.matches(),S.signups(),S.g(S.k('score_log'),[]),S.g(S.k('score_cfg'),null)]);
    const _dataChanged = _beforeSnap !== _afterSnap;
    if (!silent) {
      toast('✅ 已載入最新資料', 'ok');
      const active = document.querySelector('.nav-btn.active');
      if (active) renderPane(active.dataset.tab, document.getElementById('pane-' + active.dataset.tab));
    } else if (_dataChanged) {
      // 靜默模式：僅在資料有變動時刷新當前頁面
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
  _autoSaveTimer = setTimeout(_doWrite, 500);
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
    members:    _dedupeMembersByName(S.members()),
    tombstones: _allTombRows(),
    skillList:  S.skillList(),
    baijiaList: S.baijiaList(),
    skillTombstones: _allSkillTombRows(),
    events:     _normEvents(S.events()),
    signups:    S.signups(),
    signupDirty: S.signupDirty(), // 本機真正改過的報名格子清單（evId|姓名），供後端做逐格精準合併
    matches:    S.matches(),
    scoreCfg:   S.g(S.k('score_cfg'), null),
    scoreLog:   S.g(S.k('score_log'), []),
  };
}

async function _pushToCloud(payload){
  const res = await fetch(_syncUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  // 解析後端回應：維護中／忙碌中都不算成功，變更要留在本機繼續重試
  let body = null;
  try { body = await res.json(); } catch(_){}
  if (body && body.maintenance) {
    _showMaintBanner(body.maintenanceMsg);
    const e = new Error(body.maintenanceMsg || '系統維護中');
    e.maintenance = true;
    throw e;
  }
  if (body && body.busy) {
    const e = new Error('伺服器忙碌，稍後自動重試');
    e.busy = true;
    throw e;
  }
  if (body && body.error) throw new Error(body.error);
  // 記下這次寫入後的雲端版本號：自己造成的版本變動不需要再觸發一次完整讀取
  if (body && body.rev !== undefined) _lastRev = body.rev;
}

// ─── 維護模式橫幅：後端開啟維護時，所有裝置 30 秒內會看到提醒 ──
function _showMaintBanner(msg){
  let el = document.getElementById('maint-banner');
  if (!el) {
    el = document.createElement('div');
    el.id = 'maint-banner';
    el.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:9999;background:#b45309;color:#fff;'
      + 'padding:10px 14px;font-size:14px;line-height:1.5;text-align:center;box-shadow:0 2px 8px rgba(0,0,0,.3)';
    document.body.appendChild(el);
    document.body.style.paddingTop = '44px'; // 避免橫幅遮住頂欄
  }
  el.textContent = '🛠 ' + (msg || '系統維護更新中，您的修改已保存在此裝置，維護結束後會自動上傳');
}
function _hideMaintBanner(){
  const el = document.getElementById('maint-banner');
  if (el) { el.remove(); document.body.style.paddingTop = ''; }
}

async function _doWrite() {
  if (!_syncUrl) return;
  if (_isSyncing) { clearTimeout(_autoSaveTimer); _autoSaveTimer = setTimeout(_doWrite, 500); return; }
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
    if (err.maintenance) {
      // 維護中：變更安全保存在本機，改用較長間隔（60秒）輕量重試，維護結束即自動補上傳
      updateSyncUI('offline', '🛠 維護中（變更已保留）');
      clearTimeout(_writeRetryTimer);
      _writeRetryTimer = setTimeout(()=>{ if (_pendingWrite) _doWrite(); }, 60000);
    } else {
      updateSyncUI('offline', '📴 待同步（將自動重試）');
      // 自動重試，避免變更因為一時網路問題而遺失、甚至被舊資料覆蓋回來
      clearTimeout(_writeRetryTimer);
      _writeRetryTimer = setTimeout(()=>{ if (_pendingWrite) _doWrite(); }, 15000);
    }
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
    if (err.maintenance) {
      // 維護中：橫幅已顯示，變更留在本機，維護結束後由背景重試/輪詢自動補上傳
      updateSyncUI('offline', '🛠 維護中（變更已保留）');
      clearTimeout(_writeRetryTimer);
      _writeRetryTimer = setTimeout(()=>{ if (_pendingWrite) _doWrite(); }, 60000);
      return 'maintenance';
    }
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
            // 寫入前先把雲端刪除紀錄合併進本機墓碑，其他裝置刪除的資料不會被這次寫入復活
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
      if (err.maintenance) {
        // 維護中不必連續重試：變更留在本機，改由長間隔背景重試，維護結束自動補上傳
        updateSyncUI('offline', '🛠 維護中（變更已保留）');
        clearTimeout(_writeRetryTimer);
        _writeRetryTimer = setTimeout(()=>{ if (_pendingWrite) _doWrite(); }, 60000);
        return 'maintenance';
      }
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

// ─── UI ──────────────────────────────────────────────────
function updateSyncUI(state, text) {
  const el = document.getElementById('topbar-sync-status');
  if (el) { el.textContent = text; el.className = 'sync-status ' + state; }
}

function _nowStr() {
  return new Date().toLocaleString('zh-TW', { hour12: false });
}

// ─── Store 直接寫 localStorage（不走 S.setXxx 避免遞迴）──
// 依名字收斂重複成員：保留資料較完整的一筆（有職業>技能多>更新時間新），技能/曾用名取聯集。
// 這是防止「成員數暴增」的最後防線：舊裝置快取裡的舊 id 資料透過聯集合併「復活」時，
// 只要名字相同就會在這裡被自動合併，不會累積成兩倍人數。
function _dedupeMembersByName(arr){
  if(!Array.isArray(arr)) return [];
  const byName=new Map();
  const order=[];
  const score=m=>((m.jobId&&m.jobId!=='unknown')?2:0)+((m.skills||[]).length)+((m.baijia||[]).length?1:0);
  const _numJunk=s=>/^[\d,\.\s%]+$/.test(String(s)); // 純數字（含千分位）→ 誤匯入的數據垃圾
  arr.forEach(m=>{
    if(!m||!m.name) return;
    // 清洗歷史誤匯入殘留：絕技/群俠欄裡的純數字值（例如被誤存的擊殺數）自動移除
    if(Array.isArray(m.skills)&&m.skills.some(_numJunk)) m={...m, skills:m.skills.filter(s=>!_numJunk(s))};
    if(Array.isArray(m.baijia)&&m.baijia.some(_numJunk)) m={...m, baijia:m.baijia.filter(s=>!_numJunk(s))};
    const prev=byName.get(m.name);
    if(!prev){ byName.set(m.name,{...m}); order.push(m.name); return; }
    // 比較兩筆，較完整/較新者為主，另一筆的技能與曾用名併入
    const main=(score(m)>score(prev)||(score(m)===score(prev)&&(m.updatedAt||0)>(prev.updatedAt||0)))?{...m}:prev;
    const other=main===prev?m:prev;
    main.skills=[...new Set([...(main.skills||[]),...(other.skills||[])])];
    main.baijia=[...new Set([...(main.baijia||[]),...(other.baijia||[])])];
    main.aliases=[...new Set([...(main.aliases||[]),...(other.aliases||[])])];
    if(!main.note&&other.note) main.note=other.note;
    if(main.status!=='固定團'&&other.status==='固定團') main.status='固定團';
    byName.set(m.name, main);
  });
  // ── 第二階段：曾用名吸收（id 感知，改名安全版）──
  // 目的：清掉「改名前殘留的舊名字幽靈紀錄」（例如改名前由比賽紀錄自動補進的空殼、或其他裝置舊快取），
  // 讓改名後不會同時出現新舊兩個名字、人數灌水。
  // ★ 安全規則（修正「改名後整筆消失」）：
  //   1. 只有當「舊名字紀錄」與「本人(改名後)紀錄」是不同的 id 時才吸收；
  //      同一筆 id 只是改了名字，不是重複，絕不刪除。
  //   2. 只吸收「幽靈殼」——沒有職業、沒有技能、沒有自己的改名歷史的舊名字紀錄；
  //      若舊名字那筆本身有實質資料（代表可能是不同的人），一律保留，不吸收，避免誤刪。
  const aliasOwner=new Map(); // 舊名字 → 本人(改名後)的名字
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
    if(oldRec.id && owner.id && oldRec.id===owner.id) return; // 同一筆 id，只是改名，不吸收
    // 舊名字紀錄若有實質資料（有職業/技能/自己的改名史）→ 視為獨立成員，保留不吸收
    const oldHasData = (oldRec.jobId && oldRec.jobId!=='unknown')
      || (oldRec.skills&&oldRec.skills.length)
      || (oldRec.baijia&&oldRec.baijia.length)
      || (oldRec.changeLog&&oldRec.changeLog.length);
    if(oldHasData) return;
    // 確定是幽靈殼 → 把它的曾用名併入本人後移除
    owner.aliases=[...new Set([...(owner.aliases||[]),...(oldRec.aliases||[]),oldName])].filter(a=>a!==owner.name);
    if(!owner.note&&oldRec.note) owner.note=oldRec.note;
    if(owner.status!=='固定團'&&oldRec.status==='固定團') owner.status='固定團';
    absorbed.add(oldName);
  });
  return order.filter(n=>!absorbed.has(n)).map(n=>byName.get(n));
}
function _writeMembers(v)   { S.s(S.k('members'), _dedupeMembersByName(v)); }

// 報名紀錄跟著改名遷移：把「舊名字」的報名搬到「新名字」名下
// （新名字若已自行回覆過則以新回覆為準，直接丟棄舊的），
// 讓報名名單不會同時出現改名前後兩個名字、人數重複計算
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
      if(ns[owner]===undefined) ns[owner]=ns[key]; // 搬到新名字名下
      delete ns[key];                               // 移除舊名字的紀錄
      changed=true;
    });
    out[evId]=ns;
  });
  if(changed) _writeSignups(out);
  return changed;
}
// 技能刪除紀錄：絕技／群俠技能共用同一份刪除登記（不分類型，簡化邏輯，
// 與後端共用試算表的「共用_技能刪除紀錄」是同一份資料）；儲存在「全域」層級，
// 不用 S.k() 加組織前綴，因為技能清單本身就是跨組織共用的
const _SKILL_TOMB_KEY='tomb_skillnames';
function _getSkillTomb(){ return S.g(_SKILL_TOMB_KEY, {}); }
function _addSkillTomb(name){
  const t=_getSkillTomb(); t[name]=Date.now();
  S.s(_SKILL_TOMB_KEY, t);
}
function _cleanSkillTomb(){
  const t=_getSkillTomb(); const now=Date.now(); let changed=false;
  Object.keys(t).forEach(k=>{ if(now-t[k]>2592000000){ delete t[k]; changed=true; } }); // 30天後清除
  if(changed) S.s(_SKILL_TOMB_KEY, t);
  return t;
}
function _allSkillTombRows(){
  const t=_cleanSkillTomb();
  return Object.entries(t).map(([name,ts])=>({name,ts}));
}
// 技能清單改為「聯集合併」而非整批覆蓋：任何裝置/組織新增的技能都會保留，
// 只有明確走過刪除流程（_addSkillTomb）的項目才會被排除，
// 這樣就不會因為同步時機先後，讓剛新增的技能被舊資料蓋掉
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
// 清洗約戰活動時間：試算表可能把「20:00」污染成「1899-12-30...」的日期字串，
// 這裡取出其中的 HH:mm；完全取不出時間就清空（管理員用「編輯」重填一次即可）。
// 讓髒值無論已存在本機或雲端，流經這裡都會被自動修正，不再來回同步擴散。
function _normEventTime(t){
  if(!t) return '';
  const s=String(t);
  if(/^\d{1,2}:\d{2}$/.test(s)) return s;              // 已是乾淨格式
  const m=s.match(/(\d{1,2}:\d{2})/);
  if(m) return m[1];                                      // 字串中含時間（含1899污染）→ 救回時間
  return '';                                              // 純日期污染（如"1899-12-30"）→ 清空
}
function _normEvents(v){
  // 舊術語自動遷移：單周聯賽→單場周、雙周聯賽→雙場周（既有資料一併更新，不用手動改）
  const TYPE_MIGRATE={'單周聯賽':'單場周','雙周聯賽':'雙場周'};
  return (Array.isArray(v)?v:[]).map(e=>{
    let out=e;
    if(out && out.type && TYPE_MIGRATE[out.type]){
      out = {...out, type:TYPE_MIGRATE[out.type]};
    }
    if(out && out.eventTime!==undefined && out.eventTime!==null && out.eventTime!==''){
      const t=_normEventTime(out.eventTime);
      if(t!==String(out.eventTime)) out={...out, eventTime:t};
    }
    return out;
  });
}
// 同一天重複場次自動合併：兩台裝置在互相同步前各建了同一天的場次時，
// 聯集合併會讓同一天出現兩場。這裡依日期收斂成一場：
// 保留「較有內容」的那筆（排表人數多 > 報名多 > 更新時間新），
// 被合併場次的報名紀錄會搬到保留場次（保留場次已有的回覆優先），並加墓碑防止復活。
function _dedupeEventsByDate(arr){
  if(!Array.isArray(arr)) return arr||[];
  const byDate=new Map();
  arr.forEach(e=>{
    if(!e||!e.date){ return; }
    const d=String(e.date).slice(0,10);
    (byDate.get(d)||byDate.set(d,[]).get(d)).push(e);
  });
  const drop=new Map(); // 被合併的 evId → 保留的 evId
  const lineupCount=e=>{ let c=0; Object.entries(e.teams||{}).forEach(([k,a])=>{ if(Array.isArray(a)) c+=a.filter(Boolean).length; }); return c; };
  const signups=S.signups();
  const signupCount=e=>Object.keys(signups[e.id]||{}).length;
  byDate.forEach(group=>{
    if(group.length<2) return;
    const sorted=group.slice().sort((a,b)=>(lineupCount(b)-lineupCount(a))||(signupCount(b)-signupCount(a))||((b.updatedAt||0)-(a.updatedAt||0)));
    const keep=sorted[0];
    sorted.slice(1).forEach(e=>drop.set(e.id, keep.id));
  });
  if(!drop.size) return arr.filter(e=>e&&e.date).concat(arr.filter(e=>!e||!e.date)).filter(Boolean);
  // 報名遷移：被合併場次的回覆搬到保留場次（保留場次已有的優先）
  try{
    const out={...S.signups()};
    let ch=false;
    drop.forEach((keepId,dropId)=>{
      const from=out[dropId];
      if(!from) return;
      const to={...(out[keepId]||{})};
      Object.entries(from).forEach(([n,st])=>{ if(to[n]===undefined) to[n]=st; });
      out[keepId]=to;
      delete out[dropId];
      ch=true;
    });
    if(ch) S.s(S.k('signups'), out); // 直接寫入（不經 setSignups 的 dirty 標記，這是系統性搬移非使用者操作）
  }catch(_){}
  drop.forEach((_,dropId)=>_addTomb('events', dropId)); // 防止被其他裝置的舊快取復活
  return arr.filter(e=>e&&(!e.id||!drop.has(e.id)));
}
function _writeEvents(v)    { S.s(S.k('events'), _dedupeEventsByDate(_normEvents(v))); }
function _writeMatches(v)   { S.s(S.k('matches'), v); }
function _writeSignups(v)   { S.s(S.k('signups'), v); }

// ─── 攔截 S.setXxx（用戶操作後自動觸發防抖寫入）─────────
// setSignups 特別注意：要保留 store.js 原本帶有「dirty 追蹤」的版本再疊加同步觸發，
// 不能直接呼叫 S.s() 覆寫過去，否則會讓 dirty 追蹤機制失效，
// 使得「只有本機真正改過的資料才能覆蓋雲端」這道防線形同虛設
const _origSetSignups = S.setSignups;
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
S.setSignups    = v => { const ok=_origSetSignups.call(S,v);  syncWrite(); return ok; };
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
