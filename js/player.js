// ============================================================
// PLAYER: HOME
// ============================================================
function calcMyAttendance(){
  // 出席率 = 實際比賽紀錄出現次數 ÷ 原先報名出席的場次數
  const matches=S.matches();
  const signups=S.signups();
  const events=S.events();
  const played=matches.filter(m=>(m.participants||[]).includes(CUR_USER)).length;
  let signedUp=0;
  events.forEach(ev=>{
    if((signups[ev.id]||{})[CUR_USER]==='attend') signedUp++;
  });
  const rate=signedUp>0?Math.round(played/signedUp*100):null;
  return {played, signedUp, rate};
}

function renderPlayerHome(pane){
  const me=S.members().find(m=>m.name===CUR_USER);
  const events=S.events().slice().sort((a,b)=>(b.date||'').localeCompare(a.date||''));
  const latestEvent=events[0];
  const signups=S.signups();
  const a=calcMyAttendance();

  let profileHtml='';
  if(me){
    const job=jobById(me.jobId);
    profileHtml=`<div class="my-profile">
      <div class="my-profile-head">
        <div class="my-avatar" style="background:${job.color}">${job.name.charAt(0)}</div>
        <div><div class="my-name">${me.name}</div><div class="my-job">${job.name} ／ ${me.team||'未分配'}</div></div>
        <div style="margin-left:auto"><button class="btn btn-outline sm" onclick="openSelfEdit()">✏️ 編輯</button></div>
      </div>
      <div class="my-stat-row">
        <div class="my-stat" onclick="openMyHistory()" style="cursor:pointer" title="點擊查看歷史紀錄"><div class="my-stat-n">${a.played}</div><div class="my-stat-l">出席次數 ▸</div></div>
        <div class="my-stat"><div class="my-stat-n" style="color:var(--ok)">${a.rate===null?'—':a.rate+'%'}</div><div class="my-stat-l">出席率</div></div>
      </div>
      <div class="fg"><label>已滿等絕技</label><div class="skill-list">${(me.skills||[]).length?me.skills.map(s=>`<span class="skill-chip active">${s}</span>`).join(''):'<span style="color:var(--txt3);font-size:12px">尚未設定</span>'}</div></div>
      <div class="fg" style="margin-top:10px"><label>常用群俠技能</label><div class="skill-list">${(me.baijia||[]).length?me.baijia.map(s=>`<span class="skill-chip">${s}</span>`).join(''):'<span style="color:var(--txt3);font-size:12px">尚未設定</span>'}</div></div>
    </div>`;
  } else {
    profileHtml=`<div class="card" style="text-align:center;padding:20px">
      <p style="color:var(--txt2);margin-bottom:10px">找不到你的角色資料，請聯繫管理員加入，或先填寫基本資料</p>
      <button class="btn btn-blue sm" onclick="openSelfEdit()">填寫我的資料</button>
    </div>`;
  }

  let nextEvent='';
  if(latestEvent){
    const myStatus=(signups[latestEvent.id]||{})[CUR_USER]||null;
    const cnt=Object.values(signups[latestEvent.id]||{}).filter(v=>v==='attend').length;
    const statusLabel={attend:'✅ 已報名出席',absent:'❌ 已請假',maybe:'❓ 待定'}[myStatus]||'尚未回覆';
    nextEvent=`<div class="card">
      <div style="font-size:11px;color:var(--txt3);margin-bottom:4px">最新活動（${MODE_LABEL[CUR_MODE]}）</div>
      <div style="font-size:15px;font-weight:700;margin-bottom:4px">${latestEvent.name}</div>
      <div style="font-size:12px;color:var(--txt2);margin-bottom:10px">📅 ${latestEvent.date||''} ／ 目前 ${cnt} 人出席</div>
      <div style="margin-bottom:8px;font-size:13px;font-weight:600">我的狀態：<span style="color:var(--accent)">${statusLabel}</span></div>
      <div style="display:flex;gap:8px">
        <button class="sbtn sbtn-ok ${myStatus==='attend'?'sel':''}" onclick="quickSignup('${latestEvent.id}','attend')">✅ 出席</button>
        <button class="sbtn sbtn-mb ${myStatus==='maybe'?'sel':''}" onclick="quickSignup('${latestEvent.id}','maybe')">❓ 待定</button>
        <button class="sbtn sbtn-no ${myStatus==='absent'?'sel':''}" onclick="quickSignup('${latestEvent.id}','absent')">🌙 請假</button>
      </div>
    </div>`;
  }

  pane.innerHTML=`<div class="sec-head"><h2>👋 歡迎，${CUR_USER}</h2></div>${profileHtml}${nextEvent}`;
}

