// 出席明細：列出每一場活動的完整狀態——是否有報名（出席/候補/請假/未回覆）、
// 是否有被排進排表（含在哪一隊）、當天是否有實際出賽紀錄
function _attDetail(name){
  const me=S.members().find(x=>x.name===name);
  const alias=new Set([name,...((me&&me.aliases)||[])]);
  const events=S.events().slice().sort((a,b)=>String(b.date||'').localeCompare(String(a.date||'')));
  const matches=S.matches(), signups=S.signups();

  // 找出此成員被排在哪一隊（含候補），回傳隊伍標籤；沒被排入則回傳空字串
  function placement(ev){
    if(!ev.teams) return '';
    if((ev.teams.reserve||[]).some(n=>alias.has(n))) return '候補';
    const teamNames=ev.teamNames||[];
    for(const [key,arr] of Object.entries(ev.teams)){
      if(key==='reserve'||!Array.isArray(arr)) continue;
      if(!arr.some(n=>alias.has(n))) continue;
      const m=key.match(/^t(\d+)_sq(\d+)$/);
      if(m) return (teamNames[+m[1]]||('團'+(+m[1]+1)))+'-'+(+m[2]+1)+'隊';
      return '已排入';
    }
    return '';
  }

  const rows=[];
  const evDateSet=new Set();
  events.forEach(ev=>{
    const d=String(ev.date||'').slice(0,10); evDateSet.add(d);
    const evS=signups[ev.id]||{};
    let signup=''; alias.forEach(a=>{ if(evS[a]!==undefined) signup=evS[a]; });
    const day=matches.filter(mm=>String(mm.date||'').slice(0,10)===d);
    let played=false; day.forEach(mm=>(mm.participants||[]).forEach(n=>{ if(alias.has(n)) played=true; }));
    rows.push({
      date:ev.date||'', name:ev.name||'', type:ev.type||'',
      signup,                      // 'attend' | 'reserve' | 'absent' | ''(未回覆)
      place:placement(ev),         // 隊伍標籤 or ''
      hasMatchData:day.length>0,   // 當天是否已有比賽紀錄（沒有代表比賽還沒打/還沒匯入）
      dayMatchCount:day.length,    // 當天實際打了幾場比賽（同一天多場只算1次出席，此數字僅供參考）
      played,
    });
  });
  // 有比賽紀錄、但當天沒有在報名管理建立場次的比賽（不計入出席率，僅供對照參考，
  // 避免管理端「看起來比玩家自己的紀錄少」造成誤會）
  const extraByDate={};
  matches.forEach(mm=>{
    const d=String(mm.date||'').slice(0,10);
    if(evDateSet.has(d)) return; // 已有場次的日期，已經列在上面的 rows 裡
    if(!(mm.participants||[]).some(n=>alias.has(n))) return;
    if(!extraByDate[d]) extraByDate[d]={date:d, enemies:[]};
    extraByDate[d].enemies.push(mm.enemy||'?');
  });
  const extras=Object.values(extraByDate).sort((a,b)=>b.date.localeCompare(a.date));
  return {rows, extras};
}

