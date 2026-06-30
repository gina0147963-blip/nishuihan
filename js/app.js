// ============================================================
// UTILS
// ============================================================
function uid(){ return Date.now().toString(36)+Math.random().toString(36).slice(2,6); }
function fmtDate(d){ if(!d)return''; const dt=new Date(d); return `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')}`; }
function jobById(id){ return JOBS.find(j=>j.id===id)||{name:id,color:'#8892b0'}; }
function jobByName(n){ return JOBS.find(j=>j.name===n); }
function statusCls(s){ return {固定班底:'pill-status-core',一般成員:'pill-status-normal',候補:'pill-status-reserve',停賽:'pill-status-suspended'}[s]||'pill-status-normal'; }

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
  document.getElementById('admin-name-input').value='';
}

// ============================================================
// AUTH
// ============================================================
let CUR_USER='', IS_ADMIN=false;

function loginSuggest(val){
  const box=document.getElementById('login-suggest-box');
  box.innerHTML='';
  if(!val.trim())return;
  const hits=S.members().filter(m=>m.name.toLowerCase().includes(val.toLowerCase())).slice(0,6);
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
  const name=(document.getElementById('admin-name-input').value.trim())||'管理員';
  CUR_USER=name; IS_ADMIN=true;
  enterMain();
}
function logout(){
  CUR_USER=''; IS_ADMIN=false; CUR_MODE='';
  document.getElementById('screen-main').classList.add('hidden');
  document.getElementById('screen-login').classList.add('hidden');
  document.getElementById('screen-mode').classList.remove('hidden');
  document.getElementById('player-name-input').value='';
  document.getElementById('admin-pw-input').value='';
  document.getElementById('admin-name-input').value='';
}
function enterMain(){
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
  ['m-class','se-class'].forEach(id=>{
    const el=document.getElementById(id); if(!el)return;
    el.innerHTML='<option value="">選擇職業...</option>';
    JOBS.forEach(j=>{ const o=document.createElement('option'); o.value=j.id; o.textContent=j.name; el.appendChild(o); });
  });
  if(IS_ADMIN){ switchTab('a-lineup'); }
  else { switchTab('p-home'); }
}

// ============================================================
// TAB SWITCHING
// ============================================================
function switchTab(tab, btn){
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
