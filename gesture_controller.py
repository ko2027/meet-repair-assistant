import cv2
import mediapipe as mp
import pyautogui
import time
import threading
from flask import Flask, request, jsonify, make_response
import logging
from PIL import Image, ImageDraw, ImageFont
import numpy as np
import os # ファイル存在確認用

# === 設定エリア ===
HOLD_FRAMES = 10     # 感度調整
COOLDOWN_SEC = 2.0   # 連打防止
SERVER_PORT = 5001   # ポート5001固定

# === フォント自動検索機能 ===
def get_japanese_font_path():
    # Macで可能性のある日本語フォントのリスト
    candidates = [
        "/System/Library/Fonts/ヒラギノ角ゴシック W4.ttc",
        "/System/Library/Fonts/Hiragino Sans GB.ttc",
        "/System/Library/Fonts/ヒラギノ角ゴシック W3.ttc",
        "/Library/Fonts/Arial Unicode.ttf",
        "/System/Library/Fonts/AppleGothic.ttf"
    ]
    for path in candidates:
        if os.path.exists(path):
            print(f"✅ フォント読み込み成功: {path}")
            return path
    print("⚠️ 日本語フォントが見つかりません。デフォルトを使用します。")
    return None

FONT_PATH = get_japanese_font_path()

# === Flaskサーバー ===
app = Flask(__name__)
log = logging.getLogger('werkzeug')
log.setLevel(logging.ERROR)

display_text = ""
text_timer = 0

# Chromeからの通信許可（CORS）対応
@app.route('/update_text', methods=['POST', 'OPTIONS'])
def update_text():
    # 1. 通信許可の確認（OPTIONSリクエスト）への対応
    if request.method == 'OPTIONS':
        response = make_response()
        response.headers.add("Access-Control-Allow-Origin", "*")
        response.headers.add("Access-Control-Allow-Headers", "*")
        response.headers.add("Access-Control-Allow-Methods", "POST, OPTIONS")
        return response

    # 2. 実際のデータ受信（POSTリクエスト）
    global display_text, text_timer
    try:
        data = request.json
        text = data.get('text', '')
        print(f"📩 受信: {text}")
        display_text = text
        text_timer = time.time()
        
        # 成功レスポンスにも許可証をつける
        response = jsonify({"status": "success"})
        response.headers.add("Access-Control-Allow-Origin", "*")
        return response, 200
    except Exception as e:
        print(f"エラー: {e}")
        return jsonify({"error": str(e)}), 500

def run_server():
    # サーバー起動
    app.run(port=SERVER_PORT, debug=False, use_reloader=False)

t = threading.Thread(target=run_server, daemon=True)
t.start()

# === MediaPipe ===
mp_hands = mp.solutions.hands
hands = mp_hands.Hands(
    max_num_hands=1,
    min_detection_confidence=0.7,
    min_tracking_confidence=0.5
)
mp_draw = mp.solutions.drawing_utils
cap = cv2.VideoCapture(0) 

history = []
last_trigger_time = 0

print(f"\n=== システム起動完了 (Port: {SERVER_PORT}) ===")
print("👉 Google Meetの画面をクリックして、手前に表示してください！\n")

def count_fingers(landmarks):
    fingers = []
    # 親指
    if landmarks[4].x < landmarks[3].x: fingers.append(1)
    else: fingers.append(0)
    
    # 人差し指〜小指
    tips = [8, 12, 16, 20]
    pips = [6, 10, 14, 18]
    for t, p in zip(tips, pips):
        if landmarks[t].y < landmarks[p].y: fingers.append(1)
        else: fingers.append(0)
            
    total = sum(fingers)
    if fingers[1] == 1 and fingers[2] == 0 and fingers[3] == 0: return 1
    if fingers[1] == 1 and fingers[2] == 1 and fingers[3] == 0: return 2
    if total >= 4: return 5
    return 0

# 日本語描画関数
def putText_japanese(img, text, point, size, color):
    if not text:
        return img
    img_pil = Image.fromarray(cv2.cvtColor(img, cv2.COLOR_BGR2RGB))
    draw = ImageDraw.Draw(img_pil)
    try:
        if FONT_PATH:
            font = ImageFont.truetype(FONT_PATH, size)
        else:
            font = ImageFont.load_default()
    except Exception:
        font = ImageFont.load_default()
        
    draw.text(point, text, font=font, fill=color)
    return cv2.cvtColor(np.array(img_pil), cv2.COLOR_RGB2BGR)

try:
    while cap.isOpened():
        ret, frame = cap.read()
        if not ret: break

        frame = cv2.flip(frame, 1)
        rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        results = hands.process(rgb_frame)

        current_fingers = 0
        if results.multi_hand_landmarks:
            for hand_landmarks in results.multi_hand_landmarks:
                mp_draw.draw_landmarks(frame, hand_landmarks, mp_hands.HAND_CONNECTIONS)
                current_fingers = count_fingers(hand_landmarks.landmark)

        history.append(current_fingers)
        if len(history) > HOLD_FRAMES: history.pop(0)

        if len(history) == HOLD_FRAMES and all(x == current_fingers for x in history):
            detected_gesture = current_fingers
        else:
            detected_gesture = 0

        now = time.time()
        
        # === ジェスチャー発火 ===
        if detected_gesture in [1, 2, 5] and (now - last_trigger_time > COOLDOWN_SEC):
            target_key = str(detected_gesture)
            print(f"👉 ジェスチャー: {detected_gesture}本 -> キー[{target_key}]")
            pyautogui.press(target_key)
            last_trigger_time = now
            cv2.rectangle(frame, (0, 0), (640, 480), (0, 255, 0), 20)

        # === テキスト表示 ===
        if now - text_timer < 10 and display_text != "":
            h, w, _ = frame.shape
            # 黒背景
            cv2.rectangle(frame, (0, h - 120), (w, h), (0, 0, 0), -1)
            # 文字描画
            frame = putText_japanese(frame, display_text, (20, h - 80), 40, (255, 255, 255))

        # ステータス表示
        cv2.putText(frame, f"Detect: {current_fingers}", (10, 50), 
                    cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 255, 0), 2)
        
        if now - last_trigger_time < COOLDOWN_SEC:
             cv2.putText(frame, "Wait...", (10, 90), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 255), 2)

        cv2.imshow('Gesture Controller (Share This Window)', frame)

        if cv2.waitKey(1) & 0xFF == ord('q'): break

except KeyboardInterrupt:
    pass
finally:
    cap.release()
    cv2.destroyAllWindows()