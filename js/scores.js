// ============================================================
// SCORES.JS — 積分機制（僅限指定幫會啟用）
// 啟用組織：白月燦星(bycx)、白月梵星(byfx)。其他組織完全看不到相關介面。
// 資料：
//   score_cfg（依組織）：五種行為的分數設定 + 兌換獎勵表（整包 updatedAt 比新舊）
//   score_log（依組織）：管理端手動加/扣分紀錄（逐筆 id+updatedAt 合併，作廢用 void 標記）
// 自動計分（依現有資料即時計算，不落地、永不重複計分）：
//   行為1 報名：該場次有回覆（出席/候補/請假皆算）→ +b1
//   行為2 出賽：該場次當天有出現在任一比賽紀錄 → +b2（一天只算一次，雙周賽也算1天）
//   行為4 影片：該場次當天的比賽紀錄影片區有自己名字的影片 → 每部 +b4（管理端可手動扣回）
// 手動計分（管理端在出席明細中操作）：行為3 語音溝通、行為5 戰後復盤、行為4 影片調整
// ============================================================

const SCORE_ORGS = ['bycx', 'byfx'];
const SCORE_COLOR = '#2dd4bf'; // 積分統一顯示色（青綠，與頁面其他顏色區隔）

function scoreEnabled(){ return SCORE_ORGS.includes(CUR_ORG); }

// ─── 設定 ────────────────────────────────────────────────
const SCORE_BEHAVIORS = [
  { key:'b1', name:'行為1：在系統上完成報名（出席、候補或請假皆算）', auto:'系統自動', def:1 },
  { key:'b2', name:'行為2：出席 1 天的幫戰（雙周賽也算 1 天）',        auto:'系統自動（依比賽紀錄）', def:1 },
  { key:'b3', name:'行為3：比賽全程開語音有效溝通',                    auto:'管理端手動', def:3 },
  { key:'b4', name:'行為4：上傳比賽個人視角影片（影片有誤可手動扣分）', auto:'系統自動（依影片上傳）', def:2 },
  { key:'b5', name:'行為5：戰後復盤',                                  auto:'管理端手動', def:2 },
];
const SCORE_DEFAULT_REWARDS = [
  { need:30, item:'月卡、MyCard點數170', qty:10 },
  { need:50, item:'戰令330',             qty:5 },
  { need:80, item:'MyCard點數490',       qty:3 },
  { need:90, item:'紫爵禮籤',            qty:1 },
];

function scoreCfg(){
  const saved = S.g(S.k('score_cfg'), null) || {};
  const cfg = { updatedAt: saved.updatedAt || 0 };
  SCORE_BEHAVIORS.forEach(b => { cfg[b.key] = (typeof saved[b.key]==='number') ? saved[b.key] : b.def; });
  cfg.rewards = Array.isArray(saved.rewards) && saved.rewards.length ? saved.rewards : SCORE_DEFAULT_REWARDS.map(r=>({...r}));
  return cfg;
}
function saveScoreCfgData(cfg){
  cfg.updatedAt = Date.now();
  S.s(S.k('score_cfg'), cfg);
  if (typeof syncWrite === 'function') syncWrite();
}

// ─── 手動加/扣分紀錄 ─────────────────────────────────────
function scoreLog(){ return S.g(S.k('score_log'), []) || []; }
function addScoreLogEntry(entry){
  const list = scoreLog();
  list.push({ id: uid(), ts: Date.now(), updatedAt: Date.now(), ...entry });
  S.s(S.k('score_log'), list);
  if (typeof syncWrite === 'function') syncWrite();
}
function voidScoreLogEntry(id){
  const list = scoreLog().map(e => e.id===id ? {...e, void:true, updatedAt:Date.now()} : e);
  S.s(S.k('score_log'), list);
  if (typeof syncWrite === 'function') syncWrite();
}

// ─── 積分計算 ────────────────────────────────────────────
function _scoreAlias(name){
  const me = S.members().find(m => m.name===name || (m.aliases||[]).includes(name));
  return { alias: new Set([name, ...((me && me.aliases)||[]), ...(me?[me.name]:[])]), member: me };
}

