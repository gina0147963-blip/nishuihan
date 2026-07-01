// ============================================================
// ADMIN: SIGNUP MANAGER
// ============================================================
function renderAdminSignupMgr(pane){
  const events=S.events().slice().reverse();
  const signups=S.signups();
  pane.innerHTML=`<div class="sec-head"><h2>📅 報名管理（${MODE_LABEL[CUR_MODE]}）</h2><button class="btn btn-blue sm" onclick="openModal('modal-event')">+ 新增場次</button></div>
  ${events.length?events.map(ev=>{
    const evS=signups[ev.id]||{};
    const att=Object.entries(evS).filter(([,v])=>v==='attend');
    const abs=Object.entries(evS).filter(([,v])=>v==='absent').length;
    const mb=Object.entries(evS).filter(([,v])=>v==='maybe').length;
    return `<div class="card">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px;flex-wrap:wrap">
        <div>
          <div style="font-size:15px;font-weight:700;margin-bottom:4px">${ev.name}</div>
          <div style="font-size:12px;color:var(--txt2)">📅 ${ev.date||''} ／ ${ev.type||''}</div>
        </div>
        <div style="display:flex;gap:6px;flex-wrap:wrap">
          <button class="btn btn-outline xs" onclick="exportAttendees('${ev.id}')">匯出出席</button>
          <button class="btn btn-red xs" onclick="deleteEvent('${ev.id}')">刪除</button>
        </div>
      </div>
      <div style="display:flex;gap:12px;margin:10px 0;font-size:13px">
        <span>✅ 出席 <strong style="color:var(--ok)">${att.length}</strong></span>
        <span>❓ 待定 <strong style="color:var(--gold)">${mb}</strong></span>
        <span>❌ 缺席 <strong style="color:var(--bad)">${abs}</strong></span>
      </div>
      ${att.length?`<div class="att-list">${att.map(([n])=>`<span class="att-tag">${n}</span>`).join('')}</div>`:''}
    </div>`;
  }).join(''):'<div class="empty"><div class="empty-ico">📅</div><p>尚無場次</p></div>'}`;
}
function deleteEvent(id){
  if(!confirm('確定刪除此場次？'))return;
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
