let transcriptBuffer = []; 
let isObserving = false;   

// === 意図のリスト ===
const INTENTS = [
  { id: 'repeat',  label: '🔊 聞き逃し', icon: '🔊' },
  { id: 'explain', label: '📖 意味確認', icon: '📖' },
  { id: 'timing',  label: '✋ 質問許可', icon: '✋' },
  { id: 'chat',    label: '💬 その他',   icon: '💬' }
];

function createUI() {
  if (document.getElementById('repair-assist-container')) return;

  const container = document.createElement('div');
  container.id = 'repair-assist-container';

  // タイトル
  const title = document.createElement('div');
  title.className = 'repair-title';
  title.innerText = '修復アシスト AI';
  container.appendChild(title);

  // ステータス
  const statusBox = document.createElement('div');
  statusBox.className = 'repair-status';
  statusBox.id = 'repair-status';
  statusBox.innerText = '待機中...';
  container.appendChild(statusBox);

  // --- ボタンエリア ---
  const grid = document.createElement('div');
  grid.className = 'button-grid';

  INTENTS.forEach(intent => {
    const btn = document.createElement('button');
    btn.className = 'intent-btn';
    btn.innerHTML = `${intent.icon} ${intent.label}`;
    btn.onclick = () => handleIntentClick(intent.id, btn);
    grid.appendChild(btn);
  });
  container.appendChild(grid);

  // 結果リストエリア
  const listArea = document.createElement('div');
  listArea.id = 'candidate-list';
  container.appendChild(listArea);

  document.body.appendChild(container);

  // ★ドラッグ機能を適用する（ここを追加！）
  makeDraggable(container);
}

// === ドラッグ移動を可能にする関数（新機能） ===
function makeDraggable(element) {
  let isDragging = false;
  let startX, startY, initialLeft, initialTop;

  element.addEventListener('mousedown', (e) => {
    // ボタンをクリックしたときはドラッグしない
    if (e.target.tagName === 'BUTTON') return;

    isDragging = true;
    startX = e.clientX;
    startY = e.clientY;

    // 現在の位置を取得
    const rect = element.getBoundingClientRect();
    initialLeft = rect.left;
    initialTop = rect.top;

    // 右下固定(bottom/right)を解除して、座標配置(top/left)に切り替える
    element.style.bottom = 'auto';
    element.style.right = 'auto';
    element.style.left = initialLeft + 'px';
    element.style.top = initialTop + 'px';
    
    element.style.cursor = 'grabbing'; // 掴んでいるカーソルに
  });

  document.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    element.style.left = (initialLeft + dx) + 'px';
    element.style.top = (initialTop + dy) + 'px';
  });

  document.addEventListener('mouseup', () => {
    isDragging = false;
    element.style.cursor = 'move';
  });
}

// === AIへのリクエスト処理 ===
function handleIntentClick(intentId, btnElement) {
  const listArea = document.getElementById('candidate-list');
  const context = transcriptBuffer.slice(-5).join("\n");
  
  if (!context) {
    listArea.innerHTML = "<div style='color:red; font-size:11px;'>まだ字幕がありません</div>";
    return;
  }

  const originalText = btnElement.innerText;
  btnElement.innerText = "生成中...";
  btnElement.disabled = true;
  listArea.innerHTML = "<div style='font-size:11px; color:#666;'>AIが考え中...</div>";

  chrome.runtime.sendMessage({ 
    type: "CALL_AI", 
    text: context,
    intent: intentId 
  }, (response) => {
    btnElement.innerText = originalText;
    btnElement.disabled = false;
    listArea.innerHTML = "";

    if (response && response.success) {
      const candidates = response.data.split('\n').filter(line => line.trim() !== "");
      candidates.forEach(text => {
        const cleanText = text.replace(/^[-・\d\.]+\s*/, "").trim();
        if(!cleanText) return;

        const candBtn = document.createElement('button');
        candBtn.className = 'candidate-btn';
        candBtn.innerText = cleanText;
        candBtn.onclick = () => {
          navigator.clipboard.writeText(cleanText).then(() => {
            candBtn.innerText = "✅ コピー済み";
            setTimeout(() => { candBtn.innerText = cleanText; }, 1000);
          });
        };
        listArea.appendChild(candBtn);
      });
    } else {
      listArea.innerText = "エラー発生";
    }
  });
}

// === 字幕監視 ===
function startSubtitleObserver() {
  if (isObserving) return;
  const observerConfig = { childList: true, subtree: true, characterData: true };
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      const target = mutation.target;
      if (target.nodeType === Node.TEXT_NODE && target.textContent.trim().length > 0) {
        const parent = target.parentElement;
        if (parent) {
            const parentClass = parent.className || "";
            if (parentClass.includes("VbkSUe") || parentClass.includes("iTTPOb") || parent.closest('[jscontroller="D1tHje"]')) {
              const newText = target.textContent.trim();
              if (transcriptBuffer.length === 0 || transcriptBuffer[transcriptBuffer.length - 1] !== newText) {
                transcriptBuffer.push(newText);
                const statusBox = document.getElementById('repair-status');
                if(statusBox) statusBox.innerText = `最新: ${newText.substring(0, 10)}...`;
              }
            }
        }
      }
    });
  });
  observer.observe(document.body, observerConfig);
  isObserving = true;
}

setTimeout(() => {
  createUI();
  startSubtitleObserver();
}, 3000);