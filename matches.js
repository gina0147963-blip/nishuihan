// ============================================================
// ADMIN: MATCHES
// ============================================================
let _editMatchId=null;
let _pendingImport=null; // 暫存解析完成、等待使用者確認勝負後才正式存檔的匯入資料

function renderAdminMatches(pane){
  const matches=S.matches().slice().reverse();
  pane.innerHTML=`<div class="sec-head">
    <h2>📊 比賽紀錄（${MODE_LABEL[CUR_MODE]}）</h2>
    <div class="sec-actions">
      <button class="btn btn-blue sm" onclick="openAddMatch()">+ 新增比賽</button>
      <button class="btn btn-outline sm" onclick="document.getElementById('file-excel').click()">📥 匯入比賽紀錄(CSV/Excel)</button>
    </div>
  </div>
  <p class="hint">支援匯入官方匯出的 CSV／Excel 檔案（檔名格式：日期_ID_我方俱樂部_對方俱樂部），匯入時系統會自動把出現過的玩家名稱加入成員資料庫（職業會一併帶入，已存在的成員不會重複新增）。</p>
  <div style="display:flex;flex-direction:column;gap:8px">
  ${matches.length?matches.map(m=>{
    const rc=m.result==='勝利'?'rb-win':m.result==='失敗'?'rb-lose':'rb-draw';
    const rl=m.result==='勝利'?'勝':m.result==='失敗'?'敗':m.result==='平局'?'平':'？';
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
  if(_editMatchId){matches=matches.map(m=>m.id===_editMatchId?{...m,...data}:m);}
  else{matches.push({id:uid(),...data,players:[],participants:[],createdAt:Date.now()});}
  const ok=S.setMatches(matches);
  if(!ok)return;
  toast(_editMatchId?'已更新':'已新增','ok');
  closeModal('modal-match');
  renderAdminMatches(document.getElementById('pane-a-matches'));
}
function deleteMatch(){
  if(!_editMatchId||!confirm('確定刪除？'))return;
  S.setMatches(S.matches().filter(m=>m.id!==_editMatchId));
  closeModal('modal-match'); toast('已刪除','ok');
  renderAdminMatches(document.getElementById('pane-a-matches'));
}

// ============================================================
// 匯入 CSV / Excel — 真實格式：
//
// 檔名："日期_ID_我方俱樂部_對方俱樂部.csv"（例如 20260621_1389_白月燦星_琉芸殿.csv）
//
// 檔案內容是兩個區塊（用空白行分隔），每個區塊結構為：
//   第1行："俱樂部名稱","人數"
//   第2行：欄位標題："玩家名字","職業","擊敗","助攻","資源","對玩家傷害","對建築傷害","治療值","承受傷害","重傷","化羽/清泉","焚骨"
//   接下來每行一位玩家的數據
//
// 檔名裡第一個俱樂部名稱 = 我方，第二個 = 對方
// ============================================================

function handleExcel(e){
  const file=e.target.files[0]; if(!file)return;
  const isCSV = /\.csv$/i.test(file.name);
  const reader=new FileReader();

  reader.onload=ev=>{
    try{
      let raw; // 二維陣列形式的整份資料（不分區塊）
      if(isCSV){
        const text = stripBOM(ev.target.result);
        raw = parseCsvText(text);
      } else {
        const wb=XLSX.read(ev.target.result,{type:'array'});
        const ws=wb.Sheets[wb.SheetNames[0]];
        raw = XLSX.utils.sheet_to_json(ws,{header:1,defval:''});
      }

      const parsed = parseTwoClubBlocks(raw);
      if(!parsed){
        toast('無法辨識檔案內容，請確認是官方匯出的比賽數據格式','err');
        return;
      }

      const fileInfo = parseFilename(file.name);
      if(!fileInfo){
        toast('檔名格式不符（應為：日期_ID_我方俱樂部_對方俱樂部），改用今天日期匯入','err');
      }

      // 用檔名裡第一個俱樂部名稱判斷哪一區塊是「我方」
      let ourBlock, enemyBlock;
      if(fileInfo && parsed.blockA.clubName===fileInfo.ourClub){
        ourBlock=parsed.blockA; enemyBlock=parsed.blockB;
      } else if(fileInfo && parsed.blockB.clubName===fileInfo.ourClub){
        ourBlock=parsed.blockB; enemyBlock=parsed.blockA;
      } else {
        // 找不到對應，預設區塊A=我方
        ourBlock=parsed.blockA; enemyBlock=parsed.blockB;
      }

      // 把雙方玩家都標記陣營，合併成同一份 players 陣列方便之後統計
      const allPlayers = [
        ...ourBlock.players.map(p=>({...p, camp:'我方'})),
        ...enemyBlock.players.map(p=>({...p, camp:'對方'})),
      ];

      _pendingImport = {
        date: fileInfo ? fileInfo.date : fmtDate(new Date()),
        ourClubName: ourBlock.clubName,
        enemyClubName: enemyBlock.clubName,
        ourCount: ourBlock.players.length,
        enemyCount: enemyBlock.players.length,
        players: allPlayers,
        participants: ourBlock.players.map(p=>p.name),
        fileName: file.name,
      };

      openImportConfirm();
    }catch(err){
      toast('檔案解析失敗：'+err.message,'err');
      console.error(err);
    }
  };

  if(isCSV) reader.readAsText(file, 'utf-8');
  else reader.readAsArrayBuffer(file);
  e.target.value='';
}

function stripBOM(text){
  if(text.charCodeAt(0)===0xFEFF) return text.slice(1);
  return text;
}

// 簡易但穩健的 CSV 逐字元解析器（處理欄位內含逗號、引號跳脫等情況）
function parseCsvText(text){
  const rows=[];
  let row=[], field='', inQuotes=false;
  for(let i=0;i<text.length;i++){
    const c=text[i];
    if(inQuotes){
      if(c==='"'){
        if(text[i+1]==='"'){ field+='"'; i++; }
        else inQuotes=false;
      } else field+=c;
    } else {
      if(c==='"') inQuotes=true;
      else if(c===','){ row.push(field); field=''; }
      else if(c==='\n'){ row.push(field); rows.push(row); row=[]; field=''; }
      else if(c==='\r'){ /* skip */ }
      else field+=c;
    }
  }
  if(field.length || row.length){ row.push(field); rows.push(row); }
  return rows;
}

// 從檔名解析「日期_ID_我方俱樂部_對方俱樂部」
function parseFilename(filename){
  const base = filename.replace(/\.(csv|xlsx|xls)$/i,'');
  const parts = base.split('_');
  if(parts.length<4) return null;
  const dateStr = parts[0]; // 例如 20260621
  const ourClub = parts[2];
  const enemyClub = parts.slice(3).join('_'); // 防止對方俱樂部名稱本身含底線
  if(!/^\d{8}$/.test(dateStr)) return null;
  const date = `${dateStr.slice(0,4)}-${dateStr.slice(4,6)}-${dateStr.slice(6,8)}`;
  return { date, ourClub, enemyClub };
}

// 解析兩個俱樂部資料區塊
// 回傳 { blockA:{clubName,players}, blockB:{clubName,players} } 或 null（格式不符）
function parseTwoClubBlocks(raw){
  // 先把整份資料依「空白列」切成幾個區塊
  const blocks=[];
  let cur=[];
  raw.forEach(row=>{
    const isEmpty = !row || row.every(c=>String(c).trim()==='');
    if(isEmpty){
      if(cur.length) blocks.push(cur);
      cur=[];
    } else {
      cur.push(row);
    }
  });
  if(cur.length) blocks.push(cur);

  const parsedBlocks = blocks.map(parseSingleClubBlock).filter(Boolean);
  if(parsedBlocks.length<2) return null;

  return { blockA: parsedBlocks[0], blockB: parsedBlocks[1] };
}

// 解析單一俱樂部區塊：
//   第1行：[俱樂部名稱, 人數]
//   第2行：欄位標題
//   之後每行：玩家數據
function parseSingleClubBlock(rows){
  if(rows.length<3) return null;
  const clubName = String(rows[0][0]||'').trim();
  if(!clubName) return null;

  const header = rows[1].map(h=>String(h).trim());
  const ci = name => header.findIndex(h=>h.includes(name));
  const idxName    = ci('玩家');
  const idxJob     = ci('職業');
  const idxKills   = ci('擊敗');
  const idxAssist  = ci('助攻');
  const idxRes     = ci('資源');
  const idxPDmg    = ci('對玩家傷害');
  const idxBDmg    = ci('對建築傷害');
  const idxHeal    = ci('治療');
  const idxTaken   = ci('承受傷害');
  const idxHurt    = ci('重傷');
  const idxRevive  = ci('化羽');
  const idxBurn    = ci('焚骨');

  if(idxName<0) return null;

  const players=[];
  for(let i=2;i<rows.length;i++){
    const r=rows[i];
    const name=String(r[idxName]||'').trim();
    if(!name) continue;
    const num = v => { const n=parseFloat(String(v).replace(/[^0-9.\-]/g,'')); return isNaN(n)?0:n; };
    players.push({
      name,
      job: idxJob>=0 ? String(r[idxJob]||'').trim() : '',
      kills:   idxKills>=0   ? num(r[idxKills])   : 0,
      assist:  idxAssist>=0  ? num(r[idxAssist])  : 0,
      resource:idxRes>=0     ? num(r[idxRes])     : 0,
      pDamage: idxPDmg>=0    ? num(r[idxPDmg])    : 0,
      bDamage: idxBDmg>=0    ? num(r[idxBDmg])    : 0,
      heal:    idxHeal>=0    ? num(r[idxHeal])    : 0,
      taken:   idxTaken>=0   ? num(r[idxTaken])   : 0,
      hurt:    idxHurt>=0    ? num(r[idxHurt])    : 0,
      revive:  idxRevive>=0  ? num(r[idxRevive])  : 0,
      burn:    idxBurn>=0    ? num(r[idxBurn])    : 0,
      // 沿用既有統計模組所需的欄位別名
      damage:  idxPDmg>=0    ? num(r[idxPDmg])    : 0,
    });
  }
  if(!players.length) return null;
  return { clubName, players };
}

// ============================================================
// 匯入確認彈窗 — 讓管理員手動選擇本場勝負，並預覽匯入內容
// ============================================================
function openImportConfirm(){
  if(!_pendingImport) return;
  const p=_pendingImport;
  const box=document.getElementById('import-confirm-body');
  box.innerHTML=`
    <div class="frow">
      <div class="fg full"><label>比賽日期</label><input id="ic-date" class="fi" type="date" value="${p.date}"></div>
      <div class="fg full"><label>我方俱樂部</label><input class="fi" value="${p.ourClubName}（${p.ourCount}人）" disabled></div>
      <div class="fg full"><label>對方俱樂部</label><input id="ic-enemy" class="fi" value="${p.enemyClubName}（${p.enemyCount}人）" disabled></div>
      <div class="fg full">
        <label>本場勝負 *（檔案內無此資訊，請手動選擇）</label>
        <select id="ic-result" class="fsel">
          <option value="勝利">🟢 勝利</option>
          <option value="失敗">🔴 失敗</option>
          <option value="平局">🟡 平局</option>
        </select>
      </div>
    </div>
    <p class="hint mt8">將會匯入 ${p.players.length} 筆玩家數據（我方 ${p.ourCount} 人／對方 ${p.enemyCount} 人）。匯入後，出現過的玩家姓名若不在目前成員資料庫中，會自動新增（職業會一併帶入）。</p>
  `;
  openModal('modal-import-confirm');
}

function confirmImport(){
  if(!_pendingImport) return;
  const p=_pendingImport;
  const date=document.getElementById('ic-date').value || p.date;
  const result=document.getElementById('ic-result').value;

  // 1) 自動把新出現的玩家加入成員資料庫
  const newlyAdded = autoAddMembersFromImport(p.players);

  // 2) 寫入比賽紀錄（若同一天已有同對手的紀錄，詢問是否覆蓋；否則新增）
  let matches=S.matches();
  const existing = matches.find(m=>m.date===date && m.enemy===p.enemyClubName);
  const matchData = {
    date,
    type:'聯賽',
    enemy:p.enemyClubName,
    result,
    ourCount:p.ourCount,
    enemyCount:p.enemyCount,
    players:p.players,
    participants:p.participants,
    notes:`從 ${p.fileName} 匯入`,
  };

  if(existing){
    Object.assign(existing, matchData);
  } else {
    matches.push({ id:uid(), ...matchData, createdAt:Date.now() });
  }

  const ok = S.setMatches(matches);
  if(!ok) return;

  closeModal('modal-import-confirm');
  _pendingImport=null;

  let msg = `✅ 已匯入 ${p.players.length} 筆數據（${result}）`;
  if(newlyAdded>0) msg += `，新增 ${newlyAdded} 位成員`;
  toast(msg,'ok');

  renderAdminMatches(document.getElementById('pane-a-matches'));
}

function cancelImport(){
  _pendingImport=null;
  closeModal('modal-import-confirm');
}

// 將匯入資料中「我方」玩家自動加入成員資料庫（對方玩家不加入，避免污染自家成員清單）
function autoAddMembersFromImport(allPlayers){
  const members = S.members();
  const existingNames = new Set(members.map(m=>m.name));
  let added=0;

  allPlayers.forEach(p=>{
    if(p.camp!=='我方') return; // 只匯入我方玩家進成員資料庫
    if(existingNames.has(p.name)) return;

    const job = jobByName(p.job);
    members.push({
      id: uid(),
      name: p.name,
      jobId: job ? job.id : '',
      team: '候補',
      status: '一般成員',
      note: '由比賽紀錄匯入自動新增',
      skills: [],
      baijia: [],
      createdAt: Date.now(),
    });
    existingNames.add(p.name);
    added++;
  });

  if(added>0) S.setMembers(members);
  return added;
}
