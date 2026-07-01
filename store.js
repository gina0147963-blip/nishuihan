// ============================================================
// MODE & STORE
// ============================================================
let CUR_MODE = ''; // 'club' or 'guild'
const MODE_LABEL = { club: '俱樂部', guild: '幫戰' };

const S = {
  g:(k,d=null)=>{
    try{
      const v=localStorage.getItem('gw_'+k);
      return v!==null?JSON.parse(v):d;
    }catch(e){
      console.warn('讀取本機資料失敗 ['+k+']:', e.message);
      return d;
    }
  },
  s:(k,v)=>{
    try{
      localStorage.setItem('gw_'+k,JSON.stringify(v));
      return true;
    }catch(e){
      console.error('儲存本機資料失敗 ['+k+']:', e.message);
      // 常見原因：無痕模式封鎖儲存、或裝置儲存空間已滿
      toast('⚠️ 資料儲存失敗，請確認瀏覽器未開啟無痕模式，且裝置有足夠儲存空間','err');
      return false;
    }
  },
  // SHARED across modes
  members(){ return this.g('members',[]); },
  setMembers(v){ return this.s('members',v); },
  skillList(){ return this.g('skill_list', DEFAULT_SKILLS.slice()); },
  setSkillList(v){ return this.s('skill_list', v); },
  baijiaList(){ return this.g('baijia_list', DEFAULT_BAIJIA.slice()); },
  setBaijiaList(v){ return this.s('baijia_list', v); },
  // PER-MODE (prefixed by CUR_MODE)
  k(key){ return CUR_MODE + '_' + key; },
  matches(){ return this.g(this.k('matches'),[]); },
  setMatches(v){ return this.s(this.k('matches'),v); },
  events(){ return this.g(this.k('events'),[]); },
  setEvents(v){ return this.s(this.k('events'),v); },
  signups(){ return this.g(this.k('signups'),{}); },
  setSignups(v){ return this.s(this.k('signups'),v); },
  config(){ return this.g('config',{}); },
  setConfig(v){ return this.s('config',v); },
};
