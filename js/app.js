// ============================================================
// UTILS
// ============================================================
function uid(){ return Date.now().toString(36)+Math.random().toString(36).slice(2,6); }
function fmtDate(d){ if(!d)return''; const dt=new Date(d); return `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')}`; }
function jobById(id){ return JOBS.find(j=>j.id===id)||{name:id,color:'#8892b0'}; }
function jobByName(n){ return JOBS.find(j=>j.name===n); }
function statusCls(s){ return {可隔周上場:'pill-status-alt',固定候補:'pill-status-reserve',固定團:'pill-status-core',固定班底:'pill-status-core',一般成員:'pill-status-normal',候補:'pill-status-reserve',停賽:'pill-status-suspended',暫離:'pill-status-suspended'}[s]||'pill-status-normal'; }
// 玩家端「狀態」四個按鈕的說明文字，點哪個按鈕就顯示哪個的描述
const STATUS_DESC = {
  '可隔周上場':'我可以當周上場，下周休息，以此類推',
  '固定候補':'需要我上場時，我能隨時上場（每周自動列入候補名單）',
  '固定團':'我每周都能上場（每周自動列入出席名單，需手動點選請假）',
  '一般成員':'我每周都會手動點擊出席、候補或請假（未手動回報時，將列入未回覆名單內）',
};
// 管理端「成員管理」編輯視窗用的狀態說明（第三人稱，給管理員參考），對應狀態下拉選單的 5 個選項
const MEMBER_STATUS_DESC = {
  '可隔周上場':'這周上場、下周休息，以此類推；排表成員池會獨立分類，並依上週是否出賽提示反灰（俱樂部的「約戰」不適用反灰提醒）',
  '固定候補':'每週自動列入候補名單，並自動排入候補隊伍',
  '固定團':'每週自動列入出席名單，需手動點選請假',
  '一般成員':'每週需自行手動點擊出席、候補或請假；未回報則列入未回覆與催繳名單',
  '暫離':'僅管理端可設定：保留成員資料，但不列入報名催繳、不出現在排表成員池；成員回歸後改回其他狀態即可',
};

let _toastT;
function toast(msg, type=''){
  const el=document.getElementById('toast');
  el.textContent=msg; el.className='toast'+(type?' '+type:'');
  el.classList.remove('hidden');
  clearTimeout(_toastT);
  _toastT=setTimeout(()=>el.classList.add('hidden'),2600);
}
function openModal(id){ const el=document.getElementById(id); if(el) el.classList.remove('hidden'); else { console.error('找不到視窗:',id); toast('⚠️ 畫面元件缺失（'+id+'），請重新整理頁面','err'); } }
function closeModal(id){ const el=document.getElementById(id); if(el) el.classList.add('hidden'); }

// ============================================================
// MODE & ORG SELECTION（流程：選模式 → 選組織 → 登入）
// ============================================================
let _orgsFetched=false;
// 向後端取得組織清單並快取到本機（離線或後端失敗時就用快取）
async function fetchOrgs(){
  try{
    const res=await fetch(GS_URL,{
      method:'POST',
      headers:{'Content-Type':'text/plain;charset=utf-8'},
      body:JSON.stringify({action:'orgs'}),
    });
    const data=await res.json();
    if(data&&data.ok&&Array.isArray(data.orgs)&&data.orgs.length){
      setOrgList(data.orgs);
      _orgsFetched=true;
      return data.orgs;
    }
  }catch(err){ console.warn('取得組織清單失敗，使用本機快取:', err.message); }
  return orgList();
}

function selectMode(mode){
  CUR_MODE = mode;
  document.getElementById('screen-mode').classList.add('hidden');
  renderOrgScreen();
  document.getElementById('screen-org').classList.remove('hidden');
}