// 逐場次積分明細：回傳 { rows:[{evId,date,name,type,parts:[{label,pts,manualId?}],subtotal}], others:[...], total }
function memberScoreBreakdown(name){
  const cfg = scoreCfg();
  const { alias } = _scoreAlias(name);
  const events = S.events().slice().sort((a,b)=>String(b.date||'').localeCompare(String(a.date||'')));
  const matches = S.matches(), signups = S.signups();
  const logs = scoreLog().filter(e => !e.void && alias.has(e.member));
  const usedLogIds = new Set();
  const rows = [];
  let total = 0;

  events.forEach(ev => {
    const d = String(ev.date||'').slice(0,10);
    const parts = [];
    // 行為1：報名（任何回覆都算）
    const evS = signups[ev.id]||{};
    let responded = false; alias.forEach(a=>{ if(evS[a]!==undefined) responded=true; });
    if (responded && cfg.b1) parts.push({ label:'報名', pts:cfg.b1 });
    // 行為2：出賽（一天一次）
    const dayMatches = matches.filter(mm => String(mm.date||'').slice(0,10)===d);
    const played = dayMatches.some(mm => (mm.participants||[]).some(n=>alias.has(n)));
    if (played && cfg.b2) parts.push({ label:'出賽', pts:cfg.b2 });
    // 行為4：影片（每部一次）
    let vids = 0;
    dayMatches.forEach(mm => (mm.videos||[]).forEach(v => { if(v && alias.has(v.name)) vids++; }));
    if (vids && cfg.b4) parts.push({ label:'影片×'+vids, pts:cfg.b4*vids });
    // 手動紀錄（綁定此場次的）
    logs.forEach(e => {
      if (e.evId !== ev.id) return;
      usedLogIds.add(e.id);
      parts.push({ label:e.label||'手動', pts:Number(e.points)||0, manualId:e.id, note:e.note||'' });
    });
    const subtotal = parts.reduce((s,p)=>s+p.pts, 0);
    total += subtotal;
    if (parts.length) rows.push({ evId:ev.id, date:ev.date||'', name:ev.name||'', type:ev.type||'', parts, subtotal });
    else rows.push({ evId:ev.id, date:ev.date||'', name:ev.name||'', type:ev.type||'', parts:[], subtotal:0 });
  });

  // 沒綁到任何場次的手動紀錄（例如針對未建場次的比賽補分）
  const others = logs.filter(e => !usedLogIds.has(e.id))
    .map(e => ({ manualId:e.id, date:e.date||'', label:e.label||'手動', pts:Number(e.points)||0, note:e.note||'' }));
  others.forEach(o => total += o.pts);
  return { rows, others, total };
}
function memberScoreTotal(name){ return memberScoreBreakdown(name).total; }

function scoreChip(pts, extra){
  const sign = pts>0 ? '+'+pts : String(pts);
  return `<span style="color:${SCORE_COLOR};font-weight:800${extra||''}">${sign}</span>`;
}

// ─── 導覽分頁顯示控制（非啟用組織一律隱藏）───────────────
function updateScoreTabsVisibility(){
  const on = scoreEnabled();
  const pBtn = document.querySelector('#player-nav [data-tab="p-score"]');
  const aBtn = document.querySelector('#admin-nav [data-tab="a-scores"]');
  if (pBtn) pBtn.classList.toggle('hidden', !on);
  if (aBtn) aBtn.classList.toggle('hidden', !on);
}

