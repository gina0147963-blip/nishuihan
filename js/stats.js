// ============================================================
// ADMIN: STATS
// ============================================================
let _charts={};

// 數據排行榜可選的統計項目（key 對應 players 陣列裡的欄位）
const STAT_LEADER_COLS=[
  ['kills','擊敗'],['assist','助攻'],['resource','資源'],
  ['pDamage','對玩家傷害'],['bDamage','對建築傷害'],['heal','治療值'],
  ['taken','承受傷害'],['hurt','重傷'],['revive','化羽/清泉'],['burn','焚骨']
];

function renderAdminStats(pane){
  // 重繪前先記住使用者已選的場次與排行榜項目（背景同步刷新頁面時不打斷瀏覽）
  const prevMatch=(document.getElementById('stat-match-f')||{}).value||'';
  const prevLeader=(document.getElementById('stat-leader-f')||{}).value||'';
  const matchOpts=S.matches().slice()
    .sort((a,b)=>String(b.date||'').localeCompare(String(a.date||'')))
    .map(mm=>`<option value="${mm.id}" ${mm.id===prevMatch?'selected':''}>${String(mm.date||'').slice(0,10)} vs ${mm.enemy||'?'}</option>`).join('');
  pane.innerHTML=`<div class="sec-head"><h2>📈 數據分析（${ORG_LABEL()}）</h2></div>
  <div class="stats-grid">
    <div class="stat-card">
      <h3>勝負統計</h3>
      <div style="max-width:240px;margin:0 auto"><canvas id="chart-wr" height="150"></canvas></div>
    </div>
    <div class="stat-card">
      <div class="fg" style="margin-bottom:10px">
        <label style="font-size:12px;color:var(--txt2)">請選擇比賽場次</label>
        <select id="stat-match-f" class="fsel sm" style="width:100%" onchange="onStatMatchChange()">
          <option value="">請選擇比賽場次</option>${matchOpts}
        </select>
      </div>
      <h3>職業人數 <span id="cls-total" style="float:right;font-size:12px;color:var(--gold)"></span></h3>
      <canvas id="chart-cls" height="130"></canvas>
      <!-- 數據排行榜：依所選場次與數據項目，列出前10名 -->
      <div style="margin-top:14px">
        <div class="fg" style="margin-bottom:8px">
          <label style="font-size:12px;color:var(--txt2)">數據排行榜（前10名）</label>
          <select id="stat-leader-f" class="fsel sm" style="width:100%" onchange="renderStatLeader()">
            ${STAT_LEADER_COLS.map(c=>`<option value="${c[0]}" ${c[0]===prevLeader?'selected':''}>${c[1]}</option>`).join('')}
          </select>
        </div>
        <div id="stat-leader-box"></div>
      </div>
    </div>
  </div>`;
  setTimeout(()=>{ renderWR(); renderCls(); renderStatLeader(); },50);
}

// 切換場次：職業人數圖與數據排行榜都要跟著更新
function onStatMatchChange(){ renderCls(); renderStatLeader(); }

function renderWR(){
  const m=S.matches();
  const w=m.filter(x=>x.result==='勝利').length,l=m.filter(x=>x.result==='失敗').length,d=m.filter(x=>x.result==='平局').length;
  const c=document.getElementById('chart-wr'); if(!c)return;
  if(_charts.wr){_charts.wr.destroy();}
  if(!m.length){c.parentElement.innerHTML+='<p style="text-align:center;color:var(--txt3);font-size:12px">尚無紀錄</p>';return;}
  // 平手為 0 時不顯示「平」這一項，圖例更乾淨
  const labels=[`勝 ${w}`,`敗 ${l}`], data=[w,l], colors=['#3db87a','#e05252'];
  if(d>0){ labels.push(`平 ${d}`); data.push(d); colors.push('#f0b843'); }
  _charts.wr=new Chart(c,{type:'doughnut',data:{labels,datasets:[{data,backgroundColor:colors,borderWidth:0}]},options:{maintainAspectRatio:true,plugins:{legend:{labels:{color:'#e8eaf6',font:{size:11}}},title:{display:true,text:`共 ${m.length} 場，勝率 ${Math.round(w/m.length*100)}%`,color:'#8892b0'}}}});
}

