// === 状態管理 ===
let transcriptBuffer = [];
let isObserving = false;

// ★テスト用追加変数
let autoModeEnabled = false; // トグルスイッチの状態
let lastCharCount = 0;       // 話速計算用
let lastAutoTriggerTime = 0; // 連続発動を防ぐクールダウン用

const INTENTS = [
  { id: 'repeat',  label: '🔊 聞き逃し', icon: '🔊', key: '1' },
  { id: 'explain', label: '📖 意味確認', icon: '📖', key: '2' },
  { id: 'timing',  label: '✋ 質問許可', icon: '✋', key: '5' },
  { id: 'chat',    label: '💬 その他',   icon: '💬', key: '0' }
];

// === 1. UIの作成 ===
function createUI() {
  if (document.getElementById('repair-assist-container')) return;

  const container = document.createElement('div');
  container.id = 'repair-assist-container';

  // タイトル
  const title = document.createElement('div');
  title.className = 'repair-title';
  title.innerText = '話者速度計測付きAI';
  container.appendChild(title);

  // ダッシュボード（信号機＋トグル）
  const dashboard = document.createElement('div');
  dashboard.className = 'dashboard-area';
  dashboard.innerHTML = `
    <div class="signal-row">
      <div id="traffic-light" class="signal-light status-green"></div>
      <div id="signal-msg" class="signal-text">良好: 安定しています</div>
    </div>
    <div class="toggle-row">
      <span>AI自動提案モード</span>
      <label class="switch">
        <input type="checkbox" id="auto-toggle">
        <span class="slider"></span>
      </label>
    </div>
  `;
  container.appendChild(dashboard);

  // ステータス
  const statusBox = document.createElement('div');
  statusBox.className = 'repair-status';
  statusBox.id = 'repair-status';
  statusBox.innerText = '待機中...';
  container.appendChild(statusBox);

  // ボタンエリア
  const grid = document.createElement('div');
  grid.className = 'button-grid';
  INTENTS.forEach(intent => {
    const btn = document.createElement('button');
    btn.className = 'intent-btn';
    btn.id = `btn-${intent.id}`;
    btn.innerHTML = `<span class="btn-icon">${intent.icon}</span> <span class="btn-label">${intent.label}</span>`;
    btn.addEventListener('click', () => handleIntent(intent.id));
    grid.appendChild(btn);
  });
  container.appendChild(grid);

  // 候補表示エリア
  const candidateArea = document.createElement('div');
  candidateArea.id = 'candidate-area';
  candidateArea.style.display = 'none';
  container.appendChild(candidateArea);

  document.body.appendChild(container);
  makeDraggable(container);

  // トグルのイベントリスナー
  document.getElementById('auto-toggle').addEventListener('change', (e) => {
    autoModeEnabled = e.target.checked;
    console.log("自動提案モード:", autoModeEnabled ? "ON" : "OFF");
  });

  // 分析ループ開始（3秒ごと）
  setInterval(analyzeContext, 3000);
}

// === 2. UIをドラッグ可能にする ===
function makeDraggable(el) {
  let isDragging = false;
  let startX, startY, initialX, initialY;
  
  const titleBar = el.querySelector('.repair-title');
  if (!titleBar) return;
  titleBar.style.cursor = 'move';

  titleBar.addEventListener('mousedown', (e) => {
    isDragging = true;
    startX = e.clientX;
    startY = e.clientY;
    const rect = el.getBoundingClientRect();
    initialX = rect.left;
    initialY = rect.top;
    e.preventDefault();
  });

  document.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    el.style.left = `${initialX + dx}px`;
    el.style.top = `${initialY + dy}px`;
    el.style.bottom = 'auto'; 
    el.style.right = 'auto';  
  });

  document.addEventListener('mouseup', () => { isDragging = false; });
}

// === 3. AIにリクエストを送る ===
function handleIntent(intentId) {
  const statusBox = document.getElementById('repair-status');
  const candidateArea = document.getElementById('candidate-area');
  if (!statusBox || !candidateArea) return;

  const contextText = transcriptBuffer.join(" ");
  if (!contextText.trim()) {
    statusBox.innerText = "字幕がまだありません";
    return;
  }

  statusBox.innerText = "生成中...";
  candidateArea.style.display = 'block';
  candidateArea.innerHTML = '<div style="font-size: 11px; color: #666; text-align:center;">AIが質問を作成しています...</div>';

  chrome.runtime.sendMessage({
    type: "CALL_AI",
    text: contextText,
    intent: intentId
  }, (response) => {
    if (chrome.runtime.lastError || !response || !response.success) {
       statusBox.innerText = "エラーが発生しました";
       candidateArea.innerHTML = `<div style="color:red; font-size:11px;">${chrome.runtime.lastError ? chrome.runtime.lastError.message : 'Unknown Error'}</div>`;
       return;
    }
    statusBox.innerText = "候補を選択してください";
    showCandidates(response.data);
  });
}