// 組織選擇畫面：列出該模式下的所有組織；清單還沒抓到時先顯示載入中並自動重試
function renderOrgScreen(){
  const tag=document.getElementById('org-mode-tag');
  if(tag){ tag.textContent=MODE_LABEL[CUR_MODE]; tag.className='mode-tag '+CUR_MODE; }
  const box=document.getElementById('org-cards');
  if(!box) return;
  const list=orgsByMode(CUR_MODE);
  if(!list.length){
    box.innerHTML='<p style="color:var(--txt3);text-align:center;padding:20px">'+(_orgsFetched
      ?'此模式目前沒有任何組織，請聯繫系統管理者於後端 ORGS 設定表新增'
      :'⏳ 正在載入組織清單...')+'</p>';
    if(!_orgsFetched) fetchOrgs().then(()=>{ if(CUR_MODE&&!document.getElementById('screen-org').classList.contains('hidden')) renderOrgScreen(); });
    return;
  }
  box.innerHTML=list.map(o=>`
    <div class="mode-card ${o.mode}" onclick="selectOrg('${o.id}')">
      <div class="mode-icon">${o.mode==='guild'?'🛡️':'🏛️'}</div>
      <h2>${o.name}</h2>
      <p>${MODE_LABEL[o.mode]}</p>
    </div>`).join('');
}

function selectOrg(orgId){
  const o=orgById(orgId);
  if(!o){ toast('找不到此組織，請重新整理','err'); return; }
  CUR_ORG=orgId;
  CUR_MODE=o.mode;
  document.getElementById('screen-org').classList.add('hidden');
  document.getElementById('screen-login').classList.remove('hidden');
  const tag=document.getElementById('login-mode-tag');
  tag.textContent = o.name+'・'+MODE_LABEL[o.mode];
  tag.className = 'mode-tag ' + o.mode;
  // 切換組織後重新初始化同步（讀取該組織的雲端資料）
  _loginSyncFirstTry=0;
  if(typeof syncInit==='function') syncInit();
}
function backToMode(){
  document.getElementById('screen-org').classList.add('hidden');
  document.getElementById('screen-login').classList.add('hidden');
  document.getElementById('screen-mode').classList.remove('hidden');
  CUR_MODE=''; CUR_ORG='';
}
function backToOrg(){
  document.getElementById('screen-login').classList.add('hidden');
  renderOrgScreen();
  document.getElementById('screen-org').classList.remove('hidden');
  CUR_ORG='';
  document.getElementById('player-name-input').value='';
  document.getElementById('admin-pw-input').value='';
}

// ============================================================
// AUTH
// ============================================================
let CUR_USER='', IS_ADMIN=false;

