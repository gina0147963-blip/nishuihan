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

// 活動當天過完（隔天起）就鎖定排表，不可再編輯（避免誤改舊紀錄）
function _isLineupLocked(evId){
  const ev=S.events().find(e=>e.id===evId);
  if(!ev||!ev.date) return false;
  const dateOnly=String(ev.date).slice(0,10); // 防禦：避免舊資料混入完整時間戳記
  const evDay=new Date(dateOnly+'T00:00:00');
  if(isNaN(evDay.getTime())) return false;
  // 活動當天可編輯；活動日結束（隔天 00:00 起）即鎖定
  const unlockUntil=evDay.getTime()+24*60*60*1000-1; // 到活動當天 23:59:59 為止都還能編輯
  return Date.now()>unlockUntil;
}
// 在會修改排表內容的函式最前面呼叫；鎖定時彈出提示並回傳 true 讓呼叫端提早結束
function _guardLineupLock(){
  if(_isLineupLocked(_curEventId)){ toast('此場次活動已超過一天，排表已鎖定，僅供檢視','err'); return true; }
  return false;
}

// ============================================================
// ADMIN RENDER
// ============================================================
// 依報名狀態自動維護候補隊伍：
// - 報名選「🟡 候補」且尚未被排進任何隊伍的玩家 → 自動加入右下角候補隊伍
// - 已在候補隊伍但改成「請假」的玩家 → 自動移出（會出現在左側請假區）
// 僅在管理端且排表未鎖定時執行；有變動才儲存，避免無謂的同步寫入
function autoPlaceReserve(ev){
  if(_isLineupLocked(ev.id)) return false;
  ensureTeams(ev);
  const signups=S.signups()[ev.id]||{};
  const assigned=getAssigned(ev);
  const memberNames=new Set(S.members().map(m=>m.name));
  let changed=false;
  // 加入：報名候補、是成員、尚未被排入任何隊伍（含候補）
  Object.entries(signups).forEach(([name,st])=>{
    if(st!=='reserve') return;
    if(!memberNames.has(name)) return;
    if(assigned.has(name)) return;
    ev.teams.reserve.push(name);
    assigned.add(name);
    changed=true;
  });
  // 移出：在候補隊伍中但已改成請假
  const before=ev.teams.reserve.length;
  ev.teams.reserve=ev.teams.reserve.filter(n=>signups[n]!=='absent');
  if(ev.teams.reserve.length!==before) changed=true;
  if(changed){
    ev.updatedAt=Date.now();
    const events=S.events().map(e=>e.id===ev.id?ev:e);
    S.setEvents(events);
  }
  return changed;
}

function renderAdminLineup(pane){
  const events=S.events().slice().sort((a,b)=>(b.date||'').localeCompare(a.date||''));
  const evOpts=events.map(e=>`<option value="${e.id}">${e.name}</option>`).join('');
  const curEv=_curEventId?S.events().find(e=>e.id===_curEventId):null;
  if(curEv) autoPlaceReserve(curEv); // 報名「候補」者自動加入候補隊伍；改請假者自動移出
  const locked=curEv?_isLineupLocked(curEv.id):false;
  pane.innerHTML=`
    <div class="sec-head">
      <h2>🗡️ 出戰排表（${ORG_LABEL()}）</h2>
      <div class="sec-actions">
        <select id="ev-select" class="fsel sm" onchange="selectEvent(this.value)">
          <option value="">選擇場次...</option>${evOpts}
        </select>
        ${curEv?`
          <button class="btn btn-outline sm" onclick="addTeam()" ${locked?'disabled':''}>+ 新增團</button>
          <button class="btn btn-outline sm" onclick="openCopyLineup()" ${locked?'disabled':''}>📋 複製其他場次</button>
          <button class="btn btn-green sm" onclick="saveLineupPlan()" ${locked?'disabled':''}>💾 儲存排表方案</button>
          <button class="btn btn-outline sm" onclick="exportLineupImage()">🖼️ 匯出圖片</button>
          `:''}
      </div>
    </div>
    ${locked?'<p class="hint" style="color:var(--bad)">🔒 此場次活動已超過一天，排表已鎖定僅供檢視，無法再編輯（匯出圖片不受影響）</p>':'<p class="hint">💡 場次由「報名管理」建立。左側玩家池分已報名/未報名/請假，拖曳玩家卡到右側格子排表。點卡片可看技能。</p>'}
    <div id="lineup-body">${curEv?buildLineup(curEv,locked):'<div class="empty"><div class="empty-ico">🗡️</div><p>請先到「報名管理」建立場次，或於上方選擇場次</p></div>'}</div>`;
  if(_curEventId){ const sel=document.getElementById('ev-select'); if(sel) sel.value=_curEventId; }
}

