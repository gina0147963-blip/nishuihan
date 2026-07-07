// ============================================================
// ADMIN: STATS
// ============================================================
let _charts={};
function renderAdminStats(pane){
  pane.innerHTML=`<div class="sec-head"><h2>📈 數據分析（${MODE_LABEL[CUR_MODE]}）</h2></div>
  <div class="stats-grid">
    <div class="stat-card"><h3>勝負統計</h3><canvas id="chart-wr" height="150"></canvas></div>
    <div class="stat-card"><h3>職業人數 <span id="cls-total" style="float:right;font-size:12px;color:var(--gold)"></span></h3>
      <select id="cls-match-f" class="fsel sm" style="width:100%;margin:6px 0" onchange="renderCls()">
        <option value="">請選擇比賽場次</option>
        ${S.matches().slice().sort((a,b)=>String(b.date||'').localeCompare(String(a.date||''))).map(mm=>`<option value="${mm.id}">${String(mm.date||'').slice(0,10)} vs ${mm.enemy||'?'}</option>`).join('')}
      </select>
      <canvas id="chart-cls" height="150"></canvas></div>
  </div>`;
  setTimeout(()=>{ renderWR(); renderCls(); },50);
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
  const sel=(document.getElementById('cls-match-f')||{}).value||'';
  let total=0;
  if(sel){
    // 統計該場比賽我方玩家的職業分布
    const mt=S.matches().find(x=>x.id===sel);
    ((mt&&mt.players)||[]).forEach(p=>{
      if(p.camp!=='我方') return;
      const job=jobByName(p.job);
      if(job&&cnt[job.id]!==undefined){ cnt[job.id]++; total++; }
    });
  } else {
    // 未選場次：不顯示（提示選擇）
  }
  const tot=document.getElementById('cls-total'); if(tot) tot.textContent='共 '+total+' 人';
  const c=document.getElementById('chart-cls'); if(!c)return;
  if(_charts.cls){_charts.cls.destroy();}
  _charts.cls=new Chart(c,{type:'bar',data:{labels:JOBS.map(j=>j.name),datasets:[{data:JOBS.map(j=>cnt[j.id]),backgroundColor:JOBS.map(j=>j.color),borderRadius:4,borderWidth:0}]},options:{maintainAspectRatio:true,plugins:{legend:{display:false}},scales:{x:{ticks:{color:'#8892b0',font:{size:9}},grid:{color:'#2d3651'}},y:{ticks:{color:'#8892b0',stepSize:1},grid:{color:'#2d3651'}}}}});
}
