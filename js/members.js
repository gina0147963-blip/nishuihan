
// 計算成員出席率：實際出賽場數 ÷ 報名出席場數（含別名）
function _attRate(name){
  const me=S.members().find(x=>x.name===name);
  const alias=new Set([name,...((me&&me.aliases)||[])]);
  const events=S.events(), signups=S.signups(), matches=S.matches();
  let plan=0,act=0;
  events.forEach(ev=>{
    const evS=signups[ev.id]||{};
    let signed=false; alias.forEach(a=>{ if(evS[a]==='attend') signed=true; });
    if(!signed) return;
    plan++;
    const day=matches.filter(mm=>String(mm.date||'').slice(0,10)===String(ev.date||'').slice(0,10));
    let played=false; day.forEach(mm=>(mm.participants||[]).forEach(n=>{ if(alias.has(n)) played=true; }));
    if(played) act++;
  });
  return {plan,act,rate:plan?Math.round(act/plan*100):null};
}
// ============================================================
// ADMIN: MEMBERS
// ============================================================
let _editMemberId=null;
function renderAdminMembers(pane){
  const members=S.members();
  const matches=S.matches();
  const att={};
  matches.forEach(m=>(m.participants||[]).forEach(n=>att[n]=(att[n]||0)+1));

  let filtered=members;
  const qs=(document.getElementById('ms-q')||{value:''}).value.toLowerCase();
  const qc=(document.getElementById('ms-cls')||{value:''}).value;
  const qt=(document.getElementById('ms-team')||{value:''}).value;
  if(qs)filtered=filtered.filter(m=>m.name.toLowerCase().includes(qs));
  if(qc)filtered=filtered.filter(m=>m.jobId===qc);
  if(qt)filtered=filtered.filter(m=>m.team===qt);

  const tbody=filtered.map(m=>{
    const job=jobById(m.jobId);
    return `<tr>
      <td><strong>${m.name}</strong>${(m.changeLog&&m.changeLog.length)?`<br><span style="font-size:10px;color:var(--txt3)" title="${m.changeLog.map(c=>c.t+' '+c.type+'：'+c.from+'→'+c.to).join('&#10;')}">📝 ${m.changeLog[m.changeLog.length-1].t} ${m.changeLog[m.changeLog.length-1].type}</span>`:''}</td>
      <td><span class="pill pill-job" style="background:${job.color};color:#fff">${job.name}</span></td>

      
      <td style="color:var(--gold);font-weight:700">${(function(){const r=_attRate(m.name);return r.act+'/'+r.plan;})()}</td>
      <td>${(function(){const r=_attRate(m.name);const c=r.rate===null?'var(--txt3)':r.rate>=80?'var(--ok)':r.rate>=50?'var(--gold)':'var(--bad)';return `<span style="color:${c};font-weight:700">${r.rate===null?'—':r.rate+'%'}</span>`;})()}</td>
      <td style="font-size:11px;color:var(--txt2);max-width:130px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${(m.skills||[]).join('、')||'—'}</td>
      <td><button class="btn btn-outline xs" onclick="openEditMember('${m.id}')">編輯</button></td>
    </tr>`;
  }).join('');

  pane.innerHTML=`<div class="sec-head">
    <h2>👥 成員管理 <span style="font-size:12px;color:var(--txt2);font-weight:400">（${MODE_LABEL[CUR_MODE]}專屬，${members.length} 人）</span></h2>
    <div class="sec-actions">
      <button class="btn btn-blue sm" onclick="openAddMember()">+ 新增成員</button>
      <button class="btn btn-outline sm" onclick="exportCSV()">匯出CSV</button>
    </div>
  </div>
  <div class="filter-bar">
    <input id="ms-q" class="fi" placeholder="搜尋名稱..." oninput="filterMembers()">
    <select id="ms-cls" class="fsel" onchange="filterMembers()">
      <option value="">所有職業</option>${JOBS.map(j=>`<option value="${j.id}">${j.name}</option>`).join('')}
    </select>
    <select id="ms-team" class="fsel" onchange="filterMembers()">
      <option value="">所有隊伍</option><option>進攻</option><option>防守</option><option>機動</option><option>候補</option>
    </select>
  </div>
  <div class="tbl-wrap"><table>
    <thead><tr><th>角色名稱</th><th>職業</th><th>出席場數</th><th>出席率</th><th>絕技</th><th>操作</th></tr></thead>
    <tbody id="members-tbody">${tbody||'<tr><td colspan="6" style="text-align:center;color:var(--txt3);padding:24px">尚無成員</td></tr>'}</tbody>
  </table></div>`;
}