function selectEvent(id){ _curEventId=id||null; renderAdminLineup(document.getElementById('pane-a-lineup')); }

function buildLineup(ev,locked){
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
          slots.push(playerCardHTML(name,members,ti,key,!locked,roles[name],signups[name]==='absent',null,slot));
        } else {
          slots.push(locked
            ?`<div class="slot-empty"><span class="slot-empty-txt">空</span></div>`
            :`<div class="slot-empty" ondragover="event.preventDefault();this.classList.add('drag-over-slot')" ondragleave="this.classList.remove('drag-over-slot')" ondrop="dropToSlot(event,'${key}',${slot})"><span class="slot-empty-txt">空</span></div>`);
        }
      }
      squadsHTML.push(`<div class="squad-block${isGuard?' squad-guard':''}">
        <div class="squad-hd">
          <span class="squad-label">${tName}-${i+1}隊${isGuard?' 🛡️保鏢':''}</span>
          <span class="squad-cnt">${names.filter(Boolean).length}/${SQUAD_SIZE}</span>
          <button class="btn xs btn-purple" onclick="toggleSquadGuard('${key}')" title="標記為保鏢小隊" ${locked?'disabled':''}>🛡️</button>
          <button class="btn xs btn-outline" onclick="clearSquad('${key}')" ${locked?'disabled':''}>清空</button>
        </div>
        <div class="squad-slots" ${locked?'':`ondragover="event.preventDefault()"`}>${slots.join('')}</div>
      </div>`);
    }
    return `<div class="team-block">
      <div class="team-hd">
        <div class="team-label">
          <span class="team-badge ${cls}">${tName}</span>
          <span class="team-cnt">${total}/${SQUAD_COUNT*SQUAD_SIZE}</span>
        </div>
        <div style="display:flex;gap:4px">
          <button class="btn xs btn-outline" onclick="renameTeam(${ti})" ${locked?'disabled':''}>改名</button>
          ${ev.teamNames.length>1?`<button class="btn xs btn-red" onclick="removeTeam(${ti})" ${locked?'disabled':''}>刪除團</button>`:''}
        </div>
      </div>
      <div class="squads-grid">${squadsHTML.join('')}</div>
    </div>`;
  }).join('');


  return `
  <div class="lineup-layout">
    <div class="lineup-left" ${locked?'':`ondragover="event.preventDefault();this.classList.add('drag-over')" ondragleave="this.classList.remove('drag-over')" ondrop="dropToPool(event)"`}>
      <div class="pool-hd-fixed">
        <h3 style="flex:0 0 auto">成員池</h3>
        <div style="display:flex;gap:6px;flex:1 1 auto;min-width:0">
          <select id="pool-class-f" class="fsel sm" onchange="refreshPoolOnly()" style="flex:1 1 0;min-width:0"><option value="">全部職業</option>${JOBS.map(j=>`<option value="${j.id}">${j.name}</option>`).join('')}</select>
          <input id="pool-search-f" class="fi sm" placeholder="搜尋..." oninput="refreshPoolOnly()" style="flex:1 1 0;min-width:0">
        </div>
      </div>
      <div id="pool-groups">${buildPoolGroups(ev,locked)}</div>
    </div>
    <div class="lineup-right">
      ${buildSummaryBar(ev,members)}
      ${teamsHTML}
      <div class="team-block">
        <div class="team-hd"><div class="team-label"><span class="team-badge tb-rsv">候補</span><span class="team-cnt">${(ev.teams.reserve||[]).filter(Boolean).length}人</span></div>
        <button class="btn xs btn-outline" onclick="clearSquad('reserve')" ${locked?'disabled':''}>清空</button></div>
        <div class="team-cards reserve-pool" ${locked?'':`ondragover="event.preventDefault();this.classList.add('drag-over')" ondragleave="this.classList.remove('drag-over')" ondrop="dropToReserve(event)"`}>
          ${(ev.teams.reserve||[]).filter(Boolean).map(n=>playerCardHTML(n,members,-1,'reserve',!locked,null,signups[n]==='absent')).join('')}
          ${!(ev.teams.reserve||[]).length?'<span style="color:var(--txt3);font-size:12px;padding:8px">拖曳成員加入候補</span>':''}
        </div>
      </div>
    </div>
  </div>`;
}