// 計算成員出席率：
//   分母 = 有「報名出席」且「當天已有比賽紀錄」的場次數
//   分子 = 上述場次中，比賽紀錄實際也有出現的場次數
//   → 沒報名卻被排上場打的場次，不算進出席率（但仍算進出場次數）
//   → 尚未有比賽紀錄的場次（未來活動、或比賽打完還沒上傳紀錄）先不計入，避免被誤判為缺席
//   出席率不會超過100%
// 另外 totalPlayed = 比賽紀錄中實際出現的總場次（不論有無報名，忠實反映所有打過的場）
function _attRate(name){
  const me=S.members().find(x=>x.name===name);
  const alias=new Set([name,...((me&&me.aliases)||[])]);
  const events=S.events(), matches=S.matches(), signups=S.signups();
  let plan=0,act=0;
  events.forEach(ev=>{
    const evS=signups[ev.id]||{};
    let signedAttend=false; alias.forEach(a=>{ if(evS[a]==='attend') signedAttend=true; });
    if(!signedAttend) return; // 只計算「有報名出席」的場次
    const day=matches.filter(mm=>String(mm.date||'').slice(0,10)===String(ev.date||'').slice(0,10));
    if(!day.length) return;   // 當天還沒有任何比賽紀錄 → 比賽尚未進行/上傳，先不計入
    plan++;
    let played=false; day.forEach(mm=>(mm.participants||[]).forEach(n=>{ if(alias.has(n)) played=true; }));
    if(played) act++;
  });
  // 出場次數：只統計「報名管理有建立場次」當天的比賽紀錄，
  // 每一筆比賽紀錄都算一次出場（同一天有兩場比賽＝出場2次）；
  // 系統啟用前匯入的更早比賽紀錄視為歷史備份，不列入出席統計
  const evDates=new Set(events.map(e=>String(e.date||'').slice(0,10)).filter(Boolean));
  let totalPlayed=0;
  matches.forEach(mm=>{
    if(!evDates.has(String(mm.date||'').slice(0,10))) return;
    if((mm.participants||[]).some(n=>alias.has(n))) totalPlayed++;
  });
  return {plan,act,totalPlayed,rate:plan?Math.round(act/plan*100):null};
}
function openAttendanceDetail(name){
  const {rows, extras}=_attDetail(name);
  const r=_attRate(name);
  document.getElementById('att-detail-name').textContent=name;
  document.getElementById('att-detail-summary').innerHTML = r.plan
    ? `出席率：<strong style="color:${r.rate>=80?'var(--ok)':r.rate>=50?'var(--gold)':'var(--bad)'}">${r.rate}%</strong>　（實際出賽 ${r.act}／有報名且有紀錄 ${r.plan} 場）<br><span style="font-size:12px;color:var(--txt2)">總出場次數：${r.totalPlayed} 場</span>`
    : `尚無出席率資料（還沒有「已報名出席且有比賽紀錄」的場次）<br><span style="font-size:12px;color:var(--txt2)">總出場次數：${r.totalPlayed} 場</span>`;
  // 每場活動顯示三項狀態：報名／排表／出賽
  const signupBadge=s=>s==='attend'?'<span style="color:var(--ok);font-weight:700">✅ 出席</span>'
    :s==='reserve'?'<span style="color:var(--gold);font-weight:700">🟡 候補</span>'
    :s==='absent'?'<span style="color:var(--bad);font-weight:700">🌙 請假</span>'
    :'<span style="color:var(--txt3)">⏳ 未回覆</span>';
  const placeBadge=p=>p?'<span style="color:var(--accent);font-weight:700">📋 '+p+'</span>':'<span style="color:var(--txt3)">— 未排入</span>';
  const playBadge=x=>!x.hasMatchData?'<span style="color:var(--txt3)">尚無比賽紀錄</span>'
    :x.played?'<span style="color:var(--ok);font-weight:700">⚔️ 有出賽</span>'
    :'<span style="color:var(--bad);font-weight:700">❌ 未出賽</span>';
  const mainHtml = rows.length
    ? `<div style="display:flex;flex-direction:column;gap:8px">${rows.map(x=>`
      <div style="border:1px solid var(--border);border-radius:8px;padding:8px 12px">
        <div style="font-weight:700;margin-bottom:6px">${x.date}　${x.name}${x.type?'（'+x.type+'）':''}</div>
        <div style="display:flex;gap:14px;flex-wrap:wrap;font-size:13px">
          <span>報名：${signupBadge(x.signup)}</span>
          <span>排表：${placeBadge(x.place)}</span>
          <span>出賽：${playBadge(x)}${x.dayMatchCount>1?' <span style="color:var(--txt3);font-weight:400">（當天共'+x.dayMatchCount+'場比賽，計入出場次數'+x.dayMatchCount+'次）</span>':''}</span>
        </div>
      </div>`).join('')}</div>`
    : '<p class="hint">尚無任何活動場次</p>';
  // 有比賽紀錄但當天沒有建立報名場次：僅供對照，不計入出席率
  const extraHtml = extras.length
    ? `<div style="margin-top:14px;padding-top:10px;border-top:1px dashed var(--border)">
        <div style="font-size:12px;color:var(--txt3);margin-bottom:6px">📎 以下有比賽紀錄，但當天未建立報名場次，不計入出席率：</div>
        <div style="display:flex;flex-direction:column;gap:4px">${extras.map(e=>
          `<div style="font-size:12px;color:var(--txt2)">${e.date}　vs ${e.enemies.join('、')}</div>`
        ).join('')}</div>
      </div>`
    : '';
  document.getElementById('att-detail-list').innerHTML = mainHtml + extraHtml;
  openModal('modal-attendance-detail');
}

