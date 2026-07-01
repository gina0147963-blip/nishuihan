// ============================================================
// ADMIN: LINEUP — 4大隊 × 5小隊 × 6格固定 + 候補池
// ============================================================
let dragName=null, dragFrom=null;
let _curEventId=null;
let _roleTargetName=null;

const MAIN_TEAMS=[
  {id:'attack', name:'進攻',cls:'tb-atk'},
  {id:'defense',name:'防守',cls:'tb-def'},
  {id:'guard',  name:'保鏢',cls:'tb-grd'},
  {id:'mobile', name:'機動',cls:'tb-mob'},
];
const SQUAD_SIZE=6;
const SQUAD_COUNT=5;

function sqKey(teamId,sqIdx){ return teamId+'_sq'+sqIdx; }

function ensureTeams(ev){
  if(!ev.teams) ev.teams={};
  if(!ev.roles) ev.roles={};
  MAIN_TEAMS.forEach(t=>{
    for(let i=0;i<SQUAD_COUNT;i++){
      const k=sqKey(t.id,i);
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

function renderAdminLineup(pane){
  const events=S.events().slice().reverse();
  const evOpts=events.map(e=>`<option value="${e.id}">${e.name}</option>`).join('');
  const curEv=_curEventId?S.events().find(e=>e.id===_curEventId):null;
  pane.innerHTML=`
    <div class="sec-head">
      <h2>🗡️ 出戰排表（${MODE_LABEL[CUR_MODE]}）</h2>
      <div class="sec-actions">
        <select id="ev-select" class="fsel sm" onchange="selectEvent(this.value)">
          <option value="">選擇場次...</option>${evOpts}
        </select>
        <button class="btn btn-blue sm" onclick="openModal('modal-event')">+ 新增場次</button>
        ${curEv?`<button class="btn btn-outline sm" onclick="importCore()">匯入固定班底</button><button class="btn btn-outline sm" onclick="exportLineupExcel()">📥 匯出Excel</button>`:''}
      </div>
    </div>
    <div id="lineup-body">${curEv?buildLineup(curEv):'<div class="empty"><div class="empty-ico">🗡️</div><p>請選擇或建立場次</p></div>'}</div>`;
  if(_curEventId){ const sel=document.getElementById('ev-select'); if(sel) sel.value=_curEventId; }
}

function selectEvent(id){ _curEventId=id||null; renderAdminLineup(document.getElementById('pane-a-lineup')); }

function buildLineup(ev){
  ensureTeams(ev);
  const members=S.members();
  const roles=ev.roles||{};
  const summary=buildSummaryBar(ev,members);

  const teamsHTML=MAIN_TEAMS.map(t=>{
    let totalInTeam=0;
    for(let i=0;i<SQUAD_COUNT;i++) totalInTeam+=(ev.teams[sqKey(t.id,i)]||[]).filter(Boolean).length;
    const squadsHTML=[];
    for(let i=0;i<SQUAD_COUNT;i++){
      const key=sqKey(t.id,i);
      const names=ev.teams[key]||[];
      const slots=[];
      for(let slot=0;slot<SQUAD_SIZE;slot++){
        const name=names[slot];
        if(name){
          slots.push(playerCardHTML(name,members,t.id,key,true,roles[name]));
        } else {
          slots.push(`<div class="slot-empty" ondragover="event.preventDefault();this.classList.add('drag-over-slot')" ondragleave="this.classList.remove('drag-over-slot')" ondrop="dropToSlot(event,'${key}',${slot})"><span class="slot-empty-txt">空</span></div>`);
        }
      }
      squadsHTML.push(`<div class="squad-block"><div class="squad-hd"><span class="squad-label">${t.name}-${i+1}隊</span><span class="squad-cnt">${names.filter(Boolean).length}/${SQUAD_SIZE}</span><button class="btn xs btn-outline" onclick="clearSquad('${key}')">清空</button></div><div class="squad-slots" ondragover="event.preventDefault()" ondrop="dropToSquad(event,'${key}')">${slots.join('')}</div></div>`);
    }
    return `<div class="team-block"><div class="team-hd"><div class="team-label"><span class="team-badge ${t.cls}">${t.name}</span><span class="team-cnt">${totalInTeam}/${SQUAD_COUNT*SQUAD_SIZE}</span></div></div><div class="squads-grid">${squadsHTML.join('')}</div></div>`;
  }).join('');

  const reserve=ev.teams.reserve||[];
  const reserveHTML=`<div class="team-block"><div class="team-hd"><div class="team-label"><span class="team-badge tb-rsv">候補</span><span class="team-cnt">${reserve.length}人</span></div><button class="btn xs btn-outline" onclick="clearSquad('reserve')">清空</button></div><div class="team-cards reserve-pool" ondragover="event.preventDefault();this.classList.add('drag-over')" ondragleave="this.classList.remove('drag-over')" ondrop="dropToReserve(event)">${reserve.map(n=>playerCardHTML(n,members,'reserve','reserve',true,null)).join('')}${!reserve.length?'<span style="color:var(--txt3);font-size:12px;padding:8px">拖曳玩家加入候補</span>':''}</div></div>`;

  const assigned=getAssigned(ev);
  const cands=S.members().filter(m=>!assigned.has(m.name));
  const poolHTML=buildPoolHTML(cands);

  return `${summary}<div class="lineup-board">${teamsHTML}${reserveHTML}${poolHTML}<p class="hint">💡 從候選池拖曳到格子；點 ⭐ 指定砲手/指揮；點 ✕ 移出</p></div>`;
}

function buildSummaryBar(ev,members){
  const all=[];
  Object.values(ev.teams||{}).forEach(arr=>{ if(Array.isArray(arr)) arr.forEach(n=>{ if(n) all.push(n); }); });
  if(!all.length) return '';
  const cnt={}; JOBS.forEach(j=>cnt[j.id]=0);
  all.forEach(name=>{ const m=members.find(x=>x.name===name); if(m&&cnt[m.jobId]!==undefined) cnt[m.jobId]++; });
  return `<div class="summary-bar"><span style="font-size:12px;color:var(--txt2)">總人數：</span><span style="font-weight:800;color:var(--gold);margin-right:8px">${all.length}</span>${JOBS.map(j=>cnt[j.id]?`<span class="s-chip" style="background:${j.color}">${j.name}×${cnt[j.id]}</span>`:'').join('')}</div>`;
}

function playerCardHTML(name,members,teamId,key,adminMode,role){
  const m=members.find(x=>x.name===name);
  const job=m?jobById(m.jobId):{name:'?',color:'#8892b0',id:''};
  const skills=(m&&m.skills||[]).slice(0,1).join('');
  const roleCls=role==='cannon'?' role-cannon':role==='cmd'?' role-cmd':'';
  const roleLabel=role==='cannon'?'<div class="prole cannon">🎯砲手</div>':role==='cmd'?'<div class="prole cmd">⭐指揮</div>':'';
  const canRole=adminMode&&teamId!=='reserve';
  return `<div class="pcard jbg-${job.id}${roleCls}" ${adminMode?`draggable="true" ondragstart="startDrag(event,'${name.replace(/'/g,"\\'")}','${key}')" ondragend="this.classList.remove('dragging')"`:''} title="${name}"><div class="jdot" style="background:${job.color}">${job.name.charAt(0)}</div><div class="pname">${name}</div><div class="pjob" style="color:${job.color}">${job.name}</div>${roleLabel}${skills?`<div class="ptag">${skills}</div>`:''}${canRole?`<button class="prolebtn" onclick="openRoleModal('${name.replace(/'/g,"\\'")}')">⭐</button>`:''}${adminMode?`<button class="premove" onclick="removeFromLineup('${name.replace(/'/g,"\\'")}','${key}')">✕</button>`:''}</div>`;
}

function buildPoolHTML(cands){
  const classF=(document.getElementById('pool-class-f')||{value:''}).value||'';
  const searchF=((document.getElementById('pool-search-f')||{value:''}).value||'').toLowerCase();
  let f=cands;
  if(classF) f=f.filter(m=>m.jobId===classF);
  if(searchF) f=f.filter(m=>m.name.toLowerCase().includes(searchF));
  return `<div class="pool-sec"><div class="pool-hd"><h3>候選成員（${f.length}/${cands.length}）</h3><div class="pool-filters"><select id="pool-class-f" class="fsel sm" onchange="refreshPool()"><option value="">所有職業</option>${JOBS.map(j=>`<option value="${j.id}">${j.name}</option>`).join('')}</select><input id="pool-search-f" class="fi sm" placeholder="搜尋..." oninput="refreshPool()" style="width:90px"></div></div><div id="pool-cards" class="pool-cards" ondragover="event.preventDefault();this.classList.add('drag-over')" ondragleave="this.classList.remove('drag-over')" ondrop="dropToPool(event)">${f.length?f.map(m=>playerCardHTML(m.name,S.members(),null,'pool',true,null)).join(''):'<span style="color:var(--txt3);font-size:12px;padding:8px">所有成員已分配</span>'}</div></div>`;
}

function refreshPool(){
  if(!_curEventId) return;
  const ev=S.events().find(x=>x.id===_curEventId); if(!ev) return;
  ensureTeams(ev);
  const assigned=getAssigned(ev);
  const cands=S.members().filter(m=>!assigned.has(m.name));
  const classF=(document.getElementById('pool-class-f')||{value:''}).value||'';
  const searchF=((document.getElementById('pool-search-f')||{value:''}).value||'').toLowerCase();
  let f=cands;
  if(classF) f=f.filter(m=>m.jobId===classF);
  if(searchF) f=f.filter(m=>m.name.toLowerCase().includes(searchF));
  const pool=document.getElementById('pool-cards');
  if(pool) pool.innerHTML=f.length?f.map(m=>playerCardHTML(m.name,S.members(),null,'pool',true,null)).join(''):'<span style="color:var(--txt3);font-size:12px;padding:8px">所有成員已分配</span>';
}

function startDrag(e,name,fromKey){
  dragName=name; dragFrom=fromKey;
  e.currentTarget.classList.add('dragging');
  e.dataTransfer.setData('text/plain',name);
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
  const events=S.events();
  const ev=events.find(x=>x.id===_curEventId); if(!ev) return;
  ensureTeams(ev);
  const arr=ev.teams[targetKey]||[];
  const filled=arr.filter(Boolean).length;
  if(filled>=SQUAD_SIZE){ toast('此小隊已滿（'+SQUAD_SIZE+'人）','err'); dragName=null; return; }
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
  renderAdminLineup(document.getElementById('pane-a-lineup'));
}

function _doMove(targetKey,slotIdx){
  if(!_curEventId) return;
  const events=S.events();
  const ev=events.find(x=>x.id===_curEventId); if(!ev) return;
  ensureTeams(ev);
  if(!ev.teams[targetKey]) ev.teams[targetKey]=[];

  if(targetKey==='reserve'){
    _removeFromKey(ev,dragName,dragFrom);
    if(!ev.teams.reserve.includes(dragName)) ev.teams.reserve.push(dragName);
  } else if(slotIdx!==null){
    const occupant=(ev.teams[targetKey]||[])[slotIdx];
    _removeFromKey(ev,dragName,dragFrom);
    if(!ev.teams[targetKey]) ev.teams[targetKey]=[];
    while(ev.teams[targetKey].length<=slotIdx) ev.teams[targetKey].push(null);
    if(occupant&&occupant!==dragName){
      ev.teams[targetKey][slotIdx]=dragName;
      if(dragFrom&&dragFrom!=='pool'&&dragFrom!==targetKey&&dragFrom!=='reserve'){
        const src=ev.teams[dragFrom]||[];
        const emptyIdx=src.indexOf(null);
        if(emptyIdx>=0) src[emptyIdx]=occupant;
        else if(src.filter(Boolean).length<SQUAD_SIZE) src.push(occupant);
        else ev.teams.reserve.push(occupant);
      } else {
        ev.teams.reserve.push(occupant);
      }
    } else if(!occupant){
      ev.teams[targetKey][slotIdx]=dragName;
    }
  } else {
    // drop to squad (no specific slot) — find first empty slot
    _removeFromKey(ev,dragName,dragFrom);
    if(!ev.teams[targetKey]) ev.teams[targetKey]=[];
    const arr=ev.teams[targetKey];
    let placed=false;
    for(let i=0;i<SQUAD_SIZE;i++){
      if(!arr[i]){ arr[i]=dragName; placed=true; break; }
    }
    if(!placed&&arr.filter(Boolean).length<SQUAD_SIZE){ arr.push(dragName); }
  }

  S.setEvents(events);
  dragName=null; dragFrom=null;
  renderAdminLineup(document.getElementById('pane-a-lineup'));
}

function _removeFromKey(ev,name,key){
  if(!key||key==='pool') return;
  if(!ev.teams[key]) return;
  const idx=ev.teams[key].indexOf(name);
  if(idx>=0) ev.teams[key][idx]=null;
  // clean trailing nulls
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
  renderAdminLineup(document.getElementById('pane-a-lineup'));
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
  renderAdminLineup(document.getElementById('pane-a-lineup'));
}

function createEvent(){
  const nameEl=document.getElementById('ev-name');
  const dateEl=document.getElementById('ev-date');
  const typeEl=document.getElementById('ev-type');
  const name=(nameEl?nameEl.value:'').trim();
  const date=dateEl?dateEl.value:'';
  const type=typeEl?typeEl.value:'單周聯賽';
  if(!name){ toast('請輸入活動名稱','err'); return; }
  const events=S.events();
  const newEv={id:uid(),name,date,type,teams:{reserve:[]},roles:{},createdAt:Date.now()};
  ensureTeams(newEv);
  events.push(newEv);
  const ok=S.setEvents(events);
  if(!ok) return;
  _curEventId=newEv.id;
  closeModal('modal-event');
  toast('場次「'+name+'」已建立','ok');
  switchTab('a-lineup');
}

function importCore(){
  if(!_curEventId) return;
  const core=S.members().filter(m=>m.status==='固定班底');
  const events=S.events();
  const ev=events.find(x=>x.id===_curEventId); if(!ev) return;
  ensureTeams(ev);
  const assigned=getAssigned(ev);
  const tidMap={進攻:'attack',防守:'defense',保鏢:'guard',機動:'mobile',候補:'reserve'};
  let added=0;
  core.forEach(m=>{
    if(assigned.has(m.name)) return;
    const team=tidMap[m.team]||'reserve';
    if(team==='reserve'){ ev.teams.reserve.push(m.name); added++; return; }
    let placed=false;
    for(let i=0;i<SQUAD_COUNT;i++){
      const k=sqKey(team,i);
      const arr=ev.teams[k]||[];
      if(arr.filter(Boolean).length<SQUAD_SIZE){ arr.push(m.name); ev.teams[k]=arr; placed=true; added++; break; }
    }
    if(!placed){ ev.teams.reserve.push(m.name); added++; }
  });
  S.setEvents(events);
  toast('已匯入 '+added+' 位固定班底','ok');
  renderAdminLineup(document.getElementById('pane-a-lineup'));
}

function exportLineupExcel(){
  if(!_curEventId){ toast('請先選擇場次','err'); return; }
  const ev=S.events().find(e=>e.id===_curEventId);
  ensureTeams(ev);
  const members=S.members();
  const roles=ev.roles||{};
  const wb=XLSX.utils.book_new();
  MAIN_TEAMS.forEach(t=>{
    const rows=[['小隊','位置','角色名稱','職業','特殊角色','絕技','群俠技能']];
    for(let i=0;i<SQUAD_COUNT;i++){
      const k=sqKey(t.id,i);
      const names=ev.teams[k]||[];
      for(let slot=0;slot<SQUAD_SIZE;slot++){
        const name=names[slot]||'';
        const m=name?members.find(x=>x.name===name):null;
        const job=m?jobById(m.jobId):{name:''};
        rows.push([t.name+'-'+(i+1)+'隊',slot+1,name,job.name,roles[name]==='cannon'?'砲手':roles[name]==='cmd'?'指揮':'',(m&&m.skills||[]).join('、'),(m&&m.baijia||[]).join('、')]);
      }
    }
    XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(rows),t.name);
  });
  const rsv=ev.teams.reserve||[];
  const rsvRows=[['角色名稱','職業','絕技']];
  rsv.filter(Boolean).forEach(name=>{ const m=members.find(x=>x.name===name); const job=m?jobById(m.jobId):{name:''}; rsvRows.push([name,job.name,(m&&m.skills||[]).join('、')]); });
  XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(rsvRows),'候補');
  XLSX.writeFile(wb,'排表_'+MODE_LABEL[CUR_MODE]+'_'+ev.name+'_'+fmtDate(new Date())+'.xlsx');
  toast('Excel 已匯出','ok');
}

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
  if(val){ ev.roles[_roleTargetName]=val; } else { delete ev.roles[_roleTargetName]; }
  S.setEvents(events);
  closeModal('modal-role');
  toast('角色已更新','ok');
  renderAdminLineup(document.getElementById('pane-a-lineup'));
}

function renderPlayerLineup(pane){
  const events=S.events().slice().reverse();
  if(!events.length){ pane.innerHTML='<div class="empty"><div class="empty-ico">📋</div><p>尚無排表</p></div>'; return; }
  const ev=events[0]; ensureTeams(ev);
  const members=S.members(); const roles=ev.roles||{};
  const teamsHTML=MAIN_TEAMS.map(t=>{
    const squadsHTML=[];
    for(let i=0;i<SQUAD_COUNT;i++){
      const k=sqKey(t.id,i);
      const names=ev.teams[k]||[];
      if(!names.filter(Boolean).length) continue;
      squadsHTML.push(`<div class="squad-block"><div class="squad-hd"><span class="squad-label">${t.name}-${i+1}隊</span><span class="squad-cnt">${names.filter(Boolean).length}/${SQUAD_SIZE}</span></div><div class="squad-slots">${Array.from({length:SQUAD_SIZE},(_,s)=>{ const n=names[s]; return n?playerCardHTML(n,members,t.id,k,false,roles[n]):'<div class="slot-empty"><span class="slot-empty-txt">空</span></div>'; }).join('')}</div></div>`);
    }
    if(!squadsHTML.length) return '';
    return `<div class="team-block"><div class="team-hd"><div class="team-label"><span class="team-badge ${t.cls}">${t.name}</span></div></div><div class="squads-grid">${squadsHTML.join('')}</div></div>`;
  }).join('');
  pane.innerHTML=`<div class="sec-head"><h2>📋 本週排表</h2><span style="font-size:13px;color:var(--txt2)">${ev.name}</span></div>${buildSummaryBar(ev,members)}<div class="lineup-board">${teamsHTML||'<div class="empty"><div class="empty-ico">🗡️</div><p>尚未排表</p></div>'}</div>`;
}
