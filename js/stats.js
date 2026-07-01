// ============================================================
// ADMIN: STATS
// ============================================================
let _charts={};
function renderAdminStats(pane){
  pane.innerHTML=`<div class="sec-head"><h2>📈 數據分析（${MODE_LABEL[CUR_MODE]}）</h2></div>
  <div class="stats-grid">
    <div class="stat-card"><h3>勝負統計</h3><canvas id="chart-wr" height="160"></canvas></div>
    <div class="stat-card"><h3>職業人數</h3><canvas id="chart-cls" height="160"></canvas></div>
    <div class="stat-card wide"><h3>成員出席排行</h3><div id="att-rank" style="display:flex;flex-direction:column;gap:6px"></div></div>
    <div class="stat-card wide"><h3>各職業最高單場數據</h3><div id="top-stats"></div></div>
  </div>`;
  setTimeout(()=>{ renderWR(); renderCls(); renderAtt(); renderTopStats(); },50);
}
function renderWR(){
  const m=S.matches();
  const w=m.filter(x=>x.result==='勝利').length,l=m.filter(x=>x.result==='失敗').length,d=m.filter(x=>x.result==='平局').length;
  const c=document.getElementById('chart-wr'); if(!c)return;
  if(_charts.wr){_charts.wr.destroy();}
  if(!m.length){c.parentElement.innerHTML+='<p style="text-align:center;color:var(--txt3);font-size:12px">尚無紀錄</p>';return;}
  _charts.wr=new Chart(c,{type:'doughnut',data:{labels:[`勝 ${w}`,`敗 ${l}`,`平 ${d}`],datasets:[{data:[w,l,d],backgroundColor:['#3db87a','#e05252','#f0b843'],borderWidth:0}]},options:{plugins:{legend:{labels:{color:'#e8eaf6',font:{size:12}}},title:{display:true,text:`共 ${m.length} 場，勝率 ${m.length?Math.round(w/m.length*100):0}%`,color:'#8892b0'}}}});
}
function renderCls(){
  const cnt={}; JOBS.forEach(j=>cnt[j.id]=0);
  S.members().forEach(m=>{if(cnt[m.jobId]!==undefined)cnt[m.jobId]++;});
  const c=document.getElementById('chart-cls'); if(!c)return;
  if(_charts.cls){_charts.cls.destroy();}
  _charts.cls=new Chart(c,{type:'bar',data:{labels:JOBS.map(j=>j.name),datasets:[{data:JOBS.map(j=>cnt[j.id]),backgroundColor:JOBS.map(j=>j.color),borderRadius:4,borderWidth:0}]},options:{plugins:{legend:{display:false}},scales:{x:{ticks:{color:'#8892b0'},grid:{color:'#2d3651'}},y:{ticks:{color:'#8892b0',stepSize:1},grid:{color:'#2d3651'}}}}});
}
function renderAtt(){
  const att={};
  S.matches().forEach(m=>(m.participants||[]).forEach(n=>att[n]=(att[n]||0)+1));
  S.members().forEach(m=>{if(!att[m.name])att[m.name]=0;});
  const sorted=Object.entries(att).sort((a,b)=>b[1]-a[1]).slice(0,12);
  const max=sorted[0]?.[1]||1;
  const box=document.getElementById('att-rank'); if(!box)return;
  box.innerHTML=sorted.map(([name,cnt],i)=>{
    const m=S.members().find(x=>x.name===name);
    const job=m?jobById(m.jobId):{color:'#8892b0'};
    return `<div class="rank-item">
      <span class="rank-n" style="color:${i<3?'var(--gold)':'var(--txt3)'}">${i+1}</span>
      <span style="font-size:12px;min-width:85px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:${job.color}">${name}</span>
      <div class="rank-bw"><div class="rank-b" style="width:${Math.round(cnt/max*100)}%;background:${job.color}"></div></div>
      <span style="color:var(--gold);font-weight:700;font-size:12px;min-width:24px;text-align:right">${cnt}</span>
    </div>`;
  }).join('');
}
function renderTopStats(){
  const box=document.getElementById('top-stats'); if(!box)return;
  const members=S.members();
  const js={};
  JOBS.forEach(j=>js[j.id]={kills:0,assist:0,damage:0,resource:0});
  let hasData=false;
  S.matches().forEach(m=>{
    (m.players||[]).forEach(p=>{
      const mb=members.find(x=>x.name===p.name); if(!mb||!js[mb.jobId])return;
      const s=js[mb.jobId];
      s.kills=Math.max(s.kills,p.kills||0);
      s.assist=Math.max(s.assist,p.assist||0);
      s.damage=Math.max(s.damage,p.damage||0);
      s.resource=Math.max(s.resource,p.resource||0);
      if(p.kills||p.damage)hasData=true;
    });
  });
  if(!hasData){box.innerHTML='<p style="color:var(--txt3);font-size:12px">需匯入官方Excel才能顯示</p>';return;}
  box.innerHTML=`<div class="tbl-wrap"><table>
    <thead><tr><th>職業</th><th>最高擊敗</th><th>最高助攻</th><th>最高人傷(萬)</th><th>最高資源(萬)</th></tr></thead>
    <tbody>${JOBS.map(j=>{const s=js[j.id];return`<tr><td><span class="pill pill-job jc-${j.id}">${j.name}</span></td><td>${s.kills}</td><td>${s.assist}</td><td style="color:var(--bad)">${s.damage?s.damage.toLocaleString():'-'}</td><td style="color:var(--gold)">${s.resource?s.resource.toLocaleString():'-'}</td></tr>`;}).join('')}</tbody>
  </table></div>`;
}
