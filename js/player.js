// ============================================================
// PLAYER: HOME
// ============================================================
function calcMyAttendance(){
  // 出席率算法與管理端「成員管理」的 _attRate 完全一致（兩邊務必同步，避免各算各的）：
  //   分母(signedUp) = 有「報名出席」場次中，當天實際比賽紀錄的場數（一天2場比賽就算2）
  //   分子(totalPlayed) = 上述「已發生」的場次中，自己實際出現在比賽紀錄裡的場數
  //   未來還沒發生、當天尚無比賽紀錄的場次一律不計入（不管分子或分母）
  //   沒報名卻被排上場打的場次，不算進分母，但算進分子（因為那是「已發生且自己真的有出場」的紀錄）
  const matches=S.matches();
  const events=S.events();
  const signups=S.signups();
  const me=S.members().find(m=>m.name===CUR_USER);
  const myNames=new Set([CUR_USER,...(me&&me.aliases||[])]);
  let signedUp=0, played=0;
  events.forEach(ev=>{
    const evS=signups[ev.id]||{};
    let signedAttend=false; myNames.forEach(a=>{ if(evS[a]==='attend') signedAttend=true; });
    if(!signedAttend) return; // 只計算「有報名出席」的場次
    const day=matches.filter(mm=>String(mm.date||'').slice(0,10)===String(ev.date||'').slice(0,10));
    if(!day.length) return;   // 當天還沒有比賽紀錄 → 場次尚未發生，先不計入
    signedUp+=day.length;     // 以「比賽紀錄」為單位：當天有幾場比賽，應出賽就算幾場
    day.forEach(mm=>{ if((mm.participants||[]).some(n=>myNames.has(n))) played++; });
  });
  // 出場次數：只統計「報名管理有建立場次」當天的比賽紀錄（同一天多場比賽各算一次），
  // 系統啟用前、或當天尚未建立場次的比賽紀錄視為備份，不列入
  const evDates=new Set(events.map(e=>String(e.date||'').slice(0,10)).filter(Boolean));
  let totalPlayed=0;
  matches.forEach(mm=>{
    if(!evDates.has(String(mm.date||'').slice(0,10))) return;
    if((mm.participants||[]).some(n=>myNames.has(n))) totalPlayed++;
  });
  const rate=signedUp>0?Math.round(played/signedUp*100):null;
  return {played, signedUp, totalPlayed, rate};
}

