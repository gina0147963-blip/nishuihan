// ============================================================
// GOOGLE SYNC — 手動同步到 Google 試算表
// ============================================================

function updateSyncStatus(){
  const el=document.getElementById('topbar-sync-status');
  if(!el) return;
  const cfg=S.config();
  if(!cfg.gsWebhook){
    el.textContent='☁️ 未設定同步';
    el.className='sync-status never';
  } else if(cfg.lastSync){
    el.textContent='✅ '+cfg.lastSync.slice(0,16);
    el.className='sync-status synced';
  } else {
    el.textContent='☁️ 尚未同步';
    el.className='sync-status never';
  }
}

function openGoogleModal(){
  const cfg=S.config();
  document.getElementById('gs-webhook').value=cfg.gsWebhook||'';
  const lastEl=document.getElementById('gs-last-sync');
  if(lastEl) lastEl.textContent=cfg.lastSync?'上次同步：'+cfg.lastSync:'尚未同步過';
  openModal('modal-google');
}

function saveGoogleConfig(){
  const cfg=S.config();
  cfg.gsWebhook=document.getElementById('gs-webhook').value.trim();
  S.setConfig(cfg);
  toast('設定已儲存','ok');
  updateSyncStatus();
  closeModal('modal-google');
}

// 手動同步：把所有資料一次寫入 Google 試算表
async function googleSyncNow(){
  const cfg=S.config();
  if(!cfg.gsWebhook){
    toast('請先設定 Apps Script Webhook URL','err');
    openGoogleModal();
    return;
  }
  const btn=document.getElementById('btn-gsync');
  if(btn){ btn.disabled=true; btn.textContent='同步中...'; }
  toast('同步中，請稍候...','');

  const payload={
    action:'sync',
    mode:CUR_MODE,
    timestamp:new Date().toISOString(),
    members:S.members(),
    skillList:S.skillList(),
    baijiaList:S.baijiaList(),
    events:S.events(),
    signups:S.signups(),
    matches:S.matches(),
  };

  try{
    await fetch(cfg.gsWebhook,{
      method:'POST',
      headers:{'Content-Type':'text/plain;charset=utf-8'},
      body:JSON.stringify(payload),
    });
    const now=new Date().toLocaleString('zh-TW',{hour12:false}).slice(0,16);
    cfg.lastSync=now;
    S.setConfig(cfg);
    updateSyncStatus();
    toast('✅ 已同步至 Google 試算表（'+now+'）','ok');
    const lastEl=document.getElementById('gs-last-sync');
    if(lastEl) lastEl.textContent='上次同步：'+now;
  }catch(err){
    toast('❌ 同步失敗：'+err.message,'err');
  }finally{
    if(btn){ btn.disabled=false; btn.textContent='🔄 立即同步到 Google 試算表'; }
  }
}

// 從 Google 試算表匯入（覆蓋本機資料）
async function googleImportNow(){
  const cfg=S.config();
  if(!cfg.gsWebhook){ toast('請先設定 Apps Script Webhook URL','err'); openGoogleModal(); return; }
  if(!confirm('即將從 Google 試算表匯入「'+MODE_LABEL[CUR_MODE]+'」模式的資料，這會覆蓋本機目前的資料，確定繼續？')) return;
  toast('匯入中，請稍候...','');
  try{
    const url=cfg.gsWebhook+(cfg.gsWebhook.includes('?')?'&':'?')+'action=load&mode='+CUR_MODE;
    const res=await fetch(url,{method:'GET'});
    const data=await res.json();
    if(data.members) S.setMembers(data.members);
    if(data.skillList) S.setSkillList(data.skillList);
    if(data.baijiaList) S.setBaijiaList(data.baijiaList);
    if(data.events) S.setEvents(data.events);
    if(data.signups) S.setSignups(data.signups);
    if(data.matches) S.setMatches(data.matches);
    toast('✅ 已從 Google 試算表匯入','ok');
    closeModal('modal-google');
    const active=document.querySelector('.nav-btn.active');
    if(active) renderPane(active.dataset.tab,document.getElementById('pane-'+active.dataset.tab));
  }catch(err){
    toast('❌ 匯入失敗：'+err.message,'err');
  }
}
