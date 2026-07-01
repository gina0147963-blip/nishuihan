// ============================================================
// PLAYER: HOME
// ============================================================
function renderPlayerHome(pane){
  const me=S.members().find(m=>m.name===CUR_USER);
  const events=S.events().slice().reverse();
  const latestEvent=events[0];
  const signups=S.signups();
  const matches=S.matches();
  const att=matches.filter(m=>(m.participants||[]).includes(CUR_USER)).length;

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
        <div class="my-stat"><div class="my-stat-n">${att}</div><div class="my-stat-l">出席次數（${MODE_LABEL[CUR_MODE]}）</div></div>
        <div class="my-stat"><div class="my-stat-n" style="color:var(--ok)">${(me.skills||[]).length+(me.baijia||[]).length}</div><div class="my-stat-l">技能數</div></div>
      </div>
      <div class="fg"><label>絕技</label><div class="skill-list">${(me.skills||[]).length?me.skills.map(s=>`<span class="skill-chip active">${s}</span>`).join(''):'<span style="color:var(--txt3);font-size:12px">尚未設定</span>'}</div></div>
      <div class="fg" style="margin-top:10px"><label>群俠技能</label><div class="skill-list">${(me.baijia||[]).length?me.baijia.map(s=>`<span class="skill-chip">${s}</span>`).join(''):'<span style="color:var(--txt3);font-size:12px">尚未設定</span>'}</div></div>
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
    const statusLabel={attend:'✅ 已報名出席',absent:'❌ 已登記缺席',maybe:'❓ 待定'}[myStatus]||'尚未回覆';
    nextEvent=`<div class="card">
      <div style="font-size:11px;color:var(--txt3);margin-bottom:4px">最新活動（${MODE_LABEL[CUR_MODE]}）</div>
      <div style="font-size:15px;font-weight:700;margin-bottom:4px">${latestEvent.name}</div>
      <div style="font-size:12px;color:var(--txt2);margin-bottom:10px">📅 ${latestEvent.date||''} ／ 目前 ${cnt} 人出席</div>
      <div style="margin-bottom:8px;font-size:13px;font-weight:600">我的狀態：<span style="color:var(--accent)">${statusLabel}</span></div>
      <div style="display:flex;gap:8px">
        <button class="sbtn sbtn-ok ${myStatus==='attend'?'sel':''}" onclick="quickSignup('${latestEvent.id}','attend')">✅ 出席</button>
        <button class="sbtn sbtn-mb ${myStatus==='maybe'?'sel':''}" onclick="quickSignup('${latestEvent.id}','maybe')">❓ 待定</button>
        <button class="sbtn sbtn-no ${myStatus==='absent'?'sel':''}" onclick="quickSignup('${latestEvent.id}','absent')">❌ 缺席</button>
      </div>
    </div>`;
  }

  pane.innerHTML=`<div class="sec-head"><h2>👋 歡迎，${CUR_USER}</h2></div>${profileHtml}${nextEvent}`;
}
function quickSignup(evId, status){
  const signups=S.signups();
  if(!signups[evId]) signups[evId]={};
  const prev=signups[evId][CUR_USER];
  if(prev===status){ delete signups[evId][CUR_USER]; }
  else { signups[evId][CUR_USER]=status; }
  S.setSignups(signups);
  const labels={attend:'已報名出席',absent:'已登記缺席',maybe:'已登記待定'};
  toast(prev===status?'已取消':labels[status],'ok');
  renderPane('p-home',document.getElementById('pane-p-home'));
}

// ============================================================
// PLAYER: SIGNUP
// ============================================================
function renderPlayerSignup(pane){
  const events=S.events().slice().reverse().slice(0,10);
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
        <button class="sbtn sbtn-no ${my==='absent'?'sel':''}" onclick="doSignup('${ev.id}','absent')">❌ 缺席</button>
      </div>
      <div class="signup-cnt">✅ 出席 <strong>${att.length}</strong> ／ ❓ 待定 <strong>${mb}</strong> ／ ❌ 缺席 <strong>${abs}</strong></div>
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
  toast(prev===status?'已取消報名':{attend:'已報名出席',absent:'已登記缺席',maybe:'已登記待定'}[status],'ok');
  renderPane('p-signup',document.getElementById('pane-p-signup'));
}

// ============================================================
// PLAYER: VIEW LINEUP
// ============================================================
function renderPlayerLineup(pane){
  const events=S.events().slice().reverse();
  if(!events.length){ pane.innerHTML='<div class="empty"><div class="empty-ico">📋</div><p>尚無排表</p></div>'; return; }
  const latestEv=events[0];
  const members=S.members();
  const teamHtml=TEAMS.map(t=>{
    const names=(latestEv.teams||{})[t.id]||[];
    if(!names.length)return'';
    const roles=(latestEv.roles||{});
    return `<div class="team-block">
      <div class="team-hd"><div class="team-label"><span class="team-badge ${t.cls}">${t.name}</span><span class="team-cnt">${names.length} 人</span></div></div>
      <div class="team-cards">${names.map(name=>playerCardHTML(name,members,t,false,'team',roles[name])).join('')}</div>
    </div>`;
  }).join('');
  pane.innerHTML=`<div class="sec-head"><h2>📋 本週排表</h2><span style="font-size:13px;color:var(--txt2)">${latestEv.name}</span></div>
    ${buildSummaryBar(latestEv,members)}
    <div class="lineup-board">${teamHtml||'<div class="empty"><div class="empty-ico">🗡️</div><p>尚未排表</p></div>'}</div>`;
}

// ============================================================
// PLAYER: PROFILE
// ============================================================
function renderPlayerProfile(pane){
  const me=S.members().find(m=>m.name===CUR_USER);
  const matches=S.matches();
  const att=matches.filter(m=>(m.participants||[]).includes(CUR_USER)).length;
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
        <div class="my-stat"><div class="my-stat-n">${att}</div><div class="my-stat-l">出席次數（${MODE_LABEL[CUR_MODE]}）</div></div>
      </div>
      <div class="fg" style="margin-bottom:10px"><label>絕技</label><div class="skill-list">${(me.skills||[]).map(s=>`<span class="skill-chip active">${s}</span>`).join('')||'<span style="color:var(--txt3);font-size:12px">尚未設定</span>'}</div></div>
      <div class="fg"><label>群俠技能</label><div class="skill-list">${(me.baijia||[]).map(s=>`<span class="skill-chip">${s}</span>`).join('')||'<span style="color:var(--txt3);font-size:12px">尚未設定</span>'}</div></div>
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
function selfEditClassChange(){
  // Skill list is shared/global, not job-specific, per latest spec — keep as-is.
}
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
