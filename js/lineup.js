// ============================================================
// ADMIN: LINEUP (with special roles 砲手/指揮)
// ============================================================
let dragName=null, dragFrom=null;
let _curEventId=null;
let _roleTargetName=null;

function renderAdminLineup(pane){
  const events=S.events().slice().reverse();
  const evOpts=events.map(e=>`<option value="${e.id}">${e.name}</option>`).join('');
  const curEv=_curEventId?S.events().find(e=>e.id===_curEventId):null;

  pane.innerHTML=`<div class="sec-head">
    <h2>🗡️ 出戰排表（${MODE_LABEL[CUR_MODE]}）</h2>
    <div class="sec-actions">
      <select id="ev-select" class="fsel sm" onchange="selectEvent(this.value)"><option value="">選擇場次...</option>${evOpts}</select>
      <button class="btn btn-blue sm" onclick="openModal('modal-event')">+ 新增場次</button>
      ${curEv?`<button class="btn btn-outline sm" onclick="importCore()">匯入固定班底</button><button class="btn btn-outline sm" onclick="exportLineupExcel()">📥 匯出Excel</button>`:''}
    </div>
  </div>
  <div id="lineup-body">${curEv?buildLineup(curEv):'<div class="empty"><div class="empty-ico">🗡️</div><p>請選擇或建立場次</p></div>'}</div>`;

  if(_curEventId){ const sel=document.getElementById('ev-select'); if(sel)sel.value=_curEventId; }
}
function selectEvent(id){ _curEventId=id; renderAdminLineup(document.getElementById('pane-a-lineup')); }

function buildLineup(ev){
  const members=S.members();
  const assigned=new Set(Object.values(ev.teams||{}).flat());
  const summary=buildSummaryBar(ev,members);
  const roles=ev.roles||{};

  const teamsHtml=TEAMS.map(t=>{
    const names=(ev.teams||{})[t.id]||[];
    const cannons=names.filter(n=>roles[n]==='cannon');
    const cmds=names.filter(n=>roles[n]==='cmd');
    let specialBar='';
    if(t.id!=='reserve' && (cannons.length||cmds.length)){
      specialBar=`<div class="team-special">
        ${cmds.length?`<span class="special-tag">⭐ 指揮：${cmds.join('、')}</span>`:''}
        ${cannons.length?`<span class="special-tag">🎯 砲手：${cannons.join('、')}</span>`:''}
      </div>`;
    }
    return `<div class="team-block">
      <div class="team-hd">
        <div class="team-label"><span class="team-badge ${t.cls}">${t.name}</span><span class="team-cnt">${names.length} 人</span></div>
        <button class="btn btn-outline xs" onclick="clearTeam('${t.id}')">清空</button>
      </div>
      ${specialBar}
      <div class="team-cards" id="team-${t.id}"
        ondragover="event.preventDefault();this.classList.add('drag-over')"
        ondragleave="this.classList.remove('drag-over')"
        ondrop="dropToTeam(event,'${t.id}')">
        ${names.map(name=>playerCardHTML(name,members,t,true,'team',roles[name])).join('')}
      </div>
    </div>`;
  }).join('');

  let cands=members.filter(m=>!assigned.has(m.name));

  return `${summary}
  <div class="lineup-board">${teamsHtml}</div>
  <div class="pool-sec">
    <div class="pool-hd">
      <h3>候選成員（${cands.length} 人）</h3>
      <div class="pool-filters">
        <select id="pool-class-f" class="fsel sm" onchange="refreshPool()"><option value="">所有職業</option>${JOBS.map(j=>`<option value="${j.id}">${j.name}</option>`).join('')}</select>
        <input id="pool-search-f" class="fi sm" placeholder="搜尋..." oninput="refreshPool()" style="width:100px">
      </div>
    </div>
    <div id="pool-cards" class="pool-cards"
      ondragover="event.preventDefault();this.classList.add('drag-over')"
      ondragleave="this.classList.remove('drag-over')"
      ondrop="dropToPool(event)">
      ${buildPoolCards(cands)}
    </div>
  </div>
  <p class="hint">💡 點擊隊伍中玩家卡片左上角的紫色按鈕可指定「砲手」或「指揮」身份（須先分配到隊伍才能指定）。</p>`;
}