// ============================================================
// 我的歷史紀錄（活動時間 + 比賽紀錄列表）
// ============================================================
function openMyHistory(){
  const matches=S.matches().slice().sort((a,b)=>(b.date||'').localeCompare(a.date||''));
  const events=S.events().slice().sort((a,b)=>(b.date||'').localeCompare(a.date||''));
  const signups=S.signups();

  const myMatches=matches.filter(m=>(m.participants||[]).includes(CUR_USER));
  const mySignups=events.filter(ev=>(signups[ev.id]||{})[CUR_USER]==='attend');

  // 我在排表中的位置紀錄
  const myLineups=[];
  events.forEach(ev=>{
    if(!ev.teams) return;
    Object.entries(ev.teams).forEach(([k,arr])=>{
      if(!Array.isArray(arr)||!arr.includes(CUR_USER)) return;
      let teamLabel='候補';
      if(k!=='reserve'&&ev.teamNames){
        const m2=k.match(/^t(\d+)_sq(\d+)$/);
        if(m2) teamLabel=(ev.teamNames[+m2[1]]||'?')+'-'+(+m2[2]+1)+'隊';
      }
      const role=(ev.roles||{})[CUR_USER];
      myLineups.push({name:ev.name,date:ev.date||'',team:teamLabel,role:role==='cannon'?'🎯砲手':role==='cmd'?'⭐指揮':''});
    });
  });

  const body=document.getElementById('history-body');
  body.innerHTML=`
    <h4 style="margin-bottom:6px">🎮 比賽紀錄（${myMatches.length} 場）</h4>
    ${myMatches.length?myMatches.map(m=>{
      const p=(m.players||[]).find(pl=>pl.name===CUR_USER&&pl.camp==='我方');
      return `<div class="hist-item">
        <span class="hist-date">${m.date||''}</span>
        <span>vs ${m.enemy||'?'}</span>
        <span class="hist-result ${m.result==='勝利'?'ok':'bad'}">${m.result||''}</span>
        ${p?`<div class="hist-stats">擊敗${p.kills||0}／助攻${p.assist||0}／傷害${fmtNum(p.pDamage||0)}</div>`:''}
      </div>`;
    }).join(''):'<p class="hint">尚無比賽紀錄</p>'}
    <h4 style="margin:12px 0 6px">📋 排表紀錄（${myLineups.length} 次）</h4>
    ${myLineups.length?myLineups.map(l=>`<div class="hist-item"><span class="hist-date">${l.date}</span><span>${l.name}</span><span style="color:var(--accent)">${l.team} ${l.role}</span></div>`).join(''):'<p class="hint">尚無排表紀錄</p>'}
    <h4 style="margin:12px 0 6px">✋ 報名紀錄（${mySignups.length} 次）</h4>
    ${mySignups.length?mySignups.map(ev=>`<div class="hist-item"><span class="hist-date">${ev.date||''}</span><span>${ev.name}</span></div>`).join(''):'<p class="hint">尚無報名紀錄</p>'}
  `;
  openModal('modal-history');
}

function fmtNum(n){
  if(n>=100000000) return (n/100000000).toFixed(1)+'億';
  if(n>=10000) return (n/10000).toFixed(0)+'萬';
  return String(n);
}

function quickSignup(evId, status){
  const signups=S.signups();
  if(!signups[evId]) signups[evId]={};
  const prev=signups[evId][CUR_USER];
  if(prev===status){ delete signups[evId][CUR_USER]; }
  else { signups[evId][CUR_USER]=status; }
  S.setSignups(signups);
  const labels={attend:'已報名出席',absent:'已登記請假',maybe:'已登記待定'};
  toast(prev===status?'已取消':labels[status],'ok');
  renderPane('p-home',document.getElementById('pane-p-home'));
}

// ============================================================
// PLAYER: SIGNUP
// ============================================================
function renderPlayerSignup(pane){
  const events=S.events().slice().sort((a,b)=>(b.date||'').localeCompare(a.date||'')).slice(0,10);
  const signups=S.signups();
  if(!events.length){ pane.innerHTML='<div class="empty"><div class="empty-ico">📅</div><p>目前沒有活動</p></div>'; return; }
  pane.innerHTML=`<div class="sec-head"><h2>✋ 活動報名</h2></div>`+events.map(ev=>{
    const evS=signups[ev.id]||{};
    const my=evS[CUR_USER]||null;
    const att=Object.entries(evS).filter(([,v])=>v==='attend').map(([n])=>n);
    const abs=Object.entries(evS).filter(([,v])=>v==='absent').length;
    const mb=Object.entries(evS).filter(([,v])=>v==='maybe').length;
    return `<div class="signup-card">
      <div class="signup-title">${ev.name}</div>
      <div class="signup-meta">📅 ${ev.date||''} ／ ${ev.type||''}</div>
      <div class="signup-opts">
        <button class="sbtn sbtn-ok ${my==='attend'?'sel':''}" onclick="doSignup('${ev.id}','attend')">✅ 出席</button>
        <button class="sbtn sbtn-mb ${my==='maybe'?'sel':''}" onclick="doSignup('${ev.id}','maybe')">❓ 待定</button>
        <button class="sbtn sbtn-no ${my==='absent'?'sel':''}" onclick="doSignup('${ev.id}','absent')">🌙 請假</button>
      </div>
      <div class="signup-cnt">✅ 出席 <strong>${att.length}</strong> ／ ❓ 待定 <strong>${mb}</strong> ／ 🌙 請假 <strong>${abs}</strong></div>
      ${att.length?`<div class="att-list">${att.map(n=>`<span class="att-tag">${n}</span>`).join('')}</div>`:''}
    </div>`;
  }).join('');
}
function doSignup(evId,status){
  const s=S.signups();
  if(!s[evId])s[evId]={};
  const prev=s[evId][CUR_USER];
  if(prev===status){delete s[evId][CUR_USER];}else{s[evId][CUR_USER]=status;}
  S.setSignups(s);
  toast(prev===status?'已取消報名':{attend:'已報名出席',absent:'已登記請假',maybe:'已登記待定'}[status],'ok');
  renderPane('p-signup',document.getElementById('pane-p-signup'));
}

