// ============================================================
// MODE & STORE
// ============================================================
let CUR_MODE = ''; // 'club' or 'guild'
const MODE_LABEL = { club: '俱樂部', guild: '幫戰' };

const S = {
  g:(k,d=null)=>{ try{const v=localStorage.getItem('gw_'+k);return v!==null?JSON.parse(v):d}catch{return d} },
  s:(k,v)=>{ try{localStorage.setItem('gw_'+k,JSON.stringify(v));return true}catch{return false} },
  // SHARED across modes
  members(){ return this.g('members',[]); },
  setMembers(v){ this.s('members',v); },
  skillList(){ return this.g('skill_list', DEFAULT_SKILLS.slice()); },
  setSkillList(v){ this.s('skill_list', v); },
  baijiaList(){ return this.g('baijia_list', DEFAULT_BAIJIA.slice()); },
  setBaijiaList(v){ this.s('baijia_list', v); },
  // PER-MODE (prefixed by CUR_MODE)
  k(key){ return CUR_MODE + '_' + key; },
  matches(){ return this.g(this.k('matches'),[]); },
  setMatches(v){ this.s(this.k('matches'),v); },
  events(){ return this.g(this.k('events'),[]); },
  setEvents(v){ this.s(this.k('events'),v); },
  signups(){ return this.g(this.k('signups'),{}); },
  setSignups(v){ this.s(this.k('signups'),v); },
  config(){ return this.g('config',{}); },
  setConfig(v){ this.s('config',v); },
};
