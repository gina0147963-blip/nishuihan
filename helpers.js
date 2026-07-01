// ============================================================
// HELPERS
// ============================================================
function renderTagSel(boxId, options, selected){
  const box=document.getElementById(boxId); if(!box)return;
  box.innerHTML=options.map(s=>`<span class="stag${selected.includes(s)?' on':''}" onclick="this.classList.toggle('on')">${s}</span>`).join('');
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