function renderPlayerHome(pane){
  const me=S.members().find(m=>m.name===CUR_USER);
  const events=S.events().slice().sort((a,b)=>(b.date||'').localeCompare(a.date||''));
  const latestEvent=events[0];
  const signups=S.signups();
  const a=calcMyAttendance();

  let profileHtml='';
  if(me){
    const job=jobById(me.jobId);
    const curStatus=me.status||'一般成員';
    const nextStatus=curStatus==='固定團'?'一般成員':'固定團';
    profileHtml=`<div class="my-profile">
      <div class="my-profile-head">
        <div class="my-avatar" style="background:${job.color}">${job.img?`<img class="jimg" src="icons/jobs/${job.id}.png" alt="">`:(job.icon||job.name.charAt(0))}</div>
        <div><div class="my-name">${me.name}</div><div class="my-job">${job.name}</div></div>
        <div style="margin-left:auto"><button class="btn btn-blue" onclick="openSelfEdit()" style="font-size:16px;padding:12px 26px;font-weight:800">✏️ 編輯個人資料</button></div>
      </div>
      <div class="my-stat-row">
        <div class="my-stat" onclick="openMyHistory()" style="cursor:pointer" title="點擊查看歷史紀錄"><div class="my-stat-n">${a.totalPlayed}</div><div class="my-stat-l">出場次數 ▸</div></div>
        <div class="my-stat"><div class="my-stat-n" style="color:${attRateColor(a.totalPlayed,a.signedUp)}">${a.totalPlayed}/${a.signedUp}</div><div class="my-stat-l">出席（出場／應出賽）</div></div>
      </div>
      ${(()=>{const note=attRateNote(a.totalPlayed,a.signedUp); return note?`<div style="font-size:12px;color:${note.type==='good'?'var(--ok)':'var(--gold)'};margin-top:6px">${note.self}</div>`:'';})()}
      <div class="fg" style="margin-top:10px;padding-top:10px;border-top:1px dashed var(--border)">
        <label>固定團狀態</label>
        <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-top:2px">
          <span class="pill ${statusCls(curStatus)}">${curStatus}</span>
          <button class="btn btn-outline" onclick="togglePlayerFixedStatus()" style="font-size:15px;padding:10px 18px">切換為「${nextStatus}」</button>
        </div>
        <p class="hint" style="margin-top:6px">設為「固定團」後，管理員可在「排表系統」的固定團編輯功能中把你排入固定隊伍；之後若你改回「一般成員」，就會從固定團名單中移除，管理員之後匯入/編輯固定團時就看不到你了（已經排好的場次排表不會自動變動，需要管理員手動調整）。</p>
      </div>
      <div class="fg" style="margin-top:10px"><label>已滿等絕技</label><div class="skill-list">${(me.skills||[]).length?me.skills.map(s=>`<span class="skill-chip active">${s}</span>`).join(''):'<span style="color:var(--txt3);font-size:12px">尚未設定</span>'}</div></div>
      <div class="fg" style="margin-top:10px"><label>常用群俠技能</label><div class="skill-list">${(me.baijia||[]).length?me.baijia.map(s=>`<span class="skill-chip">${s}</span>`).join(''):'<span style="color:var(--txt3);font-size:12px">尚未設定</span>'}</div></div>
    </div>`;
  } else {
    profileHtml=`<div class="card" style="text-align:center;padding:20px">
      <p style="color:var(--txt2);margin-bottom:10px">找不到你的角色資料，請聯繫管理員加入，或先填寫基本資料</p>
      <button class="btn btn-blue sm" onclick="openSelfEdit()">填寫我的資料</button>
    </div>`;
  }

  // 即將到來的活動：今天（含）以後的場次，由最近排到最遠，全部列出供快速報名
  let nextEvent='';
  const todayStr=fmtDate(new Date());
  const upcoming=S.events().filter(e=>String(e.date||'').slice(0,10)>=todayStr)
    .sort((a,b)=>String(a.date||'').localeCompare(String(b.date||'')));
  if(upcoming.length){
    nextEvent=upcoming.map((ev,i)=>{
      const myStatus=(signups[ev.id]||{})[CUR_USER]||null;
      const cnt=Object.values(signups[ev.id]||{}).filter(v=>v==='attend').length;
      const statusLabel={attend:'✅ 已報名出席',absent:'❌ 已請假',reserve:'🟡 已登記候補',maybe:'❓ 待定'}[myStatus]||'尚未回覆';
      const locked=_isLocked(ev.id);
      return `<div class="card">
      <div style="font-size:11px;color:var(--txt3);margin-bottom:4px">${i===0?'⏰ 即將到來的活動（'+ORG_LABEL()+'）':'之後的活動'}</div>
      ${evTitleHtml(ev)}
      <div style="font-size:12px;color:var(--txt2);margin-bottom:10px">📅 ${ev.date||''} ／ 目前 ${cnt} 人出席</div>
      <div style="margin-bottom:8px;font-size:13px;font-weight:600">我的狀態：<span style="color:var(--accent)">${statusLabel}</span></div>
      <div style="display:flex;gap:8px">
        <button class="sbtn sbtn-ok ${myStatus==='attend'?'sel':''}" ${locked?'disabled style="opacity:.4;cursor:not-allowed"':''} onclick="quickSignup('${ev.id}','attend')">✅ 出席</button>
        <button class="sbtn sbtn-mb ${myStatus==='reserve'?'sel':''}" ${(locked||_isFixedMe())?'disabled style="opacity:.4;cursor:not-allowed"':''} onclick="quickSignup('${ev.id}','reserve')" title="${_isFixedMe()?'固定團成員為自動出席，不可候補':'可出席，但先以候補為主'}">🟡 候補</button>
        <button class="sbtn sbtn-no ${myStatus==='absent'?'sel':''}" ${locked?'disabled style="opacity:.4;cursor:not-allowed"':''} onclick="quickSignup('${ev.id}','absent')">🌙 請假</button>
      </div>
      ${locked?'<p class="hint" style="color:var(--bad);margin-top:6px">🔒 已截止報名</p>':''}
    </div>`;
    }).join('');
  } else {
    nextEvent=`<div class="card" style="text-align:center;color:var(--txt3);padding:16px">目前沒有即將到來的活動</div>`;
  }

  const noSyncWarn=(S.config().gsWebhook?'':`<div class="card" style="border:1px solid var(--bad);background:rgba(224,82,82,.1);margin-bottom:10px">
    <p style="color:var(--bad);font-size:13px;font-weight:600">⚠️ 這台裝置尚未連接雲端同步！</p>
    <p class="hint" style="margin-top:4px">你在這裡填寫或修改的資料，目前只會存在這台裝置上，管理員和其他人都看不到。請重新掃描管理員提供的最新報名QR碼，或聯繫管理員確認同步設定。</p>
  </div>`);
  pane.innerHTML=`<div class="sec-head"><h2>👋 歡迎，${CUR_USER}</h2></div>${noSyncWarn}${profileHtml}${nextEvent}`;
}

