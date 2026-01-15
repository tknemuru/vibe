/**
 * Copyページ HTMLテンプレート
 * @description
 *   モバイル最優先のシンプルなCopyページを生成する。
 *   ユーザーがボタンをタップするとクリップボードにコピーされる。
 */

/**
 * HTMLをエスケープする
 * @param text - エスケープ対象のテキスト
 * @returns エスケープ済みテキスト
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * Copyページ成功時のHTMLを生成する
 * @param promptText - コピー対象のプロンプトテキスト
 * @returns HTML文字列
 */
export function renderCopyPage(promptText: string): string {
  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Copy Prompt - Vibe</title>
  <style>
    * { box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      margin: 0;
      padding: 20px;
      background: #f5f5f5;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
    }
    .container {
      max-width: 400px;
      width: 100%;
      background: #fff;
      border-radius: 16px;
      padding: 24px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.1);
    }
    h1 {
      font-size: 18px;
      margin: 0 0 16px;
      color: #333;
      text-align: center;
    }
    .prompt-text {
      background: #f8f9fa;
      border: 1px solid #e0e0e0;
      border-radius: 8px;
      padding: 16px;
      font-size: 13px;
      line-height: 1.6;
      white-space: pre-wrap;
      word-break: break-word;
      max-height: 200px;
      overflow-y: auto;
      color: #333;
    }
    .copy-btn {
      display: block;
      width: 100%;
      margin-top: 20px;
      padding: 18px;
      background: #1a73e8;
      color: #fff;
      font-size: 18px;
      font-weight: 600;
      border: none;
      border-radius: 12px;
      cursor: pointer;
      -webkit-tap-highlight-color: transparent;
      transition: background 0.2s;
    }
    .copy-btn:active {
      background: #1557b0;
    }
    .copy-btn.copied {
      background: #34a853;
    }
    .toast {
      position: fixed;
      bottom: 40px;
      left: 50%;
      transform: translateX(-50%);
      background: #333;
      color: #fff;
      padding: 12px 24px;
      border-radius: 8px;
      font-size: 14px;
      opacity: 0;
      transition: opacity 0.3s;
      z-index: 100;
    }
    .toast.show {
      opacity: 1;
    }
    .footer {
      margin-top: 16px;
      text-align: center;
      font-size: 11px;
      color: #9aa0a6;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>📋 Deep Research プロンプト</h1>
    <div class="prompt-text" id="prompt">${escapeHtml(promptText)}</div>
    <button class="copy-btn" id="copyBtn">コピー</button>
    <p class="footer">Vibe CLI v3.0</p>
  </div>
  <div class="toast" id="toast">コピーしました ✓</div>
  <script>
    const btn = document.getElementById('copyBtn');
    const toast = document.getElementById('toast');
    const prompt = document.getElementById('prompt');

    btn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(prompt.textContent);
        btn.textContent = 'コピーしました ✓';
        btn.classList.add('copied');
        toast.classList.add('show');
        setTimeout(() => {
          toast.classList.remove('show');
          btn.textContent = 'コピー';
          btn.classList.remove('copied');
        }, 2000);
      } catch (err) {
        alert('コピーに失敗しました: ' + err.message);
      }
    });
  </script>
</body>
</html>`;
}

/**
 * エラーページ（404/410）のHTMLを生成する
 * @param statusCode - HTTPステータスコード
 * @param message - エラーメッセージ
 * @returns HTML文字列
 */
export function renderErrorPage(statusCode: number, message: string): string {
  const title = statusCode === 410 ? "期限切れ" : "見つかりません";
  const emoji = statusCode === 410 ? "⏰" : "🔍";

  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title} - Vibe</title>
  <style>
    * { box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      margin: 0;
      padding: 20px;
      background: #f5f5f5;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
    }
    .container {
      max-width: 400px;
      width: 100%;
      background: #fff;
      border-radius: 16px;
      padding: 32px 24px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.1);
      text-align: center;
    }
    .emoji {
      font-size: 48px;
      margin-bottom: 16px;
    }
    h1 {
      font-size: 20px;
      margin: 0 0 12px;
      color: #333;
    }
    p {
      font-size: 14px;
      color: #666;
      margin: 0;
      line-height: 1.6;
    }
    .status {
      margin-top: 16px;
      font-size: 12px;
      color: #9aa0a6;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="emoji">${emoji}</div>
    <h1>${escapeHtml(title)}</h1>
    <p>${escapeHtml(message)}</p>
    <p class="status">Status: ${statusCode}</p>
  </div>
</body>
</html>`;
}
