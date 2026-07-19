// ============================================================
// ADMIN: MATCHES — 匯入官方CSV，無手動新增
// ============================================================
let _editMatchId=null;
let _pendingImport=null;

function renderAdminMatches(pane){
  const matches=S.matches().slice().sort((a,b)=>(b.date||'').localeCompare(a.date||''));
  pane.innerHTML=`<div class="sec-head">
    <h2>📊 比賽紀錄（${ORG_LABEL()}）</h2>
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
        <div class="match-d">${(m.date||'').slice(0,10)} ／ ${m.type||''}</div>
        <div class="match-title">vs ${m.enemy||'未知對手'}</div>
        <div class="match-meta">我方 ${m.ourCount||0} 人 ／ 對方 ${m.enemyCount||0} 人${m.players?.length?' ／ 數據：'+m.players.length+'筆':''}</div>
        ${m.notes?`<div style="font-size:11px;color:var(--txt2);margin-top:3px">${m.notes}</div>`:''}
        ${(m.videos&&m.videos.length)?`<div style="margin-top:6px;display:flex;gap:10px;flex-wrap:wrap">${m.videos.map(v=>{
          const info=videoLabelFor(v);
          if(!info.url) return '';
          return `<a href="${info.url}" target="_blank" rel="noopener" style="font-size:13px;font-weight:700;color:var(--accent);text-decoration:underline">🎬 ${info.label}</a>`;
        }).join('')}</div>`:''}
      </div>
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;justify-content:center">
        <button class="btn btn-blue" onclick="openMatchDetail('${m.id}')" style="font-size:15px;padding:10px 18px">📊 數據</button>
        <button class="btn btn-outline sm" onclick="openMatchVideos('${m.id}')" title="新增或編輯此場比賽的影片網址（可多個，之後隨時補充）">🎬 影片</button>
        <button class="btn btn-red sm" onclick="deleteMatchById('${m.id}')">刪除</button>
      </div>
    </div>`;
  }).join(''):'<div class="empty"><div class="empty-ico">📊</div><p>尚無比賽紀錄，請匯入官方CSV</p></div>'}
  </div>`;
}

function deleteMatchById(id){
  if(!confirm('確定刪除此比賽紀錄？')) return;
  if(typeof _addTomb==='function') _addTomb('matches', id);
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

      // 判斷哪一區塊是「我方」：多重訊號依序判定，避免猜錯導致對方整隊被加進我方成員
      let ourBlock=null, enemyBlock=null, detectBy='';
      // 訊號1：檔名裡的我方俱樂部名稱
      if(fileInfo && parsed.blockA.clubName===fileInfo.ourClub){
        ourBlock=parsed.blockA; enemyBlock=parsed.blockB; detectBy='檔名';
      } else if(fileInfo && parsed.blockB.clubName===fileInfo.ourClub){
        ourBlock=parsed.blockB; enemyBlock=parsed.blockA; detectBy='檔名';
      }
      // 訊號2：區塊名稱直接等於本組織名稱
      if(!ourBlock){
        const orgName=ORG_LABEL();
        if(parsed.blockA.clubName===orgName){ ourBlock=parsed.blockA; enemyBlock=parsed.blockB; detectBy='組織名稱'; }
        else if(parsed.blockB.clubName===orgName){ ourBlock=parsed.blockB; enemyBlock=parsed.blockA; detectBy='組織名稱'; }
      }
      // 訊號3（最可靠）：比對成員資料庫——哪個區塊裡「已知成員」比較多，哪個就是我方
      if(!ourBlock){
        const known=new Set();
        S.members().forEach(m=>{ known.add(m.name); (m.aliases||[]).forEach(a=>known.add(a)); });
        const hitA=parsed.blockA.players.filter(p=>known.has(p.name)).length;
        const hitB=parsed.blockB.players.filter(p=>known.has(p.name)).length;
        if(hitA>hitB){ ourBlock=parsed.blockA; enemyBlock=parsed.blockB; detectBy='成員比對（'+hitA+' vs '+hitB+'）'; }
        else if(hitB>hitA){ ourBlock=parsed.blockB; enemyBlock=parsed.blockA; detectBy='成員比對（'+hitB+' vs '+hitA+'）'; }
      }
      // 訊號4：全部無法判定 → 直接詢問管理員，不再盲猜
      if(!ourBlock){
        const pickA=confirm('⚠️ 無法自動判斷哪一邊是我方，請確認：\n\n【確定】= 「'+parsed.blockA.clubName+'」（'+parsed.blockA.players.length+'人）是我方\n【取消】= 「'+parsed.blockB.clubName+'」（'+parsed.blockB.players.length+'人）是我方');
        if(pickA){ ourBlock=parsed.blockA; enemyBlock=parsed.blockB; }
        else { ourBlock=parsed.blockB; enemyBlock=parsed.blockA; }
        detectBy='手動選擇';
      }
      console.log('我方區塊判定方式:', detectBy, '→', ourBlock.clubName);

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
      <div class="fg full"><label>⚠️ 比賽日期（CSV檔名日期未必正確，請確認實際比賽日期）</label><input id="ic-date" class="fi" type="date" value="${p.date}"></div>
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
  try{
  if(!_pendingImport){ toast('匯入資料已失效，請重新選擇檔案','err'); return; }
  const p=_pendingImport;
  const date=document.getElementById('ic-date').value || p.date;
  const result=document.getElementById('ic-result').value;

  // 1) 自動把新出現的玩家加入成員資料庫
  const newlyAdded = autoAddMembersFromImport(p.players);

  // 2) 寫入比賽紀錄（若同一天已有同對手的紀錄，詢問是否覆蓋；否則新增）
  let matches=S.matches();
  const existing = matches.find(m=>String(m.date||'').slice(0,10)===String(date).slice(0,10) && m.enemy===p.enemyClubName);
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
    updatedAt:Date.now(),
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
  }catch(err){ console.error(err); toast('❌ 匯入失敗：'+err.message,'err'); }
}

function cancelImport(){
  _pendingImport=null;
  closeModal('modal-import-confirm');
}

// 將匯入資料中「我方」玩家自動加入成員資料庫（對方玩家不加入，避免污染自家成員清單）
function autoAddMembersFromImport(allPlayers){
  const members = S.members();
  // 比對現有成員時，把「曾用名」也納入：玩家改名後，含舊名字的戰報不會再被誤判為新玩家而重複建立
  const existingNames = new Set();
  members.forEach(m=>{ existingNames.add(m.name); (m.aliases||[]).forEach(a=>existingNames.add(a)); });
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


// ============================================================
// 比賽數據檢視（依官方戰報欄位）
// ============================================================
let _mdId=null,_mdSortKey='pDamage',_mdSortDir=-1;
const MD_COLS=[['job','職業'],['kills','擊敗'],['assist','助攻'],['resource','資源'],['pDamage','對玩家傷害'],['bDamage','對建築傷害'],['heal','治療值'],['taken','承受傷害'],['hurt','重傷'],['revive','化羽/清泉'],['burn','焚骨']];
function openMatchDetail(id){ _mdId=id; _mdSortKey='pDamage'; _mdSortDir=-1; renderMatchDetail(); openModal('modal-match-detail'); }
function mdSort(key){ if(_mdSortKey===key){_mdSortDir*=-1;}else{_mdSortKey=key;_mdSortDir=-1;} renderMatchDetail(); }
function renderMatchDetail(){
  const m=S.matches().find(x=>x.id===_mdId); if(!m) return;
  const jobColor=name=>{ const mem=S.members().find(x=>x.name===name); if(mem)return jobById(mem.jobId).color; const jb=jobByName((m.players||[]).find(p=>p.name===name)?.job); return jb?jb.color:'#e8eaf6'; };
  const arrow=k=>_mdSortKey===k?(_mdSortDir<0?' ▼':' ▲'):'';
  const section=(camp,label)=>{
    let rows=(m.players||[]).filter(pl=>pl.camp===camp);
    rows.sort((a,b)=>{ const va=a[_mdSortKey],vb=b[_mdSortKey]; if(_mdSortKey==='job'){return String(va||'').localeCompare(String(vb||''))*(_mdSortDir);} return ((vb||0)-(va||0))*(-_mdSortDir<0?1:1)*(_mdSortDir<0?1:-1); });
    // 修正排序方向
    rows=(m.players||[]).filter(pl=>pl.camp===camp).slice().sort((a,b)=>{
      if(_mdSortKey==='job'){ return String(a.job||'').localeCompare(String(b.job||''))*_mdSortDir; }
      return ((a[_mdSortKey]||0)-(b[_mdSortKey]||0))*_mdSortDir;
    });
    if(!rows.length) return '';
    return `<h4 style="margin:10px 0 6px">${label}（${rows.length}人）</h4>
    <div class="tbl-wrap"><table style="font-size:11px">
      <thead><tr><th onclick="mdSort('name')" style="cursor:pointer">玩家</th>${MD_COLS.map(c=>`<th onclick="mdSort('${c[0]}')" style="cursor:pointer;white-space:nowrap">${c[1]}${arrow(c[0])}</th>`).join('')}</tr></thead>
      <tbody>${rows.map(pl=>`<tr><td style="white-space:nowrap"><strong style="color:${jobColor(pl.name)}">${pl.name}</strong></td>${MD_COLS.map(c=>`<td>${c[0]==='job'?(pl.job||''):fmtNum(pl[c[0]]||0)}</td>`).join('')}</tr>`).join('')}</tbody>
    </table></div>`;
  };
  document.getElementById('match-detail-body').innerHTML=`
    <div style="margin-bottom:8px;font-size:13px"><b>${(m.date||'').slice(0,10)}</b> ／ vs ${m.enemy||''} ／ <span style="color:${m.result==='勝利'?'var(--ok)':'var(--bad)'}">${m.result||''}</span></div>
    <p class="hint" style="margin-bottom:6px">點欄位標題可排序</p>
    ${section('我方','🔵 我方')}${section('對方','🔴 對方')}
    ${!(m.players||[]).length?'<p class="hint">此紀錄無詳細數據</p>':''}`;
}


// ============================================================
// 比賽影片網址（可多個、可留空、可隨時補充，不影響CSV匯入流程）
// ============================================================
let _videoEditId=null;
// 影片視窗改由程式動態建立：即使 index.html 是舊版（沒有這個視窗）也能正常運作，
// 避免出現 "Cannot read properties of null" 的錯誤
function _ensureVideoModal(){
  if(document.getElementById('modal-match-videos')) return;
  const div=document.createElement('div');
  div.id='modal-match-videos';
  div.className='modal-ov hidden';
  div.innerHTML=`<div class="modal">
    <div class="modal-hd"><h3>🎬 比賽影片</h3><button class="close-btn" onclick="closeModal('modal-match-videos')">✕</button></div>
    <div class="modal-body">
      <p class="hint" style="margin-bottom:8px">每則影片都要填「成員視角」與「所屬團隊」，方便日後查找特定玩家的視角。整列都留空的話儲存時會自動略過。</p>
      <div id="video-rows"></div>
      <button class="btn btn-outline sm" onclick="addVideoRow()" style="margin-top:8px">+ 新增一列</button>
    </div>
    <div class="modal-ft">
      <button class="btn btn-outline" onclick="closeModal('modal-match-videos')">取消</button>
      <button class="btn btn-blue" onclick="saveMatchVideos()">儲存</button>
    </div>
  </div>`;
  document.body.appendChild(div);
}
// 產生單一列的 HTML：網址輸入框＋成員名稱（可搜尋，帶清單）＋團隊下拉
function _videoRowHtml(v, rowId){
  const url=(v&&v.url)||(typeof v==='string'?v:'')||'';
  const name=(v&&v.name)||'';
  const team=(v&&v.team)||'';
  const m=S.matches().find(x=>x.id===_videoEditId);
  // 成員名稱清單：優先列出這場比賽我方參戰玩家，方便快速選取；也可直接手動輸入其他名字
  const participants=(m&&m.participants)||[];
  const dlId='video-names-'+rowId;
  // 團隊選項：優先抓當天活動場次實際的團隊名稱；找不到就給預設的進攻/防守/機動
  const ev=m?S.events().find(e=>String(e.date||'').slice(0,10)===String(m.date||'').slice(0,10)):null;
  const teamOpts=(ev&&ev.teamNames&&ev.teamNames.length?ev.teamNames:['進攻','防守','機動']).concat(['候補']);
  return `<div class="video-row" data-row-id="${rowId}" style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-bottom:8px;padding:8px;border:1px solid var(--border);border-radius:8px">
    <input class="fi sm video-url" placeholder="影片網址" value="${url.replace(/"/g,'&quot;')}" style="flex:2 1 200px;min-width:0">
    <input class="fi sm video-name" list="${dlId}" placeholder="成員視角 *必填" value="${name.replace(/"/g,'&quot;')}" style="flex:1 1 110px;min-width:0" oninput="autoFillVideoTeam('${rowId}')">
    <datalist id="${dlId}">${participants.map(p=>`<option value="${p}">`).join('')}</datalist>
    <select class="fsel sm video-team" style="flex:1 1 90px;min-width:0">
      <option value="" disabled ${team?'':'selected'}>團隊 *必填</option>
      ${teamOpts.map(t=>`<option value="${t}" ${t===team?'selected':''}>${t}</option>`).join('')}
    </select>
    <button class="btn btn-outline xs" onclick="this.closest('.video-row').remove()">✕</button>
  </div>`;
}
// 選擇成員名稱後，自動帶出他在該場比賽當天的排表團隊（找不到就不動，讓管理員手動選）
function autoFillVideoTeam(rowId){
  const row=document.querySelector(`.video-row[data-row-id="${rowId}"]`);
  if(!row) return;
  const name=row.querySelector('.video-name').value.trim();
  const m=S.matches().find(x=>x.id===_videoEditId);
  if(!name||!m) return;
  const team=findPlayerTeamOnDate(name, m.date);
  if(team){ const sel=row.querySelector('.video-team'); if(sel) sel.value=team; }
}
function addVideoRow(v){
  const box=document.getElementById('video-rows'); if(!box) return;
  const rowId='r'+Date.now()+Math.random().toString(36).slice(2,6);
  box.insertAdjacentHTML('beforeend', _videoRowHtml(v||{}, rowId));
}
function openMatchVideos(id){
  const m=S.matches().find(x=>x.id===id); if(!m){ toast('找不到此紀錄','err'); return; }
  _ensureVideoModal();
  _videoEditId=id;
  const box=document.getElementById('video-rows');
  box.innerHTML='';
  const list=(m.videos&&m.videos.length)?m.videos:[{}];
  list.forEach(v=>addVideoRow(v));
  openModal('modal-match-videos');
}
async function saveMatchVideos(){
  const m=S.matches().find(x=>x.id===_videoEditId); if(!m){ toast('找不到此紀錄','err'); return; }
  const rows=[...document.querySelectorAll('#video-rows .video-row')];
  const videos=[];
  for(let i=0;i<rows.length;i++){
    const row=rows[i];
    let url=row.querySelector('.video-url').value.trim();
    if(!url) continue; // 整列都沒填網址的略過，不算錯誤
    if(!/^https?:\/\//i.test(url)) url='https://'+url; // 沒打協定的自動補上
    const name=row.querySelector('.video-name').value.trim();
    const team=row.querySelector('.video-team').value;
    // 有網址就一定要有成員視角與團隊，缺一就擋下儲存並標示是第幾列
    if(!name||!team){
      toast('⚠️ 第 '+(i+1)+' 列有網址，但「成員視角」或「團隊」還沒填，請補齊後再儲存','err');
      return;
    }
    videos.push({url, name, team});
  }
  const matches=S.matches();
  const idx=matches.findIndex(x=>x.id===_videoEditId);
  matches[idx]={...m, videos, updatedAt:Date.now()};
  S.setMatches(matches);
  closeModal('modal-match-videos');
  toast('儲存中，同步中...','');
  renderAdminMatches(document.getElementById('pane-a-matches'));
  const ok=await syncWriteNowFast();
  toast(ok===true?('✅ 已儲存 '+videos.length+' 個影片並同步'):'⚠️ 已儲存於本機，雲端同步失敗，背景將自動重試', ok===true?'ok':'err');
}