// 玩家自行切換固定團／一般成員狀態，與管理端「固定團隊伍排表編輯」共用同一個欄位（m.status）
// syncWriteNow() 回傳值有三種：true=已確認同步成功／false=有設定但這次失敗／'nosync'=這台裝置根本沒設定雲端同步。
// 第三種最容易被誤會成「已同步」，所以要特別強調警告，避免玩家以為資料已經送到雲端，其實只留在自己手機上。
function _syncResultToast(ok, doneMsg){
  if(ok===true){ toast('✅ '+doneMsg+'，並已同步到雲端','ok'); return; }
  if(ok==='nosync'){ toast('⚠️ '+doneMsg+'，但這台裝置尚未連接雲端同步！其他人看不到這筆變更，請聯繫管理員確認，或重新掃描最新的報名QR碼','err'); return; }
  toast('⚠️ '+doneMsg+'，但雲端同步失敗，請檢查網路後再確認一次','err');
}

function _isFixedMe(){
  const me=S.members().find(m=>m.name===CUR_USER);
  return !!(me&&me.status==='固定團');
}
async function togglePlayerFixedStatus(){
  { const me=S.members().find(m=>m.name===CUR_USER);
    if(me&&me.status==='暫離'){ toast('你目前為「暫離」狀態（由管理員設定），如要恢復請聯繫管理員','err'); return; } }
  const members=S.members();
  const idx=members.findIndex(m=>m.name===CUR_USER);
  if(idx<0){ toast('找不到你的成員資料，請先請管理員加入或填寫基本資料','err'); return; }
  const cur=members[idx].status||'一般成員';
  const next=cur==='固定團'?'一般成員':'固定團';
  const msg=next==='固定團'
    ? '確定要設為「固定團」嗎？之後管理員排固定團隊伍時就會看到你。'
    : '確定要改回「一般成員」嗎？之後管理員的固定團名單就不會再看到你了。';
  if(!confirm(msg)) return;
  members[idx]={...members[idx], status:next, updatedAt:Date.now()};
  S.setMembers(members);
  if(next==='固定團'){
    // 成為固定團：未截止場次自動報名出席；原本登記的「候補」一併轉為出席（固定團不可候補）
    const signups=S.signups(); const out={...signups}; let ch=false;
    S.events().forEach(ev=>{
      const lock=evLockTime(ev);
      if(lock && Date.now()>=lock.getTime()) return;
      const evS={...(out[ev.id]||{})};
      if(evS[CUR_USER]==='reserve'){ evS[CUR_USER]='attend'; out[ev.id]=evS; ch=true; }
    });
    if(ch) S.setSignups(out);
    if(typeof autoSignupFixedMembers==='function') autoSignupFixedMembers(CUR_USER);
  }
  toast('✅ 已切換為「'+next+'」，背景同步中...','ok');
  renderPlayerHome(document.getElementById('pane-p-home'));
  const ok=await syncWriteNowFast();
  if(ok===true) toast('☁️ 已同步','ok');
  else if(ok==='nosync') toast('⚠️ 這台裝置尚未連接雲端同步，請重新掃描報名QR碼','err');
}