// === 4. 候補を表示する ===
function showCandidates(aiResponseText) {
  const candidateArea = document.getElementById('candidate-area');
  if (!candidateArea) return;

  candidateArea.innerHTML = '';
  const lines = aiResponseText.split('\n').filter(line => line.trim().length > 0);
  
  lines.forEach(line => {
    const cleanText = line.replace(/^[\-\*\d\.\s]+/, '');
    if (!cleanText) return;

    const btn = document.createElement('button');
    btn.style.cssText = "display:block; width:100%; text-align:left; margin-bottom:5px; padding:8px; border:1px solid #4285f4; background:#fff; border-radius:4px; cursor:pointer; font-size:12px; transition:background 0.2s;";
    btn.innerText = cleanText;
    
    btn.onmouseover = () => btn.style.background = "#e8f0fe";
    btn.onmouseout = () => btn.style.background = "#fff";
    btn.onclick = () => {
      alert("発言案をコピーしました:\n" + cleanText); 
      candidateArea.style.display = 'none';
      document.getElementById('repair-status').innerText = '待機中...';
    };
    candidateArea.appendChild(btn);
  });

  const closeBtn = document.createElement('button');
  closeBtn.innerText = 'キャンセル';
  closeBtn.style.cssText = "display:block; width:100%; margin-top:5px; padding:5px; border:none; background:#eee; border-radius:4px; cursor:pointer; font-size:11px;";
  closeBtn.onclick = () => {
    candidateArea.style.display = 'none';
    document.getElementById('repair-status').innerText = '待機中...';
  };
  candidateArea.appendChild(closeBtn);
}

// === 5. 字幕の監視（★ここを強力に修正しました） ===
function startSubtitleObserver() {
  if (isObserving) return;
  const isTeams = location.hostname.includes("teams");
  const observerConfig = { childList: true, subtree: true, characterData: true };
  
  const observer = new MutationObserver((mutations) => {
    let textUpdated = false;
    let latestText = "";

    mutations.forEach((mutation) => {
      let target = mutation.target;
      // テキストノードの場合は親要素を取得する
      if (target.nodeType === 3) target = target.parentNode;
      
      // closest が使えない要素（SVGなど）は無視
      if (!target || !target.closest) return;

      // Meet と Teams の字幕コンテナのクラスを幅広く指定
      const subtitleNode = target.closest('.CNusmb, .iTTPOb, .VbkSUe, .a4cQT, .Ts1k1e, .ui-chat__message__content, .fui-StyledText');

      if (subtitleNode) {
        latestText = subtitleNode.textContent.trim();
        textUpdated = true;
      }
    });

    // 変化があり、かつテキストが存在する場合のみバッファに追加
    if (textUpdated && latestText) {
      if (transcriptBuffer[transcriptBuffer.length - 1] !== latestText) {
        transcriptBuffer.push(latestText);
        
        const statusBox = document.getElementById('repair-status');
        const candidateArea = document.getElementById('candidate-area');
        
        if(statusBox && (!candidateArea || candidateArea.style.display === 'none')) {
            // 文字が長すぎる場合は省略して表示
            statusBox.innerText = `認識中: ${latestText.substring(0, 15)}...`;
        }
        
        // 履歴が増えすぎないように維持
        if (transcriptBuffer.length > 30) transcriptBuffer.shift();
      }
    }
  });

  observer.observe(document.body, observerConfig);
  isObserving = true;
  console.log(isTeams ? "Teams字幕監視スタート" : "Meet字幕監視スタート");
}

// === 6. 難易度分析と自動発動ロジック ===
function analyzeContext() {
  if (transcriptBuffer.length === 0) return;

  const currentTotalLength = transcriptBuffer.join("").length;
  // 今回の文字数から前回の文字数を引いて、3秒間に増えた文字数を出す
  const increasedChars = currentTotalLength - lastCharCount;
  
  // マイナスになる場合（バッファが切り捨てられた時など）は0にする
  const validChars = Math.max(0, increasedChars);
  lastCharCount = currentTotalLength;
  
  const cps = validChars / 3.0; // 秒間文字数 (Characters Per Second)

  let score = 0;
  let msg = "良好: 安定しています";
  let lightClass = "status-green";

  // ※テスト用に閾値を少し低くしています（早口テストしやすくするため）
  if (cps > 15) {
      score = 2;//赤信号になる
      msg = `警告: 早すぎます (${cps.toFixed(1)}字/秒)`;
      lightClass = "status-red";
  } else if (cps > 10) {
      score = 1;//黄色信号になる
      msg = `注意: ペース上昇 (${cps.toFixed(1)}字/秒)`;
      lightClass = "status-yellow";
  }

  const light = document.getElementById('traffic-light');
  const msgEl = document.getElementById('signal-msg');
  if (light && msgEl) {
      light.className = `signal-light ${lightClass}`;
      msgEl.innerText = msg;
  }

  // 自動モードON かつ 赤信号 かつ 15秒のクールダウンが明けている場合
  const now = Date.now();
  if (autoModeEnabled && score >= 2 && (now - lastAutoTriggerTime > 15000)) {
      console.log("🚨 自動でAIを呼び出します");
      lastAutoTriggerTime = now;
      
      const candidateArea = document.getElementById('candidate-area');
      // すでに候補が開いていない時だけ発動する
      if (candidateArea && candidateArea.style.display === 'none') {
          handleIntent('explain'); // 「意味確認」を自動発射
      }
  }
}

// === 7. 起動イベント群 ===
document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    const intent = INTENTS.find(i => i.key === e.key);
    if (intent) document.getElementById(`btn-${intent.id}`)?.click();
});

window.addEventListener('load', () => {
  setTimeout(() => { createUI(); startSubtitleObserver(); }, 2000);
});

let lastUrl = location.href; 
new MutationObserver(() => {
  if (location.href !== lastUrl) {
    lastUrl = location.href;
    setTimeout(() => { createUI(); startSubtitleObserver(); }, 2000);
  }
}).observe(document, {subtree: true, childList: true});