// ============================================================
// 管理端：積分設定分頁
// ============================================================
function renderAdminScores(pane){
  if (!scoreEnabled()){ pane.innerHTML = '<p class="hint" style="padding:20px">此組織未啟用積分機制。</p>'; return; }
  const cfg = scoreCfg();
  pane.innerHTML = `<div class="sec-head"><h2>🏅 積分設定 <span style="font-size:12px;color:var(--txt2);font-weight:400">（${ORG_LABEL()}專用）</span></h2></div>
  <p class="hint">行為 1、2、4 由系統依報名／比賽紀錄／影片上傳自動計分；行為 3、5 及影片扣分由管理員在「成員管理 → 出席明細」中手動加分。修改分數後按「儲存設定」即套用（過去場次會依新分數重新計算）。</p>

  <div class="card">
    <div class="sec-head" style="margin-bottom:10px"><h3 style="font-size:14px;font-weight:700">加分行為與分數</h3></div>
    <div class="tbl-wrap"><table>
      <thead><tr><th>行為</th><th style="width:110px">積分數</th></tr></thead>
      <tbody>${SCORE_BEHAVIORS.map(b=>`<tr>
        <td>${b.name}<br><span style="font-size:11px;color:var(--txt3)">（${b.auto}）</span></td>
        <td><input id="score-cfg-${b.key}" class="fi" type="number" step="1" value="${cfg[b.key]}" style="width:90px;color:${SCORE_COLOR};font-weight:800"></td>
      </tr>`).join('')}</tbody>
    </table></div>
  </div>

  <div class="card">
    <div class="sec-head" style="margin-bottom:10px"><h3 style="font-size:14px;font-weight:700">兌換獎勵</h3>
      <button class="btn btn-outline xs" onclick="addRewardRow()">+ 新增一列</button></div>
    <div class="tbl-wrap"><table>
      <thead><tr><th style="width:110px">積分需求</th><th>可兌換獎勵</th><th style="width:100px">獎勵數目</th><th style="width:50px"></th></tr></thead>
      <tbody id="score-reward-rows">${cfg.rewards.map((r,i)=>_rewardRowHtml(r,i)).join('')}</tbody>
    </table></div>
  </div>

  <div style="display:flex;justify-content:flex-end;margin-top:4px">
    <button class="btn btn-blue" onclick="saveScoreCfgFromUI()">💾 儲存設定</button>
  </div>`;
}
function _rewardRowHtml(r,i){
  return `<tr data-reward-row>
    <td><input class="fi" type="number" step="1" value="${r.need}" data-rf="need" style="width:90px;color:${SCORE_COLOR};font-weight:800"></td>
    <td><input class="fi" value="${String(r.item||'').replace(/"/g,'&quot;')}" data-rf="item"></td>
    <td><input class="fi" type="number" step="1" value="${r.qty}" data-rf="qty" style="width:80px"></td>
    <td style="text-align:center"><button class="btn btn-outline xs" onclick="this.closest('tr').remove()" title="刪除此列">✕</button></td>
  </tr>`;
}
function addRewardRow(){
  const tb=document.getElementById('score-reward-rows');
  if(tb) tb.insertAdjacentHTML('beforeend', _rewardRowHtml({need:0,item:'',qty:1}, tb.children.length));
}
function saveScoreCfgFromUI(){
  const cfg = scoreCfg();
  SCORE_BEHAVIORS.forEach(b=>{
    const el=document.getElementById('score-cfg-'+b.key);
    if(el) cfg[b.key]=Number(el.value)||0;
  });
  const rewards=[];
  document.querySelectorAll('#score-reward-rows tr[data-reward-row]').forEach(tr=>{
    const g=f=>tr.querySelector(`[data-rf="${f}"]`);
    const item=(g('item')?.value||'').trim();
    if(!item) return;
    rewards.push({ need:Number(g('need')?.value)||0, item, qty:Number(g('qty')?.value)||0 });
  });
  rewards.sort((a,b)=>a.need-b.need);
  cfg.rewards = rewards.length ? rewards : SCORE_DEFAULT_REWARDS.map(r=>({...r}));
  saveScoreCfgData(cfg);
  toast('✅ 積分設定已儲存，背景同步中','ok');
  renderAdminScores(document.getElementById('pane-a-scores'));
}

// ============================================================
// 管理端：出席明細中的積分區塊 + 手動加分
// ============================================================
// 出席明細每張場次卡片的積分行（rows 由 members.js 帶入 evId）
function scoreAttRowHtml(memberName, evId){
  if (!scoreEnabled()) return '';
  const bd = memberScoreBreakdown(memberName);
  const row = bd.rows.find(r => r.evId===evId);
  const parts = row ? row.parts : [];
  const chips = parts.length
    ? parts.map(p => `<span style="white-space:nowrap">${p.label} ${scoreChip(p.pts)}${p.manualId && IS_ADMIN ? `<button class="btn btn-outline xs" style="padding:0 5px;margin-left:2px" title="作廢這筆手動積分${p.note?'（'+p.note+'）':''}" onclick="removeManualScore('${p.manualId}','${memberName.replace(/'/g,"\\'")}')">✕</button>`:''}</span>`).join('　')
    : '<span style="color:var(--txt3)">尚無積分</span>';
  const addBtn = IS_ADMIN
    ? `<button class="btn btn-outline xs" style="color:${SCORE_COLOR};border-color:${SCORE_COLOR}" onclick="openManualScore('${memberName.replace(/'/g,"\\'")}','${evId}')">＋積分</button>`
    : '';
  return `<div style="margin-top:6px;padding-top:6px;border-top:1px dashed var(--border);display:flex;gap:10px;flex-wrap:wrap;align-items:center;font-size:13px">
    <span style="color:var(--txt3)">積分：</span>${chips}${row&&row.subtotal?`<span style="color:var(--txt3)">＝</span>${scoreChip(row.subtotal)}`:''}
    <span style="margin-left:auto">${addBtn}</span>
  </div>`;
}
// 出席明細頂部的總積分摘要
function scoreAttSummaryHtml(memberName){
  if (!scoreEnabled()) return '';
  return `<br>總積分：<strong style="color:${SCORE_COLOR};font-size:16px">${memberScoreTotal(memberName)}</strong> 分`;
}