function buildSummaryBar(ev, members){
  const all=Object.values(ev.teams||{}).flat();
  if(!all.length)return'';
  const cnt={}; JOBS.forEach(j=>cnt[j.id]=0);
  all.forEach(name=>{ const m=members.find(x=>x.name===name); if(m&&cnt[m.jobId]!==undefined)cnt[m.jobId]++; });
  return `<div class="summary-bar">
    <span style="font-size:12px;color:var(--txt2)">總人數：</span>
    <span style="font-weight:800;color:var(--gold);margin-right:8px">${all.length}</span>
    ${JOBS.map(j=>cnt[j.id]?`<span class="s-chip" style="background:${j.color}">${j.name}×${cnt[j.id]}</span>`:'').join('')}
  </div>`;
}
function buildPoolCards(cands){
  if(!cands.length)return'<span style="color:var(--txt3);font-size:12px;padding:8px">所有成員已分配</span>';
  return cands.map(m=>playerCardHTML(m.name,S.members(),null,true,'pool')).join('');
}

function playerCardHTML(name, members, team, adminMode, source='team', role=null){
  const m=members.find(x=>x.name===name);
  const job=m?jobById(m.jobId):{name:'?',color:'#8892b0',id:''};
  const skills=(m?.skills||[]).slice(0,1).join('');
  const roleCls = role==='cannon'?' role-cannon':role==='cmd'?' role-cmd':'';
  const roleLabel = role==='cannon'?'<div class="prole cannon">🎯砲手</div>':role==='cmd'?'<div class="prole cmd">⭐指揮</div>':'';
  const canSetRole = adminMode && team && team.id!=='reserve';
  return `<div class="pcard jbg-${job.id}${roleCls}"
    ${adminMode?`draggable="true" ondragstart="startDrag(event,'${name}','${source}',${team?`'${team.id}'`:'null'})" ondragend="this.classList.remove('dragging')"`:``}
    title="${name}&#10;${job.name}${m?(m.skills||[]).length?'&#10;絕技：'+(m.skills||[]).join('、'):'':''}">
    <div class="jdot" style="background:${job.color}">${job.name.charAt(0)}</div>
    <div class="pname">${name}</div>
    <div class="pjob" style="color:${job.color}">${job.name}</div>
    ${roleLabel}
    ${skills?`<div class="ptag">${skills}</div>`:''}
    ${canSetRole?`<button class="prolebtn" onclick="openRoleModal('${name}')" title="指定角色">⭐</button>`:''}
    ${adminMode&&team?`<button class="premove" onclick="removeFromTeam('${name}','${team.id}')" title="移出">✕</button>`:''}
  </div>`;
}

