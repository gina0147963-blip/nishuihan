// ============================================================
// LINEUP.JS v3 — 動態團數 × 5小隊 × 6格 + 已報名/未報名/請假池
// 保鏢=小隊層級標記；排表可儲存為預定排表供出席率比對
// ============================================================
let dragName=null, dragFrom=null;
let _curEventId=null;
let _roleTargetName=null;
let _squadRoleTarget=null;

const SQUAD_SIZE=6;
const SQUAD_COUNT=5;
const TEAM_COLORS=['tb-atk','tb-def','tb-mob','tb-grd','tb-x1','tb-x2'];
const DEFAULT_TEAM_NAMES=['進攻','防守','機動'];

function sqKey(teamIdx,sqIdx){ return 't'+teamIdx+'_sq'+sqIdx; }

function ensureTeams(ev){
  if(!ev.teamNames||!Array.isArray(ev.teamNames)||!ev.teamNames.length){
    ev.teamNames=DEFAULT_TEAM_NAMES.slice();
  }
  if(!ev.teams) ev.teams={};
  if(!ev.roles) ev.roles={};
  if(!ev.squadRoles) ev.squadRoles={}; // 小隊層級標記（保鏢）
  ev.teamNames.forEach((_,ti)=>{
    for(let i=0;i<SQUAD_COUNT;i++){
      const k=sqKey(ti,i);
      if(!Array.isArray(ev.teams[k])) ev.teams[k]=[];
    }
  });
  if(!Array.isArray(ev.teams.reserve)) ev.teams.reserve=[];
}

function getAssigned(ev){
  const s=new Set();
  Object.values(ev.teams||{}).forEach(arr=>{ if(Array.isArray(arr)) arr.forEach(n=>{ if(n) s.add(n); }); });
  return s;
}

// ============================================================
// ADMIN RENDER
// ============================================================
function renderAdminLineup(pane){
  const events=S.events().slice().sort((a,b)=>(b.date||'').localeCompare(a.date||''));
  const evOpts=events.map(e=>`<option value="${e.id}">${e.name}</option>`).join('');
  const curEv=_curEventId?S.events().find(e=>e.id===_curEventId):null;
  pane.innerHTML=`
    <div class="sec-head">
      <h2>🗡️ 出戰排表（${MODE_LABEL[CUR_MODE]}）</h2>
      <div class="sec-actions">
        <select id="ev-select" class="fsel sm" onchange="selectEvent(this.value)">
          <option value="">選擇場次...</option>${evOpts}
        </select>
        ${curEv?`
          <button class="btn btn-outline sm" onclick="importCore()">匯入固定團</button>
          <button class="btn btn-outline sm" onclick="addTeam()">+ 新增團</button>
          <button class="btn btn-outline sm" onclick="openCopyLineup()">📋 複製其他場次</button>
          <button class="btn btn-green sm" onclick="saveLineupPlan()">💾 儲存排表方案</button>
          <button class="btn btn-outline sm" onclick="exportLineupImage()">🖼️ 匯出圖片</button>
          `:''}
      </div>
    </div>
    <p class="hint">💡 場次由「報名管理」建立。左側玩家池分已報名/未報名/請假，拖曳玩家卡到右側格子排表。點卡片可看技能。</p>
    <div id="lineup-body">${curEv?buildLineup(curEv):'<div class="empty"><div class="empty-ico">🗡️</div><p>請先到「報名管理」建立場次，或於上方選擇場次</p></div>'}</div>`;
  if(_curEventId){ const sel=document.getElementById('ev-select'); if(sel) sel.value=_curEventId; }
}

function selectEvent(id){ _curEventId=id||null; renderAdminLineup(document.getElementById('pane-a-lineup')); }