let _loginSyncFirstTry=0;
function loginSuggest(val){
  const box=document.getElementById('login-suggest-box');
  box.innerHTML='';
  const q=val.trim().toLowerCase();
  // 依名字去除重複（雲端可能因多裝置同時新增產生同名不同id的重複紀錄，
  // 資料本身可由管理端「清理重複成員」處理，這裡先保證登入畫面不會顯示兩次）
  const seen=new Set();
  const all=S.members().filter(m=>{ if(seen.has(m.name)) return false; seen.add(m.name); return true; })
    .sort((a,b)=>a.name.localeCompare(b.name,'zh-Hant'));
  // 全新裝置剛掃QR碼進來時，成員名單可能還在背景同步中，先給明確提示避免以為搜尋不到；
  // 但如果等太久（超過8秒）都還是空的，代表同步可能真的失敗了，改顯示錯誤+手動重試按鈕，
  // 不能讓「請稍候」的訊息無限期卡住，看不出真正的問題
  if(!all.length){
    // 同步網址已固定內建（gsync.js 的 GS_URL），一律走「等待同步」流程
    if(typeof GS_URL==='string' && GS_URL){
      if(!_loginSyncFirstTry) _loginSyncFirstTry=Date.now();
      const waited=Date.now()-_loginSyncFirstTry;
      if(waited<8000){
        box.innerHTML='<div class="suggest-item" style="color:var(--txt3);cursor:default">⏳ 正在同步成員名單，請稍候幾秒後再點一次...</div>';
        return;
      }
      const d=document.createElement('div');
      d.className='suggest-item';
      d.style.cssText='color:var(--bad);cursor:pointer;flex-direction:column;align-items:flex-start;gap:4px';
      d.innerHTML='⚠️ 同步逾時或失敗，成員名單抓不到<br><span style="color:var(--accent);text-decoration:underline">點我重試一次</span>';
      d.onclick=()=>{ retryLoginSync(); };
      box.appendChild(d);
      return;
    }
  }
  _loginSyncFirstTry=0;
  let hits;
  if(!q){
    // 空白時瀏覽全部成員清單（最多顯示50筆，可捲動），不用打字也能點選
    hits=all.slice(0,50);
    if(!hits.length) return;
  } else {
    const starts = all.filter(m=>m.name.toLowerCase().startsWith(q));
    const contains = all.filter(m=>!m.name.toLowerCase().startsWith(q) && m.name.toLowerCase().includes(q));
    hits = [...starts, ...contains].slice(0,8);
    if(!hits.length){
      box.innerHTML = `<div class="suggest-item" style="color:var(--txt3);cursor:default">找不到符合的角色，成員需由管理員新增後才能登入</div>`;
      return;
    }
  }
  // 頂端固定一列「收起清單」，手機上點它即可把下拉收合，露出下方的管理員登入
  const closeRow=document.createElement('div');
  closeRow.className='suggest-close';
  closeRow.innerHTML='<span>點選名稱登入，或按此收起清單 ✕</span>';
  closeRow.onmousedown=(e)=>{ e.preventDefault(); };
  closeRow.onclick=()=>{ hideLoginSuggest(); };
  box.appendChild(closeRow);
  hits.forEach(m=>{
    const job=jobById(m.jobId);
    const d=document.createElement('div');
    d.className='suggest-item';
    d.innerHTML=`<span style="width:8px;height:8px;border-radius:50%;background:${job.color};flex-shrink:0"></span><span>${m.name}</span><span style="margin-left:auto;font-size:11px;color:${job.color}">${job.name}</span>`;
    d.onclick=()=>{ document.getElementById('player-name-input').value=m.name; hideLoginSuggest(); };
    box.appendChild(d);
  });
}

// 收起登入下拉清單（把焦點移開輸入框，避免又被 onfocus 重新展開）
function hideLoginSuggest(){
  const b=document.getElementById('login-suggest-box');
  if(b) b.innerHTML='';
  const inp=document.getElementById('player-name-input');
  if(inp) inp.blur();
}