// ============================================================
// 我的歷史紀錄（活動時間 + 比賽紀錄列表）
// ============================================================
function openMyHistory(){
  const matches=S.matches().slice().sort((a,b)=>(b.date||'').localeCompare(a.date||''));
  const events=S.events().slice().sort((a,b)=>(b.date||'').localeCompare(a.date||''));
  const signups=S.signups();

  const myMatches=matches.filter(m=>(m.participants||[]).includes(CUR_USER));
  const mySignups=events.filter(ev=>(signups[ev.id]||{})[CUR_USER]==='attend');

  // 我在排表中的位置紀錄
  const myLineups=[];
  events.forEach(ev=>{
    if(!ev.teams) return;
    Object.entries(ev.teams).forEach(([k,arr])=>{
      if(!Array.isArray(arr)||!arr.includes(CUR_USER)) return;
      let teamLabel='候補';
      if(k!=='reserve'&&ev.teamNames){
        const m2=k.match(/^t(\d+)_sq(\d+)$/);
        if(m2) teamLabel=(ev.teamNames[+m2[1]]||'?')+'-'+(+m2[2]+1)+'隊';
      }
      const role=(ev.roles||{})[CUR_USER];
      myLineups.push({name:ev.name,date:ev.date||'',team:teamLabel,role:role==='cannon'?'🧨砲手':role==='cmd'?'⭐指揮':''});
    });
  });

  const a=calcMyAttendance();
  const note=attRateNote(a.totalPlayed,a.signedUp);
  const body=document.getElementById('history-body');
  body.innerHTML=`
    ${note?`<div style="font-size:13px;color:${note.type==='good'?'var(--ok)':'var(--gold)'};background:rgba(255,255,255,.04);border-radius:8px;padding:10px 12px;margin-bottom:12px">${note.self}</div>`:''}
    <h4 style="margin-bottom:6px">🎮 比賽紀錄（${myMatches.length} 場）</h4>
    ${myMatches.length?myMatches.map(m=>{
      const p=(m.players||[]).find(pl=>pl.name===CUR_USER&&pl.camp==='我方');
      return `<div class="hist-item">
        <span class="hist-date">${m.date||''}</span>
        <span>vs ${m.enemy||'?'}</span>
        <span class="hist-result ${m.result==='勝利'?'ok':'bad'}">${m.result||''}</span>
        ${p?`<div class="hist-stats">擊敗${p.kills||0}／助攻${p.assist||0}／傷害${fmtNum(p.pDamage||0)}</div>`:''}
      </div>`;
    }).join(''):'<p class="hint">尚無比賽紀錄</p>'}
    <h4 style="margin:12px 0 6px">📋 排表紀錄（${myLineups.length} 次）</h4>
    ${myLineups.length?myLineups.map(l=>`<div class="hist-item"><span class="hist-date">${l.date}</span><span>${l.name}</span><span style="color:var(--accent)">${l.team} ${l.role}</span></div>`).join(''):'<p class="hint">尚無排表紀錄</p>'}
    <h4 style="margin:12px 0 6px">✋ 報名紀錄（${mySignups.length} 次）</h4>
    ${mySignups.length?mySignups.map(ev=>`<div class="hist-item"><span class="hist-date">${ev.date||''}</span><span>${ev.name}</span></div>`).join(''):'<p class="hint">尚無報名紀錄</p>'}
  `;
  openModal('modal-history');
}

function fmtNum(n){
  if(n>=100000000) return (n/100000000).toFixed(1)+'億';
  if(n>=10000) return (n/10000).toFixed(0)+'萬';
  return String(n);
}

async function quickSignup(evId, status){
  if(_isLocked(evId)){ toast('此活動已截止報名','err'); return; }
  if(status==='reserve'){
    const me=S.members().find(m=>m.name===CUR_USER);
    if(me&&me.status==='固定團'){ toast('固定團成員為自動出席，不可登記候補；無法出席請點「請假」','err'); return; }
  }
  const label={attend:'出席',absent:'請假',reserve:'候補'}[status]||status;
  if(!confirm('確認回報「'+label+'」？')) return;
  const signups=S.signups();
  if(!signups[evId]) signups[evId]={};
  const prev=signups[evId][CUR_USER];
  if(prev===status){ delete signups[evId][CUR_USER]; }
  else { signups[evId][CUR_USER]=status; }
  S.setSignups(signups);
  const labels={attend:'已報名出席',absent:'已登記請假',maybe:'已登記待定'};
  toast('✅ '+(prev===status?'已取消':labels[status])+'，背景同步中...','ok');
  renderPane('p-home',document.getElementById('pane-p-home'));
  const ok=await syncWriteNowFast();
  if(ok===true) toast('☁️ 已同步','ok');
  else if(ok==='nosync') toast('⚠️ 這台裝置尚未連接雲端同步，請重新掃描報名QR碼','err');
}