// 手動加分小視窗（動態建立）
let _msTarget = { name:'', evId:'' };
function _ensureManualScoreModal(){
  if (document.getElementById('modal-manual-score')) return;
  const div=document.createElement('div');
  div.id='modal-manual-score';
  div.className='modal-ov hidden';
  div.innerHTML=`<div class="modal">
    <div class="modal-hd"><h3>🏅 手動積分 — <span id="ms-target-name"></span></h3><button class="close-btn" onclick="closeModal('modal-manual-score')">✕</button></div>
    <div class="modal-body">
      <div class="fg"><label>項目</label>
        <select id="ms-behavior" class="fsel" onchange="msBehaviorChange()">
          <option value="b3">行為3：比賽全程開語音有效溝通</option>
          <option value="b5">行為5：戰後復盤</option>
          <option value="b4-">行為4：影片有誤扣分</option>
          <option value="custom">自訂（其他加分/扣分）</option>
        </select>
      </div>
      <div class="fg" style="margin-top:10px"><label>積分（可為負數＝扣分）</label><input id="ms-points" class="fi" type="number" step="1" style="color:${SCORE_COLOR};font-weight:800"></div>
      <div class="fg" style="margin-top:10px"><label>備註（選填）</label><input id="ms-note" class="fi" placeholder="例：復盤紀錄連結、扣分原因"></div>
    </div>
    <div class="modal-ft">
      <button class="btn btn-outline" onclick="closeModal('modal-manual-score')">取消</button>
      <button class="btn btn-blue" onclick="confirmManualScore()">確定加分</button>
    </div>
  </div>`;
  document.body.appendChild(div);
}
function openManualScore(name, evId){
  _ensureManualScoreModal();
  _msTarget={ name, evId };
  document.getElementById('ms-target-name').textContent=name;
  document.getElementById('ms-behavior').value='b3';
  document.getElementById('ms-note').value='';
  msBehaviorChange();
  openModal('modal-manual-score');
}
function msBehaviorChange(){
  const cfg=scoreCfg();
  const v=document.getElementById('ms-behavior').value;
  const el=document.getElementById('ms-points');
  el.value = v==='b3'?cfg.b3 : v==='b5'?cfg.b5 : v==='b4-'?-Math.abs(cfg.b4) : 1;
}
function confirmManualScore(){
  const v=document.getElementById('ms-behavior').value;
  const pts=Number(document.getElementById('ms-points').value)||0;
  const note=document.getElementById('ms-note').value.trim();
  if(!pts){ toast('積分不可為 0','err'); return; }
  const labelMap={ 'b3':'語音溝通', 'b5':'戰後復盤', 'b4-':'影片調整', 'custom':'手動調整' };
  const ev=S.events().find(e=>e.id===_msTarget.evId);
  addScoreLogEntry({
    member:_msTarget.name, evId:_msTarget.evId, date:ev?String(ev.date||'').slice(0,10):'',
    behavior:v, label:labelMap[v]||'手動', points:pts, note,
  });
  closeModal('modal-manual-score');
  toast('✅ 已記錄 '+(pts>0?'+':'')+pts+' 分，背景同步中','ok');
  // 重新整理出席明細畫面
  if (typeof openAttendanceDetail==='function') openAttendanceDetail(_msTarget.name);
}
function removeManualScore(id, name){
  if(!confirm('確定作廢這筆手動積分？')) return;
  voidScoreLogEntry(id);
  toast('已作廢','ok');
  if (typeof openAttendanceDetail==='function' && name) openAttendanceDetail(name);
}

// ============================================================
// 成員管理表格：總積分欄
// ============================================================
function scoreMemberCellHtml(name){
  if (!scoreEnabled()) return '';
  const t = memberScoreTotal(name);
  return `<td><button class="btn btn-outline xs" style="color:${SCORE_COLOR};font-weight:800" onclick="openAttendanceDetail('${name.replace(/'/g,"\\'")}')" title="點擊查看各場次積分明細">${t}</button></td>`;
}