function playerLogin(){
  const name=document.getElementById('player-name-input').value.trim();
  if(!name){ toast('請輸入角色名稱','err'); return; }
  // 成員只能由管理端新增：登入名稱必須已存在於成員清單，防止玩家自行新增造成重複成員
  const all=S.members();
  if(!all.length){ toast('成員名單尚未同步完成，請稍候幾秒再試一次','err'); return; }
  if(!all.some(m=>m.name===name)){ toast('名單中找不到「'+name+'」，成員需由管理員新增後才能登入，請聯繫管理員','err'); return; }
  CUR_USER=name; IS_ADMIN=false;
  enterMain();
}
let _adminLoggingIn=false;
async function adminLogin(){
  const pw=document.getElementById('admin-pw-input').value;
  if(!pw){ toast('請輸入密碼','err'); return; }
  if(_adminLoggingIn) return; // 防止連點重複送出
  _adminLoggingIn=true;
  toast('驗證中...','');
  try{
    // 密碼改由 Apps Script 後端驗證（比對雜湊），前端程式碼不再存放密碼
    const res=await fetch(GS_URL,{
      method:'POST',
      headers:{'Content-Type':'text/plain;charset=utf-8'},
      body:JSON.stringify({action:'adminAuth',org:CUR_ORG,mode:CUR_MODE,pw:pw}),
    });
    const data=await res.json();
    if(data&&data.ok&&data.valid){
      CUR_USER='管理員'; IS_ADMIN=true;
      enterMain();
    } else if(data&&data.ok){
      toast('密碼錯誤','err');
    } else {
      toast('驗證服務異常，請稍後再試（後端可能尚未部署新版）','err');
    }
  }catch(err){
    toast('無法連線驗證伺服器，管理員登入需要網路連線','err');
  }finally{
    _adminLoggingIn=false;
  }
}
function logout(){
  clearSession();
  CUR_USER=''; IS_ADMIN=false; CUR_MODE=''; CUR_ORG='';
  document.getElementById('screen-main').classList.add('hidden');
  document.getElementById('screen-login').classList.add('hidden');
  document.getElementById('screen-org').classList.add('hidden');
  document.getElementById('screen-mode').classList.remove('hidden');
  document.getElementById('player-name-input').value='';
  document.getElementById('admin-pw-input').value='';
}
function enterMain(){
  document.getElementById('screen-mode').classList.add('hidden');
  const so=document.getElementById('screen-org'); if(so) so.classList.add('hidden');
  document.getElementById('screen-login').classList.add('hidden');
  document.getElementById('screen-main').classList.remove('hidden');
  const chip=document.getElementById('user-chip');
  chip.textContent=IS_ADMIN?('👑 '+CUR_USER):('🧑 '+CUR_USER);
  chip.className='user-chip '+(IS_ADMIN?'admin':'player');
  const mb=document.getElementById('topbar-mode-badge');
  mb.textContent=ORG_LABEL();
  mb.className='mode-badge '+CUR_MODE;
  document.getElementById('player-nav').classList.toggle('hidden', IS_ADMIN);
  document.getElementById('admin-nav').classList.toggle('hidden', !IS_ADMIN);
  const qrBtn=document.getElementById('topbar-qr-btn'); if(qrBtn) qrBtn.classList.toggle('hidden', !IS_ADMIN);
  const rfBtn=document.getElementById('topbar-refresh-btn'); if(rfBtn) rfBtn.classList.toggle('hidden', !IS_ADMIN);
  ['m-class','se-class'].forEach(id=>{
    const el=document.getElementById(id); if(!el)return;
    el.innerHTML='<option value="">選擇職業...</option>';
    JOBS.forEach(j=>{ const o=document.createElement('option'); o.value=j.id; o.textContent=j.name; el.appendChild(o); });
  });
  saveSession();
  if(IS_ADMIN){ switchTab('a-signup-mgr'); }
  else { switchTab('p-home'); }
  // 登入後自動從 Google 試算表載入最新資料
  setTimeout(()=>{ if(typeof syncInit==='function') syncInit(); }, 200);
}

// ============================================================
// TAB SWITCHING
// ============================================================
function switchTab(tab, btn){
  try{ localStorage.setItem('gw_session_tab', tab); }catch(_){}
  const nav=IS_ADMIN?document.getElementById('admin-nav'):document.getElementById('player-nav');
  nav.querySelectorAll('.nav-btn').forEach(b=>b.classList.remove('active'));
  if(btn) btn.classList.add('active');
  else { const b=nav.querySelector(`[data-tab="${tab}"]`); if(b) b.classList.add('active'); }
  document.querySelectorAll('.pane').forEach(p=>p.classList.add('hidden'));
  const pane=document.getElementById('pane-'+tab);
  if(pane){ pane.classList.remove('hidden'); renderPane(tab,pane); }
}
function renderPane(tab, pane){
  if(tab==='p-home')   renderPlayerHome(pane);
  if(tab==='p-signup') renderPlayerSignup(pane);
  if(tab==='p-lineup') renderPlayerLineup(pane);
  if(tab==='p-stats')  renderAdminStats(pane); // 玩家端數據分析：與管理端同一頁（僅讀取資料，無編輯功能）
  if(tab==='p-profile') renderPlayerProfile(pane);
  if(tab==='a-lineup') renderAdminLineup(pane);
  if(tab==='a-members') renderAdminMembers(pane);
  if(tab==='a-matches') renderAdminMatches(pane);
  if(tab==='a-stats')  renderAdminStats(pane);
  if(tab==='a-signup-mgr') renderAdminSignupMgr(pane);
  if(tab==='a-skills') renderAdminSkills(pane);
  if(tab==='p-score' && typeof renderPlayerScore==='function') renderPlayerScore(pane);
  if(tab==='a-scores' && typeof renderAdminScores==='function') renderAdminScores(pane);
  // 積分分頁只在啟用積分機制的組織顯示（白月燦星、白月梵星）
  if(typeof updateScoreTabsVisibility==='function') updateScoreTabsVisibility();
}