function openAddMember(){
  _editMemberId=null;
  document.getElementById('modal-member-title').textContent='新增成員';
  document.getElementById('m-name').value='';
  document.getElementById('m-class').value='';
  document.getElementById('m-team').value='進攻';
  document.getElementById('m-status').value='一般成員';
  document.getElementById('m-skills-custom').value='';
  document.getElementById('m-baijia-custom').value='';
  document.getElementById('btn-del-member').classList.add('hidden');
  renderTagSel('m-skills-tags', S.skillList(), []);
  renderTagSel('m-baijia-tags', S.baijiaList(), []);
  openModal('modal-member');
}
function openEditMember(id){
  const m=S.members().find(x=>x.id===id); if(!m)return;
  _editMemberId=id;
  document.getElementById('modal-member-title').textContent='編輯：'+m.name;
  document.getElementById('m-name').value=m.name;
  document.getElementById('m-class').value=m.jobId||'';
  document.getElementById('m-team').value=m.team||'候補';
  document.getElementById('m-status').value=m.status||'一般成員';
  document.getElementById('m-skills-custom').value='';
  document.getElementById('m-baijia-custom').value='';
  document.getElementById('btn-del-member').classList.remove('hidden');
  renderTagSel('m-skills-tags', S.skillList(), m.skills||[]);
  renderTagSel('m-baijia-tags', S.baijiaList(), m.baijia||[]);
  openModal('modal-member');
}
function memberClassChange(){ /* skill list is global, no per-job filtering anymore */ }
function saveMember(){
  const name=document.getElementById('m-name').value.trim();
  const jobId=document.getElementById('m-class').value;
  const team=document.getElementById('m-team').value;
  const status=document.getElementById('m-status').value;
  if(!name){toast('請輸入角色名稱','err');return;}
  if(!jobId){toast('請選擇職業','err');return;}

  // Custom skill entries get added to global list automatically (admin action)
  const cs=document.getElementById('m-skills-custom').value.trim();
  const cb=document.getElementById('m-baijia-custom').value.trim();
  const customSkills = cs?cs.split(/[,，]/).map(s=>s.trim()).filter(Boolean):[];
  const customBaijia = cb?cb.split(/[,，]/).map(s=>s.trim()).filter(Boolean):[];
  if(customSkills.length){
    const list=S.skillList();
    customSkills.forEach(s=>{ if(!list.includes(s)) list.push(s); });
    S.setSkillList(list);
  }
  if(customBaijia.length){
    const list=S.baijiaList();
    customBaijia.forEach(s=>{ if(!list.includes(s)) list.push(s); });
    S.setBaijiaList(list);
  }
  const skills=[...getSelectedTags('m-skills-tags'),...customSkills];
  const baijia=[...getSelectedTags('m-baijia-tags'),...customBaijia];

  let members=S.members();
  if(_editMemberId){
    members=members.map(m=>{
      if(m.id!==_editMemberId) return m;
      const log=Array.isArray(m.changeLog)?m.changeLog.slice():[];
      const aliases=Array.isArray(m.aliases)?m.aliases.slice():[];
      const today=fmtDate(new Date());
      if(m.name!==name){
        log.push({t:today,type:'改名',from:m.name,to:name});
        if(!aliases.includes(m.name)) aliases.push(m.name); // 舊名保留供出席率統計
      }
      if(m.jobId!==jobId){
        log.push({t:today,type:'改職業',from:jobById(m.jobId).name,to:jobById(jobId).name});
      }
      return {...m,name,jobId,team,status,note:'',skills,baijia,aliases,changeLog:log};
    });
    toast('成員已更新','ok');
  } else {
    if(members.find(m=>m.name===name)){toast('角色名稱已存在','err');return;}
    members.push({id:uid(),name,jobId,team,status,note:'',skills,baijia,createdAt:Date.now()});
    toast('成員已新增','ok');
  }
  S.setMembers(members);
  closeModal('modal-member');
  renderAdminMembers(document.getElementById('pane-a-members'));
}
function deleteMember(){
  if(!_editMemberId||!confirm('確定刪除？'))return;
  S.setMembers(S.members().filter(m=>m.id!==_editMemberId));
  closeModal('modal-member');
  toast('已刪除','ok');
  renderAdminMembers(document.getElementById('pane-a-members'));
}
function exportCSV(){
  const members=S.members();
  const rows=[['角色名稱','職業','隊伍','狀態','絕技','群俠技能','備註'],...members.map(m=>[m.name,jobById(m.jobId).name,m.team||'',m.status||'',(m.skills||[]).join('|'),(m.baijia||[]).join('|'),m.note||''])];
  const csv=rows.map(r=>r.map(c=>`"${String(c).replace(/"/g,'""')}"`).join(',')).join('\n');
  dl('\uFEFF'+csv,`成員清單_${fmtDate(new Date())}.csv`,'text/csv');
  toast('CSV已匯出','ok');
}
function handleCSV(e){
  const file=e.target.files[0]; if(!file)return;
  const reader=new FileReader();
  reader.onload=ev=>{
    try{
      const lines=ev.target.result.split('\n').filter(l=>l.trim());
      if(lines.length<2){toast('格式錯誤','err');return;}
      let members=S.members(); let added=0;
      const skillList=S.skillList(), baijiaList=S.baijiaList();
      for(let i=1;i<lines.length;i++){
        const cols=parseCsvLine(lines[i]);
        const name=(cols[0]||'').trim(); if(!name)continue;
        const job=jobByName((cols[1]||'').trim());
        if(members.find(m=>m.name===name))continue;
        const sk=cols[4]?cols[4].split('|').filter(Boolean):[];
        const bj=cols[5]?cols[5].split('|').filter(Boolean):[];
        sk.forEach(s=>{if(!skillList.includes(s))skillList.push(s);});
        bj.forEach(s=>{if(!baijiaList.includes(s))baijiaList.push(s);});
        members.push({id:uid(),name,jobId:job?.id||'',team:cols[2]||'候補',status:cols[3]||'一般成員',skills:sk,baijia:bj,note:cols[6]||'',createdAt:Date.now()});
        added++;
      }
      S.setMembers(members);
      S.setSkillList(skillList);
      S.setBaijiaList(baijiaList);
      toast(`已匯入 ${added} 位成員`,'ok');
      renderAdminMembers(document.getElementById('pane-a-members'));
    }catch(err){toast('CSV解析失敗：'+err.message,'err');}
  };
  reader.readAsText(file,'utf-8');
  e.target.value='';
}
function parseCsvLine(line){
  const res=[]; let cur='',inQ=false;
  for(let i=0;i<line.length;i++){
    const c=line[i];
    if(c==='"'){if(inQ&&line[i+1]==='"'){cur+='"';i++;}else{inQ=!inQ;}}
    else if(c===','&&!inQ){res.push(cur.trim());cur='';}
    else cur+=c;
  }
  res.push(cur.trim()); return res;
}

