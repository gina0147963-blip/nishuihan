// ============================================================
// ADMIN: SIGNUP MANAGER
// ============================================================
function renderAdminSignupMgr(pane){
  // 補跑固定團自動報名：涵蓋其他裝置新建的場次、或成員後來才被設為固定團的情況（冪等，有變動才寫入）
  if(typeof autoSignupFixedMembers==='function') autoSignupFixedMembers();
  // 依活動日期由新到舊排序（同日再以建立時間新→舊）
  const events=S.events().slice().sort((a,b)=>String(b.date||'').localeCompare(String(a.date||''))||((b.createdAt||0)-(a.createdAt||0)));
  const signups=S.signups();
  const members=S.members();
  pane.innerHTML=`<div class="sec-head"><h2>📅 報名管理（${ORG_LABEL()}）</h2><button class="btn btn-blue sm" onclick="openEventModal()">+ 新增場次</button></div>
  ${events.length?events.map(ev=>{
    const evS=signups[ev.id]||{};
    const attNames=Object.entries(evS).filter(([,v])=>v==='attend').map(([n])=>n);
    const rsvNames=Object.entries(evS).filter(([,v])=>v==='reserve').map(([n])=>n);
    const absNames=Object.entries(evS).filter(([,v])=>v==='absent').map(([n])=>n);
    const responded=new Set(Object.keys(evS));
    const pendingNames=members.filter(m=>!responded.has(m.name)).map(m=>m.name);
    const cdText=evLockCountdownText(ev);
    const cdColor=cdText.startsWith('🔒')?'var(--bad)':'var(--gold)';
    return `<div class="card">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px;flex-wrap:wrap">
        <div>
          ${evTitleHtml(ev)}
          <div style="font-size:12px;color:var(--txt2)">📅 ${ev.date||''}</div>
          ${cdText?`<div style="font-size:12px;font-weight:700;color:${cdColor};margin-top:4px">${cdText}（截止：${evLockTimeLabel(ev)}）</div>`:''}
        </div>
        <div style="display:flex;gap:6px;flex-wrap:wrap">
          <button class="btn btn-outline sm" onclick="toggleAttendeePanel('${ev.id}')">📋 查看名單</button>
          ${pendingNames.length?`<button class="btn btn-outline sm" onclick="copyPendingReminder('${ev.id}')" title="複製「尚未報名」催繳文字，可直接貼到遊戲群組">📣 複製催繳名單</button>`:''}
          <button class="btn btn-outline sm" onclick="openEditEvent('${ev.id}')">✏️ 編輯</button>
          <button class="btn btn-outline sm" onclick="exportAttendees('${ev.id}')">匯出CSV</button>
          <button class="btn btn-red xs" onclick="deleteEvent('${ev.id}')">刪除</button>
        </div>
      </div>
      <div style="display:flex;gap:12px;margin:10px 0;font-size:13px;flex-wrap:wrap">
        <span>✅ 出席 <strong style="color:var(--ok)">${attNames.length}</strong></span>
        <span>🟡 候補 <strong style="color:var(--gold)">${rsvNames.length}</strong></span>
        <span>🌙 請假 <strong style="color:var(--bad)">${absNames.length}</strong></span>
        <span>⏳ 未回覆 <strong style="color:var(--txt2)">${pendingNames.length}</strong></span>
      </div>
      <div id="att-panel-${ev.id}" class="hidden">
        <div style="margin-bottom:10px">
          <div style="font-size:12px;font-weight:700;color:var(--ok);margin-bottom:4px">✅ 已報名出席（${attNames.length}）</div>
          <div class="att-list">${attNames.length?attNames.map(n=>`<span class="att-tag" style="cursor:pointer" title="點一下調整此玩家的報名狀態" onclick="adminEditSignup('${ev.id}','${n.replace(/'/g,"\\'")}')">${n}</span>`).join(''):'<span style="color:var(--txt3);font-size:12px">無</span>'}</div>
        </div>
        <div style="margin-bottom:10px">
          <div style="font-size:12px;font-weight:700;color:var(--gold);margin-bottom:4px">🟡 候補（${rsvNames.length}）<span style="font-weight:400;color:var(--txt3)">　可出席，但先以候補為主</span></div>
          <div class="att-list">${rsvNames.length?rsvNames.map(n=>`<span class="att-tag" style="cursor:pointer;border-color:var(--gold);color:var(--gold)" title="點一下調整此玩家的報名狀態" onclick="adminEditSignup('${ev.id}','${n.replace(/'/g,"\\'")}')">${n}</span>`).join(''):'<span style="color:var(--txt3);font-size:12px">無</span>'}</div>
        </div>
        <div style="margin-bottom:10px">
          <div style="font-size:12px;font-weight:700;color:var(--bad);margin-bottom:4px">🌙 已請假（${absNames.length}）</div>
          <div class="att-list">${absNames.length?absNames.map(n=>`<span class="att-tag absent" style="cursor:pointer" title="點一下調整此玩家的報名狀態" onclick="adminEditSignup('${ev.id}','${n.replace(/'/g,"\\'")}')">${n}</span>`).join(''):'<span style="color:var(--txt3);font-size:12px">無</span>'}</div>
        </div>
        <div>
          <div style="font-size:12px;font-weight:700;color:var(--txt2);margin-bottom:4px">⏳ 尚未回覆（${pendingNames.length}）<span style="font-weight:400;color:var(--txt3)">　💡 點名字即可代為報名或修正狀態</span></div>
          <div class="att-list">${pendingNames.length?pendingNames.map(n=>`<span class="att-tag pending" style="cursor:pointer" title="點一下調整此玩家的報名狀態" onclick="adminEditSignup('${ev.id}','${n.replace(/'/g,"\\'")}')">${n}</span>`).join(''):'<span style="color:var(--txt3);font-size:12px">無</span>'}</div>
        </div>
      </div>
    </div>`;
  }).join(''):'<div class="empty"><div class="empty-ico">📅</div><p>尚無場次</p></div>'}`;
}
// ── 管理員調整玩家報名狀態 ─────────────────────────────
// 點名單中任一名字開啟小視窗，可改為出席/請假/清除回覆。
// 管理員操作不受截止時間限制（截止後玩家不能改，但管理員可以更正錯誤）。
function adminEditSignup(evId,name){
  const ev=S.events().find(e=>e.id===evId);
  if(!ev){ toast('找不到此場次','err'); return; }
  const cur=(S.signups()[evId]||{})[name];
  const curLabel=cur==='attend'?'✅ 出席':cur==='reserve'?'🟡 候補':cur==='absent'?'🌙 請假':'⏳ 尚未回覆';
  let ov=document.getElementById('modal-admin-signup');
  if(ov) ov.remove();
  ov=document.createElement('div');
  ov.id='modal-admin-signup';
  ov.className='modal-ov';
  ov.innerHTML=`<div class="modal" style="max-width:340px">
    <div class="modal-hd"><h3>調整報名狀態</h3><button class="close-btn" onclick="closeModal('modal-admin-signup')">✕</button></div>
    <div class="modal-body">
      <p style="margin-bottom:4px"><strong style="font-size:16px">${name}</strong></p>
      <p class="hint" style="margin-bottom:12px">${ev.name}　目前狀態：${curLabel}</p>
      <div style="display:flex;flex-direction:column;gap:8px">
        <button class="btn btn-blue" onclick="adminSetSignup('${evId}','${name.replace(/'/g,"\\'")}','attend')">✅ 改為出席</button>
        <button class="btn btn-outline" style="border-color:var(--gold);color:var(--gold)" onclick="adminSetSignup('${evId}','${name.replace(/'/g,"\\'")}','reserve')">🟡 改為候補</button>
        <button class="btn btn-outline" onclick="adminSetSignup('${evId}','${name.replace(/'/g,"\\'")}','absent')">🌙 改為請假</button>
        <button class="btn btn-outline" onclick="adminSetSignup('${evId}','${name.replace(/'/g,"\\'")}',null)">🗑 清除回覆（改回尚未回覆）</button>
      </div>
    </div>
  </div>`;
  document.body.appendChild(ov);
}