function startDrag(e,name,src,teamId){
  dragName=name; dragFrom={src,teamId};
  e.currentTarget.classList.add('dragging');
  e.dataTransfer.setData('text',name);
}
function dropToTeam(e,targetTeamId){
  e.preventDefault(); e.currentTarget.classList.remove('drag-over');
  if(!dragName||!_curEventId)return;
  const events=S.events();
  const ev=events.find(x=>x.id===_curEventId); if(!ev)return;
  if(!ev.teams){ev.teams={};TEAMS.forEach(t=>ev.teams[t.id]=[])}
  if(!ev.roles) ev.roles={};
  if(dragFrom.src==='team'&&dragFrom.teamId){
    ev.teams[dragFrom.teamId]=(ev.teams[dragFrom.teamId]||[]).filter(n=>n!==dragName);
  }
  if(!(ev.teams[targetTeamId]||[]).includes(dragName)){
    if(!ev.teams[targetTeamId])ev.teams[targetTeamId]=[];
    ev.teams[targetTeamId].push(dragName);
  }
  // If moved to reserve, clear special role
  if(targetTeamId==='reserve' && ev.roles[dragName]){ delete ev.roles[dragName]; }
  S.setEvents(events);
  dragName=null; dragFrom=null;
  renderAdminLineup(document.getElementById('pane-a-lineup'));
}
function dropToPool(e){
  e.preventDefault(); e.currentTarget.classList.remove('drag-over');
  if(!dragName||!_curEventId||dragFrom.src!=='team')return;
  const events=S.events();
  const ev=events.find(x=>x.id===_curEventId); if(!ev)return;
  if(dragFrom.teamId){ ev.teams[dragFrom.teamId]=(ev.teams[dragFrom.teamId]||[]).filter(n=>n!==dragName); }
  if(ev.roles && ev.roles[dragName]) delete ev.roles[dragName];
  S.setEvents(events);
  dragName=null; dragFrom=null;
  renderAdminLineup(document.getElementById('pane-a-lineup'));
}
function removeFromTeam(name,teamId){
  if(!_curEventId)return;
  const events=S.events();
  const ev=events.find(x=>x.id===_curEventId); if(!ev)return;
  ev.teams[teamId]=(ev.teams[teamId]||[]).filter(n=>n!==name);
  if(ev.roles && ev.roles[name]) delete ev.roles[name];
  S.setEvents(events);
  renderAdminLineup(document.getElementById('pane-a-lineup'));
}
function clearTeam(teamId){
  if(!_curEventId||!confirm('確定清空此隊伍？'))return;
  const events=S.events();
  const ev=events.find(x=>x.id===_curEventId); if(!ev)return;
  const names=ev.teams[teamId]||[];
  if(ev.roles){ names.forEach(n=>delete ev.roles[n]); }
  ev.teams[teamId]=[];
  S.setEvents(events);
  renderAdminLineup(document.getElementById('pane-a-lineup'));
}
function refreshPool(){
  if(!_curEventId)return;
  const events=S.events();
  const ev=events.find(x=>x.id===_curEventId); if(!ev)return;
  const assigned=new Set(Object.values(ev.teams||{}).flat());
  let cands=S.members().filter(m=>!assigned.has(m.name));
  const cf=(document.getElementById('pool-class-f')||{}).value||'';
  const sf=((document.getElementById('pool-search-f')||{}).value||'').toLowerCase();
  if(cf)cands=cands.filter(m=>m.jobId===cf);
  if(sf)cands=cands.filter(m=>m.name.toLowerCase().includes(sf));
  const pool=document.getElementById('pool-cards');
  if(pool)pool.innerHTML=buildPoolCards(cands);
}
function createEvent(){
  const name=document.getElementById('ev-name').value.trim();
  const date=document.getElementById('ev-date').value;
  const type=document.getElementById('ev-type').value;
  if(!name){toast('請輸入活動名稱','err');return;}
  const events=S.events();
  const ev={id:uid(),name,date,type,teams:{attack:[],defense:[],guard:[],mobile:[],reserve:[]},roles:{},createdAt:Date.now()};
  events.push(ev); S.setEvents(events);
  _curEventId=ev.id;
  closeModal('modal-event');
  toast('場次已建立','ok');
  renderAdminLineup(document.getElementById('pane-a-lineup'));
}
function importCore(){
  if(!_curEventId)return;
  const core=S.members().filter(m=>m.status==='固定班底');
  const events=S.events();
  const ev=events.find(x=>x.id===_curEventId); if(!ev)return;
  if(!ev.teams)ev.teams={attack:[],defense:[],guard:[],mobile:[],reserve:[]};
  if(!ev.roles)ev.roles={};
  const tidMap={進攻:'attack',防守:'defense',保鏢:'guard',機動:'mobile',候補:'reserve'};
  let added=0;
  core.forEach(m=>{
    const tid=tidMap[m.team]||'reserve';
    const all=Object.values(ev.teams).flat();
    if(!all.includes(m.name)){ ev.teams[tid].push(m.name); added++; }
  });
  S.setEvents(events);
  toast(`已匯入 ${added} 位固定班底`,'ok');
  renderAdminLineup(document.getElementById('pane-a-lineup'));
}
function exportLineupExcel(){
  if(!_curEventId){toast('請先選擇場次','err');return;}
  const ev=S.events().find(e=>e.id===_curEventId);
  const members=S.members();
  const roles=ev.roles||{};
  const wb=XLSX.utils.book_new();
  TEAMS.forEach(t=>{
    const names=(ev.teams||{})[t.id]||[];
    const rows=[['角色名稱','職業','特殊角色','絕技','群俠技能']];
    names.forEach(name=>{
      const m=members.find(x=>x.name===name);
      const job=m?jobById(m.jobId):{name:''};
      const roleLabel = roles[name]==='cannon'?'砲手':roles[name]==='cmd'?'指揮':'';
      rows.push([name,job.name,roleLabel,(m?.skills||[]).join('、'),(m?.baijia||[]).join('、')]);
    });
    XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(rows),t.name);
  });
  XLSX.writeFile(wb,`排表_${MODE_LABEL[CUR_MODE]}_${ev.name}_${fmtDate(new Date())}.xlsx`);
  toast('Excel 已匯出','ok');
}

// Role assignment modal
function openRoleModal(name){
  _roleTargetName=name;
  document.getElementById('role-player-name').textContent=name;
  const ev=S.events().find(x=>x.id===_curEventId);
  const cur=(ev?.roles||{})[name]||'';
  document.getElementById('role-select').value=cur;
  openModal('modal-role');
}
function saveRole(){
  if(!_curEventId||!_roleTargetName)return;
  const val=document.getElementById('role-select').value;
  const events=S.events();
  const ev=events.find(x=>x.id===_curEventId); if(!ev)return;
  if(!ev.roles)ev.roles={};
  if(val){ ev.roles[_roleTargetName]=val; } else { delete ev.roles[_roleTargetName]; }
  S.setEvents(events);
  closeModal('modal-role');
  toast('角色已更新','ok');
  renderAdminLineup(document.getElementById('pane-a-lineup'));
}