function _selMatch(){
  const sel=(document.getElementById('stat-match-f')||{}).value||'';
  return sel?S.matches().find(x=>x.id===sel):null;
}

function renderCls(){
  const cnt={}; JOBS.forEach(j=>cnt[j.id]=0);
  const mt=_selMatch();
  let total=0;
  if(mt){
    (mt.players||[]).forEach(p=>{
      if(p.camp!=='我方') return;
      const job=jobByName(p.job);
      if(job&&cnt[job.id]!==undefined){ cnt[job.id]++; total++; }
    });
  }
  const tot=document.getElementById('cls-total'); if(tot) tot.textContent='共 '+total+' 人';
  const c=document.getElementById('chart-cls'); if(!c)return;
  if(_charts.cls){_charts.cls.destroy();}
  _charts.cls=new Chart(c,{type:'bar',data:{labels:JOBS.map(j=>j.name),datasets:[{data:JOBS.map(j=>cnt[j.id]),backgroundColor:JOBS.map(j=>j.color),borderRadius:4,borderWidth:0}]},options:{maintainAspectRatio:true,plugins:{legend:{display:false}},scales:{x:{ticks:{color:'#8892b0',font:{size:9}},grid:{color:'#2d3651'}},y:{ticks:{color:'#8892b0',stepSize:1},grid:{color:'#2d3651'}}}}});
}

// 依所選場次與數據項目，列出我方前10名（名稱依職業代表色顯示）
function renderStatLeader(){
  const box=document.getElementById('stat-leader-box'); if(!box) return;
  const mt=_selMatch();
  if(!mt){ box.innerHTML='<p class="hint" style="text-align:center;padding:12px 0">請先於上方選擇比賽場次</p>'; return; }
  const key=(document.getElementById('stat-leader-f')||{}).value||'kills';
  const label=(STAT_LEADER_COLS.find(c=>c[0]===key)||['',''])[1];
  // 只統計我方玩家，依該數據由大到小取前10
  const rows=(mt.players||[])
    .filter(p=>p.camp==='我方')
    .map(p=>({name:p.name, job:p.job, val:Number(p[key])||0}))
    .sort((a,b)=>b.val-a.val)
    .slice(0,10);
  if(!rows.length){ box.innerHTML='<p class="hint" style="text-align:center;padding:12px 0">此場次無我方數據</p>'; return; }
  const fmt=n=>Number(n).toLocaleString('en-US');
  // 名稱顏色：優先用成員資料庫的職業，其次用戰報裡的職業字串
  const nameColor=(name,jobStr)=>{
    const mem=S.members().find(x=>x.name===name);
    if(mem) return jobById(mem.jobId).color;
    const jb=jobByName(jobStr);
    return jb?jb.color:'#e8eaf6';
  };
  box.innerHTML=`<div class="tbl-wrap"><table style="width:100%">
    <thead><tr>
      <th style="width:32px;text-align:center">#</th>
      <th>玩家</th><th>職業</th>
      <th style="text-align:right">${label}</th>
    </tr></thead>
    <tbody>${rows.map((r,i)=>{
      const color=nameColor(r.name,r.job);
      const medal=i===0?'🥇':i===1?'🥈':i===2?'🥉':(i+1);
      return `<tr>
        <td style="text-align:center;color:var(--txt3)">${medal}</td>
        <td style="font-weight:700;color:${color}">${r.name}</td>
        <td style="color:var(--txt2);font-size:12px">${r.job||'—'}</td>
        <td style="text-align:right;font-weight:700">${fmt(r.val)}</td>
      </tr>`;
    }).join('')}</tbody>
  </table></div>`;
}
