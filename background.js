// === background.js (裏方) ===

// ★ここにAPIキーを入れてください
const API_KEY = "ここにAPIキー"
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === "CALL_AI") {
    // request.intent (意図) を受け取って処理を分岐
    callOpenAI(request.text, request.intent).then(aiResponse => {
      sendResponse({ success: true, data: aiResponse });
    }).catch(error => {
      sendResponse({ success: false, error: error.message });
    });
    return true; 
  }
});

async function callOpenAI(contextText, intent) {
  // 意図に応じた指示（プロンプト）を作る
  let systemInstruction = "";

  if (intent === "repeat") {
    systemInstruction = "参加者が『聞き逃した』『もう一度聞きたい』と感じています。直近の発言をやんわりと聞き返すための短いフレーズを3つ生成してください。";
  } else if (intent === "explain") {
    systemInstruction = "参加者が『言葉の意味が分からない』『専門用語を知りたい』と感じています。直近の単語や文脈について、教えを請うための短いフレーズを3つ生成してください。";
  } else if (intent === "timing") {
    systemInstruction = "参加者が『発言したいがタイミングが難しい』と感じています。会話の腰を折らずに、発言の許可を求めるための短いフレーズを3つ生成してください。";
  } else {
    systemInstruction = "会議の流れを止めずに質問するための短いフレーズを3つ生成してください。";
  }

  const prompt = `
あなたは聴覚障害者の会議参加支援AIです。
【状況】
${systemInstruction}
返答はフレーズのみを箇条書きで出力してください。

【会議の文脈】
${contextText}
`;

  // ... 以下は前回と同じ通信処理 ...
  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${API_KEY}`
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.7
      })
    });

    const data = await response.json();
    if (data.error) throw new Error(data.error.message);
    return data.choices[0].message.content;
    
  } catch (err) {
    return "エラー: " + err.message;
  }
}