// ============================================================
// ADMIN: MEMBERS
// ============================================================
let _editMemberId=null;
// 依目前篩選條件計算要顯示的成員列表與活動度資料
function _memberView(){
  const members=S.members();
  const signups=S.signups();
  // 每位成員的活動度：實際出賽場數（totalPlayed）＋報名回覆次數（出席或請假都算有回應）
  const actMap={};
  members.forEach(m=>{
    const r=_attRate(m.name);
    const alias=new Set([m.name,...(m.aliases||[])]);
    let resp=0;
    Object.values(signups).forEach(evS=>{ Object.keys(evS||{}).forEach(n=>{ if(alias.has(n)) resp++; }); });
    actMap[m.id]={played:r.totalPlayed, plan:r.plan, act:r.act, rate:r.rate, resp};
  });
  let filtered=members;
  const qs=(document.getElementById('ms-q')||{value:''}).value.toLowerCase();
  const qc=(document.getElementById('ms-cls')||{value:''}).value;
  const qa=(document.getElementById('ms-act')||{value:''}).value;
  if(qs)filtered=filtered.filter(m=>m.name.toLowerCase().includes(qs));
  if(qc)filtered=filtered.filter(m=>m.jobId===qc);
  // 活動度篩選／排序：協助找出長期未參與、可能已離開幫派的成員
  if(qa==='never'){
    filtered=filtered.filter(m=>{const a=actMap[m.id];return a.played===0&&a.resp===0;});
  } else if(qa==='low'){
    filtered=filtered.slice().sort((a,b)=>(actMap[a.id].played-actMap[b.id].played)||(actMap[a.id].resp-actMap[b.id].resp));
  } else if(qa==='high'){
    filtered=filtered.slice().sort((a,b)=>(actMap[b.id].played-actMap[a.id].played)||(actMap[b.id].resp-actMap[a.id].resp));
  }
  return {members, filtered, actMap, qs, qc, qa};
}