function buildSummaryBar(ev,members){
  const all=[];
  // 總人數統計不含候補隊伍（只計實際出戰名單）
  Object.entries(ev.teams||{}).forEach(([k,arr])=>{ if(k==='reserve'||!Array.isArray(arr)) return; arr.forEach(n=>{ if(n) all.push(n); }); });
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
function playerCardHTML(name,members,teamIdx,key,adminMode,role,isAbsent,evOverride,slotIdx){
  const m=members.find(x=>x.name===name);
  const job=m?jobById(m.jobId):{name:'⚠️查無資料',color:'#e05252',id:''};
  const missingCls=m?'':' pcard-missing';
  const esc=name.replace(/'/g,"\\'");
  const roleCls=role==='cannon'?' role-cannon':role==='cmd'?' role-cmd':'';
  const absentCls=isAbsent?' pcard-absent':'';
  const roleLabel=role==='cannon'?'<div class="prole cannon">💣砲手</div>':role==='cmd'?'<div class="prole cmd">🎤指揮</div>':'';
  const slotDropAttr=adminMode&&slotIdx!==null&&slotIdx!==undefined?` ondragover="event.preventDefault();this.classList.add('drag-over-slot')" ondragleave="this.classList.remove('drag-over-slot')" ondrop="dropToSlot(event,'${key}',${slotIdx})"`:'';
  return `<div class="pcard jbg-${job.id}${roleCls}${absentCls}${missingCls}"
    ${adminMode?`draggable="true" ondragstart="startDrag(event,'${esc}','${key}')" ondragend="this.classList.remove('dragging')"`:''}${slotDropAttr}
    title="${m?name:name+'（成員資料庫查無此人，請至「成員管理」→「🔧 從排表補齊成員」修復）'}">
    <div class="jdot" style="background:${job.color}">${job.img?`<img class="jimg" src="icons/jobs/${job.id}.png" alt="">`:(job.icon||job.name.charAt(0))}</div>
    <div class="pname">${name}</div>
    <div class="pjob" style="color:${job.color}">${job.name}</div>
    ${roleLabel}
    ${(function(){
      // evOverride：明確指定要查詢技能指派的場次（玩家端查看排表用，含歷史場次）；
      // 沒傳的話沿用原本行為，從目前管理端正在編輯的 _curEventId 取得（排表系統拖曳排表用）
      const ev=evOverride||S.events().find(e=>e.id===_curEventId);
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
  if(body) body.innerHTML=buildLineup(ev,_isLineupLocked(_curEventId));
  const cf=document.getElementById('pool-class-f'); if(cf&&savedQc){ cf.value=savedQc; }
  const sf=document.getElementById('pool-search-f'); if(sf&&savedQs){ sf.value=savedQs; }
  if(savedQc||savedQs) refreshPoolOnly();
}

// ============================================================
// TEAM MANAGEMENT
// ============================================================
function addTeam(){
  if(!_curEventId) return;
  if(_guardLineupLock()) return;
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
  if(_guardLineupLock()) return;
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
  if(_guardLineupLock()) return;
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
  if(_guardLineupLock()) return;
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
  e.stopPropagation();
  e.currentTarget.classList.remove('drag-over-slot');
  if(!dragName||!_curEventId) return;
  if(_guardLineupLock()){ dragName=null; return; }
  _doMove(targetKey,slotIdx);
}
function dropToSquad(e,targetKey){
  e.preventDefault();
  e.stopPropagation();
}
function dropToReserve(e){
  e.preventDefault();
  e.stopPropagation();
  e.currentTarget.classList.remove('drag-over');
  if(!dragName||!_curEventId) return;
  if(_guardLineupLock()){ dragName=null; return; }
  _doMove('reserve',null);
}
function dropToPool(e){
  e.preventDefault();
  e.stopPropagation();
  e.currentTarget.classList.remove('drag-over');
  if(!dragName||!_curEventId||dragFrom==='pool') return;
  if(_guardLineupLock()){ dragName=null; dragFrom=null; return; }
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

  if(targetKey==='reserve'){
    // 全域去重後放入候補
    Object.keys(ev.teams).forEach(k=>{ if(k!=='reserve') _removeFromKey(ev,dragName,k); });
    _removeFromKey(ev,dragName,dragFrom);
    if(!ev.teams.reserve.includes(dragName)) ev.teams.reserve.push(dragName);
    S.setEvents(events); dragName=null; dragFrom=null; refreshLineup(); return;
  }

  const sameSquad=(dragFrom===targetKey);
  const compactTarget=(ev.teams[targetKey]||[]).filter(Boolean);
  let list=sameSquad?compactTarget.filter(n=>n!==dragName):compactTarget.slice();

  if(!sameSquad){
    // 不是同一小隊：先把被拖曳者從原本位置移除（包含候補/其他隊伍）
    Object.keys(ev.teams).forEach(k=>{ if(k!==targetKey) _removeFromKey(ev,dragName,k); });
  }

  if(slotIdx!==null){
    // 精準落點插入；目標位置才是最終排序位置
    const insertAt=Math.max(0,Math.min(slotIdx, list.length));
    list.splice(insertAt, 0, dragName);

    if(!sameSquad && list.length>SQUAD_SIZE){
      const overflow=list.slice(SQUAD_SIZE);
      list=list.slice(0,SQUAD_SIZE);
      overflow.forEach(n=>{
        if(!n) return;
        Object.keys(ev.teams).forEach(k=>{ _removeFromKey(ev,n,k); });
        const ri=(ev.teams.reserve||[]).indexOf(n); if(ri>=0) ev.teams.reserve.splice(ri,1);
        if(ev.roles&&ev.roles[n]) delete ev.roles[n];
      });
      toast('小隊已滿，'+overflow.join('、')+' 已移回成員池','');
    }

    ev.teams[targetKey]=Array.from({length:SQUAD_SIZE},(_,i)=>list[i]||null);
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
  if(_guardLineupLock()) return;
  const events=S.events();
  const ev=events.find(x=>x.id===_curEventId); if(!ev) return;
  ensureTeams(ev);
  _removeFromKey(ev,name,key);
  if(ev.roles&&ev.roles[name]) delete ev.roles[name];
  S.setEvents(events);
  refreshLineup();
}
function clearSquad(key){
  if(!_curEventId) return;
  if(_guardLineupLock()) return;
  if(!confirm('確定清空？')) return;
  const events=S.events();
  const ev=events.find(x=>x.id===_curEventId); if(!ev) return;
  ensureTeams(ev);
  const names=ev.teams[key]||[];
  if(ev.roles) names.filter(Boolean).forEach(n=>{ if(ev.roles[n]) delete ev.roles[n]; });
  ev.teams[key]=[];
  S.setEvents(events);
  refreshLineup();
}

// 注意：原本的「匯入固定團」自動排位功能已移除，改為在成員池頂部
// 固定顯示「⭐ 固定團」分類（見 buildPoolGroups），由管理員手動拖曳入隊，
// 避免因隊伍名稱對不上或隊伍已滿，而被錯誤塞進候補。

// ============================================================
// 儲存排表方案（作為預定排表，供出席率比對）
// ============================================================
function saveLineupPlan(){
  if(!_curEventId) return;
  if(_guardLineupLock()) return;
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
// 自動調整文字大小以塞進指定寬度：先逐步縮小字體（到下限為止），
// 仍放不下才以「完整字元」為單位安全截斷加「…」（不會把表情符號切成亂碼）。
// 呼叫後 ctx.font 已設定為最終字體，直接 fillText 回傳值即可。
function _fitText(ctx, text, maxWidth, baseSize, minSize, bold){
  const font=s=>(bold?'bold ':'')+s+'px sans-serif';
  let size=baseSize;
  ctx.font=font(size);
  while(size>minSize && ctx.measureText(text).width>maxWidth){ size--; ctx.font=font(size); }
  let out=String(text);
  if(ctx.measureText(out).width>maxWidth){
    const chars=[...out]; // 以完整字元（含表情符號）為單位截斷
    while(chars.length && ctx.measureText(chars.join('')+'…').width>maxWidth) chars.pop();
    out=chars.join('')+'…';
  }
  return out;
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
  const teamColors=['#e05252','#4f8ef7','#3db87a','#f0b843','#a78bfa','#38bdf8'];

  // ── 版面設定：小隊改為「直欄」呈現（每小隊一欄、隊員往下排 6 列），
  //    每欄寬度大幅增加，搭配較大字體，轉傳 Discord/Line 壓縮後仍清晰 ──
  const CW=1080, PAD=20, HDH=60, TEAMHD=40, SQHD=30;
  const COLW=Math.floor((CW-PAD*2)/SQUAD_COUNT); // 每小隊欄寬（5欄 → 每欄約208px）
  const measureCv=document.createElement('canvas');
  const mctx=measureCv.getContext('2d');

  function slotSkillLines(name){
    if(!name) return [];
    const asRaw=assignedSkills[name], abRaw=assignedBaijia[name];
    const as=Array.isArray(asRaw)?asRaw:(asRaw?[asRaw]:[]);
    const ab=Array.isArray(abRaw)?abRaw:(abRaw?[abRaw]:[]);
    const lines=[];
    mctx.font='16px sans-serif';
    if(as.length) lines.push(..._wrapCanvasText(mctx,'絕技：'+as.join('、'),COLW-18));
    if(ab.length) lines.push(..._wrapCanvasText(mctx,'群俠：'+ab.join('、'),COLW-18));
    return lines;
  }

  // 每個團在轉置後的「列高」：同一列（各小隊的第 r 位隊員）取技能行數最多者
  function teamRowHeights(ti){
    const hs=[];
    for(let r=0;r<SQUAD_SIZE;r++){
      let maxLines=0;
      for(let i=0;i<SQUAD_COUNT;i++){
        const names=ev.teams[sqKey(ti,i)]||[];
        const n=slotSkillLines(names[r]).length;
        if(n>maxLines) maxLines=n;
      }
      hs.push(Math.max(64, 54+maxLines*20+8));
    }
    return hs;
  }
  function teamBlockHeight(ti){
    return TEAMHD+SQHD+teamRowHeights(ti).reduce((a,b)=>a+b,0)+16;
  }

  // 候補區塊
  const reserveNames=(ev.teams.reserve||[]).filter(Boolean);
  const RESERVE_HD=34, RESERVE_COLS=SQUAD_COUNT;
  const reserveRowCount=Math.ceil(reserveNames.length/RESERVE_COLS);
  const reserveRowH=[];
  for(let r=0;r<reserveRowCount;r++){
    let maxLines=0;
    for(let c=0;c<RESERVE_COLS;c++){
      const idx=r*RESERVE_COLS+c;
      if(idx>=reserveNames.length) break;
      const n=slotSkillLines(reserveNames[idx]).length;
      if(n>maxLines) maxLines=n;
    }
    reserveRowH.push(Math.max(64, 54+maxLines*20+8));
  }
  const reserveH=reserveNames.length?(RESERVE_HD+8+reserveRowH.reduce((a,b)=>a+b+8,0)+8):0;

  // 繪製單一個團（轉置版：欄=小隊、列=隊員）
  function drawTeam(ctx,ti,y){
    const tName=ev.teamNames[ti];
    ctx.fillStyle=teamColors[ti%teamColors.length];
    ctx.fillRect(PAD,y,CW-PAD*2,32);
    ctx.fillStyle='#fff'; ctx.font='bold 20px sans-serif';
    ctx.fillText(tName,PAD+12,y+23);
    y+=TEAMHD;
    const colTop=y; // 整欄保鏢框的起點（欄標題上緣）
    // 小隊名稱列（欄標題）
    for(let i=0;i<SQUAD_COUNT;i++){
      const k=sqKey(ti,i);
      const isGuard=squadRoles[k]==='guard';
      const x=PAD+i*COLW;
      ctx.fillStyle=isGuard?'#3a3d0a':'#1e2538';
      ctx.fillRect(x,y,COLW-4,SQHD-4);
      ctx.fillStyle=isGuard?'#eaff00':'#aeb6d0';
      ctx.fillText(_fitText(ctx,tName+'-'+(i+1)+'隊'+(isGuard?' 🛡️':''),COLW-16,15,12,true),x+8,y+19);
    }
    y+=SQHD;
    const rowHs=teamRowHeights(ti);
    for(let r=0;r<SQUAD_SIZE;r++){
      const rowH=rowHs[r];
      for(let i=0;i<SQUAD_COUNT;i++){
        const k=sqKey(ti,i);
        const names=ev.teams[k]||[];
        const isGuard=squadRoles[k]==='guard';
        const name=names[r];
        const x=PAD+i*COLW;
        if(name){
          const m=members.find(mm=>mm.name===name);
          const job=m?jobById(m.jobId):{color:'#8892b0',name:'?'};
          ctx.fillStyle=job.color;
          ctx.fillRect(x,y+2,COLW-4,rowH-4);
          ctx.fillStyle='#fff';
          const label=name+(roles[name]==='cannon'?' 💣':roles[name]==='cmd'?' 🎤':'');
          ctx.fillText(_fitText(ctx,label,COLW-16,20,14,true), x+8, y+26);
          ctx.font='14px sans-serif';
          ctx.fillText(job.name, x+8, y+46);
          let ly=y+66;
          slotSkillLines(name).forEach(ln=>{ ctx.font='16px sans-serif'; ctx.fillText(ln, x+8, ly); ly+=20; });
        } else {
          ctx.strokeStyle='#2d3651';
          ctx.strokeRect(x,y+2,COLW-4,rowH-4);
          ctx.fillStyle='#4a5578'; ctx.font='14px sans-serif';
          ctx.fillText('空',x+COLW/2-8,y+rowH/2+4);
        }
      }
      y+=rowH;
    }
    // 保鏢小隊：整隊用一個粗黃框框起（從欄標題到最後一列），而非每張名片各自框線
    for(let i=0;i<SQUAD_COUNT;i++){
      if(squadRoles[sqKey(ti,i)]!=='guard') continue;
      const x=PAD+i*COLW;
      ctx.strokeStyle='#eaff00'; ctx.lineWidth=4; // 螢光黃粗框：與所有職業代表色都不同，對比明顯
      ctx.strokeRect(x-2, colTop-2, COLW, y-colTop+2);
      ctx.lineWidth=1;
    }
    return y+16;
  }

  // 繪製候補區塊
  function drawReserve(ctx,y){
    if(!reserveNames.length) return y;
    ctx.fillStyle='#5a6272';
    ctx.fillRect(PAD,y,CW-PAD*2,RESERVE_HD);
    ctx.fillStyle='#fff'; ctx.font='bold 20px sans-serif';
    ctx.fillText('📋 候補（'+reserveNames.length+'人）', PAD+12, y+25);
    y+=RESERVE_HD+8;
    for(let r=0;r<reserveRowCount;r++){
      const rowH=reserveRowH[r];
      for(let c=0;c<RESERVE_COLS;c++){
        const idx=r*RESERVE_COLS+c;
        if(idx>=reserveNames.length) break;
        const name=reserveNames[idx];
        const x=PAD+c*COLW;
        const m=members.find(mm=>mm.name===name);
        const job=m?jobById(m.jobId):{name:'⚠️查無資料',color:'#e05252',id:''};
        ctx.fillStyle=job.color;
        ctx.fillRect(x,y,COLW-4,rowH-4);
        ctx.fillStyle='#fff';
        ctx.fillText(_fitText(ctx,name,COLW-16,20,14,true), x+8, y+24);
        ctx.font='14px sans-serif';
        ctx.fillText(job.name, x+8, y+44);
        let ly=y+64;
        slotSkillLines(name).forEach(ln=>{ ctx.font='16px sans-serif'; ctx.fillText(ln, x+8, ly); ly+=20; });
      }
      y+=rowH+8;
    }
    return y+8;
  }

  // ── 分成兩張圖片：第 1 張＝前兩個團（進攻＋防守）；
  //    第 2 張＝其餘的團（機動等）＋候補。團數不超過 2 時只輸出一張。──
  const teamIdx=ev.teamNames.map((_,i)=>i);
  const pages=[];
  if(teamIdx.length<=2){
    pages.push({teams:teamIdx, reserve:true});
  } else {
    pages.push({teams:teamIdx.slice(0,2), reserve:false});
    pages.push({teams:teamIdx.slice(2), reserve:true});
  }

  const title='⚔️ '+ev.name+' '+ORG_LABEL()+'（'+(ev.type||'')+'）';
  let exported=0;
  pages.forEach((page,pi)=>{
    let totalH=HDH+PAD;
    page.teams.forEach(ti=>{ totalH+=teamBlockHeight(ti); });
    if(page.reserve) totalH+=reserveH;
    totalH+=50;

    const cv=document.createElement('canvas');
    const EXPORT_SCALE=2;
    cv.width=CW*EXPORT_SCALE; cv.height=totalH*EXPORT_SCALE;
    const ctx=cv.getContext('2d');
    ctx.scale(EXPORT_SCALE,EXPORT_SCALE);
    ctx.fillStyle='#0d1117'; ctx.fillRect(0,0,CW,totalH);
    ctx.fillStyle='#e8eaf6';
    ctx.fillText(_fitText(ctx,title+(pages.length>1?'　'+(pi+1)+'/'+pages.length:''),CW-PAD*2,26,18,true), PAD, 44);

    let y=HDH+PAD;
    page.teams.forEach(ti=>{ y=drawTeam(ctx,ti,y); });
    if(page.reserve) y=drawReserve(ctx,y);

    cv.toBlob(blob=>{
      const a=document.createElement('a');
      a.href=URL.createObjectURL(blob);
      a.download='排表_'+ORG_LABEL()+'_'+ev.name+(pages.length>1?'_'+(pi+1):'')+'.png';
      a.click();
      exported++;
      if(exported===pages.length) toast('✅ 已匯出 '+pages.length+' 張圖片','ok');
    });
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
  XLSX.writeFile(wb,'排表_'+ORG_LABEL()+'_'+ev.name+'.xlsx');
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
  if(_guardLineupLock()) return;
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
// 產生單一場次的排表板 HTML（玩家端共用：頂端當前場次與歷屆展開都用這個）
function _buildPlayerBoardHTML(ev){
  ensureTeams(ev);
  const members=S.members(); const roles=ev.roles||{};

  // 找出玩家自己被排在哪個「團」（含候補）；找不到就代表這場還沒被排入
  let myTi=null, myIsReserve=false;
  if((ev.teams.reserve||[]).includes(CUR_USER)){
    myIsReserve=true;
  } else {
    outer:
    for(let ti=0; ti<ev.teamNames.length; ti++){
      for(let i=0;i<SQUAD_COUNT;i++){
        if((ev.teams[sqKey(ti,i)]||[]).includes(CUR_USER)){ myTi=ti; break outer; }
      }
    }
  }

  if(myTi===null && !myIsReserve){
    return `${buildSummaryBar(ev,members)}<div class="empty"><div class="empty-ico">🗓️</div><p>你目前尚未被排入這場的陣容</p></div>`;
  }

  let boardHTML;
  if(myIsReserve){
    const names=(ev.teams.reserve||[]).filter(Boolean);
    boardHTML=`<div class="team-block">
      <div class="team-hd"><div class="team-label"><span class="team-badge">🟡 候補</span></div></div>
      <div class="squads-grid"><div class="squad-block">
        <div class="squad-hd"><span class="squad-label">候補名單</span><span class="squad-cnt">${names.length}人</span></div>
        <div class="squad-slots">${names.map(n=>playerCardHTML(n,members,-1,'reserve',false,roles[n],false,ev)).join('')}</div>
      </div></div>
    </div>`;
  } else {
    // 顯示整個「團」（該團底下所有小隊都列出，不只自己所在的那一小隊）
    const tName=ev.teamNames[myTi];
    const cls=TEAM_COLORS[myTi%TEAM_COLORS.length];
    const squadsHTML=[];
    for(let i=0;i<SQUAD_COUNT;i++){
      const k=sqKey(myTi,i);
      const names=ev.teams[k]||[];
      if(!names.filter(Boolean).length) continue;
      const isGuard=(ev.squadRoles||{})[k]==='guard';
      squadsHTML.push(`<div class="squad-block${isGuard?' squad-guard':''}">
        <div class="squad-hd"><span class="squad-label">${tName}-${i+1}隊${isGuard?' 🛡️':''}</span><span class="squad-cnt">${names.filter(Boolean).length}/${SQUAD_SIZE}</span></div>
        <div class="squad-slots">${Array.from({length:SQUAD_SIZE},(_,s)=>{ const n=names[s]; return n?playerCardHTML(n,members,myTi,k,false,roles[n],false,ev):'<div class="slot-empty"><span class="slot-empty-txt">空</span></div>'; }).join('')}</div>
      </div>`);
    }
    boardHTML=`<div class="team-block">
      <div class="team-hd"><div class="team-label"><span class="team-badge ${cls}">${tName}</span></div></div>
      <div class="squads-grid">${squadsHTML.join('')}</div>
    </div>`;
  }
  return `${buildSummaryBar(ev,members)}<div class="lineup-board">${boardHTML}</div>`;
}

function renderPlayerLineup(pane){
  const all=S.events().slice();
  if(!all.length){ pane.innerHTML='<div class="empty"><div class="empty-ico">📋</div><p>尚無排表</p></div>'; return; }
  const todayStr=fmtDate(new Date());
  // 頂端：離現在最近的「即將到來」場次（今天含以後、日期最近的一場）
  const upcoming=all.filter(e=>String(e.date||'').slice(0,10)>=todayStr)
    .sort((a,b)=>String(a.date||'').localeCompare(String(b.date||'')));
  // 歷屆：已結束的場次，新到舊，預設收合、點日期才展開
  const past=all.filter(e=>String(e.date||'').slice(0,10)<todayStr)
    .sort((a,b)=>String(b.date||'').localeCompare(String(a.date||'')));

  const cur=upcoming[0]||null;
  const curHTML=cur
    ? `<div class="sec-head"><h2>📋 本周排表</h2><span style="font-size:13px;color:var(--txt2)">${cur.name}${cur.type?'（'+cur.type+'）':''}</span></div>${_buildPlayerBoardHTML(cur)}`
    : `<div class="sec-head"><h2>📋 本周排表</h2></div><div class="card" style="text-align:center;color:var(--txt3);padding:16px">目前沒有即將到來的活動排表</div>`;

  const pastHTML=past.length?`
    <div style="margin-top:22px">
      <h3 style="font-size:14px;color:var(--txt2);margin-bottom:8px">🗂️ 歷屆排表（點日期展開）</h3>
      <div style="display:flex;flex-direction:column;gap:8px">${past.map(e=>`
        <div class="card" style="padding:0;overflow:hidden">
          <div style="padding:12px 14px;cursor:pointer;display:flex;justify-content:space-between;align-items:center" onclick="toggleHistLineup('${e.id}')">
            <span style="font-weight:700">${e.name}　<span style="font-size:12px;color:var(--gold)">${e.type||''}</span></span>
            <span id="hist-arrow-${e.id}" style="color:var(--txt3)">▼</span>
          </div>
          <div id="hist-board-${e.id}" class="hidden" style="padding:0 12px 12px"></div>
        </div>`).join('')}</div>
    </div>`:'';

  pane.innerHTML=curHTML+pastHTML;
}

// 歷屆排表展開/收合：第一次展開時才產生內容（避免一次渲染全部歷史拖慢頁面）
function toggleHistLineup(evId){
  const box=document.getElementById('hist-board-'+evId);
  const arrow=document.getElementById('hist-arrow-'+evId);
  if(!box) return;
  const opening=box.classList.contains('hidden');
  if(opening && !box.dataset.rendered){
    const ev=S.events().find(e=>e.id===evId);
    box.innerHTML=ev?_buildPlayerBoardHTML(ev):'<p class="hint">找不到此場次</p>';
    box.dataset.rendered='1';
  }
  box.classList.toggle('hidden');
  if(arrow) arrow.textContent=opening?'▲':'▼';
}


// ============================================================
// 玩家池分組（含篩選）— 局部刷新用
// ============================================================
function buildPoolGroups(ev,locked){
  ensureTeams(ev);
  const members=S.members();
  const signups=S.signups()[ev.id]||{};
  const assigned=getAssigned(ev);
  const qc=((document.getElementById('pool-class-f')||{}).value)||'';
  const qs=(((document.getElementById('pool-search-f')||{}).value)||'').toLowerCase();
  const coreNames=[],attendNames=[],absentNames=[],pendingNames=[],reserveNames=[];
  members.forEach(m=>{
    if(assigned.has(m.name)) return;
    if(qc&&m.jobId!==qc) return;
    if(qs&&!m.name.toLowerCase().includes(qs)) return;
    const st=signups[m.name];
    // 固定團成員（且本場次未請假）固定置頂顯示，方便管理員直接拖曳到隊伍，不再自動塞進候補
    if(m.status==='固定團'&&st!=='absent'){ coreNames.push(m); return; }
    if(m.status==='暫離') return; // 暫離成員不出現在排表成員池
    if(st==='attend') attendNames.push(m);
    else if(st==='absent') absentNames.push(m);
    else if(st==='reserve') reserveNames.push(m); // 報名選「候補」（會自動排入右側候補隊伍）
    else if(m.status==='候補') reserveNames.push(m);
    else pendingNames.push(m);
  });
  const sec=(title,list,color,drag)=>!list.length?'':`<div class="pool-group"><div class="pool-group-hd" style="color:${color}">${title}（${list.length}）</div><div class="pool-group-cards">${list.map(m=>playerPoolCardHTML(m,drag&&!locked)).join('')}</div></div>`;
  return (sec('⭐ 固定團',coreNames,'var(--gold)',true)+sec('✅ 出席',attendNames,'var(--ok)',true)+sec('❓ 待定',pendingNames,'var(--gold)',true)+sec('📋 候補',reserveNames,'var(--txt2)',true)+sec('🌙 請假',absentNames,'var(--txt3)',false))||'<p class="hint">無符合成員</p>';
}
function refreshPoolOnly(){
  if(!_curEventId) return;
  const ev=S.events().find(x=>x.id===_curEventId); if(!ev) return;
  const box=document.getElementById('pool-groups');
  if(box) box.innerHTML=buildPoolGroups(ev,_isLineupLocked(_curEventId));
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
  const opts=events.map(e=>`<option value="${e.id}">${e.name}${e.type?'　'+e.type:''}</option>`).join('');
  const body=document.getElementById('coreteam-body');
  body.innerHTML=`<div class="fg"><label>選擇要複製排表的場次</label><select id="copy-src" class="fsel">${opts}</select></div>
    <p class="hint">將把該場次的團隊結構、分隊、砲手/指揮、保鏢、指派技能整份複製過來，覆蓋目前排表。</p>`;
  document.querySelector('#modal-coreteam .modal-hd h3').textContent='📋 複製其他場次排表';
  const btn=document.querySelector('#modal-coreteam .modal-ft .btn-blue');
  btn.textContent='複製'; btn.setAttribute('onclick','doCopyLineup()');
  openModal('modal-coreteam');
}
function doCopyLineup(){
  if(_guardLineupLock()) return;
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
  if(_guardLineupLock()) return;
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
