// ============================================================
// ADMIN: MATCHES
// ============================================================
let _editMatchId=null;
function renderAdminMatches(pane){
  const matches=S.matches().slice().reverse();
  pane.innerHTML=`<div class="sec-head">
    <h2>📊 比賽紀錄（${MODE_LABEL[CUR_MODE]}）</h2>
    <div class="sec-actions">
      <button class="btn btn-blue sm" onclick="openAddMatch()">+ 新增比賽</button>
      <button class="btn btn-outline sm" onclick="document.getElementById('file-excel').click()">📥 匯入官方Excel</button>
    </div>
  </div>
  <div style="display:flex;flex-direction:column;gap:8px">
  ${matches.length?matches.map(m=>{
    const rc=m.result==='勝利'?'rb-win':m.result==='失敗'?'rb-lose':'rb-draw';
    const rl=m.result==='勝利'?'勝':m.result==='失敗'?'敗':'平';
    return `<div class="match-card">
      <div class="match-rbadge ${rc}">${rl}</div>
      <div class="match-info">
        <div class="match-d">${m.date||''} ／ ${m.type||''}</div>
        <div class="match-title">vs ${m.enemy||'未知對手'}</div>
        <div class="match-meta">我方 ${m.ourCount||0} 人 ／ 對方 ${m.enemyCount||0} 人${m.formation?' ／ 陣型：'+m.formation:''}${m.players?.length?' ／ 數據：'+m.players.length+'筆':''}</div>
        ${m.notes?`<div style="font-size:11px;color:var(--txt2);margin-top:3px">${m.notes}</div>`:''}
      </div>
      <button class="btn btn-outline xs" onclick="openEditMatch('${m.id}')">編輯</button>
    </div>`;
  }).join(''):'<div class="empty"><div class="empty-ico">📊</div><p>尚無比賽紀錄</p></div>'}
  </div>`;
}
function openAddMatch(){
  _editMatchId=null;
  document.getElementById('modal-match-title').textContent='新增比賽紀錄';
  document.getElementById('match-date').value=fmtDate(new Date());
  document.getElementById('match-type').value='單周聯賽';
  document.getElementById('match-enemy').value='';
  document.getElementById('match-result').value='勝利';
  document.getElementById('match-our').value='';
  document.getElementById('match-enemy-cnt').value='';
  document.getElementById('match-formation').value='';
  document.getElementById('match-notes').value='';
  document.getElementById('btn-del-match').classList.add('hidden');
  openModal('modal-match');
}
function openEditMatch(id){
  const m=S.matches().find(x=>x.id===id); if(!m)return;
  _editMatchId=id;
  document.getElementById('modal-match-title').textContent='編輯比賽紀錄';
  document.getElementById('match-date').value=m.date||'';
  document.getElementById('match-type').value=m.type||'單周聯賽';
  document.getElementById('match-enemy').value=m.enemy||'';
  document.getElementById('match-result').value=m.result||'勝利';
  document.getElementById('match-our').value=m.ourCount||'';
  document.getElementById('match-enemy-cnt').value=m.enemyCount||'';
  document.getElementById('match-formation').value=m.formation||'';
  document.getElementById('match-notes').value=m.notes||'';
  document.getElementById('btn-del-match').classList.remove('hidden');
  openModal('modal-match');
}
function saveMatch(){
  const date=document.getElementById('match-date').value;
  if(!date){toast('請選擇日期','err');return;}
  const data={date,type:document.getElementById('match-type').value,enemy:document.getElementById('match-enemy').value.trim(),result:document.getElementById('match-result').value,ourCount:parseInt(document.getElementById('match-our').value)||0,enemyCount:parseInt(document.getElementById('match-enemy-cnt').value)||0,formation:document.getElementById('match-formation').value.trim(),notes:document.getElementById('match-notes').value.trim()};
  let matches=S.matches();
  if(_editMatchId){matches=matches.map(m=>m.id===_editMatchId?{...m,...data}:m);toast('已更新','ok');}
  else{matches.push({id:uid(),...data,players:[],createdAt:Date.now()});toast('已新增','ok');}
  S.setMatches(matches);
  closeModal('modal-match');
  renderAdminMatches(document.getElementById('pane-a-matches'));
}
function deleteMatch(){
  if(!_editMatchId||!confirm('確定刪除？'))return;
  S.setMatches(S.matches().filter(m=>m.id!==_editMatchId));
  closeModal('modal-match'); toast('已刪除','ok');
  renderAdminMatches(document.getElementById('pane-a-matches'));
}
function handleExcel(e){
  const file=e.target.files[0]; if(!file)return;
  const reader=new FileReader();
  reader.onload=ev=>{
    try{
      const wb=XLSX.read(ev.target.result,{type:'array'});
      const ws=wb.Sheets[wb.SheetNames[0]];
      const raw=XLSX.utils.sheet_to_json(ws,{header:1,defval:''});
      if(raw.length<2){toast('Excel 無資料','err');return;}
      const hdr=raw[0].map(h=>String(h).trim());
      const ci=n=>hdr.findIndex(h=>h.includes(n));
      const ni=ci('玩家'),campi=ci('陣營'),ki=ci('擊敗'),ai=ci('助攻'),ri=ci('資源'),di=ci('人傷'),si=ci('破泉');
      if(ni<0){toast('找不到「玩家」欄位','err');return;}
      const players=[];
      for(let i=1;i<raw.length;i++){
        const r=raw[i],name=String(r[ni]||'').trim(); if(!name)continue;
        players.push({name,camp:campi>=0?String(r[campi]||''):'',kills:ki>=0?(parseInt(r[ki])||0):0,assist:ai>=0?(parseInt(r[ai])||0):0,resource:ri>=0?(parseFloat(String(r[ri]).replace(/[^0-9.]/g,''))||0):0,damage:di>=0?(parseFloat(String(r[di]).replace(/[^0-9.]/g,''))||0):0,spring:si>=0?(parseInt(r[si])||0):0});
      }
      const dm=file.name.match(/(\d{6})/);
      let date=fmtDate(new Date());
      if(dm){const d=dm[1];date=`20${d.slice(0,2)}-${d.slice(2,4)}-${d.slice(4,6)}`;}
      const our=players.filter(p=>p.camp==='我方'||!p.camp);
      let matches=S.matches();
      let ex=matches.find(m=>m.date===date);
      if(ex){ex.players=players;ex.participants=our.map(p=>p.name);ex.ourCount=our.length;}
      else{matches.push({id:uid(),date,type:'聯賽',enemy:'',result:'',ourCount:our.length,enemyCount:0,players,participants:our.map(p=>p.name),notes:`從${file.name}匯入`,createdAt:Date.now()});}
      S.setMatches(matches);
      toast(`已匯入 ${players.length} 筆數據`,'ok');
      renderAdminMatches(document.getElementById('pane-a-matches'));
    }catch(err){toast('Excel解析失敗：'+err.message,'err');}
  };
  reader.readAsArrayBuffer(file);
  e.target.value='';
}