function buildLineup(ev){
  ensureTeams(ev);
  const members=S.members();
  const roles=ev.roles||{};
  const signups=S.signups()[ev.id]||{};
  const assigned=getAssigned(ev);


  // 右側團隊
  const teamsHTML=ev.teamNames.map((tName,ti)=>{
    const cls=TEAM_COLORS[ti%TEAM_COLORS.length];
    let total=0;
    for(let i=0;i<SQUAD_COUNT;i++) total+=(ev.teams[sqKey(ti,i)]||[]).filter(Boolean).length;
    const squadsHTML=[];
    for(let i=0;i<SQUAD_COUNT;i++){
      const key=sqKey(ti,i);
      const names=ev.teams[key]||[];
      const isGuard=ev.squadRoles[key]==='guard';
      const slots=[];
      for(let slot=0;slot<SQUAD_SIZE;slot++){
        const name=names[slot];
        if(name){
          slots.push(playerCardHTML(name,members,ti,key,true,roles[name],signups[name]==='absent'));
        } else {
          slots.push(`<div class="slot-empty" ondragover="event.preventDefault();this.classList.add('drag-over-slot')" ondragleave="this.classList.remove('drag-over-slot')" ondrop="dropToSlot(event,'${key}',${slot})"><span class="slot-empty-txt">空</span></div>`);
        }
      }
      squadsHTML.push(`<div class="squad-block${isGuard?' squad-guard':''}">
        <div class="squad-hd">
          <span class="squad-label">${tName}-${i+1}隊${isGuard?' 🛡️保鏢':''}</span>
          <span class="squad-cnt">${names.filter(Boolean).length}/${SQUAD_SIZE}</span>
          <button class="btn xs btn-purple" onclick="toggleSquadGuard('${key}')" title="標記為保鏢小隊">🛡️</button>
          <button class="btn xs btn-outline" onclick="clearSquad('${key}')">清空</button>
        </div>
        <div class="squad-slots" ondragover="event.preventDefault()" ondrop="dropToSquad(event,'${key}')">${slots.join('')}</div>
      </div>`);
    }
    return `<div class="team-block">
      <div class="team-hd">
        <div class="team-label">
          <span class="team-badge ${cls}">${tName}</span>
          <span class="team-cnt">${total}/${SQUAD_COUNT*SQUAD_SIZE}</span>
        </div>
        <div style="display:flex;gap:4px">
          <button class="btn xs btn-outline" onclick="renameTeam(${ti})">改名</button>
          ${ev.teamNames.length>1?`<button class="btn xs btn-red" onclick="removeTeam(${ti})">刪除團</button>`:''}
        </div>
      </div>
      <div class="squads-grid">${squadsHTML.join('')}</div>
    </div>`;
  }).join('');


  return `
  <div class="lineup-layout">
    <div class="lineup-left" ondragover="event.preventDefault();this.classList.add('drag-over')" ondragleave="this.classList.remove('drag-over')" ondrop="dropToPool(event)">
      <div class="pool-hd-fixed"><h3>成員池</h3>
        <select id="pool-class-f" class="fsel sm" onchange="refreshPoolOnly()"><option value="">全部職業</option>${JOBS.map(j=>`<option value="${j.id}">${j.name}</option>`).join('')}</select>
        <input id="pool-search-f" class="fi sm" placeholder="搜尋..." oninput="refreshPoolOnly()" style="width:90px">
      </div>
      <div id="pool-groups">${buildPoolGroups(ev)}</div>
    </div>
    <div class="lineup-right">
      ${buildSummaryBar(ev,members)}
      ${teamsHTML}
      <div class="team-block">
        <div class="team-hd"><div class="team-label"><span class="team-badge tb-rsv">候補</span><span class="team-cnt">${(ev.teams.reserve||[]).filter(Boolean).length}人</span></div>
        <button class="btn xs btn-outline" onclick="clearSquad('reserve')">清空</button></div>
        <div class="team-cards reserve-pool" ondragover="event.preventDefault();this.classList.add('drag-over')" ondragleave="this.classList.remove('drag-over')" ondrop="dropToReserve(event)">
          ${(ev.teams.reserve||[]).filter(Boolean).map(n=>playerCardHTML(n,members,-1,'reserve',true,null,signups[n]==='absent')).join('')}
          ${!(ev.teams.reserve||[]).length?'<span style="color:var(--txt3);font-size:12px;padding:8px">拖曳成員加入候補</span>':''}
        </div>
      </div>
    </div>
  </div>`;
}

function buildSummaryBar(ev,members){
  const all=[];
  Object.values(ev.teams||{}).forEach(arr=>{ if(Array.isArray(arr)) arr.forEach(n=>{ if(n) all.push(n); }); });
  if(!all.length) return '';
  const cnt={}; JOBS.forEach(j=>cnt[j.id]=0);
  all.forEach(name=>{ const m=members.find(x=>x.name===name); if(m&&cnt[m.jobId]!==undefined) cnt[m.jobId]++; });
  return `<div class="summary-bar"><span style="font-size:12px;color:var(--txt2)">總人數：</span><span style="font-weight:800;color:var(--gold);margin-right:8px">${all.length}</span>${JOBS.map(j=>cnt[j.id]?`<span class="s-chip" style="background:${j.color}">${j.name}×${cnt[j.id]}</span>`:'').join('')}</div>`;
}