// 全域錯誤提示：任何未捕捉錯誤直接顯示，方便手機除錯
window.onerror=function(msg,src,line){
  try{ toast('⚠️ 錯誤：'+msg,'err'); }catch(_){ alert('錯誤：'+msg); }
  return false;
};

// ===== 工作階段保存：重新整理免重登、回到原分頁 =====
function saveSession(){
  try{ localStorage.setItem('gw_session', JSON.stringify({mode:CUR_MODE,org:CUR_ORG,user:CUR_USER,admin:IS_ADMIN})); }catch(_){}
}
function clearSession(){
  try{ localStorage.removeItem('gw_session'); localStorage.removeItem('gw_session_tab'); }catch(_){}
}
function retryLoginSync(){
  _loginSyncFirstTry=0;
  const box=document.getElementById('login-suggest-box');
  if(box) box.innerHTML='<div class="suggest-item" style="color:var(--txt3);cursor:default">⏳ 重新同步中...</div>';
  if(typeof syncLoad==='function'){
    // 用非靜默模式呼叫，這樣如果同步失敗，會直接跳出實際的錯誤訊息，方便排查問題
    syncLoad(false).then(()=>{
      const input=document.getElementById('player-name-input');
      loginSuggest(input?input.value:'');
    });
  }
}

document.addEventListener('DOMContentLoaded', ()=>{
  // 開機先在背景抓組織清單（成功會快取，離線則用上次快取）
  fetchOrgs().then(()=>{
    // 若使用者已停在組織選擇畫面，抓到清單後刷新它
    const sc=document.getElementById('screen-org');
    if(sc&&!sc.classList.contains('hidden')) renderOrgScreen();
  });
  try{
    const s=JSON.parse(localStorage.getItem('gw_session')||'null');
    if(s&&s.mode&&s.user){
      CUR_MODE=s.mode; CUR_ORG=s.org||''; CUR_USER=s.user; IS_ADMIN=!!s.admin;
      enterMain();
      const tab=localStorage.getItem('gw_session_tab');
      if(tab) setTimeout(()=>{ try{ switchTab(tab); }catch(_){} }, 50);
      return;
    }
  }catch(_){}
  // 沒有登入中的工作階段時，檢查網址參數（QR碼分享連結用）是否指定模式與組織，
  // 若有則直接跳過選擇畫面，讓掃碼的成員直接看到登入頁
  try{
    const params=new URLSearchParams(location.search);
    const qm=params.get('mode');
    const qorg=params.get('org');
    if(qorg){
      // 網址直接指定組織：等組織清單抓到後直接進入該組織的登入頁
      const go=()=>{ const o=orgById(qorg); if(o){ document.getElementById('screen-mode').classList.add('hidden'); selectOrg(qorg); } };
      if(orgById(qorg)) go();
      else fetchOrgs().then(go);
    } else if(qm==='club'||qm==='guild'){
      // 只指定模式（舊QR碼相容）：進入該模式的組織選擇畫面；若該模式只有一個組織就直接進登入頁
      const go=()=>{
        const list=orgsByMode(qm);
        if(list.length===1){ document.getElementById('screen-mode').classList.add('hidden'); selectOrg(list[0].id); }
        else selectMode(qm);
      };
      if(orgList().length) go(); else fetchOrgs().then(go);
    }
  }catch(_){}
});