// 局部更新成員表格（保留搜尋框焦點）
function filterMembers(){
  const members=S.members();
  const matches=S.matches();
  const att={}; matches.forEach(mm=>(mm.participants||[]).forEach(n=>att[n]=(att[n]||0)+1));
  const qs=((document.getElementById('ms-q')||{}).value||'').toLowerCase();
  const qc=(document.getElementById('ms-cls')||{}).value||'';
  const qt=(document.getElementById('ms-team')||{}).value||'';
  let f=members;
  if(qs)f=f.filter(x=>x.name.toLowerCase().includes(qs));
  if(qc)f=f.filter(x=>x.jobId===qc);
  if(qt)f=f.filter(x=>x.team===qt);
  const tb=document.getElementById('members-tbody'); if(!tb)return;
  tb.innerHTML=f.map(x=>{
    const job=jobById(x.jobId);
    return `<tr><td><strong>${x.name}</strong>${(x.changeLog&&x.changeLog.length)?`<br><span style="font-size:10px;color:var(--txt3)" title="${x.changeLog.map(c=>c.t+' '+c.type+'：'+c.from+'→'+c.to).join('&#10;')}">📝 ${x.changeLog[x.changeLog.length-1].t} ${x.changeLog[x.changeLog.length-1].type}</span>`:''}</td><td><span class="pill pill-job" style="background:${job.color};color:#fff">${job.name}</span></td><td style="color:var(--gold);font-weight:700">${(function(){const r=_attRate(x.name);return r.act+'/'+r.plan;})()}</td><td>${(function(){const r=_attRate(x.name);const c=r.rate===null?'var(--txt3)':r.rate>=80?'var(--ok)':r.rate>=50?'var(--gold)':'var(--bad)';return `<span style="color:${c};font-weight:700">${r.rate===null?'—':r.rate+'%'}</span>`;})()}</td><td style="font-size:11px;color:var(--txt2);max-width:130px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${(x.skills||[]).join('、')||'—'}</td><td><button class="btn btn-outline xs" onclick="openEditMember('${x.id}')">編輯</button></td></tr>`;
  }).join('')||'<tr><td colspan="6" style="text-align:center;color:var(--txt3);padding:24px">無符合</td></tr>';
}
// 狀態=固定團時隱藏隊伍「候補」選項
function onStatusChange(){
  const st=document.getElementById('m-status').value;
  const teamSel=document.getElementById('m-team');
  const hasReserve=[...teamSel.options].some(o=>o.value==='候補');
  if(st==='固定團'){
    if(hasReserve){ [...teamSel.options].forEach(o=>{ if(o.value==='候補') o.remove(); }); }
    if(teamSel.value==='候補'||!teamSel.value) teamSel.value='進攻';
  } else if(!hasReserve){
    const o=document.createElement('option'); o.textContent='候補'; teamSel.appendChild(o);
  }
}