// 產生表格列 HTML
function _memberRowsHtml(filtered, actMap, qa){
  const tbody=filtered.map((m,idx)=>{
    const job=jobById(m.jobId);
    const a=actMap[m.id];
    const inactive=a.played===0&&a.resp===0;
    return `<tr${inactive?' style="opacity:.55"':''}>
      <td style="text-align:center;color:var(--txt3);font-size:12px;width:36px">${idx+1}</td>
      <td><strong>${m.name}</strong>${inactive?'<br><span style="font-size:10px;color:var(--bad)">💤 從未出賽/報名</span>':''}${(m.changeLog&&m.changeLog.length)?`<br><span style="font-size:10px;color:var(--txt3)" title="${m.changeLog.map(c=>c.t+' '+c.type+'：'+c.from+'→'+c.to).join('&#10;')}">📝 ${m.changeLog[m.changeLog.length-1].t} ${m.changeLog[m.changeLog.length-1].type}</span>`:''}</td>
      <td><span class="pill pill-job" style="background:${job.color};color:#fff">${job.name}</span></td>
      <td>${(function(){
        const c=a.rate===null?'var(--txt3)':a.rate>=80?'var(--ok)':a.rate>=50?'var(--gold)':'var(--bad)';
        return `<button class="btn btn-outline xs" style="color:${c};font-weight:700" onclick="openAttendanceDetail('${m.name.replace(/'/g,"\\'")}')">${a.act}/${a.plan}${a.rate===null?'':' ('+a.rate+'%)'}</button><br><span style="font-size:10px;color:var(--txt3)">（實際出賽／有報名且有紀錄）</span>`;
      })()}</td>
      <td style="font-size:11px;color:var(--txt2);max-width:130px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${(m.skills||[]).join('、')||'—'}</td>
      <td><button class="btn btn-outline xs" onclick="openEditMember('${m.id}')">編輯</button></td>
    </tr>`;
  }).join('');
  return tbody||'<tr><td colspan="6" style="text-align:center;color:var(--txt3);padding:24px">'+(qa==='never'?'沒有「從未出賽/報名」的成員 🎉':'尚無成員')+'</td></tr>';
}

function renderAdminMembers(pane){
  const v=_memberView();
  pane.innerHTML=`<div class="sec-head">
    <h2>👥 成員管理 <span id="ms-count" style="font-size:12px;color:var(--txt2);font-weight:400">${(()=>{const away=v.members.filter(m=>m.status==='暫離').length;const active=v.members.length-away;return '（'+ORG_LABEL()+'專屬'+active+'人'+(away?'，不含暫離 '+away+' 人':'')+(v.qa?'，顯示 '+v.filtered.length+' 人':'')+'）';})()}</span></h2>
    <div class="sec-actions">
      <button class="btn btn-blue sm" onclick="openAddMember()">+ 新增成員</button>
      <button class="btn btn-outline sm" onclick="exportBackupXLSX()" title="將成員、活動、報名、比賽紀錄完整匯出成 Excel，定期備份以防試算表誤刪">💾 匯出Excel備份</button>
      <button class="btn btn-outline sm" onclick="rebuildFromMatches()" title="掃描比賽紀錄，把我方出賽過但清單裡沒有的玩家補進來（含職業）">📥 從比賽紀錄補齊成員</button>
    </div>
  </div>
  <div class="filter-bar">
    <input id="ms-q" class="fi" placeholder="搜尋名稱..." oninput="filterMembers()" value="${v.qs.replace(/"/g,'&quot;')}">
    <select id="ms-cls" class="fsel" onchange="filterMembers()">
      <option value="">所有職業</option>${JOBS.map(j=>`<option value="${j.id}" ${v.qc===j.id?'selected':''}>${j.name}</option>`).join('')}
    </select>
    <select id="ms-act" class="fsel" onchange="filterMembers()" title="依活動度排序或篩選，協助找出可能已離開幫派的成員">
      <option value="">活動度（預設）</option>
      <option value="low" ${v.qa==='low'?'selected':''}>出席少 → 多</option>
      <option value="high" ${v.qa==='high'?'selected':''}>出席多 → 少</option>
      <option value="never" ${v.qa==='never'?'selected':''}>💤 只看從未出賽/報名</option>
    </select>
  </div>
  <div class="tbl-wrap"><table>
    <thead><tr><th style="width:36px"></th><th>成員名稱</th><th>職業</th><th>出席場數</th><th>絕技</th><th>操作</th></tr></thead>
    <tbody id="members-tbody">${_memberRowsHtml(v.filtered, v.actMap, v.qa)}</tbody>
  </table></div>`;
}

function openAddMember(){
  _editMemberId=null;
  document.getElementById('modal-member-title').textContent='新增成員';
  document.getElementById('m-name').value='';
  document.getElementById('m-class').value='';
  document.getElementById('m-status').value='一般成員';
  document.getElementById('btn-del-member').classList.add('hidden');
  const clBox=document.getElementById('m-changelog-box'); if(clBox) clBox.style.display='none';
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
  document.getElementById('m-status').value=m.status||'一般成員';
  document.getElementById('btn-del-member').classList.remove('hidden');
  renderTagSel('m-skills-tags', S.skillList(), m.skills||[]);
  renderTagSel('m-baijia-tags', S.baijiaList(), m.baijia||[]);
  // 顯示改名／異動歷史（含玩家自行改名的紀錄）
  const clBox=document.getElementById('m-changelog-box');
  const clEl=document.getElementById('m-changelog');
  const log=Array.isArray(m.changeLog)?m.changeLog:[];
  if(log.length && clBox && clEl){
    clEl.innerHTML=log.slice().reverse().map(c=>`<div style="padding:3px 0;border-bottom:1px solid var(--border)">${c.t}　${c.type}：<span style="color:var(--txt3)">${c.from}</span> → <span style="color:var(--txt)">${c.to}</span></div>`).join('')
      + (m.aliases&&m.aliases.length?`<div style="padding:6px 0 0;color:var(--txt3)">曾用名：${m.aliases.join('、')}</div>`:'');
    clBox.style.display='';
  } else if(clBox){ clBox.style.display='none'; }
  openModal('modal-member');
}
function memberClassChange(){ /* skill list is global, no per-job filtering anymore */ }
function saveMember(){
  const name=document.getElementById('m-name').value.trim();
  const jobId=document.getElementById('m-class').value;
  const status=document.getElementById('m-status').value;
  if(!name){toast('請輸入角色名稱','err');return;}
  if(!jobId){toast('請選擇職業','err');return;}

  const skills=getSelectedTags('m-skills-tags');
  const baijia=getSelectedTags('m-baijia-tags');

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
      // 注意：隊伍（team）不在此處編輯，保留原值；請至排表系統的固定團編輯設定
      return {...m,name,jobId,status,note:'',skills,baijia,aliases,changeLog:log,updatedAt:Date.now()};
    });
    toast('成員已更新','ok');
  } else {
    if(members.find(m=>m.name===name)){toast('角色名稱已存在','err');return;}
    members.push({id:uid(),name,jobId,status,note:'',skills,baijia,createdAt:Date.now(),updatedAt:Date.now()});
    toast('成員已新增','ok');
  }
  S.setMembers(members);
  // 若此成員為固定團：未截止場次自動報名出席，原登記的候補轉為出席（固定團不可候補）
  try{
    const savedName=(document.getElementById('m-name')||{value:''}).value.trim();
    const savedM=members.find(x=>x.name===savedName);
    if(savedM&&savedM.status==='固定團'){
      const signups=S.signups(); const out={...signups}; let ch=false;
      S.events().forEach(ev=>{
        const lock=evLockTime(ev);
        if(lock && Date.now()>=lock.getTime()) return;
        const evS={...(out[ev.id]||{})};
        if(evS[savedM.name]==='reserve'){ evS[savedM.name]='attend'; out[ev.id]=evS; ch=true; }
      });
      if(ch) S.setSignups(out);
      if(typeof autoSignupFixedMembers==='function') autoSignupFixedMembers(savedM.name);
    }
  }catch(_){}
      // 改名後立即清理：吸收殘留的舊名字成員紀錄、把舊名字的報名搬到新名字名下
      try{
        if(typeof _dedupeMembersByName==='function') S.setMembers(_dedupeMembersByName(S.members()));
        if(typeof _migrateAliasSignups==='function') _migrateAliasSignups();
      }catch(_){}
  closeModal('modal-member');
  renderAdminMembers(document.getElementById('pane-a-members'));
}
function deleteMember(){
  if(!_editMemberId||!confirm('確定刪除？'))return;
  if(typeof _addTomb==='function') _addTomb('members', _editMemberId);
  S.setMembers(S.members().filter(m=>m.id!==_editMemberId));
  closeModal('modal-member');
  toast('已刪除','ok');
  renderAdminMembers(document.getElementById('pane-a-members'));
}
// 匯出CSV已移除（內容與「匯出Excel備份」重複），請改用Excel備份。

// 完整 Excel 備份：成員／活動場次／報名紀錄／比賽紀錄各一張工作表，
// 定期下載保存，萬一 Google 試算表被誤刪或資料損毀時可以救回來
function exportBackupXLSX(){
  try{
    if(typeof XLSX==='undefined'){ toast('Excel 函式庫尚未載入，請確認網路後重試','err'); return; }
    const wb=XLSX.utils.book_new();
    const members=S.members(), events=S.events(), matches=S.matches(), signups=S.signups();
    const evName={}; events.forEach(e=>evName[e.id]=e.name||e.id);

    const mRows=members.map(m=>({角色名稱:m.name,職業:jobById(m.jobId).name,隊伍:m.team||'',狀態:m.status||'',絕技:(m.skills||[]).join('|'),群俠技能:(m.baijia||[]).join('|'),曾用名:(m.aliases||[]).join('|'),備註:m.note||''}));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(mRows.length?mRows:[{}]), '成員清單');

    const eRows=events.map(e=>({場次:e.name||'',日期:e.date||'',類型:e.type||''}));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(eRows.length?eRows:[{}]), '活動場次');

    const sRows=[];
    Object.entries(signups).forEach(([evId,map])=>{
      Object.entries(map||{}).forEach(([name,st])=>{
        sRows.push({場次:evName[evId]||evId,角色名稱:name,狀態:{attend:'出席',absent:'請假'}[st]||st});
      });
    });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(sRows.length?sRows:[{}]), '報名紀錄');

    const mtRows=matches.map(mt=>({日期:String(mt.date||'').slice(0,10),類型:mt.type||'',對手:mt.enemy||'',結果:mt.result||'',我方人數:mt.ourCount||'',敵方人數:mt.enemyCount||'',參與者:(mt.participants||[]).join('|'),備註:mt.notes||''}));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(mtRows.length?mtRows:[{}]), '比賽紀錄');

    XLSX.writeFile(wb, `備份_${ORG_LABEL()}_${fmtDate(new Date())}.xlsx`);
    toast('✅ Excel 備份已下載，建議妥善保存','ok');
  }catch(err){
    console.error('exportBackupXLSX error:',err);
    toast('❌ 備份失敗：'+err.message,'err');
  }
}
// 成員CSV匯入功能已移除：此功能沒有格式驗證，曾導致比賽數據CSV被誤匯入、
// 對方玩家與數據被當成成員/絕技寫入。成員請由管理端逐一新增，備份請用「匯出Excel備份」。
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
  // 打字/切換篩選時只更新表格內容與人數文字，「不重繪搜尋框本身」——
  // 若整頁重繪會把輸入框換新，注音/拼音等輸入法組字到一半會被打斷而打不出中文
  const tb=document.getElementById('members-tbody');
  if(!tb){ renderAdminMembers(document.getElementById('pane-a-members')); return; }
  const v=_memberView();
  tb.innerHTML=_memberRowsHtml(v.filtered, v.actMap, v.qa);
  const cnt=document.getElementById('ms-count');
  const awayN=v.members.filter(m=>m.status==='暫離').length;
  const activeN=v.members.length-awayN;
  if(cnt) cnt.textContent='（'+ORG_LABEL()+'專屬'+activeN+'人'+(awayN?'，不含暫離 '+awayN+' 人':'')+((v.qa||v.qs||v.qc)?'，顯示 '+v.filtered.length+' 人':'')+'）';
}
// 隊伍分配已改至排表系統的固定團編輯功能設定，此處不再處理

// 掃描所有比賽紀錄，把我方玩家補進成員清單（含職業）
// 從比賽紀錄補齊成員：改為「先選擇場次」再補齊。
// 避免拿太久以前的比賽紀錄補進已離開組織的玩家，導致出席率統計、催繳名單都算進不存在的人。
function rebuildFromMatches(){
  const matches=S.matches().slice().sort((a,b)=>String(b.date||'').localeCompare(String(a.date||'')));
  if(!matches.length){ toast('尚無比賽紀錄','err'); return; }
  // 動態建立選擇視窗（新→舊排序，預設選最新一場）
  let modal=document.getElementById('modal-rebuild-src');
  if(!modal){
    modal=document.createElement('div');
    modal.id='modal-rebuild-src';
    modal.className='modal-ov hidden';
    modal.innerHTML=`<div class="modal">
      <div class="modal-hd"><h3>📥 從比賽紀錄補齊成員</h3><button class="close-btn" onclick="closeModal('modal-rebuild-src')">✕</button></div>
      <div class="modal-body">
        <div class="fg"><label>選擇要用哪一場比賽的名單補齊</label>
          <select id="rebuild-src-sel" class="fsel" style="width:100%"></select>
        </div>
        <p class="hint">只會補進「該場比賽」出賽過、但成員清單裡還沒有的我方玩家（含職業）。<br>建議選擇最近的一場，避免把已離開組織的老玩家加回來，影響出席率與催繳名單的正確性。</p>
      </div>
      <div class="modal-ft">
        <button class="btn btn-outline" onclick="closeModal('modal-rebuild-src')">取消</button>
        <button class="btn btn-blue" onclick="doRebuildFromMatch()">補齊成員</button>
      </div>
    </div>`;
    document.body.appendChild(modal);
  }
  const sel=document.getElementById('rebuild-src-sel');
  sel.innerHTML=matches.map((mt,i)=>`<option value="${mt.id}" ${i===0?'selected':''}>${String(mt.date||'').slice(0,10)} vs ${mt.enemy||'?'}（我方 ${mt.ourCount||(mt.participants||[]).length||'?'} 人）</option>`).join('');
  openModal('modal-rebuild-src');
}

async function doRebuildFromMatch(){
  const sel=document.getElementById('rebuild-src-sel');
  const mt=S.matches().find(x=>x.id===(sel?sel.value:''));
  if(!mt){ toast('找不到該場比賽','err'); return; }
  closeModal('modal-rebuild-src');
  const members=S.members();
  const names=new Set(); members.forEach(m=>{ names.add(m.name); (m.aliases||[]).forEach(a=>names.add(a)); }); // 含曾用名，改名玩家不會被重複補進來
  let added=0;
  (mt.players||[]).forEach(p=>{
    if(p.camp!=='我方'||!p.name||names.has(p.name)) return;
    const job=jobByName(p.job);
    members.push({id:uid(),name:p.name,jobId:job?job.id:'',status:'一般成員',note:'',skills:[],baijia:[],createdAt:Date.now(),updatedAt:Date.now()});
    names.add(p.name); added++;
  });
  if(added){
    S.setMembers(members);
    renderAdminMembers(document.getElementById('pane-a-members'));
    toast('✅ 已從「'+String(mt.date||'').slice(0,10)+' vs '+(mt.enemy||'?')+'」補齊 '+added+' 位成員，同步中...','ok');
    if(typeof syncWriteNow==='function'){ const ok=await syncWriteNow(); toast(ok===true?'✅ 已補齊並同步 '+added+' 位成員':'⚠️ 已補齊 '+added+' 位（雲端同步待重試）', ok===true?'ok':'err'); }
  }
  else toast('該場比賽的我方玩家都已在成員清單中，沒有需要補齊的','');
}

// 掃描所有排表場次的隊伍名單，把「排表裡有名字但成員資料庫查無此人」的成員補回來
// （常見於多裝置同步時，新增的成員一時尚未同步到本機，但排表紀錄仍保留了名字）
// 職業/技能需要補齊後手動設定，因為排表只存名字，無法還原職業資訊
function rebuildFromLineups(){
  const members=S.members();
  const names=new Set(); members.forEach(m=>{ names.add(m.name); (m.aliases||[]).forEach(a=>names.add(a)); }); // 含曾用名，改名玩家不會被重複補進來
  let added=0;
  S.events().forEach(ev=>{
    if(!ev.teams) return;
    Object.values(ev.teams).forEach(arr=>{
      (arr||[]).forEach(name=>{
        if(!name||names.has(name)) return;
        members.push({id:uid(),name,jobId:'',status:'一般成員',note:'',skills:[],baijia:[],createdAt:Date.now(),updatedAt:Date.now()});
        names.add(name); added++;
      });
    });
  });
  if(added){ S.setMembers(members); toast('✅ 已補回 '+added+' 位成員，請記得補設定職業','ok'); renderAdminMembers(document.getElementById('pane-a-members')); }
  else toast('沒有需要補回的成員','');
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

// 「清理重複成員」手動按鈕已移除：重複成員（同名、或改名前的舊名）現在會在每次資料同步時
// 自動收斂合併（見 gsync.js 的 _dedupeMembersByName 與 _migrateAliasSignups），不需要手動操作。

