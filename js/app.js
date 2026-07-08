// ============================================================
// UTILS
// ============================================================
function uid(){ return Date.now().toString(36)+Math.random().toString(36).slice(2,6); }
function fmtDate(d){ if(!d)return''; const dt=new Date(d); return `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')}`; }
function jobById(id){ return JOBS.find(j=>j.id===id)||{name:id,color:'#8892b0'}; }
function jobByName(n){ return JOBS.find(j=>j.name===n); }
function statusCls(s){ return {固定團:'pill-status-core',固定班底:'pill-status-core',一般成員:'pill-status-normal',候補:'pill-status-reserve',停賽:'pill-status-suspended'}[s]||'pill-status-normal'; }

let _toastT;
function toast(msg, type=''){
  const el=document.getElementById('toast');
  el.textContent=msg; el.className='toast'+(type?' '+type:'');
  el.classList.remove('hidden');
  clearTimeout(_toastT);
  _toastT=setTimeout(()=>el.classList.add('hidden'),2600);
}
function openModal(id){ document.getElementById(id).classList.remove('hidden'); }
function closeModal(id){ document.getElementById(id).classList.add('hidden'); }

// ============================================================
// MODE SELECTION
// ============================================================
function selectMode(mode){
  CUR_MODE = mode;
  document.getElementById('screen-mode').classList.add('hidden');
  document.getElementById('screen-login').classList.remove('hidden');
  const tag=document.getElementById('login-mode-tag');
  tag.textContent = MODE_LABEL[mode];
  tag.className = 'mode-tag ' + mode;
}
function backToMode(){
  document.getElementById('screen-login').classList.add('hidden');
  document.getElementById('screen-mode').classList.remove('hidden');
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
  const all=S.members().slice().sort((a,b)=>a.name.localeCompare(b.name,'zh-Hant'));
  // 全新裝置剛掃QR碼進來時，成員名單可能還在背景同步中，先給明確提示避免以為搜尋不到；
  // 但如果等太久（超過8秒）都還是空的，代表同步可能真的失敗了，改顯示錯誤+手動重試按鈕，
  // 不能讓「請稍候」的訊息無限期卡住，看不出真正的問題
  if(!all.length){
    const cfg=S.config();
    if(cfg && cfg.gsWebhook){
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
      box.innerHTML = `<div class="suggest-item" style="color:var(--txt3);cursor:default">找不到符合的角色，可直接輸入完整名稱</div>`;
      return;
    }
  }
  hits.forEach(m=>{
    const job=jobById(m.jobId);
    const d=document.createElement('div');
    d.className='suggest-item';
    d.innerHTML=`<span style="width:8px;height:8px;border-radius:50%;background:${job.color};flex-shrink:0"></span><span>${m.name}</span><span style="margin-left:auto;font-size:11px;color:${job.color}">${job.name}</span>`;
    d.onclick=()=>{ document.getElementById('player-name-input').value=m.name; box.innerHTML=''; };
    box.appendChild(d);
  });
}

function playerLogin(){
  const name=document.getElementById('player-name-input').value.trim();
  if(!name){ toast('請輸入角色名稱','err'); return; }
  CUR_USER=name; IS_ADMIN=false;
  enterMain();
}
function adminLogin(){
  const pw=document.getElementById('admin-pw-input').value;
  if(pw!==ADMIN_PW){ toast('密碼錯誤','err'); return; }
  CUR_USER='管理員'; IS_ADMIN=true;
  enterMain();
}
function logout(){
  clearSession();
  CUR_USER=''; IS_ADMIN=false; CUR_MODE='';
  document.getElementById('screen-main').classList.add('hidden');
  document.getElementById('screen-login').classList.add('hidden');
  document.getElementById('screen-mode').classList.remove('hidden');
  document.getElementById('player-name-input').value='';
  document.getElementById('admin-pw-input').value='';
}
function enterMain(){
  document.getElementById('screen-mode').classList.add('hidden');
  document.getElementById('screen-login').classList.add('hidden');
  document.getElementById('screen-main').classList.remove('hidden');
  const chip=document.getElementById('user-chip');
  chip.textContent=IS_ADMIN?('👑 '+CUR_USER):('🧑 '+CUR_USER);
  chip.className='user-chip '+(IS_ADMIN?'admin':'player');
  const mb=document.getElementById('topbar-mode-badge');
  mb.textContent=MODE_LABEL[CUR_MODE];
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
  if(tab==='p-profile') renderPlayerProfile(pane);
  if(tab==='a-lineup') renderAdminLineup(pane);
  if(tab==='a-members') renderAdminMembers(pane);
  if(tab==='a-matches') renderAdminMatches(pane);
  if(tab==='a-stats')  renderAdminStats(pane);
  if(tab==='a-signup-mgr') renderAdminSignupMgr(pane);
  if(tab==='a-skills') renderAdminSkills(pane);
}

// 全域錯誤提示：任何未捕捉錯誤直接顯示，方便手機除錯
window.onerror=function(msg,src,line){
  try{ toast('⚠️ 錯誤：'+msg,'err'); }catch(_){ alert('錯誤：'+msg); }
  return false;
};

// ===== 工作階段保存：重新整理免重登、回到原分頁 =====
function saveSession(){
  try{ localStorage.setItem('gw_session', JSON.stringify({mode:CUR_MODE,user:CUR_USER,admin:IS_ADMIN})); }catch(_){}
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
  try{
    const s=JSON.parse(localStorage.getItem('gw_session')||'null');
    if(s&&s.mode&&s.user){
      CUR_MODE=s.mode; CUR_USER=s.user; IS_ADMIN=!!s.admin;
      enterMain();
      const tab=localStorage.getItem('gw_session_tab');
      if(tab) setTimeout(()=>{ try{ switchTab(tab); }catch(_){} }, 50);
      return;
    }
  }catch(_){}
  // 沒有登入中的工作階段時，檢查網址參數（QR碼分享連結用）是否指定模式，
  // 若有則直接跳過「選擇模式」畫面，讓掃碼的成員直接看到登入頁
  try{
    const params=new URLSearchParams(location.search);
    const qm=params.get('mode');
    const qgs=params.get('gs');
    // QR碼裡若帶有雲端同步網址，代表這是全新裝置也要一併同步成員名單，
    // 這樣登入頁的關鍵字搜尋才找得到人，不用先手動進管理端設定同步
    if(qgs){
      try{
        const cfg=S.config();
        if(cfg.gsWebhook!==qgs) S.setConfig({...cfg, gsWebhook:qgs});
      }catch(_){}
    }
    if(qm==='club'||qm==='guild'){
      selectMode(qm);
      // 立即在背景同步該模式的成員名單，讓登入頁的搜尋框可以馬上找到人
      setTimeout(()=>{ if(typeof syncInit==='function') syncInit(); }, 50);
    }
  }catch(_){}
});
