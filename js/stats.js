// ============================================================
// ADMIN: STATS
// ============================================================
let _charts={};
function renderAdminStats(pane){
  pane.innerHTML=`<div class="sec-head"><h2>📈 數據分析（${MODE_LABEL[CUR_MODE]}）</h2></div>
  <div class="stats-grid three">
    <div class="stat-card"><h3>勝負統計</h3><canvas id="chart-wr" height="150"></canvas></div>
    <div class="stat-card"><h3>職業人數 <span id="cls-total" style="float:right;font-size:12px;color:var(--gold)"></span></h3><canvas id="chart-cls" height="150"></canvas></div>
    <div class="stat-card"><h3>出席率
      <select id="att-cls-f" class="fsel sm" style="float:right" onchange="renderAttendance()"><option value="">全部職業</option>${JOBS.map(j=>`<option value="${j.id}">${j.name}</option>`).join('')}</select>
    </h3><div id="attendance-box" style="max-height:320px;overflow-y:auto"></div></div>
  </div>`;
  setTimeout(()=>{ renderWR(); renderCls(); renderAttendance(); },50);
}
function renderWR(){
  const m=S.matches();
  const w=m.filter(x=>x.result==='勝利').length,l=m.filter(x=>x.result==='失敗').length,d=m.filter(x=>x.result==='平局').length;
  const c=document.getElementById('chart-wr'); if(!c)return;
  if(_charts.wr){_charts.wr.destroy();}
  if(!m.length){c.parentElement.innerHTML+='<p style="text-align:center;color:var(--txt3);font-size:12px">尚無紀錄</p>';return;}
  _charts.wr=new Chart(c,{type:'doughnut',data:{labels:[`勝 ${w}`,`敗 ${l}`,`平 ${d}`],datasets:[{data:[w,l,d],backgroundColor:['#3db87a','#e05252','#f0b843'],borderWidth:0}]},options:{maintainAspectRatio:true,plugins:{legend:{labels:{color:'#e8eaf6',font:{size:11}}},title:{display:true,text:`共 ${m.length} 場，勝率 ${Math.round(w/m.length*100)}%`,color:'#8892b0'}}}});
}
function renderCls(){
  const cnt={}; JOBS.forEach(j=>cnt[j.id]=0);
  let total=0;
  S.members().forEach(m=>{if(cnt[m.jobId]!==undefined){cnt[m.jobId]++;total++;}});
  const tot=document.getElementById('cls-total'); if(tot) tot.textContent='共 '+S.members().length+' 人';
  const c=document.getElementById('chart-cls'); if(!c)return;
  if(_charts.cls){_charts.cls.destroy();}
  _charts.cls=new Chart(c,{type:'bar',data:{labels:JOBS.map(j=>j.name),datasets:[{data:JOBS.map(j=>cnt[j.id]),backgroundColor:JOBS.map(j=>j.color),borderRadius:4,borderWidth:0}]},options:{maintainAspectRatio:true,plugins:{legend:{display:false}},scales:{x:{ticks:{color:'#8892b0',font:{size:9}},grid:{color:'#2d3651'}},y:{ticks:{color:'#8892b0',stepSize:1},grid:{color:'#2d3651'}}}}});
}
// 出席率：玩家/職業/報名場數/實際出席場數/出席率（可職業篩選）
function renderAttendance(){
  const box=document.getElementById('attendance-box'); if(!box)return;
  const qc=((document.getElementById('att-cls-f')||{}).value)||'';
  const events=S.events();
  const matches=S.matches();
  const signups=S.signups();
  // 別名對照：改名後舊名的報名/出席都歸到現用名
  const aliasMap={};
  S.members().forEach(mm=>{ aliasMap[mm.name]=mm.name; (mm.aliases||[]).forEach(a=>aliasMap[a]=mm.name); });
  const norm=n=>aliasMap[n]||n;
  const stat={};
  events.forEach(ev=>{
    const evS=signups[ev.id]||{};
    const dayMatches=matches.filter(mm=>mm.date===ev.date);
    const actual=new Set(); dayMatches.forEach(mm=>(mm.participants||[]).forEach(n=>actual.add(norm(n))));
    Object.entries(evS).forEach(([rawName,st])=>{
      if(st!=='attend') return;
      const name=norm(rawName);
      if(!stat[name]) stat[name]={plan:0,act:0};
      stat[name].plan++;
      if(actual.has(name)) stat[name].act++;
    });
  });
  let rows=Object.entries(stat).map(([name,s])=>{
    const m=S.members().find(x=>x.name===name);
    return {name,jobId:m?m.jobId:'',job:m?jobById(m.jobId).name:'—',plan:s.plan,act:s.act,rate:s.plan?Math.round(s.act/s.plan*100):0};
  });
  if(qc) rows=rows.filter(r=>r.jobId===qc);
  rows.sort((a,b)=>b.rate-a.rate||b.plan-a.plan);
  box.innerHTML=rows.length?`<div class="tbl-wrap"><table style="font-size:12px">
    <thead><tr><th>玩家</th><th>職業</th><th>報名</th><th>出席</th><th>出席率</th></tr></thead>
    <tbody>${rows.map(r=>{
      const color=r.rate>=80?'var(--ok)':r.rate>=50?'var(--gold)':'var(--bad)';
      return `<tr><td>${r.name}</td><td>${r.job}</td><td>${r.plan}</td><td>${r.act}</td><td style="color:${color};font-weight:700">${r.rate}%</td></tr>`;
    }).join('')}</tbody></table></div>`:'<p class="hint">尚無報名資料</p>';
}
