// ============================================================
// QR 碼分享 — 讓成員免進管理端、免輸入網址，直接掃碼開啟登入頁
// 俱樂部／幫戰各自對應一組QR碼（網址帶 ?mode=club 或 ?mode=guild），
// 掃描後會自動跳過「選擇模式」畫面，直接進入該模式的登入頁，
// 再從清單點選或搜尋自己的角色名稱即可報名（見 app.js 的 loginSuggest）。
// ============================================================

function _qrShareUrl(){
  return location.origin + location.pathname + '?mode=' + CUR_MODE;
}

function openQRModal(){
  const url = _qrShareUrl();
  const label = MODE_LABEL[CUR_MODE] || CUR_MODE;
  document.getElementById('qr-mode-label').textContent = label;
  document.getElementById('qr-mode-label2').textContent = label;
  document.getElementById('qr-url-text').textContent = url;

  const box = document.getElementById('qr-canvas-box');
  box.innerHTML = '';
  try {
    if (typeof QRCode === 'undefined') throw new Error('QRCode 函式庫尚未載入');
    // eslint-disable-next-line no-new
    new QRCode(box, {
      text: url,
      width: 220,
      height: 220,
      colorDark: '#000000',
      colorLight: '#ffffff',
      correctLevel: QRCode.CorrectLevel.M,
    });
  } catch (err) {
    console.error('QR碼產生失敗:', err);
    box.innerHTML = '<p style="color:var(--bad);padding:20px;font-size:13px">⚠️ QR碼產生失敗，請確認網路連線正常後重新開啟本視窗（QR函式庫需要從網路載入）</p>';
  }
  openModal('modal-qrcode');
}

function copyQRLink(){
  const url = _qrShareUrl();
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(url).then(
      () => toast('連結已複製', 'ok'),
      () => _qrFallbackCopy(url)
    );
  } else {
    _qrFallbackCopy(url);
  }
}

function _qrFallbackCopy(text){
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    toast('連結已複製', 'ok');
  } catch (err) {
    toast('複製失敗，請手動選取連結文字', 'err');
  }
}

function downloadQRImage(){
  const box = document.getElementById('qr-canvas-box');
  const canvas = box.querySelector('canvas');
  const img = box.querySelector('img');
  let dataUrl = null;
  if (canvas) dataUrl = canvas.toDataURL('image/png');
  else if (img && img.src) dataUrl = img.src;

  if (!dataUrl) { toast('找不到QR圖片，請重新開啟視窗', 'err'); return; }

  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = '報名QR碼_' + (MODE_LABEL[CUR_MODE] || CUR_MODE) + '.png';
  a.click();
  toast('QR圖片已下載', 'ok');
}
