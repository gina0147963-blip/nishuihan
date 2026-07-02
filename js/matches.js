// ============================================================
// ADMIN: MATCHES — 匯入官方CSV，無手動新增
// ============================================================
let _editMatchId=null;
let _pendingImport=null;

function renderAdminMatches(pane){
  const matches=S.matches().slice().reverse();
  pane.innerHTML=`<div class="sec-head">
    <h2>📊 比賽紀錄（${MODE_LABEL[CUR_MODE]}）</h2>
    <div class="sec-actions">
      <button class="btn btn-blue sm" onclick="document.getElementById('file-excel').click()">📥 匯入比賽紀錄(CSV)</button>
    </div>
  </div>
  <p class="hint">請匯入官方匯出的 CSV 檔案（檔名格式：日期_ID_我方俱樂部_對方俱樂部）。匯入後我方玩家會自動加入成員資料庫。</p>
  <div style="display:flex;flex-direction:column;gap:8px">
  ${matches.length?matches.map(m=>{
    const rc=m.result==='勝利'?'rb-win':m.result==='失敗'?'rb-lose':'rb-draw';
    const rl=m.result==='勝利'?'勝':m.result==='失敗'?'敗':m.result==='平局'?'平':'？';
    return `<div class="match-card">
      <div class="match-rbadge ${rc}">${rl}</div>
      <div class="match-info">
        <div class="match-d">${m.date||''} ／ ${m.type||''}</div>
        <div class="match-title">vs ${m.enemy||'未知對手'}</div>
        <div class="match-meta">我方 ${m.ourCount||0} 人 ／ 對方 ${m.enemyCount||0} 人${m.players?.length?' ／ 數據：'+m.players.length+'筆':''}</div>
        ${m.notes?`<div style="font-size:11px;color:var(--txt2);margin-top:3px">${m.notes}</div>`:''}
      </div>
      <button class="btn btn-red xs" onclick="deleteMatchById('${m.id}')">刪除</button>
    </div>`;
  }).join(''):'<div class="empty"><div class="empty-ico">📊</div><p>尚無比賽紀錄，請匯入官方CSV</p></div>'}
  </div>`;
}

function deleteMatchById(id){
  if(!confirm('確定刪除此比賽紀錄？')) return;
  S.setMatches(S.matches().filter(m=>m.id!==id));
  toast('已刪除','ok');
  renderAdminMatches(document.getElementById('pane-a-matches'));
}

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
