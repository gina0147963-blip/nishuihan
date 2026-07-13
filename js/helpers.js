// ============================================================
// HELPERS
// ============================================================
function renderTagSel(boxId, options, selected){
  const box=document.getElementById(boxId); if(!box)return;
  box.innerHTML=options.map(s=>`<span class="stag${selected.includes(s)?' on':''}" onclick="this.classList.toggle('on')">${s}</span>`).join('');
}
function getSelectedTags(boxId){
  return [...document.querySelectorAll(`#${boxId} .stag.on`)].map(t=>t.textContent);
}
function dl(content, filename, mime){
  const blob=new Blob([content],{type:mime+';charset=utf-8'});
  const a=document.createElement('a');
  a.href=URL.createObjectURL(blob);
  a.download=filename; a.click();
}

document.addEventListener('DOMContentLoaded',()=>{
  const today=fmtDate(new Date());
  ['ev-date','match-date'].forEach(id=>{const el=document.getElementById(id);if(el)el.value=today;});
  document.getElementById('player-name-input').addEventListener('keydown',e=>{if(e.key==='Enter')playerLogin();});
  document.getElementById('admin-pw-input').addEventListener('keydown',e=>{if(e.key==='Enter')adminLogin();});
});

// 依職業「名稱」找職業（CSV 匯入用）
function jobByName(name){
  if(!name) return null;
  const n=String(name).trim();
  return JOBS.find(j=>j.name===n)||null;
}

// ── 報名截止時間（全站統一規則：活動前2天的晚上6點）──────
// 例：活動在星期六 → 星期四 18:00 截止
function evLockTime(ev){
  if(!ev||!ev.date) return null;
  const dateOnly=String(ev.date).slice(0,10);
  const evDay=new Date(dateOnly+'T00:00:00');
  if(isNaN(evDay.getTime())) return null;
  return new Date(evDay.getTime()-2*24*60*60*1000+18*60*60*1000);
}
// 產生截止倒數文字（管理端報名管理頁用）
function evLockCountdownText(ev){
  const lock=evLockTime(ev);
  if(!lock) return '';
  const diff=lock.getTime()-Date.now();
  if(diff<=0) return '🔒 已截止報名';
  const totalMin=Math.floor(diff/60000);
  const d=Math.floor(totalMin/1440), h=Math.floor((totalMin%1440)/60), mi=totalMin%60;
  if(d>0) return `⏳ 距截止還有 ${d} 天 ${h} 小時`;
  if(h>0) return `⏳ 距截止還有 ${h} 小時 ${mi} 分`;
  return `⏳ 距截止不到 ${mi} 分鐘！`;
}
// 截止時間的顯示文字，例如「7/9（四）18:00」
function evLockTimeLabel(ev){
  const lock=evLockTime(ev);
  if(!lock) return '';
  const wd=['日','一','二','三','四','五','六'][lock.getDay()];
  return (lock.getMonth()+1)+'/'+lock.getDate()+'（'+wd+'）18:00';
}

// ── 場次標題列（管理端與玩家端共用）─────────────────────
// 名稱＋類型＋（約戰的）活動時間＋局制放在同一排，大字明顯呈現
function evTitleHtml(ev){
  if(!ev) return '';
  // 清洗活動時間：舊資料若被試算表污染成「1899-12-30T20:00...」，只取出 HH:mm 顯示
  const cleanTime=(t)=>{
    if(!t) return '';
    const s=String(t);
    const m=s.match(/(\d{1,2}:\d{2})/);
    return m?m[1]:s;
  };
  const parts=[`<span style="font-size:17px;font-weight:800">${ev.name||''}</span>`];
  if(ev.type) parts.push(`<span style="font-size:15px;font-weight:700;color:var(--gold)">${ev.type}</span>`);
  if(ev.type==='約戰'){
    const t=cleanTime(ev.eventTime);
    if(t) parts.push(`<span style="font-size:15px;font-weight:700;color:var(--accent)">🕐 ${t}</span>`);
    if(ev.matchFormat) parts.push(`<span style="font-size:15px;font-weight:700;color:var(--accent)">⚔️ ${ev.matchFormat==='2'?'兩局制':'一局制'}</span>`);
  }
  return `<div style="display:flex;align-items:baseline;gap:10px;flex-wrap:wrap;margin-bottom:4px">${parts.join('')}</div>`;
}

// ── 通用：複製文字到剪貼簿（含舊瀏覽器備援）──────────────
function copyTextToClipboard(text, okMsg){
  const done=()=>toast(okMsg||'已複製','ok');
  const fail=()=>{
    try{
      const ta=document.createElement('textarea');
      ta.value=text; ta.style.position='fixed'; ta.style.opacity='0';
      document.body.appendChild(ta); ta.select();
      document.execCommand('copy'); document.body.removeChild(ta);
      done();
    }catch(_){ toast('複製失敗，請手動選取文字','err'); }
  };
  if(navigator.clipboard&&navigator.clipboard.writeText){
    navigator.clipboard.writeText(text).then(done,fail);
  } else fail();
}
