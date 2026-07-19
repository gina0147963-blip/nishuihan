// ============================================================
// HELPERS
// ============================================================
function renderTagSel(boxId, options, selected){
  const box=document.getElementById(boxId); if(!box)return;
  // 保護：把「已勾選但目前技能池裡找不到」的項目也一併顯示出來（標示提醒），
  // 避免技能清單同步時機不一致時，成員原本的選擇被悄悄清空
  const extra=(selected||[]).filter(s=>!options.includes(s));
  const allOptions=[...options, ...extra];
  box.innerHTML=allOptions.map(s=>{
    const isExtra=extra.includes(s);
    return `<span class="stag${selected.includes(s)?' on':''}" onclick="this.classList.toggle('on')" ${isExtra?'title="此技能目前不在技能設定清單中，可能已被移除；保留是為了不遺失原本的資料"style="opacity:.7"':''}>${s}${isExtra?' ⚠️':''}</span>`;
  }).join('');
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

// ── 出席狀態提示訊息（管理端/玩家端共用）──────────────────
// 出場次數 > 應出賽：曾在未報名/請假的情況下仍到場支援，給予肯定
// 出場次數 < 應出賽：提醒記得到系統填寫出席狀態
// 兩者相等（含都是0）：不需要額外提示
function attRateNote(num, den){
  if(den===0){
    if(num>0) return {type:'good',
      admin:'🙏 尚未正式報名出席，但已有實際出場紀錄，義氣相挺！',
      self:'🙏 你目前還沒報名出席過，但已經上場幫忙了，謝謝你！'};
    return null;
  }
  if(num>den) return {type:'good',
    admin:'🙏 有場次雖未報名或請假，仍義氣相挺實際到場支援，出場次數超過應出賽！',
    self:'🙏 謝謝你！有幾場你雖然沒報名或請了假，還是義氣相挺出席支援！'};
  if(num<den) return {type:'warn',
    admin:'📢 出場次數低於應出賽，請提醒記得到系統填寫出席狀態。',
    self:'📢 你的出場次數低於應出賽，記得到系統填寫出席狀態（出席／候補／請假）喔！'};
  return null;
}

// 分母（應出賽）為0但仍有實際出場紀錄 → 金黃色提示（不是異常，只是尚未正式報名）
// 分母>0 → 依「實際出場次數／應出賽」比例上色；都是0 → 中性灰
function attRateColor(num, den){
  if(!den) return num>0 ? 'var(--gold)' : 'var(--txt3)';
  const ratio=num/den;
  return ratio>=0.8?'var(--ok)':ratio>=0.5?'var(--gold)':'var(--bad)';
}

// ── 報名截止時間（全站統一規則：活動前2天的晚上8點）──────
// 例：活動在星期六 → 星期四 20:00 截止
function evLockTime(ev){
  if(!ev||!ev.date) return null;
  const dateOnly=String(ev.date).slice(0,10);
  const evDay=new Date(dateOnly+'T00:00:00');
  if(isNaN(evDay.getTime())) return null;
  return new Date(evDay.getTime()-2*24*60*60*1000+20*60*60*1000);
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
// 截止時間的顯示文字，例如「7/9（四）20:00」
function evLockTimeLabel(ev){
  const lock=evLockTime(ev);
  if(!lock) return '';
  const wd=['日','一','二','三','四','五','六'][lock.getDay()];
  return (lock.getMonth()+1)+'/'+lock.getDate()+'（'+wd+'）20:00';
}

// ── 查詢玩家在某日期的活動中被排入哪個團（進攻/防守/機動...或候補）───
// 找不到對應場次或沒被排入時回傳空字串
function findPlayerTeamOnDate(name, dateStr){
  const d=String(dateStr||'').slice(0,10);
  const ev=S.events().find(e=>String(e.date||'').slice(0,10)===d);
  if(!ev||!ev.teams) return '';
  if((ev.teams.reserve||[]).includes(name)) return '候補';
  const teamNames=ev.teamNames||[];
  for(let ti=0; ti<teamNames.length; ti++){
    for(let i=0;i<SQUAD_COUNT;i++){
      if((ev.teams[sqKey(ti,i)]||[]).includes(name)) return teamNames[ti];
    }
  }
  return '';
}
// ── 影片顯示標籤：統一產生「成員名稱（團隊）」格式；相容舊資料（純網址字串）──
function videoLabelFor(v){
  if(typeof v==='string'){
    const label=/youtu\.?be/i.test(v)?'YouTube':/bilibili/i.test(v)?'Bilibili':/twitch/i.test(v)?'Twitch':'影片';
    return {url:v, label};
  }
  const label=[v.name||'', v.team?'（'+v.team+'）':''].join('')||'影片';
  return {url:v.url||'', label};
}

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

// ── 固定團自動報名 ────────────────────────────────────────
// 固定團成員視為每場活動自動出席：凡「尚未回覆」的未截止場次，自動填為出席。
// 已手動回覆（請假等）的不覆蓋；已截止的場次不動。
// onlyName（可選）：只處理指定成員（例如玩家自己切換為固定團時）。
// 回傳是否有變動。
function autoSignupFixedMembers(onlyName){
  try{
    const events=S.events();
    if(!events.length) return false;
    const fixed=S.members().filter(m=>m.status==='固定團' && (!onlyName||m.name===onlyName));
    if(!fixed.length) return false;
    const signups=S.signups();
    let changed=false;
    const out={...signups};
    events.forEach(ev=>{
      const lock=evLockTime(ev);
      if(lock && Date.now()>=lock.getTime()) return; // 已截止不動
      const evS={...(out[ev.id]||{})};
      let evChanged=false;
      fixed.forEach(m=>{
        if(evS[m.name]===undefined){ evS[m.name]='attend'; evChanged=true; }
      });
      if(evChanged){ out[ev.id]=evS; changed=true; }
    });
    if(changed) S.setSignups(out);
    return changed;
  }catch(err){ console.warn('autoSignupFixedMembers:',err.message); return false; }
}