// 掃描所有比賽紀錄，把我方玩家補進成員清單（含職業）
function rebuildFromMatches(){
  const members=S.members();
  const names=new Set(members.map(m=>m.name));
  let added=0;
  S.matches().forEach(mt=>{
    (mt.players||[]).forEach(p=>{
      if(p.camp!=='我方'||!p.name||names.has(p.name)) return;
      const job=jobByName(p.job);
      members.push({id:uid(),name:p.name,jobId:job?job.id:'',team:'候補',status:'一般成員',note:'',skills:[],baijia:[],createdAt:Date.now()});
      names.add(p.name); added++;
    });
  });
  if(added){ S.setMembers(members); toast('✅ 已補齊 '+added+' 位成員','ok'); renderAdminMembers(document.getElementById('pane-a-members')); }
  else toast('沒有需要補齊的成員','');
}

// 自癒：成員為空但有比賽紀錄時，自動從比賽我方名單重建（同步後自動觸發）
function autoHealMembers(){
  if(S.members().length>0) return false;
  const matches=S.matches();
  if(!matches.length) return false;
  const members=[]; const names=new Set();
  matches.forEach(mt=>{
    (mt.players||[]).forEach(p=>{
      if(p.camp!=='我方'||!p.name||names.has(p.name)) return;
      const job=jobByName(p.job);
      members.push({id:uid(),name:p.name,jobId:job?job.id:'',team:'候補',status:'一般成員',note:'',skills:[],baijia:[],createdAt:Date.now()});
      names.add(p.name);
    });
  });
  if(members.length){ S.setMembers(members); console.log('autoHealMembers: rebuilt',members.length); return true; }
  return false;
}