// ============================================================
// PLAYER: SIGNUP
// ============================================================
// 產生單一場次卡片的內容（按鈕＋出席/候補/請假/待回覆名單），供「即將到來」與「已結束」共用
function _buildSignupCardBody(ev, isPast){
  const signups=S.signups();
  const evS=signups[ev.id]||{};
  const my=evS[CUR_USER]||null;
  const members=S.members().filter(m=>m.status!=='暫離'); // 暫離成員不需回覆，不列入名單統計
  const att=[], rsv=[], abs=[], pending=[];
  members.forEach(m=>{
    const st=evS[m.name];
    if(st==='attend') att.push(m.name);
    else if(st==='reserve') rsv.push(m.name);
    else if(st==='absent') abs.push(m.name);
    else pending.push(m.name);
  });
  const locked=_isLocked(ev.id);
  const listBlock=(icon,label,color,names)=>names.length?`<div style="margin-top:6px">
      <div style="font-size:12px;color:${color};font-weight:700;margin-bottom:4px">${icon} ${label}（${names.length}）</div>
      <div class="att-list">${names.map(n=>`<span class="att-tag">${n}</span>`).join('')}</div>
    </div>`:'';
  return `<div class="signup-opts">
        <button class="sbtn sbtn-ok ${my==='attend'?'sel':''}" ${locked?'disabled style="opacity:.4;cursor:not-allowed"':''} onclick="doSignup('${ev.id}','attend')">✅ 出席</button>
        <button class="sbtn sbtn-mb ${my==='reserve'?'sel':''}" ${(locked||_isFixedMe())?'disabled style="opacity:.4;cursor:not-allowed"':''} onclick="doSignup('${ev.id}','reserve')" title="${_isFixedMe()?'固定團成員為自動出席，不可候補':'可出席，但先以候補為主'}">🟡 候補</button>
        <button class="sbtn sbtn-no ${my==='absent'?'sel':''}" ${locked?'disabled style="opacity:.4;cursor:not-allowed"':''} onclick="doSignup('${ev.id}','absent')">🌙 請假</button>
      </div>
      ${locked?'<p class="hint" style="color:var(--bad)">🔒 已截止報名（活動前2天的晚上8點起鎖定，無法再更改）</p>':''}
      <div class="signup-cnt">✅ 出席 <strong>${att.length}</strong> ／ 🟡 候補 <strong>${rsv.length}</strong> ／ 🌙 請假 <strong>${abs.length}</strong> ／ ⏳ 待回覆 <strong>${pending.length}</strong></div>
      ${listBlock('✅','出席名單','var(--ok)',att)}
      ${listBlock('🟡','候補名單','var(--gold)',rsv)}
      ${listBlock('🌙','請假名單','var(--bad)',abs)}
      ${listBlock('⏳','待回覆名單','var(--txt3)',pending)}
      ${isPast?_buildPlayerVideoSection(ev):''}`;
}

