// ============================================================
// DATA — JOBS
// ============================================================
const JOBS = [
  {id:'jiuling',  name:'九靈',  color:'#7c4dbf', icon:'🦊', img:1},
  {id:'longyin',  name:'龍吟',  color:'#45c08c', icon:'🐉', img:1},
  {id:'shenxiang',name:'神相',  color:'#3d5bdb', icon:'🔥', img:1},
  {id:'suwen',    name:'素問',  color:'#f2a7bb', icon:'☯', img:1},
  {id:'suimeng',  name:'碎夢',  color:'#7ba3b0', icon:'⚔', img:1},
  {id:'tieyi',    name:'鐵衣',  color:'#e8a33d', icon:'🛡', img:1},
  {id:'xehe',     name:'血河',  color:'#c0392b', icon:'🩸', img:1},
  {id:'xuanji',   name:'玄機',  color:'#9a9a52', icon:'🪽', img:1},
  {id:'chaoguang',name:'潮光',  color:'#6db3d9', icon:'🌊', img:1},
];
const TEAMS = [
  {id:'attack', name:'進攻', cls:'tb-atk'},
  {id:'defense',name:'防守', cls:'tb-def'},
  {id:'guard',  name:'保鏢', cls:'tb-grd'},
  {id:'mobile', name:'機動', cls:'tb-mob'},
  {id:'reserve',name:'候補', cls:'tb-rsv'},
];
// Default skill lists (admin-editable, shared across both modes)
const DEFAULT_SKILLS = "碧落凝珠、冰火絕滅、殘心三絕劍、蒼冥無晝、長歌獻君、春華佑世、大鬧天宮、奪魄寶典、法天象地、繁花一夢、焚天·絕、蓋世訣、紅蓮焚夜、花縈凌波、灰燼冰河、劍破乾坤、劍嘯飛流、燼海焚蓮、淨世蓮華、九天雷引、鈞天浩意、狂發一怒、流風千刃、流風輕雲、鳴刃迭鋒、青劍鳴篁、神龍九現、太極圖、騰龍躍淵、天下無狗、天澤露華、萬劍訣·落英、萬想鷹揚、昀光神劍、星河落瀑、蝶舞清夢、劍魂衝霄、追魂".split("、");
const DEFAULT_BAIJIA = "碧雲問笛、不動禪心、猛虎出擊、龍馳雷淵、槍鋒烈魂、輝雪寒瑛、清弦鳴絕、拳撼山嶽、雲闊天流、彤光飛虹、貫破連城、雲影濯香、拂衣亂影、金戈浴火、祈月長明、劍蕩雲心、芳心妙癒、蠱靈醉夢、蜜語含香、霜天幽影、錦弦生蓮、醉攬月、鳳成天錦、孤刀斬影".split("、");
const ADMIN_PW = 'guild2024';
