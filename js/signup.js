// ============================================================
// ADMIN: SIGNUP MANAGER
// ============================================================
function renderAdminSignupMgr(pane){
  const events=S.events().slice().reverse();
  const signups=S.signups();
  const members=S.members();
  pane.innerHTML=`<div class="sec-head"><h2>📅 報名管理（${ORG_LABEL()}）</h2><button class="btn btn-blue sm" onclick="openEventModal()">+ 新增場次</button></div>
  ${events.length?events.map(ev=>{
    const evS=signups[ev.id]||{};
    const attNames=Object.entries(evS).filter(([,v])=>v==='attend').map(([n])=>n);
    const absNames=Object.entries(evS).filter(([,v])=>v==='absent').map(([n])=>n);
    const responded=new Set(Object.keys(evS));
    const pendingNames=members.filter(m=>!responded.has(m.name)).map(m=>m.name);
    const cdText=evLockCountdownText(ev);
    const cdColor=cdText.startsWith('🔒')?'var(--bad)':'var(--gold)';
    return `<div class="card">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px;flex-wrap:wrap">
        <div>
          <div style="font-size:15px;font-weight:700;margin-bottom:4px">${ev.name}</div>
          <div style="font-size:12px;color:var(--txt2)">📅 ${ev.date||''} ／ ${ev.type||''}${ev.type==='約戰'?(ev.eventTime?'　🕐 '+ev.eventTime:'')+(ev.matchFormat?'　⚔️ '+(ev.matchFormat==='2'?'兩局制':'一局制'):''):''}</div>
          ${cdText?`<div style="font-size:12px;font-weight:700;color:${cdColor};margin-top:4px">${cdText}（截止：${evLockTimeLabel(ev)}）</div>`:''}
        </div>
        <div style="display:flex;gap:6px;flex-wrap:wrap">
          <button class="btn btn-outline xs" onclick="toggleAttendeePanel('${ev.id}')">📋 查看名單</button>
          ${pendingNames.length?`<button class="btn btn-outline xs" onclick="copyPendingReminder('${ev.id}')" title="複製「尚未報名」催繳文字，可直接貼到遊戲群組">📣 複製催繳名單</button>`:''}
          <button class="btn btn-outline xs" onclick="openEditEvent('${ev.id}')">✏️ 編輯</button>
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
// 一鍵產生「尚未報名」催繳文字並複製，直接貼到遊戲群組即可，省去人工比對
function copyPendingReminder(evId){
  const ev=S.events().find(e=>e.id===evId);
  if(!ev){ toast('找不到此場次','err'); return; }
  const evS=S.signups()[evId]||{};
  const responded=new Set(Object.keys(evS));
  const pendingNames=S.members().filter(m=>!responded.has(m.name)).map(m=>m.name);
  if(!pendingNames.length){ toast('全員都已回覆，不需要催繳 🎉','ok'); return; }
  const deadline=evLockTimeLabel(ev);
  const text='📣【'+(ev.name||'')+(ev.type?' '+ev.type:'')+'】報名提醒\n'
    +'以下 '+pendingNames.length+' 位尚未報名，請盡快到系統回報出席或請假：\n'
    +pendingNames.join('、')
    +(deadline?'\n⏰ 截止時間：'+deadline+'（截止後無法再更改）':'');
  copyTextToClipboard(text,'催繳名單已複製，可直接貼到群組');
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
  dl('\uFEFF'+csv,`出席名單_${ORG_LABEL()}_${ev?.name||evId}.csv`,'text/csv');
  toast('已匯出','ok');
}

// ============================================================
// 建立場次（由報名管理建立）
// ============================================================
let _editingEvId=null; // 目前正在編輯的場次id；null＝建立新場次

function openEventModal(){
  _editingEvId=null;
  const typeEl=document.getElementById('ev-type');
  if(typeEl){
    typeEl.innerHTML = CUR_MODE==='club'
      ? '<option>領地戰</option><option>約戰</option>'
      : '<option>單周聯賽</option><option>雙周聯賽</option>';
  }
  const nameEl=document.getElementById('ev-name'); if(nameEl) nameEl.value='';
  const dateEl=document.getElementById('ev-date');
  if(dateEl && !dateEl.value) dateEl.value=fmtDate(new Date());
  const t=document.getElementById('modal-event-title'); if(t) t.textContent='建立活動場次';
  const b=document.getElementById('modal-event-submit'); if(b) b.textContent='建立';
  onEventTypeChange(); // 依目前選到的類型決定要不要顯示約戰欄位
  openModal('modal-event');
}

// 編輯既有場次：帶入原本的名稱、日期、類型、約戰時間與局制
function openEditEvent(evId){
  const ev=S.events().find(e=>e.id===evId);
  if(!ev){ toast('找不到此場次','err'); return; }
  _editingEvId=evId;
  const typeEl=document.getElementById('ev-type');
  if(typeEl){
    typeEl.innerHTML = CUR_MODE==='club'
      ? '<option>領地戰</option><option>約戰</option>'
      : '<option>單周聯賽</option><option>雙周聯賽</option>';
    typeEl.value=ev.type||typeEl.options[0].value;
  }
  const nameEl=document.getElementById('ev-name'); if(nameEl) nameEl.value=ev.name||'';
  const dateEl=document.getElementById('ev-date'); if(dateEl) dateEl.value=String(ev.date||'').slice(0,10);
  const timeEl=document.getElementById('ev-time'); if(timeEl) timeEl.value=ev.eventTime||'20:00';
  const fmtEl=document.getElementById('ev-format'); if(fmtEl) fmtEl.value=ev.matchFormat||'1';
  const t=document.getElementById('modal-event-title'); if(t) t.textContent='編輯活動場次';
  const b=document.getElementById('modal-event-submit'); if(b) b.textContent='儲存修改';
  onEventTypeChange();
  openModal('modal-event');
}

// 活動類型切換：只有俱樂部的「約戰」需要填活動時間與賽制，其餘類型隱藏這些欄位
function onEventTypeChange(){
  const typeEl=document.getElementById('ev-type');
  const box=document.getElementById('ev-yuezhan-fields');
  if(!typeEl||!box) return;
  const isYuezhan = typeEl.value==='約戰';
  box.classList.toggle('hidden', !isYuezhan);
}

// 依日期自動產生場次名稱，例如 07-11（六）
function _autoEvName(date){
  const wd=['日','一','二','三','四','五','六'][new Date(date+'T00:00:00').getDay()];
  return date.slice(5)+'（'+wd+'）';
}

function submitCreateEvent(){
  try{
    const dateEl=document.getElementById('ev-date');
    const typeEl=document.getElementById('ev-type');
    const nameEl=document.getElementById('ev-name');
    const date=dateEl&&dateEl.value?dateEl.value:fmtDate(new Date());
    const type=typeEl&&typeEl.value?typeEl.value:(CUR_MODE==='club'?'領地戰':'單周聯賽');
    // 同日限一場的檢查；編輯模式時要排除自己這場
    if(S.events().some(e=>e.date===date && e.id!==_editingEvId)){ toast('該日期已有活動場次，同一天僅能建立一場','err'); return; }
    const customName=nameEl?nameEl.value.trim():'';
    const events=S.events();

    if(_editingEvId){
      // ── 編輯既有場次 ──
      const idx=events.findIndex(e=>e.id===_editingEvId);
      if(idx<0){ toast('找不到此場次','err'); return; }
      const ev=events[idx];
      const dateChanged=String(ev.date||'').slice(0,10)!==date;
      ev.date=date;
      ev.type=type;
      // 名稱規則：有填就用填的；留空則依（新）日期自動產生
      ev.name=customName||_autoEvName(date);
      if(type==='約戰'){
        const timeEl=document.getElementById('ev-time');
        const fmtEl=document.getElementById('ev-format');
        ev.eventTime=timeEl&&timeEl.value?timeEl.value:'';
        ev.matchFormat=fmtEl&&fmtEl.value?fmtEl.value:'1';
      } else {
        // 改回非約戰類型時清掉約戰專屬資訊，避免殘留顯示
        delete ev.eventTime;
        delete ev.matchFormat;
      }
      ev.updatedAt=Date.now(); // 讓多裝置合併時以這筆較新的為準
      S.setEvents(events);
      closeModal('modal-event');
      _editingEvId=null;
      toast('✅ 場次「'+ev.name+'」已更新'+(dateChanged?'（日期已變更，截止時間會跟著新日期重新計算）':''),'ok');
    } else {
      // ── 建立新場次 ──
      const name=customName||_autoEvName(date);
      const newEv={id:uid(),name,date,type,teamNames:['進攻','防守','機動'],teams:{reserve:[]},roles:{},squadRoles:{},createdAt:Date.now(),updatedAt:Date.now()};
      // 約戰額外記錄活動時間與賽制，會一併顯示在玩家端活動畫面
      if(type==='約戰'){
        const timeEl=document.getElementById('ev-time');
        const fmtEl=document.getElementById('ev-format');
        newEv.eventTime=timeEl&&timeEl.value?timeEl.value:'';
        newEv.matchFormat=fmtEl&&fmtEl.value?fmtEl.value:'1';
      }
      if(typeof ensureTeams==='function') ensureTeams(newEv);
      events.push(newEv);
      S.setEvents(events);
      closeModal('modal-event');
      toast('✅ 場次「'+name+'」已建立，玩家現在可以報名','ok');
    }
    renderAdminSignupMgr(document.getElementById('pane-a-signup-mgr'));
  }catch(err){
    console.error('createEvent error:',err);
    toast('❌ 儲存失敗：'+err.message,'err');
  }
}