// ============================================================
// PLAYER: PROFILE
// ============================================================
function renderPlayerProfile(pane){
  const me=S.members().find(m=>m.name===CUR_USER);
  const a=calcMyAttendance();
  if(!me){
    pane.innerHTML=`<div class="sec-head"><h2>👤 我的資料</h2></div>
      <div class="card" style="text-align:center;padding:24px">
        <p style="color:var(--txt2);margin-bottom:12px">你的角色「${CUR_USER}」尚未在成員名單中，<br>請聯繫管理員加入或自行填寫基本資料</p>
        <button class="btn btn-blue" onclick="openSelfEdit()">填寫基本資料</button>
      </div>`;
    return;
  }
  const job=jobById(me.jobId);
  pane.innerHTML=`<div class="sec-head"><h2>👤 我的資料</h2><button class="btn btn-blue sm" onclick="openSelfEdit()">✏️ 編輯</button></div>
    <div class="my-profile">
      <div class="my-profile-head">
        <div class="my-avatar" style="background:${job.color}">${job.name.charAt(0)}</div>
        <div><div class="my-name">${me.name}</div><div class="my-job">${job.name} ／ ${me.team||'未分配'} ／ <span class="pill ${statusCls(me.status)}">${me.status||''}</span></div></div>
      </div>
      <div class="my-stat-row">
        <div class="my-stat" onclick="openMyHistory()" style="cursor:pointer"><div class="my-stat-n">${a.played}</div><div class="my-stat-l">出席次數 ▸</div></div>
        <div class="my-stat"><div class="my-stat-n" style="color:var(--ok)">${a.rate===null?'—':a.rate+'%'}</div><div class="my-stat-l">出席率</div></div>
      </div>
      <div class="fg" style="margin-bottom:10px"><label>已滿等絕技</label><div class="skill-list">${(me.skills||[]).map(s=>`<span class="skill-chip active">${s}</span>`).join('')||'<span style="color:var(--txt3);font-size:12px">尚未設定</span>'}</div></div>
      <div class="fg"><label>常用群俠技能</label><div class="skill-list">${(me.baijia||[]).map(s=>`<span class="skill-chip">${s}</span>`).join('')||'<span style="color:var(--tx3);font-size:12px">尚未設定</span>'}</div></div>
      ${me.note?`<div class="fg" style="margin-top:10px"><label>備註</label><span style="font-size:13px;color:var(--txt2)">${me.note}</span></div>`:''}
    </div>`;
}

// Self edit (player can only pick from admin-managed lists)
function openSelfEdit(){
  const me=S.members().find(m=>m.name===CUR_USER);
  document.getElementById('se-class').value=me?.jobId||'';
  renderTagSel('se-skills-tags', S.skillList(), me?.skills||[]);
  renderTagSel('se-baijia-tags', S.baijiaList(), me?.baijia||[]);
  openModal('modal-self-edit');
}
function selfEditClassChange(){}
function saveSelfEdit(){
  const jobId=document.getElementById('se-class').value;
  const skills=getSelectedTags('se-skills-tags');
  const baijia=getSelectedTags('se-baijia-tags');
  let members=S.members();
  const idx=members.findIndex(m=>m.name===CUR_USER);
  if(idx>=0){ members[idx]={...members[idx],jobId,skills,baijia}; }
  else { members.push({id:uid(),name:CUR_USER,jobId,team:'候補',status:'一般成員',skills,baijia,note:'',createdAt:Date.now()}); }
  S.setMembers(members);
  closeModal('modal-self-edit');
  toast('資料已更新','ok');
  const active=document.querySelector('.nav-btn.active');
  if(active) renderPane(active.dataset.tab, document.getElementById('pane-'+active.dataset.tab));
}
