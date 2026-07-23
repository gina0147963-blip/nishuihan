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

// ── 出席狀態提示訊息（管理端/玩家端共用）──────────────────────
// 判斷邏輯只看「最近一場已經有比賽紀錄的場次」（見 members.js 的 _recentAttStatus）：
//   這場「報名／排表／出賽」三者若一致（都做了、或都沒做也沒出賽）→ 正常，不跳提醒；
//   完全沒報名沒排入卻出賽了 → warn1；已報名(出席)或已排入戰鬥小隊卻沒出賽 → warn2；
//   只有候補報名/候補排入而沒出賽 → 候補沒被叫上場，屬正常情況，用中性提示。
// 只看最近一場、不追溯更早的場次：更早場次即使曾經異常，只要最近一場恢復正常就不再提醒
// （但 a/b/c 顯示的數字本身仍是全部累計加總，只有「要不要跳提醒」看最近一場）。
function attStatusNote(name,isSelf){
  const st=(typeof _recentAttStatus==='function')?_recentAttStatus(name):null;
  if(!st||st.type==='ok') return null;
  if(st.type==='warn1') return {type:'warn1',
    text: (isSelf?'📢 記得到系統填寫出席狀態喔！':'📢 請提醒該成員到系統填寫出席狀態')+`（${st.date} 那場有出賽紀錄，卻沒有報名也沒被排入排表）`};
  if(st.type==='warn2') return {type:'warn2',
    text: (isSelf?'📢 記得要出場喔！':'📢 提醒該成員要記得出場')+`（${st.date} 那場已報名或排入排表，卻沒有出賽紀錄）`};
  if(st.type==='reserve') return {type:'reserve',
    text: isSelf?'🟡 你有候補紀錄，不一定會被排上場，這不算異常喔！':'🟡 該成員有候補紀錄，可能因此未出場，屬正常情況、非異常'};
  return null;
}

// 依「最近一場」的異常類型上色：沒有可比對的場次／完全沒動靜 → 中性灰；
// warn1(金)／warn2(紅)／候補(藍綠)／正常(綠)
function attRateColor3(name){
  const st=(typeof _recentAttStatus==='function')?_recentAttStatus(name):null;
  if(!st) return 'var(--txt3)';
  if(st.type==='warn1') return 'var(--gold)';
  if(st.type==='warn2') return 'var(--bad)';
  if(st.type==='reserve') return 'var(--accent)';
  if(st.type==='ok') return 'var(--ok)';
  return 'var(--txt3)';
}

// ── 報名時效性提醒：排入排表次數(c) < 報名次數(b) ──────────────
// 代表這位成員的報名時機常常「排表已經排完了才報名」，導致有報名卻沒被排進去。
// 用累計總數判斷（反映的是長期的報名時機落差，不是單一場次的事，所以不採最近一場邏輯）。
function attSignupTimingNote(b,c,isSelf){
  if(c>=b) return null;
  return {type:'timing',
    text: isSelf?'⏰ 請盡早報名填寫出席狀態，會影響到排表的判斷':'⏰ 該成員報名次數多於排入排表次數，請提醒他盡早報名，避免影響排表判斷'};
}

// ── 幫戰模式特別規定（僅白月燦星／白月梵星適用，其他組織不吃這條規則）──
// 每週六固定一場聯賽（單場周1場、雙場周2場比賽）。取「報名管理」最近4場（即最近4週，
// 依單場周/雙場周交替，通常共約6場比賽）為判斷區間；這裡的出場次數(a)跟其他地方的
// a算法一致，依實際比賽紀錄逐筆累加（雙場周算2次）。若該成員這4週實際出場次數少於3場，
// 提醒管理員確認是否有請長假需求。
// 資料不足4週（系統剛啟用、場次還沒累積到4場）時先不判斷，避免誤判。
const LONG_LEAVE_CHECK_ORGS = ['bycx','byfx'];
function checkLongLeaveWarning(name){
  if(!LONG_LEAVE_CHECK_ORGS.includes(CUR_ORG)) return null;
  const me=S.members().find(x=>x.name===name);
  const alias=new Set([name,...((me&&me.aliases)||[])]);
  const recent=S.events().slice().sort((a,b)=>String(b.date||'').localeCompare(String(a.date||''))).slice(0,4);
  if(recent.length<4) return null; // 場次資料還不滿4週，先不判斷
  const recentDates=new Set(recent.map(e=>String(e.date||'').slice(0,10)));
  let a=0;
  S.matches().forEach(mm=>{
    const d=String(mm.date||'').slice(0,10);
    if(!recentDates.has(d)) return;
    if((mm.participants||[]).some(n=>alias.has(n))) a++;
  });
  if(a<3) return {text:'⚠️ 該成員出場次數不符規定，請確認該成員是否有請長假需求（最近4週僅出場 '+a+' 場）'};
  return null;
}