// 已結束場次：玩家可直接上傳自己視角的影片，不用輸入名稱／團隊（自動帶入自己與當天排表分配的團隊）
function _buildPlayerVideoSection(ev){
  const dayMatches=S.matches().filter(mm=>String(mm.date||'').slice(0,10)===String(ev.date||'').slice(0,10));
  if(!dayMatches.length) return ''; // 當天還沒有比賽紀錄，無從附加影片
  const myTeam=findPlayerTeamOnDate(CUR_USER, ev.date);
  const matchOpts=dayMatches.map(mm=>`<option value="${mm.id}">vs ${mm.enemy||'?'}</option>`).join('');
  // 列出目前已上傳、跟自己有關（成員視角是自己）的影片，方便確認是否已經傳過
  const mine=[];
  dayMatches.forEach(mm=>(mm.videos||[]).forEach(v=>{ if(v&&typeof v==='object'&&v.name===CUR_USER) mine.push(v); }));
  const mineHtml=mine.length?`<div style="margin-top:6px;display:flex;gap:8px;flex-wrap:wrap">${mine.map(v=>{
      const info=videoLabelFor(v);
      return `<a href="${info.url}" target="_blank" rel="noopener" style="font-size:12px;color:var(--accent);text-decoration:underline">🎬 ${info.label}</a>`;
    }).join('')}</div>`:'';
  return `<div style="margin-top:10px;padding-top:10px;border-top:1px dashed var(--border)">
      <div style="font-size:12px;color:var(--txt2);font-weight:700;margin-bottom:6px">🎬 上傳我的影片視角${myTeam?'（'+myTeam+'）':''}</div>
      <div style="display:flex;gap:6px;flex-wrap:wrap">
        ${dayMatches.length>1?`<select id="pv-match-${ev.id}" class="fsel sm" style="flex:1 1 100px">${matchOpts}</select>`:`<input type="hidden" id="pv-match-${ev.id}" value="${dayMatches[0].id}">`}
        <input id="pv-url-${ev.id}" class="fi sm" placeholder="貼上影片網址" style="flex:2 1 160px;min-width:0">
        <button class="btn btn-blue sm" onclick="submitMyVideo('${ev.id}')">上傳</button>
      </div>
      ${mineHtml}
    </div>`;
}
async function submitMyVideo(evId){
  const ev=S.events().find(e=>e.id===evId); if(!ev) return;
  const urlInput=document.getElementById('pv-url-'+evId);
  let url=(urlInput?urlInput.value:'').trim();
  if(!url){ toast('請先貼上影片網址','err'); return; }
  if(!/^https?:\/\//i.test(url)) url='https://'+url;
  const matchSel=document.getElementById('pv-match-'+evId);
  const matchId=matchSel?matchSel.value:null;
  const matches=S.matches();
  const idx=matches.findIndex(m=>m.id===matchId);
  if(idx===-1){ toast('找不到對應的比賽紀錄','err'); return; }
  const team=findPlayerTeamOnDate(CUR_USER, ev.date);
  const videos=[...(matches[idx].videos||[]), {url, name:CUR_USER, team}];
  matches[idx]={...matches[idx], videos, updatedAt:Date.now()};
  S.setMatches(matches);
  toast('上傳中，同步中...','');
  const body=document.getElementById('sp-body-'+evId);
  if(body) body.innerHTML=_buildSignupCardBody(ev,true);
  const ok=await syncWriteNowFast();
  toast(ok===true?'✅ 已上傳並同步':'⚠️ 已存在本機，雲端同步失敗，背景將自動重試', ok===true?'ok':'err');
}

function renderPlayerSignup(pane){
  const all=S.events().slice().sort((a,b)=>(b.date||'').localeCompare(a.date||''));
  if(!all.length){ pane.innerHTML='<div class="empty"><div class="empty-ico">📅</div><p>目前沒有活動</p></div>'; return; }
  const todayStr=fmtDate(new Date());
  // 已結束或日期已過的場次收合，只顯示日期名稱一行，點擊才展開完整的報名/名單資訊
  const upcoming=all.filter(e=>String(e.date||'').slice(0,10)>=todayStr);
  const past=all.filter(e=>String(e.date||'').slice(0,10)<todayStr);

  const upcomingHtml=upcoming.map(ev=>`<div class="signup-card">
      ${evTitleHtml(ev)}
      <div class="signup-meta">📅 ${ev.date||''}</div>
      ${_buildSignupCardBody(ev)}
    </div>`).join('');

  const pastHtml=past.length?`
    <div style="margin-top:16px">
      <h3 style="font-size:14px;color:var(--txt2);margin-bottom:8px">🗂️ 已結束的場次（點日期展開）</h3>
      <div style="display:flex;flex-direction:column;gap:8px">${past.map(ev=>`
        <div class="card" style="padding:0;overflow:hidden">
          <div style="padding:12px 14px;cursor:pointer;display:flex;justify-content:space-between;align-items:center" onclick="toggleSignupPast('${ev.id}')">
            <span style="font-weight:700">${ev.date||''}　${ev.name}${ev.type?'（'+ev.type+'）':''}</span>
            <span id="sp-arrow-${ev.id}" style="color:var(--txt3)">▼</span>
          </div>
          <div id="sp-body-${ev.id}" class="hidden" style="padding:0 14px 14px"></div>
        </div>`).join('')}</div>
    </div>`:'';

  pane.innerHTML=`<div class="sec-head"><h2>✋ 活動報名</h2></div>${upcomingHtml||'<p class="hint">目前沒有即將到來的活動</p>'}${pastHtml}`;
}
// 已結束場次收合列展開/收合：第一次展開時才產生內容
function toggleSignupPast(evId){
  const body=document.getElementById('sp-body-'+evId);
  const arrow=document.getElementById('sp-arrow-'+evId);
  if(!body) return;
  const opening=body.classList.contains('hidden');
  if(opening && !body.dataset.rendered){
    const ev=S.events().find(e=>e.id===evId);
    body.innerHTML=ev?_buildSignupCardBody(ev,true):'<p class="hint">找不到此場次</p>';
    body.dataset.rendered='1';
  }
  body.classList.toggle('hidden');
  if(arrow) arrow.textContent=opening?'▲':'▼';
}
function _isLocked(evId){
  const ev=S.events().find(e=>e.id===evId);
  const lockTime=evLockTime(ev); // 全站統一規則見 helpers.js：活動前2天的晚上8點
  if(!lockTime) return false;
  return Date.now()>=lockTime.getTime();
}
async function doSignup(evId,status){
  if(_isLocked(evId)){ toast('此活動已於前2天晚上8點截止，無法再更改報名','err'); return; }
  if(status==='reserve'){
    const me=S.members().find(m=>m.name===CUR_USER);
    if(me&&me.status==='固定團'){ toast('固定團成員為自動出席，不可登記候補；無法出席請點「請假」','err'); return; }
  }
  const label={attend:'出席',absent:'請假',reserve:'候補'}[status]||status;
  if(!confirm('確認回報「'+label+'」？\n（活動前2天晚上8點截止前都可再修改）')) return;
  const s=S.signups();
  if(!s[evId])s[evId]={};
  const prev=s[evId][CUR_USER];
  if(prev===status){delete s[evId][CUR_USER];}else{s[evId][CUR_USER]=status;}
  S.setSignups(s);
  const label2=prev===status?'已取消報名':{attend:'已報名出席',absent:'已登記請假',maybe:'已登記請假'}[status];
  toast('✅ '+label2+'，背景同步中...','ok');
  renderPane('p-signup',document.getElementById('pane-p-signup'));
  const ok=await syncWriteNowFast();
  if(ok===true) toast('☁️ 已同步','ok');
  else if(ok==='nosync') toast('⚠️ 這台裝置尚未連接雲端同步，請重新掃描報名QR碼','err');
}

// ============================================================
// PLAYER: PROFILE
// ============================================================
function renderPlayerProfile(pane){
  const me=S.members().find(m=>m.name===CUR_USER);
  const a=calcMyAttendance();
  if(!me){
    pane.innerHTML=`<div class="sec-head"><h2>👤 我的資料</h2></div>
      <div class="card" style="text-align:center;padding:24px">
        <p style="color:var(--txt2);margin-bottom:12px">你的角色「${CUR_USER}」尚未在成員名單中，<br>請聯繫管理員加入或自行填寫基本資料</p>
        <button class="btn btn-blue" onclick="openSelfEdit()">填寫基本資料</button>
      </div>`;
    return;
  }
  const job=jobById(me.jobId);
  pane.innerHTML=`<div class="sec-head"><h2>👤 我的資料</h2><button class="btn btn-blue sm" onclick="openSelfEdit()">✏️ 編輯</button></div>
    <div class="my-profile">
      <div class="my-profile-head">
        <div class="my-avatar" style="background:${job.color}">${job.img?`<img class="jimg" src="icons/jobs/${job.id}.png" alt="">`:(job.icon||job.name.charAt(0))}</div>
        <div><div class="my-name">${me.name}</div><div class="my-job">${job.name} ／ ${me.team||'未分配'} ／ <span class="pill ${statusCls(me.status)}">${me.status||''}</span></div></div>
      </div>
      <div class="my-stat-row">
        <div class="my-stat" onclick="openMyHistory()" style="cursor:pointer"><div class="my-stat-n">${a.totalPlayed}</div><div class="my-stat-l">出場次數 ▸</div></div>
        <div class="my-stat"><div class="my-stat-n" style="color:${attRateColor(a.totalPlayed,a.signedUp)}">${a.totalPlayed}/${a.signedUp}</div><div class="my-stat-l">出席（出場／應出賽）</div></div>
      </div>
      ${(()=>{const note=attRateNote(a.totalPlayed,a.signedUp); return note?`<div style="font-size:12px;color:${note.type==='good'?'var(--ok)':'var(--gold)'};margin-top:6px">${note.self}</div>`:'';})()}
      <div class="fg" style="margin-bottom:10px"><label>已滿等絕技</label><div class="skill-list">${(me.skills||[]).map(s=>`<span class="skill-chip active">${s}</span>`).join('')||'<span style="color:var(--txt3);font-size:12px">尚未設定</span>'}</div></div>
      <div class="fg"><label>常用群俠技能</label><div class="skill-list">${(me.baijia||[]).map(s=>`<span class="skill-chip">${s}</span>`).join('')||'<span style="color:var(--tx3);font-size:12px">尚未設定</span>'}</div></div>
      ${me.note?`<div class="fg" style="margin-top:10px"><label>備註</label><span style="font-size:13px;color:var(--txt2)">${me.note}</span></div>`:''}
    </div>`;
}

// Self edit (player can only pick from admin-managed lists)
function openSelfEdit(){
  const me=S.members().find(m=>m.name===CUR_USER);
  document.getElementById('se-name').value=me?me.name:CUR_USER;
  document.getElementById('se-class').value=me?.jobId||'';
  renderTagSel('se-skills-tags', S.skillList(), me?.skills||[]);
  renderTagSel('se-baijia-tags', S.baijiaList(), me?.baijia||[]);
  openModal('modal-self-edit');
}
function selfEditClassChange(){}
async function saveSelfEdit(){
  const newName=(document.getElementById('se-name').value||'').trim();
  const jobId=document.getElementById('se-class').value;
  const skills=getSelectedTags('se-skills-tags');
  const baijia=getSelectedTags('se-baijia-tags');
  if(!newName){ toast('請輸入角色名稱','err'); return; }
  let members=S.members();
  const idx=members.findIndex(m=>m.name===CUR_USER);
  // 若改成別人已使用的名稱，擋下來避免衝突
  if(newName!==CUR_USER && members.some(m=>m.name===newName)){ toast('這個角色名稱已經有人使用，請確認或聯繫管理員','err'); return; }
  if(idx>=0){
    const m=members[idx];
    const log=Array.isArray(m.changeLog)?m.changeLog.slice():[];
    const aliases=Array.isArray(m.aliases)?m.aliases.slice():[];
    if(m.name!==newName){
      // 記錄改名歷史，並把舊名加入別名，讓管理員仍能對應到過去的出賽/報名資料
      log.push({t:fmtDate(new Date()),type:'改名',from:m.name,to:newName});
      if(!aliases.includes(m.name)) aliases.push(m.name);
    }
    members[idx]={...m,name:newName,jobId,skills,baijia,aliases,changeLog:log,updatedAt:Date.now()};
  } else {
    // 成員只能由管理端新增：找不到自己的資料時不再自動建立，避免產生重複成員
    toast('找不到你的成員資料，成員需由管理員新增，請聯繫管理員','err');
    return;
  }
  S.setMembers(members);
  // 改名後立即清理：吸收殘留的舊名字成員紀錄、把舊名字的報名搬到新名字名下
  if(newName!==CUR_USER){
    try{
      if(typeof _dedupeMembersByName==='function') S.setMembers(_dedupeMembersByName(S.members())); // 吸收舊名字的殘留紀錄
      if(typeof _migrateAliasSignups==='function') _migrateAliasSignups(); // 報名紀錄搬到新名字名下
    }catch(_){}
  }
  // 改名後同步更新目前登入身分與工作階段，避免下次重整又變回舊名
  if(newName!==CUR_USER){
    CUR_USER=newName;
    try{
      const s=JSON.parse(localStorage.getItem('gw_session')||'null');
      if(s){ s.user=newName; localStorage.setItem('gw_session',JSON.stringify(s)); }
    }catch(_){}
    const chip=document.getElementById('user-chip'); if(chip) chip.textContent=newName;
  }
  // 先讓使用者立即看到已儲存（本機瞬間完成），雲端同步在背景進行，不用乾等
  closeModal('modal-self-edit');
  toast('✅ 資料已儲存，正在背景同步...','ok');
  const active=document.querySelector('.nav-btn.active');
  if(active) renderPane(active.dataset.tab, document.getElementById('pane-'+active.dataset.tab));
  const ok=await syncWriteNowFast();
  if(ok===true) toast('☁️ 已同步到雲端','ok');
  else if(ok==='nosync') toast('⚠️ 這台裝置尚未連接雲端同步，資料只存在本機，請重新掃描報名QR碼','err');
  // ok===false 時不再彈警告打斷使用者，背景會自動重試
}