// ============================================================
// 成員端：首頁總分格 + 「積分機制」分頁
// ============================================================
function scoreHomeStatHtml(){
  if (!scoreEnabled()) return '';
  const t = memberScoreTotal(CUR_USER);
  return `<div class="my-stat" onclick="switchTab('p-score',document.querySelector('#player-nav [data-tab=\\'p-score\\']'))" style="cursor:pointer" title="點擊查看積分明細與兌換獎勵">
    <div class="my-stat-n" style="color:${SCORE_COLOR}">${t}</div><div class="my-stat-l">🏅 總積分</div>
  </div>`;
}

function renderPlayerScore(pane){
  if (!scoreEnabled()){ pane.innerHTML='<p class="hint" style="padding:20px">此組織未啟用積分機制。</p>'; return; }
  const cfg = scoreCfg();
  const bd = memberScoreBreakdown(CUR_USER);
  const rowsWithPts = bd.rows.filter(r=>r.parts.length);

  const rewardsHtml = cfg.rewards.map(r=>{
    const reached = bd.total >= r.need;
    return `<tr style="${reached?'':'opacity:.55'}">
      <td style="color:${SCORE_COLOR};font-weight:800">${r.need}</td>
      <td>${r.item}${reached?' <span style="color:var(--ok);font-weight:700">✅ 已達標</span>':''}</td>
      <td>${r.qty}</td>
    </tr>`;
  }).join('');

  const rowHtml = r => `<div class="card" style="padding:10px 14px">
    <div style="display:flex;justify-content:space-between;align-items:center">
      <div style="font-weight:700">${r.date}　${r.name}${r.type?'（'+r.type+'）':''}</div>
      <div>${scoreChip(r.subtotal)}</div>
    </div>
    <div style="margin-top:4px;font-size:12px;color:var(--txt2);display:flex;gap:12px;flex-wrap:wrap">
      ${r.parts.map(p=>`<span>${p.label} ${scoreChip(p.pts)}${p.note?` <span style="color:var(--txt3)">（${p.note}）</span>`:''}</span>`).join('')}
    </div>
  </div>`;

  const othersHtml = bd.others.length ? `<div style="margin-top:10px">
    <div style="font-size:12px;color:var(--txt3);margin-bottom:6px">其他手動積分紀錄：</div>
    ${bd.others.map(o=>`<div class="card" style="padding:8px 14px;display:flex;justify-content:space-between"><span>${o.date||''}　${o.label}${o.note?`（${o.note}）`:''}</span>${scoreChip(o.pts)}</div>`).join('')}
  </div>` : '';

  pane.innerHTML = `<div class="sec-head"><h2>🏅 積分機制 <span style="font-size:12px;color:var(--txt2);font-weight:400">（${ORG_LABEL()}）</span></h2></div>
  <div class="card" style="text-align:center;padding:18px">
    <div style="font-size:13px;color:var(--txt2)">我的總積分</div>
    <div style="font-size:40px;font-weight:900;color:${SCORE_COLOR};line-height:1.3">${bd.total}</div>
    <div style="font-size:11px;color:var(--txt3)">報名 +${cfg.b1}　出賽 +${cfg.b2}　語音溝通 +${cfg.b3}　上傳影片 +${cfg.b4}　戰後復盤 +${cfg.b5}</div>
  </div>

  <div class="card">
    <div class="sec-head" style="margin-bottom:10px"><h3 style="font-size:14px;font-weight:700">🎁 兌換獎勵</h3></div>
    <div class="tbl-wrap"><table>
      <thead><tr><th style="width:100px">積分需求</th><th>可兌換獎勵</th><th style="width:90px">獎勵數目</th></tr></thead>
      <tbody>${rewardsHtml}</tbody>
    </table></div>
    <p class="hint" style="margin-top:8px">達標後請聯繫管理員兌換。獎勵內容以管理端最新設定為準。</p>
  </div>

  <div class="sec-head" style="margin-top:16px"><h3 style="font-size:14px;font-weight:700">📋 各場次積分明細</h3></div>
  ${rowsWithPts.length ? `<div style="display:flex;flex-direction:column;gap:8px">${rowsWithPts.map(rowHtml).join('')}</div>` : '<p class="hint">尚無積分紀錄，完成報名或出賽即可開始累積！</p>'}
  ${othersHtml}`;
}