// ── 報名截止時間（全站統一規則：活動當天的凌晨0點整）──────
// 例：活動在星期六 → 星期六 00:00 截止（即星期五午夜一到就鎖定）
function evLockTime(ev){
  if(!ev||!ev.date) return null;
  const dateOnly=String(ev.date).slice(0,10);
  const evDay=new Date(dateOnly+'T00:00:00');
  if(isNaN(evDay.getTime())) return null;
  return evDay;
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
// 截止時間的顯示文字，例如「7/11（六）00:00」
function evLockTimeLabel(ev){
  const lock=evLockTime(ev);
  if(!lock) return '';
  const wd=['日','一','二','三','四','五','六'][lock.getDay()];
  return (lock.getMonth()+1)+'/'+lock.getDate()+'（'+wd+'）00:00';
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

// ── 固定團／固定候補自動報名 ──────────────────────────────
// 固定團成員視為每場活動自動出席；固定候補成員視為每場活動自動候補
// （candidate 候補簽到後，既有的 autoPlaceReserve() 會自動把候補簽到者排進右下角候補隊伍，
// 因此固定候補不需要另外寫排表搬移邏輯，只要簽到狀態對了，排表會自動跟上）。
// 凡「尚未回覆」的未截止場次，自動依身分填為出席／候補；已手動回覆（請假等）的不覆蓋；
// 若身分與既有回覆衝突（固定團卻是候補／固定候補卻是出席），強制轉為該身分對應的狀態。
// 已截止的場次不動。onlyName（可選）：只處理指定成員（例如玩家自己切換狀態時）。
// 回傳是否有變動。
function autoSignupFixedMembers(onlyName){
  try{
    const events=S.events();
    if(!events.length) return false;
    const targets=S.members().filter(m=>(m.status==='固定團'||m.status==='固定候補') && (!onlyName||m.name===onlyName));
    if(!targets.length) return false;
    const signups=S.signups();
    let changed=false;
    const out={...signups};
    events.forEach(ev=>{
      const lock=evLockTime(ev);
      if(lock && Date.now()>=lock.getTime()) return; // 已截止不動
      const evS={...(out[ev.id]||{})};
      let evChanged=false;
      targets.forEach(m=>{
        const want=m.status==='固定團'?'attend':'reserve';
        if(evS[m.name]===undefined){ evS[m.name]=want; evChanged=true; }
        else if(evS[m.name]!==want && (evS[m.name]==='attend'||evS[m.name]==='reserve')){ evS[m.name]=want; evChanged=true; } // 身分與既有出席/候補回覆衝突，強制轉為身分對應狀態
      });
      if(evChanged){ out[ev.id]=evS; changed=true; }
    });
    if(changed) S.setSignups(out);
    return changed;
  }catch(err){ console.warn('autoSignupFixedMembers:',err.message); return false; }
}

// ── 「可隔周上場」名片反灰判斷 ───────────────────────────────
// 檢查某成員在「指定日期往前 days 天」那天是否有出賽紀錄（含曾用名比對）。
// 用於排表系統成員池「隔周上場」分類：上週有出賽 → 這週名片反灰提醒（可能該輪休了），
// 上週沒出賽 → 這週正常顯示（提醒該上場了）。反灰僅供參考，名片仍可點擊拖曳。
function _playedDaysBefore(name,dateStr,days){
  const m=S.members().find(x=>x.name===name);
  const alias=new Set([name,...((m&&m.aliases)||[])]);
  const d=new Date(String(dateStr).slice(0,10)+'T00:00:00');
  if(isNaN(d.getTime())) return false;
  d.setDate(d.getDate()-days);
  const target=fmtDate(d);
  return S.matches().some(mm=>String(mm.date||'').slice(0,10)===target && (mm.participants||[]).some(n=>alias.has(n)));
}
