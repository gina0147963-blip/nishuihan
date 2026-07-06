// ============================================================
// ADMIN: SIGNUP MANAGER
// ============================================================
function renderAdminSignupMgr(pane){
  const events=S.events().slice().reverse();
  const signups=S.signups();
  const members=S.members();
  pane.innerHTML=`<div class="sec-head"><h2>📅 報名管理（${MODE_LABEL[CUR_MODE]}）</h2><button class="btn btn-blue sm" onclick="openEventModal()">+ 新增場次</button></div>
  ${events.length?events.map(ev=>{
    const evS=signups[ev.id]||{};
    const attNames=Object.entries(evS).filter(([,v])=>v==='attend').map(([n])=>n);
    const absNames=Object.entries(evS).filter(([,v])=>v==='absent').map(([n])=>n);
    const responded=new Set(Object.keys(evS));
    const pendingNames=members.filter(m=>!responded.has(m.name)).map(m=>m.name);
    return `<div class="card">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px;flex-wrap:wrap">
        <div>
          <div style="font-size:15px;font-weight:700;margin-bottom:4px">${ev.name}</div>
          <div style="font-size:12px;color:var(--txt2)">📅 ${ev.date||''} ／ ${ev.type||''}</div>
        </div>
        <div style="display:flex;gap:6px;flex-wrap:wrap">
          <button class="btn btn-outline xs" onclick="toggleAttendeePanel('${ev.id}')">📋 查看名單</button>
          <button class="btn btn-outline xs" onclick="exportAttendees('${ev.id}')">匯出CSV</button>
          <button class="btn btn-red xs" onclick="deleteEvent('${ev.id}')">刪除</button>
        </div>
      </div>
      <div style="display:flex;gap:12px;margin:10px 0;font-size:13px;flex-wrap:wrap">
        <span>✅ 出席 <strong style="color:var(--ok)">${attNames.length}</strong></span>
        <span>🌙 請假 <strong style="color:var(--bad)">${absNames.length}</strong></span>
        <span>⏳ 未回覆 <strong style="color:var(--txt2)">${pendingNames.length}</strong></span>
      </div>
      <div id="att-panel-${ev.id}" class="hidden">
        <div style="margin-bottom:10px">
          <div style="font-size:12px;font-weight:700;color:var(--ok);margin-bottom:4px">✅ 已報名出席（${attNames.length}）</div>
          <div class="att-list">${attNames.length?attNames.map(n=>`<span class="att-tag">${n}</span>`).join(''):'<span style="color:var(--txt3);font-size:12px">無</span>'}</div>
        </div>
        <div style="margin-bottom:10px">
          <div style="font-size:12px;font-weight:700;color:var(--bad);margin-bottom:4px">🌙 已請假（${absNames.length}）</div>
          <div class="att-list">${absNames.length?absNames.map(n=>`<span class="att-tag absent">${n}</span>`).join(''):'<span style="color:var(--txt3);font-size:12px">無</span>'}</div>
        </div>
        <div>
          <div style="font-size:12px;font-weight:700;color:var(--txt2);margin-bottom:4px">⏳ 尚未回覆（${pendingNames.length}）</div>
          <div class="att-list">${pendingNames.length?pendingNames.map(n=>`<span class="att-tag pending">${n}</span>`).join(''):'<span style="color:var(--txt3);font-size:12px">無</span>'}</div>
        </div>
      </div>
    </div>`;
  }).join(''):'<div class="empty"><div class="empty-ico">📅</div><p>尚無場次</p></div>'}`;
}
function toggleAttendeePanel(evId){
  const el=document.getElementById('att-panel-'+evId);
  if(el) el.classList.toggle('hidden');
}
function deleteEvent(id){
  if(!confirm('確定刪除此場次？'))return;
  if(typeof _addTomb==='function') _addTomb('events', id);
  S.setEvents(S.events().filter(e=>e.id!==id));
  toast('已刪除','ok');
  renderAdminSignupMgr(document.getElementById('pane-a-signup-mgr'));
}
function exportAttendees(evId){
  const ev=S.events().find(e=>e.id===evId);
  const evS=S.signups()[evId]||{};
  const members=S.members();
  const rows=[['場次','角色名稱','職業','隊伍','狀態','報名狀態']];
  Object.entries(evS).forEach(([name,st])=>{
    const m=members.find(x=>x.name===name);
    const job=m?jobById(m.jobId):{name:''};
    rows.push([ev?.name||'',name,job.name,m?.team||'',m?.status||'',{attend:'出席',absent:'缺席',maybe:'待定'}[st]||st]);
  });
  const csv=rows.map(r=>r.map(c=>`"${String(c).replace(/"/g,'""')}"`).join(',')).join('\n');
  dl('\uFEFF'+csv,`出席名單_${MODE_LABEL[CUR_MODE]}_${ev?.name||evId}.csv`,'text/csv');
  toast('已匯出','ok');
}

// ============================================================
// 建立場次（由報名管理建立）
// ============================================================
function openEventModal(){
  const typeEl=document.getElementById('ev-type');
  if(typeEl){
    typeEl.innerHTML = CUR_MODE==='club'
      ? '<option>領地戰</option><option>約戰</option>'
      : '<option>單周聯賽</option><option>雙周聯賽</option>';
  }
  const dateEl=document.getElementById('ev-date');
  if(dateEl && !dateEl.value) dateEl.value=fmtDate(new Date());
  openModal('modal-event');
}

function submitCreateEvent(){
  try{
    const dateEl=document.getElementById('ev-date');
    const typeEl=document.getElementById('ev-type');
    const date=dateEl&&dateEl.value?dateEl.value:fmtDate(new Date());
    const type=typeEl&&typeEl.value?typeEl.value:(CUR_MODE==='club'?'領地戰':'單周聯賽');
    if(S.events().some(e=>e.date===date)){ toast('該日期已有活動場次，同一天僅能建立一場','err'); return; }
    const wd=['日','一','二','三','四','五','六'][new Date(date+'T00:00:00').getDay()];
    const name=date.slice(5).replace('-','-')+'（'+wd+'）';
    const events=S.events();
    const newEv={id:uid(),name,date,type,teamNames:['進攻','防守','機動'],teams:{reserve:[]},roles:{},squadRoles:{},createdAt:Date.now()};
    if(typeof ensureTeams==='function') ensureTeams(newEv);
    events.push(newEv);
    S.setEvents(events);
    closeModal('modal-event');
    toast('✅ 場次「'+name+'」已建立，玩家現在可以報名','ok');
    renderAdminSignupMgr(document.getElementById('pane-a-signup-mgr'));
  }catch(err){
    console.error('createEvent error:',err);
    toast('❌ 建立失敗：'+err.message,'err');
  }
}
