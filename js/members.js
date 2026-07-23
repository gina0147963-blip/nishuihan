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
    let dayPlayedCount=0; day.forEach(mm=>{ if((mm.participants||[]).some(n=>alias.has(n))) dayPlayedCount++; });
    const place=placement(ev);
    rows.push({
      evId:ev.id,
      date:ev.date||'', name:ev.name||'', type:ev.type||'',
      signup,                      // 'attend' | 'reserve' | 'absent' | ''(未回覆)
      place,                        // 隊伍標籤／'候補'／''
      isReserve:place==='候補',     // 候補不出賽不算異常
      hasMatchData:day.length>0,   // 當天是否已有比賽紀錄（沒有代表比賽還沒打/還沒匯入）
      dayMatchCount:day.length,    // 當天總共打了幾場比賽（不論自己是否出現在裡面）
      dayPlayedCount,               // 自己實際出現在幾場比賽紀錄裡（計入出場次數的真正場數）
      played:dayPlayedCount>0,
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

// 計算成員出席狀態 a/b/c：
//   a = 實際出場次數：報名管理有建立場次的日期中，比賽紀錄實際出現的總場次
//       （不論有無報名／有無排入排表，忠實反映所有打過的場；同一天2場比賽算2次）
//   b = 報名次數：累計「報名出席」＋「報名候補」的次數；
//   c = 排入排表次數：累計被排入「實際戰鬥小隊」＋「候補隊伍」的次數
//       （候補確實有報名、確實有被排入，所以要計入 b、c；但候補不一定真的會上場，
//        所以另外拆出 bFull/cFull＝只算「出席」與「戰鬥小隊」的部分，
//        用來判斷 b、c 超出 a 是因為候補、還是真的沒出席/沒出賽）
//   b、c 都依「當天實際比賽場數」計算（雙場周算2次），且都只計算「當天已經有比賽紀錄」
//   的場次——還沒過期／還沒發生的場次不計入 b、c，避免把「還沒發生的事」也算進去
function _attRate(name){
  const me=S.members().find(x=>x.name===name);
  const alias=new Set([name,...((me&&me.aliases)||[])]);
  const events=S.events(), matches=S.matches(), signups=S.signups();

  // 找出此成員在某場次是否被排入「實際戰鬥小隊」（不含候補）
  function inCombatSquad(ev){
    if(!ev.teams) return false;
    for(const [key,arr] of Object.entries(ev.teams)){
      if(key==='reserve'||!Array.isArray(arr)) continue;
      if(arr.some(n=>alias.has(n))) return true;
    }
    return false;
  }
  function inReserveSquad(ev){
    return !!(ev.teams && (ev.teams.reserve||[]).some(n=>alias.has(n)));
  }

  let bFull=0, bReserve=0, cFull=0, cReserve=0;
  events.forEach(ev=>{
    const d=String(ev.date||'').slice(0,10);
    const day=matches.filter(mm=>String(mm.date||'').slice(0,10)===d);
    if(!day.length) return; // 當天還沒有比賽紀錄（尚未發生/過期）→ 不計入 b、c

    const evS=signups[ev.id]||{};
    let st=''; alias.forEach(a=>{ if(evS[a]!==undefined) st=evS[a]; });
    if(st==='attend') bFull += day.length;       // 報名出席：雙場周算2次
    else if(st==='reserve') bReserve += day.length; // 報名候補：一樣算，但另外拆出來

    if(inCombatSquad(ev)) cFull += day.length;         // 排入戰鬥小隊：雙場周算2次
    else if(inReserveSquad(ev)) cReserve += day.length; // 排入候補隊伍：一樣算，但另外拆出來
  });
  const b=bFull+bReserve, c=cFull+cReserve;

  // a：只統計「報名管理有建立場次」當天的比賽紀錄，每一筆比賽紀錄都算一次出場
  const evDates=new Set(events.map(e=>String(e.date||'').slice(0,10)).filter(Boolean));
  let a=0;
  matches.forEach(mm=>{
    if(!evDates.has(String(mm.date||'').slice(0,10))) return;
    if((mm.participants||[]).some(n=>alias.has(n))) a++;
  });
  return {a,b,c,bFull,cFull};
}

// 找出「最近一場已經有比賽紀錄」的場次，判斷該場次的報名／排表／出賽三者是否一致：
//   'ok'      = 三者一致（有報名+排入+出賽，或都沒有也沒出賽）——正常，不需提醒
//   'warn1'   = 完全沒報名、沒排入，卻出賽了——請盡快用系統登記
//   'warn2'   = 有報名（出席）或有排入戰鬥小隊，卻沒出賽——請記得要出場
//   'reserve' = 只有候補報名／候補排入，沒出賽——候補沒被叫上場，屬正常情況、非異常
//   null      = 目前還沒有任何「已有比賽紀錄」的場次可供比對（例如全新成員）
// 刻意只看「最近一場」、不追溯更早的場次：更早場次即使曾經異常，只要最近一場恢復
// 正常就不再提醒；a/b/c 顯示的數字本身仍是全部累計加總，不受這裡影響。
function _recentAttStatus(name){
  const {rows}=_attDetail(name);
  const row=rows.find(r=>r.hasMatchData);
  if(!row) return null;
  const fullSignup=row.signup==='attend';
  const reserveSignup=row.signup==='reserve';
  const fullPlaced=!!row.place && row.place!=='候補';
  const reservePlaced=row.place==='候補';
  const played=row.played;
  if(!fullSignup && !reserveSignup && !fullPlaced && !reservePlaced && played) return {type:'warn1', date:row.date};
  if((fullSignup||fullPlaced) && !played) return {type:'warn2', date:row.date};
  if((reserveSignup||reservePlaced) && !played) return {type:'reserve', date:row.date};
  return {type:'ok', date:row.date};
}
// 出席明細中「更早場次」收合列的展開/收合
function toggleOlderAttRow(i){
  const body=document.getElementById('older-att-body-'+i);
  const arrow=document.getElementById('older-att-arrow-'+i);
  if(!body) return;
  const opening=body.classList.contains('hidden');
  body.classList.toggle('hidden');
  if(arrow) arrow.textContent=opening?'▲':'▼';
}
function openAttendanceDetail(name){
  const {rows, extras}=_attDetail(name);
  const r=_attRate(name);
  document.getElementById('att-detail-name').textContent=name;
  {
    const note=attStatusNote(name,false);
    const noteColor=note?.type==='warn1'?'var(--gold)':note?.type==='warn2'?'var(--bad)':note?.type==='reserve'?'var(--accent)':'var(--txt2)';
    const timingNote=attSignupTimingNote(r.b,r.c,false);
    const leaveNote=checkLongLeaveWarning(name);
    document.getElementById('att-detail-summary').innerHTML =
      `出席：<strong style="color:${attRateColor3(name)}">${r.a}/${r.b}/${r.c}</strong>　（實際出場次數／報名次數／排入排表次數）${note?'<br><span style="font-size:12px;color:'+noteColor+'">'+note.text+'</span>':''}${timingNote?'<br><span style="font-size:12px;color:var(--gold)">'+timingNote.text+'</span>':''}${leaveNote?'<br><span style="font-size:12px;color:var(--bad)">'+leaveNote.text+'</span>':''}${typeof scoreAttSummaryHtml==='function'?scoreAttSummaryHtml(name):''}`;
  }
  // 每場活動顯示三項狀態：報名／排表／出賽
  const signupBadge=s=>s==='attend'?'<span style="color:var(--ok);font-weight:700">✅ 出席</span>'
    :s==='reserve'?'<span style="color:var(--gold);font-weight:700">🟡 候補</span>'
    :s==='absent'?'<span style="color:var(--bad);font-weight:700">🌙 請假</span>'
    :'<span style="color:var(--txt3)">⏳ 未回覆</span>';
  const placeBadge=p=>p?'<span style="color:var(--accent);font-weight:700">📋 '+p+'</span>':'<span style="color:var(--txt3)">— 未排入</span>';
  // 候補未出賽不是異常，用中性提示；只有被排入實際戰鬥小隊卻沒出賽，才視為缺席異常
  const playBadge=x=>!x.hasMatchData?'<span style="color:var(--txt3)">尚無比賽紀錄</span>'
    :x.played?'<span style="color:var(--ok);font-weight:700">⚔️ 有出賽</span>'
    :x.isReserve?'<span style="color:var(--txt3)">🟡 候補未上場（不計入異常）</span>'
    :'<span style="color:var(--bad);font-weight:700">❌ 未出賽</span>';
  const RECENT_N=5;
  const recentRows=rows.slice(0,RECENT_N);
  const olderRows=rows.slice(RECENT_N);
  const rowCardHtml=x=>`
      <div style="border:1px solid var(--border);border-radius:8px;padding:8px 12px">
        <div style="font-weight:700;margin-bottom:6px">${x.date}　${x.name}${x.type?'（'+x.type+'）':''}</div>
        <div style="display:flex;gap:14px;flex-wrap:wrap;font-size:13px">
          <span>報名：${signupBadge(x.signup)}</span>
          <span>排表：${placeBadge(x.place)}</span>
          <span>出賽：${playBadge(x)}${x.dayMatchCount>1?' <span style="color:var(--txt3);font-weight:400">（當天共'+x.dayMatchCount+'場比賽'+(x.dayPlayedCount>0?'，計入出場次數'+x.dayPlayedCount+'次）':'）')+'</span>':''}</span>
        </div>
        ${typeof scoreAttRowHtml==='function'?scoreAttRowHtml(name, x.evId):''}
      </div>`;
  const recentHtml=recentRows.length
    ? `<div style="display:flex;flex-direction:column;gap:8px">${recentRows.map(rowCardHtml).join('')}</div>`
    : '<p class="hint">尚無任何活動場次</p>';
  // 更早的場次預設收合，只顯示日期/名稱一行，點擊才展開完整報名/排表/出賽狀態，避免資料越多畫面越長
  const olderHtml=olderRows.length
    ? `<div style="margin-top:10px;display:flex;flex-direction:column;gap:4px">${olderRows.map((x,i)=>`
        <div class="card" style="padding:0;overflow:hidden">
          <div style="padding:8px 12px;cursor:pointer;display:flex;justify-content:space-between;align-items:center;font-size:13px" onclick="toggleOlderAttRow(${i})">
            <span>${x.date}　${x.name}${x.type?'（'+x.type+'）':''}</span>
            <span id="older-att-arrow-${i}" style="color:var(--txt3)">▼</span>
          </div>
          <div id="older-att-body-${i}" class="hidden" style="padding:0 12px 10px">
            <div style="display:flex;gap:14px;flex-wrap:wrap;font-size:13px">
              <span>報名：${signupBadge(x.signup)}</span>
              <span>排表：${placeBadge(x.place)}</span>
              <span>出賽：${playBadge(x)}${x.dayMatchCount>1?' <span style="color:var(--txt3);font-weight:400">（當天共'+x.dayMatchCount+'場比賽'+(x.dayPlayedCount>0?'，計入出場次數'+x.dayPlayedCount+'次）':'）')+'</span>':''}</span>
            </div>
            ${typeof scoreAttRowHtml==='function'?scoreAttRowHtml(name, x.evId):''}
          </div>
        </div>`).join('')}</div>`
    : '';
  const mainHtml = recentHtml + olderHtml;
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
// 出席場數欄的排序狀態（點表頭切換，取代原本的下拉選單）：
// '' 預設 → 'low' 出席少→多 → 'high' 出席多→少 → 'never' 只看從未出賽/報名 → 回到 ''
let _msActState='';
// 絕技欄的篩選狀態（點表頭切換）：只看尚未設定任何絕技的成員
let _msSkillState=false;
// 總積分欄排序狀態（點表頭切換）：'' 預設 → 'high' 高→低 → 'low' 低→高 → 回 ''
let _msScoreSort='';
function cycleScoreSort(){
  const seq=['','high','low'];
  _msScoreSort=seq[(seq.indexOf(_msScoreSort)+1)%seq.length];
  renderAdminMembers(document.getElementById('pane-a-members'));
}

function cycleActSort(){
  const seq=['','low','high','never'];
  _msActState=seq[(seq.indexOf(_msActState)+1)%seq.length];
  renderAdminMembers(document.getElementById('pane-a-members'));
}
function toggleSkillFilter(){
  _msSkillState=!_msSkillState;
  renderAdminMembers(document.getElementById('pane-a-members'));
}

// 依目前篩選條件計算要顯示的成員列表與活動度資料
function _memberView(){
  const members=S.members();
  const signups=S.signups();
  // 每位成員的活動度：實際出賽場數（a）＋報名回覆次數（出席或請假都算有回應）
  const actMap={};
  members.forEach(m=>{
    const r=_attRate(m.name);
    const alias=new Set([m.name,...(m.aliases||[])]);
    let resp=0;
    Object.values(signups).forEach(evS=>{ Object.keys(evS||{}).forEach(n=>{ if(alias.has(n)) resp++; }); });
    actMap[m.id]={a:r.a, b:r.b, c:r.c, bFull:r.bFull, cFull:r.cFull, resp};
  });
  let filtered=members;
  const qs=(document.getElementById('ms-q')||{value:''}).value.toLowerCase();
  const qc=(document.getElementById('ms-cls')||{value:''}).value;
  const qa=_msActState;
  if(qs)filtered=filtered.filter(m=>m.name.toLowerCase().includes(qs));
  if(qc)filtered=filtered.filter(m=>m.jobId===qc);
  if(_msSkillState) filtered=filtered.filter(m=>!(m.skills&&m.skills.length));
  // 出席場數排序／篩選：協助找出長期未參與、可能已離開幫派的成員
  if(qa==='never'){
    filtered=filtered.filter(m=>{const a=actMap[m.id];return a.a===0&&a.resp===0;});
  } else if(qa==='low'){
    filtered=filtered.slice().sort((a,b)=>(actMap[a.id].a-actMap[b.id].a)||(actMap[a.id].resp-actMap[b.id].resp));
  } else if(qa==='high'){
    filtered=filtered.slice().sort((a,b)=>(actMap[b.id].a-actMap[a.id].a)||(actMap[b.id].resp-actMap[a.id].resp));
  }
  // 總積分排序（僅積分機制組織；與出席排序互斥，積分排序啟用時以它為準）
  if(_msScoreSort && typeof scoreEnabled==='function' && scoreEnabled() && typeof memberScoreTotal==='function'){
    const sc={}; filtered.forEach(m=>{ sc[m.id]=memberScoreTotal(m.name); });
    filtered=filtered.slice().sort((a,b)=> _msScoreSort==='high' ? (sc[b.id]-sc[a.id]) : (sc[a.id]-sc[b.id]));
  }
  return {members, filtered, actMap, qs, qc, qa};
}

// 產生表格列 HTML
function _memberRowsHtml(filtered, actMap, qa){
  const tbody=filtered.map((m,idx)=>{
    const job=jobById(m.jobId);
    const a=actMap[m.id];
    const inactive=a.a===0&&a.resp===0;
    const isAway=(m.status==='暫離');
    return `<tr${inactive?' style="opacity:.55"':''}>
      <td style="text-align:center;color:var(--txt3);font-size:12px;width:36px">${idx+1}</td>
      <td><strong${isAway?' style="color:var(--bad)"':''}>${isAway?'🚫 ':''}${m.name}</strong>${isAway?'<br><span style="font-size:10px;color:var(--bad);font-weight:700">⛔ 暫離中（不列入排表/催繳）</span>':''}${inactive?'<br><span style="font-size:10px;color:var(--bad)">💤 從未出賽/報名</span>':''}${(m.changeLog&&m.changeLog.length)?`<br><span style="font-size:10px;color:var(--txt3)" title="${m.changeLog.map(c=>c.t+' '+c.type+'：'+c.from+'→'+c.to).join('&#10;')}">📝 ${m.changeLog[m.changeLog.length-1].t} ${m.changeLog[m.changeLog.length-1].type}</span>`:''}</td>
      <td><span class="pill pill-job" style="background:${job.color};color:#fff">${job.name}</span></td>
      <td>${(function(){
        const c=attRateColor3(m.name);
        const note=attStatusNote(m.name,false);
        const timingNote=attSignupTimingNote(a.b,a.c,false);
        const leaveNote=checkLongLeaveWarning(m.name);
        const badge=note?` <span title="${note.text}" style="cursor:help">${note.type==='reserve'?'🟡':'📢'}</span>`:'';
        const timingBadge=timingNote?` <span title="${timingNote.text}" style="cursor:help">⏰</span>`:'';
        const leaveBadge=leaveNote?` <span title="${leaveNote.text}" style="cursor:help">🏖️</span>`:'';
        return `<button class="btn btn-outline xs" style="color:${c};font-weight:700" onclick="openAttendanceDetail('${m.name.replace(/'/g,"\\'")}')">${a.a}/${a.b}/${a.c}</button>${badge}${timingBadge}${leaveBadge}<br><span style="font-size:10px;color:var(--txt3)">（出場／報名／排表）</span>`;
      })()}</td>
      ${(typeof scoreMemberCellHtml==='function')?scoreMemberCellHtml(m.name):''}
      <td style="font-size:11px;color:var(--txt2);max-width:130px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${(m.skills||[]).join('、')||'—'}</td>
      <td style="font-size:11px;color:var(--txt2);max-width:130px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${(m.baijia||[]).join('、')||'—'}</td>
      <td><button class="btn btn-outline xs" onclick="openEditMember('${m.id}')">編輯</button></td>
    </tr>`;
  }).join('');
  const _cols=7+((typeof scoreEnabled==='function'&&scoreEnabled())?1:0);
  return tbody||'<tr><td colspan="'+_cols+'" style="text-align:center;color:var(--txt3);padding:24px">'+(qa==='never'?'沒有「從未出賽/報名」的成員 🎉':'尚無成員')+'</td></tr>';
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
  </div>
  <div class="tbl-wrap"><table>
    <thead><tr><th style="width:36px"></th><th>成員名稱</th><th>職業</th>
      <th style="cursor:pointer;white-space:nowrap;user-select:none" onclick="cycleActSort()" title="點擊切換：預設 → 出席少→多 → 出席多→少 → 只看從未出賽/報名">出席場數 ${({'':'⇅','low':'🔼','high':'🔽','never':'💤'})[v.qa]}</th>
      ${(typeof scoreEnabled==='function'&&scoreEnabled())?`<th style="cursor:pointer;white-space:nowrap;user-select:none" onclick="cycleScoreSort()" title="點擊切換：預設 → 積分高→低 → 積分低→高">🏅 總積分 ${({'':'⇅','high':'🔽','low':'🔼'})[_msScoreSort]}</th>`:''}
      <th style="cursor:pointer;white-space:nowrap;user-select:none" onclick="toggleSkillFilter()" title="點擊切換：只顯示尚未設定絕技的成員">絕技 ${_msSkillState?'❓':'⇅'}</th>
      <th>群俠技能</th>
      <th>操作</th></tr></thead>
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
async function saveMember(){
  // 清除從遊戲/聊天視窗複製貼上時常夾帶的零寬空白等隱形字元，
  // 避免產生「看起來一樣、其實不同」的名稱造成重複或搜尋不到
  const name=document.getElementById('m-name').value.trim().replace(/[\u200B-\u200F\uFEFF\u2060]/g,'');
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
    // ★ 曾用名衝突檢查：若這個名稱在某位成員的「曾用名」清單裡，
    // 系統的改名合併機制會在儲存後立刻把新成員自動併回該成員（看起來像「加不進去」）。
    // 這裡先擋下並明確告知處理方式，不再無聲消失。
    const aliasOwner=members.find(m=>m.name!==name&&(m.aliases||[]).includes(name));
    if(aliasOwner){
      toast('⚠️ 「'+name+'」是成員「'+aliasOwner.name+'」改名前的曾用名，系統會視為同一人。若這確實是不同的新玩家，請改用可區別的角色名稱新增（例如加上後綴），以免與歷史紀錄混淆。','err');
      return;
    }
    members.push({id:uid(),name,jobId,status,note:'',skills,baijia,createdAt:Date.now(),updatedAt:Date.now()});
    toast('成員已新增','ok');
  }
  S.setMembers(members);
  // 若此成員為固定團／固定候補：未截止場次自動報名出席／候補（衝突時強制轉為身分對應狀態）
  try{
    const savedName=(document.getElementById('m-name')||{value:''}).value.trim();
    const savedM=members.find(x=>x.name===savedName);
    if(savedM && typeof autoSignupFixedMembers==='function') autoSignupFixedMembers(savedM.name);
  }catch(_){}
      // 改名後立即清理：吸收殘留的舊名字成員紀錄、把舊名字的報名搬到新名字名下、
      // 並把排表系統（隊伍名單/砲手指揮/指派技能）裡的舊名字也搬到新名字名下，
      // 這樣該玩家後續的出席率等統計才會正確，排表也不會出現查無資料的舊名字卡片
      try{
        if(typeof _dedupeMembersByName==='function') S.setMembers(_dedupeMembersByName(S.members()));
        if(typeof _migrateAliasSignups==='function') _migrateAliasSignups();
        if(typeof _migrateAliasLineups==='function') _migrateAliasLineups();
      }catch(_){}
  closeModal('modal-member');
  renderAdminMembers(document.getElementById('pane-a-members'));
  // 立即同步，不等背景的2秒防抖排程——避免存檔後太快切換頁面/重整，
  // 讓變更只留在本機、沒真正送上雲端
  if(typeof syncWriteNowFast==='function'){
    const ok=await syncWriteNowFast();
    if(ok===true) toast('✅ 已儲存並同步','ok');
    else if(ok!=='nosync') toast('⚠️ 已存在本機，但雲端同步失敗，背景將自動重試','err');
  }
}
async function deleteMember(){
  if(!_editMemberId||!confirm('確定刪除？'))return;
  if(typeof _addTomb==='function') _addTomb('members', _editMemberId);
  S.setMembers(S.members().filter(m=>m.id!==_editMemberId));
  closeModal('modal-member');
  toast('刪除中，同步中...','');
  renderAdminMembers(document.getElementById('pane-a-members'));
  if(typeof syncWriteNowFast==='function'){
    const ok=await syncWriteNowFast();
    toast(ok===true?'✅ 已刪除並同步':'⚠️ 已刪除（本機），雲端同步失敗，背景將自動重試', ok===true?'ok':'err');
  }
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

    const mRows=members.map(m=>({角色名稱:m.name,職業:jobById(m.jobId).name,隊伍:m.team||'',狀態:m.status||'',總積分:(typeof scoreEnabled==='function'&&scoreEnabled())?memberScoreTotal(m.name):'',絕技:(m.skills||[]).join('|'),群俠技能:(m.baijia||[]).join('|'),曾用名:(m.aliases||[]).join('|'),備註:m.note||''}));
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