function adminSetSignup(evId,name,status){
  if(status==='reserve'){
    const m=S.members().find(x=>x.name===name);
    if(m&&m.status==='固定團'){ toast('「'+name+'」是固定團成員，為自動出席、不可改為候補；無法出席請改為請假','err'); return; }
  }
  const signups=S.signups();
  const evS={...(signups[evId]||{})};
  if(status===null) delete evS[name];
  else evS[name]=status;
  S.setSignups({...signups,[evId]:evS});
  closeModal('modal-admin-signup');
  const label=status==='attend'?'出席':status==='reserve'?'候補':status==='absent'?'請假':'尚未回覆';
  toast('✅ 已將「'+name+'」調整為「'+label+'」','ok');
  // 重新整理報名管理頁，並保持該場次的名單面板展開
  renderAdminSignupMgr(document.getElementById('pane-a-signup-mgr'));
  const panel=document.getElementById('att-panel-'+evId);
  if(panel) panel.classList.remove('hidden');
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
    rows.push([ev?.name||'',name,job.name,m?.team||'',m?.status||'',{attend:'出席',reserve:'候補',absent:'缺席',maybe:'待定'}[st]||st]);
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
  // 幫戰場次名稱一律依日期自動產生，不顯示名稱欄位；俱樂部保留自訂彈性
  const nameFg=document.getElementById('ev-name-field'); if(nameFg) nameFg.classList.toggle('hidden', CUR_MODE==='guild');
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
  const nameFg=document.getElementById('ev-name-field'); if(nameFg) nameFg.classList.toggle('hidden', CUR_MODE==='guild');
  const dateEl=document.getElementById('ev-date'); if(dateEl) dateEl.value=String(ev.date||'').slice(0,10);
  const timeEl=document.getElementById('ev-time'); if(timeEl){ const mt=String(ev.eventTime||'').match(/(\d{1,2}:\d{2})/); timeEl.value=mt?mt[1]:'20:00'; }
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
    const customName=(CUR_MODE==='guild')?'':(nameEl?nameEl.value.trim():'');
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
      // 固定團成員自動報名出席（之後個別點請假即可取消）
      if(typeof autoSignupFixedMembers==='function') autoSignupFixedMembers();
      toast('✅ 場次「'+name+'」已建立，固定團成員已自動報名出席','ok');
    }
    renderAdminSignupMgr(document.getElementById('pane-a-signup-mgr'));
  }catch(err){
    console.error('createEvent error:',err);
    toast('❌ 儲存失敗：'+err.message,'err');
  }
}
