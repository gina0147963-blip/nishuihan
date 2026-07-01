// ============================================================
// DATA — JOBS
// ============================================================
const JOBS = [
  {id:'jiuling',  name:'九靈',  color:'#a78bfa'},
  {id:'longyin',  name:'龍吟',  color:'#34d399'},
  {id:'shenxiang',name:'神相',  color:'#60a5fa'},
  {id:'suwen',    name:'素問',  color:'#f472b6'},
  {id:'suimeng',  name:'碎夢',  color:'#fb923c'},
  {id:'tieyi',    name:'鐵衣',  color:'#94a3b8'},
  {id:'xehe',     name:'血河',  color:'#ef4444'},
  {id:'xuanji',   name:'玄機',  color:'#facc15'},
  {id:'chaoguang',name:'潮光',  color:'#38bdf8'},
];
const TEAMS = [
  {id:'attack', name:'進攻', cls:'tb-atk'},
  {id:'defense',name:'防守', cls:'tb-def'},
  {id:'guard',  name:'保鏢', cls:'tb-grd'},
  {id:'mobile', name:'機動', cls:'tb-mob'},
  {id:'reserve',name:'候補', cls:'tb-rsv'},
];
// Default skill lists (admin-editable, shared across both modes)
const DEFAULT_SKILLS = "碧落凝珠、冰火滅絕、殘心三絕劍、蒼冥無晝、長歌獻君、春華佑世、大鬧天宮、奪魄寶典、法天象地、繁花一夢、焚天·絕、蓋世訣、紅蓮焚夜、花縈凌波、灰燼冰河、劍破乾坤、劍嘯飛流、燼海焚蓮、淨世蓮華、九天雷引、鈞天浩意、狂發一怒、流風千刃、流風輕雲、鳴刃迭鋒、青劍鳴篁、神龍九現、太極圖、騰龍躍淵、天下無狗、天澤露華、萬劍訣·落英、萬象鷹揚、曜光神劍、星河落天、蝶舞驚夢、劍魂衝霄、追魂".split("、");
const DEFAULT_BAIJIA = "碧雲問笛、不動禪心、猛虎出擊、龍馳雷淵、槍鋒烈魂、輝雪寒瑛、清弦鳴絕、拳撼山嶽、雲闊天流、彤光飛虹、貫破連城、雲影濯香、拂衣亂影、金戈浴火、祈月長明、劍蕩雲心、芳心妙癒、蠱靈醉夢、蜜語含香、霜天幽影、錦弦生蓮、醉攬月、鳳呈天錦、孤刀斬影".split("、");
const ADMIN_PW = 'guild2024';