// 玩家池卡片（可點擊展開技能）
function playerPoolCardHTML(m,draggable){
  const job=jobById(m.jobId);
  const esc=m.name.replace(/'/g,"\\'");
  return `<div class="pcard pool-card jbg-${job.id}${draggable?'':' pcard-disabled'}"
    ${draggable?`draggable="true" ondragstart="startDrag(event,'${esc}','pool')" ondragend="this.classList.remove('dragging')"`:''}
    onclick="togglePlayerDetail(this,'${esc}')">
    <div class="jdot" style="background:${job.color}">${job.img?`<img class="jimg" src="icons/jobs/${job.id}.png" alt="">`:(job.icon||job.name.charAt(0))}</div>
    <div class="pname">${m.name}</div>
    <div class="pjob" style="color:${job.color}">${job.name}</div>
    <div class="pcard-detail hidden">
      <div class="pd-row"><b>絕技:</b>${(m.skills||[]).join('、')||'—'}</div>
      <div class="pd-row"><b>群俠:</b>${(m.baijia||[]).join('、')||'—'}</div>
    </div>
  </div>`;
}

function togglePlayerDetail(card,name){
  const det=card.querySelector('.pcard-detail');
  if(det) det.classList.toggle('hidden');
}

// 隊伍中卡片
function playerCardHTML(name,members,teamIdx,key,adminMode,role,isAbsent){
  const m=members.find(x=>x.name===name);
  const job=m?jobById(m.jobId):{name:'⚠️查無資料',color:'#e05252',id:''};
  const missingCls=m?'':' pcard-missing';
  const esc=name.replace(/'/g,"\\'");
  const roleCls=role==='cannon'?' role-cannon':role==='cmd'?' role-cmd':'';
  const absentCls=isAbsent?' pcard-absent':'';
  const roleLabel=role==='cannon'?'<div class="prole cannon">🎯砲手</div>':role==='cmd'?'<div class="prole cmd">⭐指揮</div>':'';
  return `<div class="pcard jbg-${job.id}${roleCls}${absentCls}${missingCls}"
    ${adminMode?`draggable="true" ondragstart="startDrag(event,'${esc}','${key}')" ondragend="this.classList.remove('dragging')"`:''}
    title="${m?name:name+'（成員資料庫查無此人，請至「成員管理」→「🔧 從排表補齊成員」修復）'}">
    <div class="jdot" style="background:${job.color}">${job.img?`<img class="jimg" src="icons/jobs/${job.id}.png" alt="">`:(job.icon||job.name.charAt(0))}</div>
    <div class="pname">${name}</div>
    <div class="pjob" style="color:${job.color}">${job.name}</div>
    ${roleLabel}
    ${(function(){
      const ev=S.events().find(e=>e.id===_curEventId);
      const asRaw=ev&&ev.assignedSkills&&ev.assignedSkills[name];
      const abRaw=ev&&ev.assignedBaijia&&ev.assignedBaijia[name];
      const as=Array.isArray(asRaw)?asRaw:(asRaw?[asRaw]:[]); // 相容舊版單一字串資料
      const ab=Array.isArray(abRaw)?abRaw:(abRaw?[abRaw]:[]);
      if(!as.length&&!ab.length) return '';
      let html='';
      if(as.length) html+=`<div class="passign">絕技：${as.join('、')}</div>`;
      if(ab.length) html+=`<div class="passign passign-b">群俠：${ab.join('、')}</div>`;
      return html;
    })()}
    ${isAbsent?'<div class="prole" style="color:var(--txt3)">🌙請假</div>':''}
    ${adminMode&&key!=='reserve'?`<button class="prolebtn" onclick="openRoleModal('${esc}')">⭐</button><button class="prolebtn" style="left:20px" onclick="openAssignSkill('${esc}')" title="指派技能">🎴</button>`:''}
    ${adminMode?`<button class="premove" onclick="removeFromLineup('${esc}','${key}')">✕</button>`:''}
  </div>`;
}

function refreshLineup(){
  if(!_curEventId) return;
  const ev=S.events().find(x=>x.id===_curEventId); if(!ev) return;
  // 保存成員池篩選值，重建後還原（修正拖曳後篩選失效）
  const savedQc=(document.getElementById('pool-class-f')||{}).value||'';
  const savedQs=(document.getElementById('pool-search-f')||{}).value||'';
  const body=document.getElementById('lineup-body');
  if(body) body.innerHTML=buildLineup(ev);
  const cf=document.getElementById('pool-class-f'); if(cf&&savedQc){ cf.value=savedQc; }
  const sf=document.getElementById('pool-search-f'); if(sf&&savedQs){ sf.value=savedQs; }
  if(savedQc||savedQs) refreshPoolOnly();
}

// ============================================================
// TEAM MANAGEMENT
// ============================================================
function addTeam(){
  if(!_curEventId) return;
  const name=prompt('新團名稱：','新團');
  if(!name) return;
  const events=S.events();
  const ev=events.find(x=>x.id===_curEventId); if(!ev) return;
  ensureTeams(ev);
  ev.teamNames.push(name.trim());
  ensureTeams(ev);
  S.setEvents(events);
  refreshLineup();
  toast('已新增「'+name+'」團','ok');
}

function renameTeam(ti){
  if(!_curEventId) return;
  const events=S.events();
  const ev=events.find(x=>x.id===_curEventId); if(!ev) return;
  const cur=ev.teamNames[ti];
  const name=prompt('修改團名：',cur);
  if(!name||name.trim()===cur) return;
  ev.teamNames[ti]=name.trim();
  S.setEvents(events);
  refreshLineup();
}

function removeTeam(ti){
  if(!_curEventId) return;
  if(!confirm('確定刪除此團？團內玩家會回到玩家池')) return;
  const events=S.events();
  const ev=events.find(x=>x.id===_curEventId); if(!ev) return;
  ensureTeams(ev);
  // 移除該團的所有小隊資料
  for(let i=0;i<SQUAD_COUNT;i++){ delete ev.teams[sqKey(ti,i)]; delete ev.squadRoles[sqKey(ti,i)]; }
  ev.teamNames.splice(ti,1);
  // 重新映射之後團的索引
  const newTeams={reserve:ev.teams.reserve||[]};
  const newSquadRoles={};
  ev.teamNames.forEach((_,newTi)=>{
    const oldTi=newTi>=ti?newTi+1:newTi;
    for(let i=0;i<SQUAD_COUNT;i++){
      newTeams[sqKey(newTi,i)]=ev.teams[sqKey(oldTi,i)]||[];
      if(ev.squadRoles[sqKey(oldTi,i)]) newSquadRoles[sqKey(newTi,i)]=ev.squadRoles[sqKey(oldTi,i)];
    }
  });
  ev.teams=newTeams;
  ev.squadRoles=newSquadRoles;
  S.setEvents(events);
  refreshLineup();
}

function toggleSquadGuard(key){
  if(!_curEventId) return;
  const events=S.events();
  const ev=events.find(x=>x.id===_curEventId); if(!ev) return;
  ensureTeams(ev);
  if(ev.squadRoles[key]==='guard') delete ev.squadRoles[key];
  else ev.squadRoles[key]='guard';
  S.setEvents(events);
  refreshLineup();
}

// ============================================================
// DRAG & DROP
// ============================================================
function startDrag(e,name,fromKey){
  dragName=name; dragFrom=fromKey;
  e.currentTarget.classList.add('dragging');
  e.dataTransfer.setData('text/plain',name);
  e.stopPropagation();
}
function dropToSlot(e,targetKey,slotIdx){
  e.preventDefault();
  e.currentTarget.classList.remove('drag-over-slot');
  if(!dragName||!_curEventId) return;
  _doMove(targetKey,slotIdx);
}
function dropToSquad(e,targetKey){
  e.preventDefault();
  if(!dragName||!_curEventId) return;
  const ev=S.events().find(x=>x.id===_curEventId); if(!ev) return;
  ensureTeams(ev);
  const arr=ev.teams[targetKey]||[];
  if(arr.filter(Boolean).length>=SQUAD_SIZE){ toast('此小隊已滿','err'); dragName=null; return; }
  _doMove(targetKey,null);
}
function dropToReserve(e){
  e.preventDefault();
  e.currentTarget.classList.remove('drag-over');
  if(!dragName||!_curEventId) return;
  _doMove('reserve',null);
}
function dropToPool(e){
  e.preventDefault();
  e.currentTarget.classList.remove('drag-over');
  if(!dragName||!_curEventId||dragFrom==='pool') return;
  const events=S.events();
  const ev=events.find(x=>x.id===_curEventId); if(!ev) return;
  ensureTeams(ev);
  _removeFromKey(ev,dragName,dragFrom);
  if(ev.roles&&ev.roles[dragName]) delete ev.roles[dragName];
  S.setEvents(events);
  dragName=null; dragFrom=null;
  refreshLineup();
}
function _doMove(targetKey,slotIdx){
  if(!_curEventId) return;
  const events=S.events();
  const ev=events.find(x=>x.id===_curEventId); if(!ev) return;
  ensureTeams(ev);
  if(!ev.teams[targetKey]) ev.teams[targetKey]=[];
  // 全域去重：先從所有位置移除該玩家，避免重複卡片
  Object.keys(ev.teams).forEach(k=>{ if(k!==targetKey) _removeFromKey(ev,dragName,k); });
  if(targetKey==='reserve'){
    _removeFromKey(ev,dragName,dragFrom);
    if(!ev.teams.reserve.includes(dragName)) ev.teams.reserve.push(dragName);
  } else if(slotIdx!==null){
    const occupant=(ev.teams[targetKey]||[])[slotIdx];
    _removeFromKey(ev,dragName,dragFrom);
    while(ev.teams[targetKey].length<=slotIdx) ev.teams[targetKey].push(null);
    if(occupant&&occupant!==dragName){
      ev.teams[targetKey][slotIdx]=dragName;
      ev.teams.reserve.push(occupant);
    } else {
      ev.teams[targetKey][slotIdx]=dragName;
    }
  } else {
    _removeFromKey(ev,dragName,dragFrom);
    const arr=ev.teams[targetKey];
    let placed=false;
    for(let i=0;i<SQUAD_SIZE;i++){ if(!arr[i]){ arr[i]=dragName; placed=true; break; } }
    if(!placed&&arr.filter(Boolean).length<SQUAD_SIZE) arr.push(dragName);
  }
  S.setEvents(events);
  dragName=null; dragFrom=null;
  refreshLineup();
}
function _removeFromKey(ev,name,key){
  if(!key||key==='pool') return;
  if(!ev.teams[key]) return;
  const idx=ev.teams[key].indexOf(name);
  if(idx>=0) ev.teams[key][idx]=null;
  while(ev.teams[key].length&&ev.teams[key][ev.teams[key].length-1]===null) ev.teams[key].pop();
}
function removeFromLineup(name,key){
  if(!_curEventId) return;
  const events=S.events();
  const ev=events.find(x=>x.id===_curEventId); if(!ev) return;
  ensureTeams(ev);
  _removeFromKey(ev,name,key);
  if(ev.roles&&ev.roles[name]) delete ev.roles[name];
  S.setEvents(events);
  refreshLineup();
}
function clearSquad(key){
  if(!_curEventId||!confirm('確定清空？')) return;
  const events=S.events();
  const ev=events.find(x=>x.id===_curEventId); if(!ev) return;
  ensureTeams(ev);
  const names=ev.teams[key]||[];
  if(ev.roles) names.filter(Boolean).forEach(n=>{ if(ev.roles[n]) delete ev.roles[n]; });
  ev.teams[key]=[];
  S.setEvents(events);
  refreshLineup();
}

// ============================================================
// 匯入固定團
// ============================================================
function importCore(){
  if(!_curEventId) return;
  const events=S.events();
  const ev=events.find(x=>x.id===_curEventId); if(!ev) return;
  ensureTeams(ev);
  const signups=S.signups()[ev.id]||{};
  const core=S.members().filter(m=>(m.status==='固定團'||m.status==='固定班底'));
  const assigned=getAssigned(ev);
  const nameToTeamIdx={};
  ev.teamNames.forEach((n,i)=>{ nameToTeamIdx[n]=i; });
  let added=0;
  core.forEach(m=>{
    if(assigned.has(m.name)) return;
    // 請假的固定團成員不排入（灰格顯示在池底）
    if(signups[m.name]==='absent') return;
    const ti=nameToTeamIdx[m.team];
    if(ti===undefined){ ev.teams.reserve.push(m.name); added++; return; }
    let placed=false;
    for(let i=0;i<SQUAD_COUNT;i++){
      const k=sqKey(ti,i);
      const arr=ev.teams[k]||[];
      let slotted=false;
      for(let s=0;s<SQUAD_SIZE;s++){ if(!arr[s]){ arr[s]=m.name; slotted=true; break; } }
      if(!slotted&&arr.filter(Boolean).length<SQUAD_SIZE){ arr.push(m.name); slotted=true; }
      if(slotted){ ev.teams[k]=arr; placed=true; added++; break; }
    }
    if(!placed){ ev.teams.reserve.push(m.name); added++; }
  });
  S.setEvents(events);
  toast('已匯入 '+added+' 位固定團成員（請假者已略過）','ok');
  refreshLineup();
}

// ============================================================
// 儲存排表方案（作為預定排表，供出席率比對）
// ============================================================
function saveLineupPlan(){
  if(!_curEventId) return;
  const events=S.events();
  const ev=events.find(x=>x.id===_curEventId); if(!ev) return;
  ensureTeams(ev);
  const planned=[];
  Object.entries(ev.teams).forEach(([k,arr])=>{
    if(Array.isArray(arr)) arr.forEach(n=>{ if(n&&!planned.includes(n)) planned.push(n); });
  });
  ev.plannedRoster=planned;
  ev.planSavedAt=new Date().toISOString();
  S.setEvents(events);
  toast('✅ 排表方案已儲存（共 '+planned.length+' 人），可供出席率比對','ok');
}

// ============================================================
// 匯出圖片（Canvas 繪製排表）
// ============================================================
// 依畫布寬度換行文字（中英文皆以字元寬度量測）
function _wrapCanvasText(ctx,text,maxWidth){
  const chars=[...String(text)];
  const lines=[]; let cur='';
  chars.forEach(ch=>{
    const test=cur+ch;
    if(cur&&ctx.measureText(test).width>maxWidth){ lines.push(cur); cur=ch; }
    else cur=test;
  });
  if(cur) lines.push(cur);
  return lines;
}
function exportLineupImage(){
  if(!_curEventId){ toast('請先選擇場次','err'); return; }
  const ev=S.events().find(e=>e.id===_curEventId);
  ensureTeams(ev);
  const members=S.members();
  const roles=ev.roles||{};
  const squadRoles=ev.squadRoles||{};
  const assignedSkills=ev.assignedSkills||{};
  const assignedBaijia=ev.assignedBaijia||{};

  const CW=1080, PAD=20, HDH=60, TEAMHD=44, SLOTW=150, SLOTX0=PAD+120;
  const measureCv=document.createElement('canvas');
  const mctx=measureCv.getContext('2d');

  // 取得某玩家在本場次被指派的絕技／群俠技能，換行後的文字行陣列（要全部顯示）
  function slotSkillLines(name){
    if(!name) return [];
    const asRaw=assignedSkills[name], abRaw=assignedBaijia[name];
    const as=Array.isArray(asRaw)?asRaw:(asRaw?[asRaw]:[]);
    const ab=Array.isArray(abRaw)?abRaw:(abRaw?[abRaw]:[]);
    const lines=[];
    mctx.font='9px sans-serif';
    if(as.length) lines.push(..._wrapCanvasText(mctx,'絕技：'+as.join('、'),SLOTW-14));
    if(ab.length) lines.push(..._wrapCanvasText(mctx,'群俠：'+ab.join('、'),SLOTW-14));
    return lines;
  }

  // 第一輪：依每個小隊內最長的技能行數，動態計算該小隊列高
  const squadRowH=ev.teamNames.map((tName,ti)=>{
    const rowHs=[];
    for(let i=0;i<SQUAD_COUNT;i++){
      const names=ev.teams[sqKey(ti,i)]||[];
      let maxLines=0;
      for(let s=0;s<SQUAD_SIZE;s++){
        const n=slotSkillLines(names[s]).length;
        if(n>maxLines) maxLines=n;
      }
      rowHs.push(Math.max(46, 36+maxLines*11+8));
    }
    return rowHs;
  });

  let totalH=HDH+PAD;
  ev.teamNames.forEach((_,ti)=>{
    totalH+=TEAMHD+16;
    squadRowH[ti].forEach(h=>{ totalH+=h+8; });
  });
  totalH+=60;

  const cv=document.createElement('canvas');
  const EXPORT_SCALE=2; // 提高匯出圖片解析度（實際輸出像素為版面尺寸的2倍）
  cv.width=CW*EXPORT_SCALE; cv.height=totalH*EXPORT_SCALE;
  const ctx=cv.getContext('2d');
  ctx.scale(EXPORT_SCALE,EXPORT_SCALE);
  ctx.fillStyle='#0d1117'; ctx.fillRect(0,0,CW,totalH);
  ctx.fillStyle='#e8eaf6'; ctx.font='bold 26px sans-serif';
  ctx.fillText('⚔️ '+ev.name+'（'+MODE_LABEL[CUR_MODE]+'）', PAD, 38);
  ctx.font='13px sans-serif'; ctx.fillStyle='#8892b0';
  ctx.fillText('日期：'+(ev.date||'')+'  類型：'+(ev.type||''), PAD, 58);

  const teamColors=['#e05252','#4f8ef7','#3db87a','#f0b843','#a78bfa','#38bdf8'];
  let y=HDH+PAD;
  ev.teamNames.forEach((tName,ti)=>{
    ctx.fillStyle=teamColors[ti%teamColors.length];
    ctx.fillRect(PAD,y,CW-PAD*2,32);
    ctx.fillStyle='#fff'; ctx.font='bold 17px sans-serif';
    ctx.fillText(tName,PAD+12,y+22);
    y+=TEAMHD;
    for(let i=0;i<SQUAD_COUNT;i++){
      const k=sqKey(ti,i);
      const names=ev.teams[k]||[];
      const isGuard=squadRoles[k]==='guard';
      const rowH=squadRowH[ti][i];
      ctx.fillStyle='#1e2538';
      ctx.fillRect(PAD,y,CW-PAD*2,rowH);
      ctx.fillStyle=isGuard?'#f0b843':'#8892b0';
      ctx.font='bold 13px sans-serif';
      ctx.fillText(tName+'-'+(i+1)+'隊'+(isGuard?' 🛡️保鏢':''),PAD+8,y+16);
      let x=SLOTX0;
      for(let s=0;s<SQUAD_SIZE;s++){
        const name=names[s];
        const w=SLOTW;
        if(name){
          const m=members.find(mm=>mm.name===name);
          const job=m?jobById(m.jobId):{color:'#8892b0',name:'?'};
          ctx.fillStyle=job.color;
          ctx.fillRect(x,y+4,w-6,rowH-8);
          ctx.fillStyle='#fff'; ctx.font='bold 12px sans-serif';
          const label=name+(roles[name]==='cannon'?' 🎯':roles[name]==='cmd'?' ⭐':'');
          ctx.fillText(label.length>10?label.slice(0,10)+'…':label, x+6, y+18);
          ctx.font='10px sans-serif';
          ctx.fillText(job.name, x+6, y+31);
          let ly=y+43;
          slotSkillLines(name).forEach(ln=>{
            ctx.font='9px sans-serif';
            ctx.fillText(ln, x+6, ly);
            ly+=11;
          });
        } else {
          ctx.strokeStyle='#2d3651';
          ctx.strokeRect(x,y+4,w-6,rowH-8);
          ctx.fillStyle='#4a5578'; ctx.font='11px sans-serif';
          ctx.fillText('空',x+60,y+rowH/2+4);
        }
        x+=w;
      }
      if(isGuard){
        ctx.strokeStyle='#f0b843';
        ctx.lineWidth=3;
        ctx.strokeRect(PAD+1.5,y+1.5,CW-PAD*2-3,rowH-3);
        ctx.lineWidth=1;
      }
      y+=rowH+8;
    }
    y+=16;
  });

  cv.toBlob(blob=>{
    const a=document.createElement('a');
    a.href=URL.createObjectURL(blob);
    a.download='排表_'+MODE_LABEL[CUR_MODE]+'_'+ev.name+'.png';
    a.click();
    toast('圖片已匯出','ok');
  });
}

// ============================================================
// EXPORT EXCEL
// ============================================================
function exportLineupExcel(){
  if(!_curEventId){ toast('請先選擇場次','err'); return; }
  const ev=S.events().find(e=>e.id===_curEventId);
  ensureTeams(ev);
  const members=S.members();
  const roles=ev.roles||{};
  const wb=XLSX.utils.book_new();
  ev.teamNames.forEach((tName,ti)=>{
    const rows=[['小隊','位置','角色名稱','職業','特殊角色','絕技','群俠技能']];
    for(let i=0;i<SQUAD_COUNT;i++){
      const k=sqKey(ti,i);
      const names=ev.teams[k]||[];
      const guard=(ev.squadRoles||{})[k]==='guard'?'(保鏢)':'';
      for(let slot=0;slot<SQUAD_SIZE;slot++){
        const name=names[slot]||'';
        const m=name?members.find(x=>x.name===name):null;
        const job=m?jobById(m.jobId):{name:''};
        rows.push([tName+'-'+(i+1)+'隊'+guard,slot+1,name,job.name,roles[name]==='cannon'?'砲手':roles[name]==='cmd'?'指揮':'',(m&&m.skills||[]).join('、'),(m&&m.baijia||[]).join('、')]);
      }
    }
    XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(rows),tName.slice(0,28));
  });
  XLSX.writeFile(wb,'排表_'+MODE_LABEL[CUR_MODE]+'_'+ev.name+'.xlsx');
  toast('Excel 已匯出','ok');
}

// ============================================================
// ROLE MODAL
// ============================================================
function openRoleModal(name){
  _roleTargetName=name;
  document.getElementById('role-player-name').textContent=name;
  const ev=S.events().find(x=>x.id===_curEventId);
  document.getElementById('role-select').value=(ev&&ev.roles&&ev.roles[name])||'';
  openModal('modal-role');
}
function saveRole(){
  if(!_curEventId||!_roleTargetName) return;
  const val=document.getElementById('role-select').value;
  const events=S.events();
  const ev=events.find(x=>x.id===_curEventId); if(!ev) return;
  if(!ev.roles) ev.roles={};
  if(val) ev.roles[_roleTargetName]=val; else delete ev.roles[_roleTargetName];
  S.setEvents(events);
  closeModal('modal-role');
  toast('角色已更新','ok');
  refreshLineup();
}

// ============================================================
// PLAYER READ-ONLY VIEW
// ============================================================
function renderPlayerLineup(pane){
  const events=S.events().slice().sort((a,b)=>(b.date||'').localeCompare(a.date||''));
  if(!events.length){ pane.innerHTML='<div class="empty"><div class="empty-ico">📋</div><p>尚無排表</p></div>'; return; }
  const ev=events[0]; ensureTeams(ev);
  const members=S.members(); const roles=ev.roles||{};
  const teamsHTML=ev.teamNames.map((tName,ti)=>{
    const cls=TEAM_COLORS[ti%TEAM_COLORS.length];
    const squadsHTML=[];
    for(let i=0;i<SQUAD_COUNT;i++){
      const k=sqKey(ti,i);
      const names=ev.teams[k]||[];
      if(!names.filter(Boolean).length) continue;
      const isGuard=(ev.squadRoles||{})[k]==='guard';
      squadsHTML.push(`<div class="squad-block${isGuard?' squad-guard':''}"><div class="squad-hd"><span class="squad-label">${tName}-${i+1}隊${isGuard?' 🛡️':''}</span><span class="squad-cnt">${names.filter(Boolean).length}/${SQUAD_SIZE}</span></div><div class="squad-slots">${Array.from({length:SQUAD_SIZE},(_,s)=>{ const n=names[s]; return n?playerCardHTML(n,members,ti,k,false,roles[n],false):'<div class="slot-empty"><span class="slot-empty-txt">空</span></div>'; }).join('')}</div></div>`);
    }
    if(!squadsHTML.length) return '';
    return `<div class="team-block"><div class="team-hd"><div class="team-label"><span class="team-badge ${cls}">${tName}</span></div></div><div class="squads-grid">${squadsHTML.join('')}</div></div>`;
  }).join('');
  pane.innerHTML=`<div class="sec-head"><h2>📋 本週排表</h2><span style="font-size:13px;color:var(--txt2)">${ev.name}</span></div>${buildSummaryBar(ev,members)}<div class="lineup-board">${teamsHTML||'<div class="empty"><div class="empty-ico">🗡️</div><p>尚未排表</p></div>'}</div>`;
}


// ============================================================
// 玩家池分組（含篩選）— 局部刷新用
// ============================================================
function buildPoolGroups(ev){
  ensureTeams(ev);
  const members=S.members();
  const signups=S.signups()[ev.id]||{};
  const assigned=getAssigned(ev);
  const qc=((document.getElementById('pool-class-f')||{}).value)||'';
  const qs=(((document.getElementById('pool-search-f')||{}).value)||'').toLowerCase();
  const attendNames=[],absentNames=[],pendingNames=[],reserveNames=[];
  members.forEach(m=>{
    if(assigned.has(m.name)) return;
    if(qc&&m.jobId!==qc) return;
    if(qs&&!m.name.toLowerCase().includes(qs)) return;
    const st=signups[m.name];
    if(st==='attend') attendNames.push(m);
    else if(st==='absent') absentNames.push(m);
    else if(m.status==='候補') reserveNames.push(m);
    else pendingNames.push(m);
  });
  const sec=(title,list,color,drag)=>!list.length?'':`<div class="pool-group"><div class="pool-group-hd" style="color:${color}">${title}（${list.length}）</div><div class="pool-group-cards">${list.map(m=>playerPoolCardHTML(m,drag)).join('')}</div></div>`;
  return (sec('✅ 出席',attendNames,'var(--ok)',true)+sec('❓ 待定',pendingNames,'var(--gold)',true)+sec('📋 候補',reserveNames,'var(--txt2)',true)+sec('🌙 請假',absentNames,'var(--txt3)',false))||'<p class="hint">無符合成員</p>';
}
function refreshPoolOnly(){
  if(!_curEventId) return;
  const ev=S.events().find(x=>x.id===_curEventId); if(!ev) return;
  const box=document.getElementById('pool-groups');
  if(box) box.innerHTML=buildPoolGroups(ev);
}

// ============================================================
// 固定團隊伍排表編輯
// ============================================================
function openCoreTeamEditor(){
  const members=S.members().slice().sort((a,b)=>(a.jobId||'').localeCompare(b.jobId||''));
  const teams=['進攻','防守','機動'];
  document.getElementById('coreteam-body').innerHTML=`<div class="tbl-wrap"><table>
    <thead><tr><th>角色</th><th>職業</th><th>固定團</th><th>隊伍</th></tr></thead>
    <tbody>${members.map(m=>{
      const job=jobById(m.jobId);
      const isCore=(m.status==='固定團'||(m.status==='固定團'||m.status==='固定班底'));
      return `<tr data-mid="${m.id}">
        <td>${m.name}</td>
        <td><span class="pill pill-job" style="background:${job.color};color:#fff">${job.name}</span></td>
        <td style="text-align:center"><input type="checkbox" class="ct-core" ${isCore?'checked':''}></td>
        <td><select class="fsel sm ct-team">${teams.map(t=>`<option ${m.team===t?'selected':''}>${t}</option>`).join('')}</select></td>
      </tr>`;
    }).join('')}</tbody></table></div>`;
  openModal('modal-coreteam');
}
function saveCoreTeam(){
  const members=S.members();
  document.querySelectorAll('#coreteam-body tr[data-mid]').forEach(tr=>{
    const m=members.find(x=>x.id===tr.dataset.mid); if(!m) return;
    const core=tr.querySelector('.ct-core').checked;
    const team=tr.querySelector('.ct-team').value;
    if(core){ m.status='固定團'; m.team=team; }
    else if(m.status==='固定團'||(m.status==='固定團'||m.status==='固定班底')){ m.status='一般成員'; }
  });
  S.setMembers(members);
  closeModal('modal-coreteam');
  toast('固定團設定已儲存','ok');
  refreshLineup();
}


// ============================================================
// 複製其他場次的排表
// ============================================================
function openCopyLineup(){
  if(!_curEventId){ toast('請先選擇場次','err'); return; }
  const events=S.events().filter(e=>e.id!==_curEventId).sort((a,b)=>String(b.date||'').localeCompare(String(a.date||'')));
  if(!events.length){ toast('沒有其他場次可複製','err'); return; }
  const opts=events.map(e=>`<option value="${e.id}">${String(e.date||'').slice(0,10)} ${e.name}</option>`).join('');
  const body=document.getElementById('coreteam-body');
  body.innerHTML=`<div class="fg"><label>選擇要複製排表的場次</label><select id="copy-src" class="fsel">${opts}</select></div>
    <p class="hint">將把該場次的團隊結構、分隊、砲手/指揮、保鏢、指派技能整份複製過來，覆蓋目前排表。</p>`;
  document.querySelector('#modal-coreteam .modal-hd h3').textContent='📋 複製其他場次排表';
  const btn=document.querySelector('#modal-coreteam .modal-ft .btn-blue');
  btn.textContent='複製'; btn.setAttribute('onclick','doCopyLineup()');
  openModal('modal-coreteam');
}
function doCopyLineup(){
  const srcId=document.getElementById('copy-src').value;
  const events=S.events();
  const src=events.find(e=>e.id===srcId);
  const cur=events.find(e=>e.id===_curEventId);
  if(!src||!cur) return;
  cur.teamNames=JSON.parse(JSON.stringify(src.teamNames||['進攻','防守','機動']));
  cur.teams=JSON.parse(JSON.stringify(src.teams||{}));
  cur.roles=JSON.parse(JSON.stringify(src.roles||{}));
  cur.squadRoles=JSON.parse(JSON.stringify(src.squadRoles||{}));
  cur.assignedSkills=JSON.parse(JSON.stringify(src.assignedSkills||{}));
  cur.assignedBaijia=JSON.parse(JSON.stringify(src.assignedBaijia||{}));
  S.setEvents(events);
  closeModal('modal-coreteam');
  toast('✅ 已複製排表','ok');
  refreshLineup();
}

// ============================================================
// 指派技能給玩家（絕技／群俠技能皆可複選，僅套用於本場次排表）
// ============================================================
let _assignSkillName=null;
function openAssignSkill(name){
  _assignSkillName=name;
  const ev=S.events().find(e=>e.id===_curEventId);
  const curSRaw=(ev&&ev.assignedSkills&&ev.assignedSkills[name])||[];
  const curBRaw=(ev&&ev.assignedBaijia&&ev.assignedBaijia[name])||[];
  // 相容舊版單一字串資料
  const curS=Array.isArray(curSRaw)?curSRaw:(curSRaw?[curSRaw]:[]);
  const curB=Array.isArray(curBRaw)?curBRaw:(curBRaw?[curBRaw]:[]);
  const mem=S.members().find(m=>m.name===name);
  // 只顯示該玩家自己在「我的資料」或管理端成員清單編輯過的絕技／群俠技能
  const optS=(mem&&mem.skills)||[];
  const optB=(mem&&mem.baijia)||[];
  document.getElementById('assign-skill-name').textContent=name;
  renderTagSel('assign-skills-tags', optS, curS);
  renderTagSel('assign-baijia-tags', optB, curB);
  if(!optS.length){ const b=document.getElementById('assign-skills-tags'); if(b) b.innerHTML='<span class="hint">此玩家尚未設定絕技，請先到「成員」或請玩家自行編輯</span>'; }
  if(!optB.length){ const b=document.getElementById('assign-baijia-tags'); if(b) b.innerHTML='<span class="hint">此玩家尚未設定群俠技能，請先到「成員」或請玩家自行編輯</span>'; }
  openModal('modal-assign-skill');
}
function saveAssignSkill(){
  if(!_curEventId||!_assignSkillName) return;
  const events=S.events();
  const ev=events.find(e=>e.id===_curEventId); if(!ev) return;
  if(!ev.assignedSkills) ev.assignedSkills={};
  if(!ev.assignedBaijia) ev.assignedBaijia={};
  const skills=getSelectedTags('assign-skills-tags');
  const baijia=getSelectedTags('assign-baijia-tags');
  if(skills.length) ev.assignedSkills[_assignSkillName]=skills; else delete ev.assignedSkills[_assignSkillName];
  if(baijia.length) ev.assignedBaijia[_assignSkillName]=baijia; else delete ev.assignedBaijia[_assignSkillName];
  S.setEvents(events);
  closeModal('modal-assign-skill');
  toast('技能已指派','ok');
  refreshLineup();
}
