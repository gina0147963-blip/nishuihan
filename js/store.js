// ============================================================
// MODE & ORG & STORE
// ============================================================
let CUR_MODE = ''; // 'club' or 'guild'
let CUR_ORG  = ''; // 組織代號，例如 'bycx'（白月燦星）
const MODE_LABEL = { club: '俱樂部', guild: '幫戰' };

// 沿用改版前本機資料的組織：舊版 key 是模式開頭（guild_/club_），
// 第一次進入時自動把舊資料搬到新 key，成員在舊裝置上的快取不會消失
// （白月燦星←幫戰、今朝←俱樂部）
const LEGACY_LOCAL_MAP = { bycx: 'guild', jinzhao: 'club' };

// 組織清單（由後端下載後快取於本機，離線時使用快取）
function orgList(){ return S.g('orgs', []); }
function setOrgList(v){ return S.s('orgs', v); }
function orgById(id){ return orgList().find(o=>o.id===id)||null; }
function orgsByMode(mode){ return orgList().filter(o=>o.mode===mode); }
// 目前組織的顯示名稱（各功能頁標題用），尚未載入清單時退回模式名稱
function ORG_LABEL(){ const o=orgById(CUR_ORG); return o?o.name:(MODE_LABEL[CUR_MODE]||''); }

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
  // 讀取「依組織存放」的資料；若該組織尚無資料且有舊版對應（白月燦星←guild_），自動搬移一次
  _gOrg(key, d){
    let v=this.g(this.k(key), null);
    if(v===null){
      const legacy=LEGACY_LOCAL_MAP[CUR_ORG];
      if(legacy){
        v=this.g(legacy+'_'+key, null);
        if(v!==null) this.s(this.k(key), v); // 搬移到新 key，之後就走新的
      }
    }
    return v!==null?v:d;
  },
  members(){ return this._gOrg('members', []) || []; },
  setMembers(v){ return this.s(this.k('members'),v); },
  skillList(){ return this.g('skill_list', DEFAULT_SKILLS.slice()); },
  setSkillList(v){ return this.s('skill_list', v); },
  baijiaList(){ return this.g('baijia_list', DEFAULT_BAIJIA.slice()); },
  setBaijiaList(v){ return this.s('baijia_list', v); },
  // PER-ORG（依組織代號前綴，各組織資料完全獨立）
  k(key){ return (CUR_ORG||CUR_MODE) + '_' + key; },
  matches(){ return this._gOrg('matches',[]); },
  setMatches(v){ return this.s(this.k('matches'),v); },
  events(){ return this._gOrg('events',[]); },
  setEvents(v){ return this.s(this.k('events'),v); },
  signups(){ return this._gOrg('signups',{}); },
  setSignups(v){ return this.s(this.k('signups'),v); },
  config(){ return this.g('config',{}); },
  setConfig(v){ return this.s('config',v); },
};
