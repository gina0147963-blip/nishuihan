
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
  // 出場次數：比賽紀錄中實際出現的總場次（獨立計算，沒報名也照算）
  let totalPlayed=0;
  matches.forEach(mm=>{ if((mm.participants||[]).some(n=>alias.has(n))) totalPlayed++; });
  return {plan,act,totalPlayed,rate:plan?Math.round(act/plan*100):null};
}
// 出席率明細：列出每一場「有報名出席且當天已有比賽紀錄」的場次，以及是否實際出賽
function _attDetail(name){
  const me=S.members().find(x=>x.name===name);
  const alias=new Set([name,...((me&&me.aliases)||[])]);
  const events=S.events().slice().sort((a,b)=>String(b.date||'').localeCompare(String(a.date||'')));
  const matches=S.matches(), signups=S.signups();
  const rows=[];
  events.forEach(ev=>{
    const evS=signups[ev.id]||{};
    let signedAttend=false; alias.forEach(a=>{ if(evS[a]==='attend') signedAttend=true; });
    if(!signedAttend) return;
    const day=matches.filter(mm=>String(mm.date||'').slice(0,10)===String(ev.date||'').slice(0,10));
    if(!day.length) return; // 尚無比賽紀錄的場次不列入明細（不計入出席率）
    let played=false; day.forEach(mm=>(mm.participants||[]).forEach(n=>{ if(alias.has(n)) played=true; }));
    rows.push({date:ev.date||'',name:ev.name||'',type:ev.type||'',played});
  });
  return rows;
}
function openAttendanceDetail(name){
  const rows=_attDetail(name);
  const r=_attRate(name);
  document.getElementById('att-detail-name').textContent=name;
  document.getElementById('att-detail-summary').innerHTML = r.plan
    ? `出席率：<strong style="color:${r.rate>=80?'var(--ok)':r.rate>=50?'var(--gold)':'var(--bad)'}">${r.rate}%</strong>　（有報名出席 ${r.plan} 場中，實際出賽 ${r.act} 場）<br><span style="font-size:12px;color:var(--txt2)">總出場次數：${r.totalPlayed} 場（含未報名卻上場的場次，不計入出席率）</span>`
    : `此成員尚無「報名出席」的場次，暫無出席率資料<br><span style="font-size:12px;color:var(--txt2)">總出場次數：${r.totalPlayed} 場</span>`;
  document.getElementById('att-detail-list').innerHTML = rows.length
    ? rows.map(x=>`<div class="att-detail-row"><span class="att-detail-date">${x.date}</span><span class="att-detail-nm">${x.name}${x.type?'（'+x.type+'）':''}</span><span class="att-detail-st" style="color:${x.played?'var(--ok)':'var(--bad)'}">${x.played?'✅ 有出賽':'❌ 未出賽'}</span></div>`).join('')
    : '<p class="hint">尚無「報名出席」的場次紀錄</p>';
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
  const tbody=filtered.map(m=>{
    const job=jobById(m.jobId);
    const a=actMap[m.id];
    const inactive=a.played===0&&a.resp===0;
    return `<tr${inactive?' style="opacity:.55"':''}>
      <td><strong>${m.name}</strong>${inactive?'<br><span style="font-size:10px;color:var(--bad)">💤 從未出賽/報名</span>':''}${(m.changeLog&&m.changeLog.length)?`<br><span style="font-size:10px;color:var(--txt3)" title="${m.changeLog.map(c=>c.t+' '+c.type+'：'+c.from+'→'+c.to).join('&#10;')}">📝 ${m.changeLog[m.changeLog.length-1].t} ${m.changeLog[m.changeLog.length-1].type}</span>`:''}</td>
      <td><span class="pill pill-job" style="background:${job.color};color:#fff">${job.name}</span></td>
      <td>${(function(){const c=a.rate===null?'var(--txt3)':a.rate>=80?'var(--ok)':a.rate>=50?'var(--gold)':'var(--bad)';return `<button class="btn btn-outline xs" style="color:${c};font-weight:700" onclick="openAttendanceDetail('${m.name.replace(/'/g,"\\'")}')">${a.act}/${a.plan}${a.rate===null?'':' ('+a.rate+'%)'}</button><br><span style="font-size:10px;color:var(--txt3)">出賽${a.played}場・回覆${a.resp}次</span>`;})()}</td>
      <td style="font-size:11px;color:var(--txt2);max-width:130px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${(m.skills||[]).join('、')||'—'}</td>
      <td><button class="btn btn-outline xs" onclick="openEditMember('${m.id}')">編輯</button></td>
    </tr>`;
  }).join('');
  return tbody||'<tr><td colspan="5" style="text-align:center;color:var(--txt3);padding:24px">'+(qa==='never'?'沒有「從未出賽/報名」的成員 🎉':'尚無成員')+'</td></tr>';
}

function renderAdminMembers(pane){
  const v=_memberView();
  pane.innerHTML=`<div class="sec-head">
    <h2>👥 成員管理 <span id="ms-count" style="font-size:12px;color:var(--txt2);font-weight:400">（${ORG_LABEL()}專屬，${v.members.length} 人${v.qa?'，顯示 '+v.filtered.length+' 人':''}）</span></h2>
    <div class="sec-actions">
      <button class="btn btn-blue sm" onclick="openAddMember()">+ 新增成員</button>
      <button class="btn btn-outline sm" onclick="exportCSV()">匯出CSV</button>
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
    <thead><tr><th>角色名稱</th><th>職業</th><th>出席場數</th><th>絕技</th><th>操作</th></tr></thead>
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
function exportCSV(){
  const members=S.members();
  const rows=[['角色名稱','職業','隊伍','狀態','絕技','群俠技能','備註'],...members.map(m=>[m.name,jobById(m.jobId).name,m.team||'',m.status||'',(m.skills||[]).join('|'),(m.baijia||[]).join('|'),m.note||''])];
  const csv=rows.map(r=>r.map(c=>`"${String(c).replace(/"/g,'""')}"`).join(',')).join('\n');
  dl('\uFEFF'+csv,`成員清單_${fmtDate(new Date())}.csv`,'text/csv');
  toast('CSV已匯出','ok');
}

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
  // 打字/切換篩選時只更新表格內容與人數文字，「不重繪搜尋框本身」——
  // 若整頁重繪會把輸入框換新，注音/拼音等輸入法組字到一半會被打斷而打不出中文
  const tb=document.getElementById('members-tbody');
  if(!tb){ renderAdminMembers(document.getElementById('pane-a-members')); return; }
  const v=_memberView();
  tb.innerHTML=_memberRowsHtml(v.filtered, v.actMap, v.qa);
  const cnt=document.getElementById('ms-count');
  if(cnt) cnt.textContent='（'+ORG_LABEL()+'專屬，'+v.members.length+' 人'+((v.qa||v.qs||v.qc)?'，顯示 '+v.filtered.length+' 人':'')+'）';
}
// 隊伍分配已改至排表系統的固定團編輯功能設定，此處不再處理

// 掃描所有比賽紀錄，把我方玩家補進成員清單（含職業）
async function rebuildFromMatches(){
  const members=S.members();
  const names=new Set(); members.forEach(m=>{ names.add(m.name); (m.aliases||[]).forEach(a=>names.add(a)); }); // 含曾用名，改名玩家不會被重複補進來
  let added=0;
  S.matches().forEach(mt=>{
    (mt.players||[]).forEach(p=>{
      if(p.camp!=='我方'||!p.name||names.has(p.name)) return;
      const job=jobByName(p.job);
      members.push({id:uid(),name:p.name,jobId:job?job.id:'',status:'一般成員',note:'',skills:[],baijia:[],createdAt:Date.now(),updatedAt:Date.now()});
      names.add(p.name); added++;
    });
  });
  if(added){
    S.setMembers(members);
    renderAdminMembers(document.getElementById('pane-a-members'));
    toast('✅ 已補齊 '+added+' 位成員，同步中...','ok');
    if(typeof syncWriteNow==='function'){ const ok=await syncWriteNow(); toast(ok===true?'✅ 已補齊並同步 '+added+' 位成員':'⚠️ 已補齊 '+added+' 位（雲端同步待重試）', ok===true?'ok':'err'); }
  }
  else toast('沒有需要補齊的成員','');
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

