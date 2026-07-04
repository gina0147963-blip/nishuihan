// ============================================================
// ADMIN: SKILLS MANAGEMENT
// ============================================================
let _skillAddType=''; // 'skill' or 'baijia'
function renderAdminSkills(pane){
  const skills=S.skillList();
  const baijia=S.baijiaList();
  pane.innerHTML=`<div class="sec-head"><h2>🎴 技能設定</h2></div>
  <p class="hint">此清單為「絕技」與「群俠技能」的共用選項池，玩家在「我的資料」中只能從這裡勾選。新增/刪除項目會立即影響所有玩家可選範圍。</p>
  <div class="card">
    <div class="sec-head" style="margin-bottom:10px"><h3 style="font-size:14px;font-weight:700">絕技清單（${skills.length}）</h3><button class="btn btn-blue xs" onclick="openSkillAdd('skill')">+ 新增絕技</button></div>
    <div class="skill-manage-list" id="skill-manage-skills">
      ${skills.map(s=>`<span class="skill-manage-item">${s}<button onclick="removeSkillItem('skill','${s.replace(/'/g,"\\'")}')" title="刪除">✕</button></span>`).join('')}
    </div>
  </div>
  <div class="card">
    <div class="sec-head" style="margin-bottom:10px"><h3 style="font-size:14px;font-weight:700">群俠技能清單（${baijia.length}）</h3><button class="btn btn-blue xs" onclick="openSkillAdd('baijia')">+ 新增群俠技能</button></div>
    <div class="skill-manage-list" id="skill-manage-baijia">
      ${baijia.map(s=>`<span class="skill-manage-item">${s}<button onclick="removeSkillItem('baijia','${s.replace(/'/g,"\\'")}')" title="刪除">✕</button></span>`).join('')}
    </div>
  </div>`;
}
function openSkillAdd(type){
  _skillAddType=type;
  document.getElementById('skill-add-title').textContent = type==='skill'?'新增絕技':'新增群俠技能';
  document.getElementById('skill-add-input').value='';
  openModal('modal-skill-add');
}
function confirmAddSkill(){
  const val=document.getElementById('skill-add-input').value.trim();
  if(!val){toast('請輸入名稱','err');return;}
  const items=val.split(/[,，]/).map(s=>s.trim()).filter(Boolean);
  if(_skillAddType==='skill'){
    const list=S.skillList();
    let added=0;
    items.forEach(s=>{ if(!list.includes(s)){list.push(s);added++;} });
    S.setSkillList(list);
    toast(`已新增 ${added} 項絕技`,'ok');
  } else {
    const list=S.baijiaList();
    let added=0;
    items.forEach(s=>{ if(!list.includes(s)){list.push(s);added++;} });
    S.setBaijiaList(list);
    toast(`已新增 ${added} 項群俠技能`,'ok');
  }
  closeModal('modal-skill-add');
  renderAdminSkills(document.getElementById('pane-a-skills'));
}
function removeSkillItem(type, name){
  if(!confirm(`確定刪除「${name}」？已選擇此技能的成員資料不會自動移除。`))return;
  if(type==='skill'){
    S.setSkillList(S.skillList().filter(s=>s!==name));
  } else {
    S.setBaijiaList(S.baijiaList().filter(s=>s!==name));
  }
  toast('已刪除','ok');
  renderAdminSkills(document.getElementById('pane-a-skills'));
}
