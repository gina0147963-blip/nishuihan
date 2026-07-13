// ============================================================
// PLAYER: HOME
// ============================================================
function calcMyAttendance(){
  // 出席率算法與管理端「成員管理」的 _attRate 完全一致：
  //   分母 = 有「報名出席」且「當天已有比賽紀錄」的場次數
  //   分子 = 上述場次中，比賽紀錄實際也有出現的場次數
  //   沒報名卻被排上場打的場次，不算進出席率（但算進出場次數）
  //   尚無比賽紀錄的場次（未來活動、或還沒上傳紀錄）先不計入
  const matches=S.matches();
  const events=S.events();
  const signups=S.signups();
  const me=S.members().find(m=>m.name===CUR_USER);
  const myNames=new Set([CUR_USER,...(me&&me.aliases||[])]);
  let signedUp=0, played=0;
  events.forEach(ev=>{
    const evS=signups[ev.id]||{};
    let signedAttend=false; myNames.forEach(a=>{ if(evS[a]==='attend') signedAttend=true; });
    if(!signedAttend) return; // 只計算「有報名出席」的場次
    const day=matches.filter(mm=>String(mm.date||'').slice(0,10)===String(ev.date||'').slice(0,10));
    if(!day.length) return;   // 當天還沒有比賽紀錄 → 先不計入
    signedUp++;
    let didPlay=false; day.forEach(mm=>(mm.participants||[]).forEach(n=>{ if(myNames.has(n)) didPlay=true; }));
    if(didPlay) played++;
  });
  // 出場次數：比賽紀錄中實際出現的總場次（不論有無報名）
  let totalPlayed=0;
  matches.forEach(mm=>{ if((mm.participants||[]).some(n=>myNames.has(n))) totalPlayed++; });
  const rate=signedUp>0?Math.round(played/signedUp*100):null;
  return {played, signedUp, totalPlayed, rate};
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
    const curStatus=me.status||'一般成員';
    const nextStatus=curStatus==='固定團'?'一般成員':'固定團';
    profileHtml=`<div class="my-profile">
      <div class="my-profile-head">
        <div class="my-avatar" style="background:${job.color}">${job.img?`<img class="jimg" src="icons/jobs/${job.id}.png" alt="">`:(job.icon||job.name.charAt(0))}</div>
        <div><div class="my-name">${me.name}</div><div class="my-job">${job.name}</div></div>
        <div style="margin-left:auto"><button class="btn btn-outline" onclick="openSelfEdit()" style="font-size:15px;padding:10px 18px">✏️ 編輯</button></div>
      </div>
      <div class="my-stat-row">
        <div class="my-stat" onclick="openMyHistory()" style="cursor:pointer" title="點擊查看歷史紀錄"><div class="my-stat-n">${a.totalPlayed}</div><div class="my-stat-l">出場次數 ▸</div></div>
        <div class="my-stat"><div class="my-stat-n" style="color:var(--ok)">${a.rate===null?'—':a.rate+'%'}</div><div class="my-stat-l">出席率</div></div>
      </div>
      <div class="fg" style="margin-top:10px;padding-top:10px;border-top:1px dashed var(--border)">
        <label>固定團狀態</label>
        <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-top:2px">
          <span class="pill ${statusCls(curStatus)}">${curStatus}</span>
          <button class="btn btn-outline" onclick="togglePlayerFixedStatus()" style="font-size:15px;padding:10px 18px">切換為「${nextStatus}」</button>
        </div>
        <p class="hint" style="margin-top:6px">設為「固定團」後，管理員可在「排表系統」的固定團編輯功能中把你排入固定隊伍；之後若你改回「一般成員」，就會從固定團名單中移除，管理員之後匯入/編輯固定團時就看不到你了（已經排好的場次排表不會自動變動，需要管理員手動調整）。</p>
      </div>
      <div class="fg" style="margin-top:10px"><label>已滿等絕技</label><div class="skill-list">${(me.skills||[]).length?me.skills.map(s=>`<span class="skill-chip active">${s}</span>`).join(''):'<span style="color:var(--txt3);font-size:12px">尚未設定</span>'}</div></div>
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
    const locked=_isLocked(latestEvent.id);
    nextEvent=`<div class="card">
      <div style="font-size:11px;color:var(--txt3);margin-bottom:4px">最新活動（${ORG_LABEL()}）</div>
      ${evTitleHtml(latestEvent)}
      <div style="font-size:12px;color:var(--txt2);margin-bottom:10px">📅 ${latestEvent.date||''} ／ 目前 ${cnt} 人出席</div>
      <div style="margin-bottom:8px;font-size:13px;font-weight:600">我的狀態：<span style="color:var(--accent)">${statusLabel}</span></div>
      <div style="display:flex;gap:8px">
        <button class="sbtn sbtn-ok ${myStatus==='attend'?'sel':''}" ${locked?'disabled style="opacity:.4;cursor:not-allowed"':''} onclick="quickSignup('${latestEvent.id}','attend')">✅ 出席</button>
        <button class="sbtn sbtn-no ${myStatus==='absent'?'sel':''}" ${locked?'disabled style="opacity:.4;cursor:not-allowed"':''} onclick="quickSignup('${latestEvent.id}','absent')">🌙 請假</button>
      </div>
      ${locked?'<p class="hint" style="color:var(--bad);margin-top:6px">🔒 已截止報名</p>':''}
    </div>`;
  }

  const noSyncWarn=(S.config().gsWebhook?'':`<div class="card" style="border:1px solid var(--bad);background:rgba(224,82,82,.1);margin-bottom:10px">
    <p style="color:var(--bad);font-size:13px;font-weight:600">⚠️ 這台裝置尚未連接雲端同步！</p>
    <p class="hint" style="margin-top:4px">你在這裡填寫或修改的資料，目前只會存在這台裝置上，管理員和其他人都看不到。請重新掃描管理員提供的最新報名QR碼，或聯繫管理員確認同步設定。</p>
  </div>`);
  pane.innerHTML=`<div class="sec-head"><h2>👋 歡迎，${CUR_USER}</h2></div>${noSyncWarn}${profileHtml}${nextEvent}`;
}

// 玩家自行切換固定團／一般成員狀態，與管理端「固定團隊伍排表編輯」共用同一個欄位（m.status）
// syncWriteNow() 回傳值有三種：true=已確認同步成功／false=有設定但這次失敗／'nosync'=這台裝置根本沒設定雲端同步。
// 第三種最容易被誤會成「已同步」，所以要特別強調警告，避免玩家以為資料已經送到雲端，其實只留在自己手機上。
function _syncResultToast(ok, doneMsg){
  if(ok===true){ toast('✅ '+doneMsg+'，並已同步到雲端','ok'); return; }
  if(ok==='nosync'){ toast('⚠️ '+doneMsg+'，但這台裝置尚未連接雲端同步！其他人看不到這筆變更，請聯繫管理員確認，或重新掃描最新的報名QR碼','err'); return; }
  toast('⚠️ '+doneMsg+'，但雲端同步失敗，請檢查網路後再確認一次','err');
}

async function togglePlayerFixedStatus(){
  const members=S.members();
  const idx=members.findIndex(m=>m.name===CUR_USER);
  if(idx<0){ toast('找不到你的成員資料，請先請管理員加入或填寫基本資料','err'); return; }
  const cur=members[idx].status||'一般成員';
  const next=cur==='固定團'?'一般成員':'固定團';
  const msg=next==='固定團'
    ? '確定要設為「固定團」嗎？之後管理員排固定團隊伍時就會看到你。'
    : '確定要改回「一般成員」嗎？之後管理員的固定團名單就不會再看到你了。';
  if(!confirm(msg)) return;
  members[idx]={...members[idx], status:next, updatedAt:Date.now()};
  S.setMembers(members);
  toast('✅ 已切換為「'+next+'」，背景同步中...','ok');
  renderPlayerHome(document.getElementById('pane-p-home'));
  const ok=await syncWriteNowFast();
  if(ok===true) toast('☁️ 已同步','ok');
  else if(ok==='nosync') toast('⚠️ 這台裝置尚未連接雲端同步，請重新掃描報名QR碼','err');
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

async function quickSignup(evId, status){
  if(_isLocked(evId)){ toast('此活動已截止報名','err'); return; }
  const label={attend:'出席',absent:'請假'}[status]||status;
  if(!confirm('確認回報「'+label+'」？')) return;
  const signups=S.signups();
  if(!signups[evId]) signups[evId]={};
  const prev=signups[evId][CUR_USER];
  if(prev===status){ delete signups[evId][CUR_USER]; }
  else { signups[evId][CUR_USER]=status; }
  S.setSignups(signups);
  const labels={attend:'已報名出席',absent:'已登記請假',maybe:'已登記待定'};
  toast('✅ '+(prev===status?'已取消':labels[status])+'，背景同步中...','ok');
  renderPane('p-home',document.getElementById('pane-p-home'));
  const ok=await syncWriteNowFast();
  if(ok===true) toast('☁️ 已同步','ok');
  else if(ok==='nosync') toast('⚠️ 這台裝置尚未連接雲端同步，請重新掃描報名QR碼','err');
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
    const locked=_isLocked(ev.id);
    return `<div class="signup-card">
      ${evTitleHtml(ev)}
      <div class="signup-meta">📅 ${ev.date||''}</div>
      <div class="signup-opts">
        <button class="sbtn sbtn-ok ${my==='attend'?'sel':''}" ${locked?'disabled style="opacity:.4;cursor:not-allowed"':''} onclick="doSignup('${ev.id}','attend')">✅ 出席</button>
        <button class="sbtn sbtn-no ${my==='absent'?'sel':''}" ${locked?'disabled style="opacity:.4;cursor:not-allowed"':''} onclick="doSignup('${ev.id}','absent')">🌙 請假</button>
      </div>
      ${locked?'<p class="hint" style="color:var(--bad)">🔒 已截止報名（活動前2天的晚上6點起鎖定，無法再更改）</p>':''}
      <div class="signup-cnt">✅ 出席 <strong>${att.length}</strong> ／ 🌙 請假 <strong>${abs}</strong></div>
      ${att.length?`<div class="att-list">${att.map(n=>`<span class="att-tag">${n}</span>`).join('')}</div>`:''}
    </div>`;
  }).join('');
}
function _isLocked(evId){
  const ev=S.events().find(e=>e.id===evId);
  const lockTime=evLockTime(ev); // 全站統一規則見 helpers.js：活動前2天的晚上6點
  if(!lockTime) return false;
  return Date.now()>=lockTime.getTime();
}
async function doSignup(evId,status){
  if(_isLocked(evId)){ toast('此活動已於前2天晚上6點截止，無法再更改報名','err'); return; }
  const label={attend:'出席',absent:'請假'}[status]||status;
  if(!confirm('確認回報「'+label+'」？\n（活動前2天晚上6點截止前都可再修改）')) return;
  const s=S.signups();
  if(!s[evId])s[evId]={};
  const prev=s[evId][CUR_USER];
  if(prev===status){delete s[evId][CUR_USER];}else{s[evId][CUR_USER]=status;}
  S.setSignups(s);
  const label2=prev===status?'已取消報名':{attend:'已報名出席',absent:'已登記請假',maybe:'已登記請假'}[status];
  toast('✅ '+label2+'，背景同步中...','ok');
  renderPane('p-signup',document.getElementById('pane-p-signup'));
  const ok=await syncWriteNowFast();
  if(ok===true) toast('☁️ 已同步','ok');
  else if(ok==='nosync') toast('⚠️ 這台裝置尚未連接雲端同步，請重新掃描報名QR碼','err');
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
        <div class="my-avatar" style="background:${job.color}">${job.img?`<img class="jimg" src="icons/jobs/${job.id}.png" alt="">`:(job.icon||job.name.charAt(0))}</div>
        <div><div class="my-name">${me.name}</div><div class="my-job">${job.name} ／ ${me.team||'未分配'} ／ <span class="pill ${statusCls(me.status)}">${me.status||''}</span></div></div>
      </div>
      <div class="my-stat-row">
        <div class="my-stat" onclick="openMyHistory()" style="cursor:pointer"><div class="my-stat-n">${a.totalPlayed}</div><div class="my-stat-l">出場次數 ▸</div></div>
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
  document.getElementById('se-name').value=me?me.name:CUR_USER;
  document.getElementById('se-class').value=me?.jobId||'';
  renderTagSel('se-skills-tags', S.skillList(), me?.skills||[]);
  renderTagSel('se-baijia-tags', S.baijiaList(), me?.baijia||[]);
  openModal('modal-self-edit');
}
function selfEditClassChange(){}
async function saveSelfEdit(){
  const newName=(document.getElementById('se-name').value||'').trim();
  const jobId=document.getElementById('se-class').value;
  const skills=getSelectedTags('se-skills-tags');
  const baijia=getSelectedTags('se-baijia-tags');
  if(!newName){ toast('請輸入角色名稱','err'); return; }
  let members=S.members();
  const idx=members.findIndex(m=>m.name===CUR_USER);
  // 若改成別人已使用的名稱，擋下來避免衝突
  if(newName!==CUR_USER && members.some(m=>m.name===newName)){ toast('這個角色名稱已經有人使用，請確認或聯繫管理員','err'); return; }
  if(idx>=0){
    const m=members[idx];
    const log=Array.isArray(m.changeLog)?m.changeLog.slice():[];
    const aliases=Array.isArray(m.aliases)?m.aliases.slice():[];
    if(m.name!==newName){
      // 記錄改名歷史，並把舊名加入別名，讓管理員仍能對應到過去的出賽/報名資料
      log.push({t:fmtDate(new Date()),type:'改名',from:m.name,to:newName});
      if(!aliases.includes(m.name)) aliases.push(m.name);
    }
    members[idx]={...m,name:newName,jobId,skills,baijia,aliases,changeLog:log,updatedAt:Date.now()};
  } else {
    // 成員只能由管理端新增：找不到自己的資料時不再自動建立，避免產生重複成員
    toast('找不到你的成員資料，成員需由管理員新增，請聯繫管理員','err');
    return;
  }
  S.setMembers(members);
  // 改名後同步更新目前登入身分與工作階段，避免下次重整又變回舊名
  if(newName!==CUR_USER){
    CUR_USER=newName;
    try{
      const s=JSON.parse(localStorage.getItem('gw_session')||'null');
      if(s){ s.user=newName; localStorage.setItem('gw_session',JSON.stringify(s)); }
    }catch(_){}
    const chip=document.getElementById('user-chip'); if(chip) chip.textContent=newName;
  }
  // 先讓使用者立即看到已儲存（本機瞬間完成），雲端同步在背景進行，不用乾等
  closeModal('modal-self-edit');
  toast('✅ 資料已儲存，正在背景同步...','ok');
  const active=document.querySelector('.nav-btn.active');
  if(active) renderPane(active.dataset.tab, document.getElementById('pane-'+active.dataset.tab));
  const ok=await syncWriteNowFast();
  if(ok===true) toast('☁️ 已同步到雲端','ok');
  else if(ok==='nosync') toast('⚠️ 這台裝置尚未連接雲端同步，資料只存在本機，請重新掃描報名QR碼','err');
  // ok===false 時不再彈警告打斷使用者，背景會自動重試
}
