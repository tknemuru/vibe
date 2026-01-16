import nodemailer from "nodemailer";
import {
  Book,
  getBookAuthors,
  getBookLinks,
  createBookDelivery,
  markBooksDelivered,
  recordDeliveryItems,
  createPromptWithToken,
} from "../db/dao.js";
import { buildDeepResearchPrompt } from "./prompt-builder.js";

export class MailerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MailerError";
  }
}

/**
 * Book mail result
 */
export interface BookMailResult {
  jobName: string;
  books: Book[];
}

function getSmtpConfig() {
  return {
    host: process.env.SMTP_HOST || "smtp.gmail.com",
    port: parseInt(process.env.SMTP_PORT || "587", 10),
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
    to: process.env.MAIL_TO,
  };
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * CopyページのベースURLを取得する
 * @returns ベースURL（環境変数未設定時はlocalhost:8787）
 */
function getCopyPageBaseUrl(): string {
  return process.env.COPY_PAGE_BASE_URL || "http://localhost:8787";
}

/**
 * 書籍カードをレンダリングする（Copyリンク付き）
 * @param book - 書籍エンティティ
 * @param token - Copyページ用トークン
 * @param baseUrl - CopyページのベースURL
 * @returns HTMLカード文字列
 */
function renderBookCard(book: Book, token: string, baseUrl: string): string {
  const title = escapeHtml(book.title);
  const authors = getBookAuthors(book);
  const authorsStr = authors.length > 0 ? authors.join(", ") : "不明";
  const publisher = book.publisher || "不明";
  const publishedDate = book.published_date || "不明";
  const description = book.description ? escapeHtml(book.description.slice(0, 300)) : "";
  const links = getBookLinks(book);

  const copyUrl = `${baseUrl}/p/${token}`;

  const linksHtml = links.length > 0
    ? `<div style="margin-top:12px;">
         <p style="margin:0 0 6px 0;font-size:12px;font-weight:500;color:#5f6368;">参考リンク:</p>
         ${links.map((l: { label: string; url: string }) =>
           `<a href="${escapeHtml(l.url)}" style="display:inline-block;margin-right:12px;color:#1a73e8;font-size:12px;text-decoration:none;">${escapeHtml(l.label)}</a>`
         ).join("")}
       </div>`
    : "";

  return `
    <div class="card" style="margin-bottom:24px;padding:18px;border:2px solid #e8eaed;border-radius:8px;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,0.08);">
      <div style="display:flex;gap:16px;">
        ${book.cover_url ? `<img src="${escapeHtml(book.cover_url)}" alt="表紙" style="width:80px;height:auto;object-fit:contain;border-radius:4px;box-shadow:0 1px 3px rgba(0,0,0,0.2);">` : ""}
        <div style="flex:1;min-width:0;">
          <h3 style="margin:0 0 8px 0;color:#1a73e8;font-size:16px;font-weight:600;line-height:1.4;">${title}</h3>
          <p style="margin:0 0 4px 0;font-size:13px;color:#3c4043;"><strong>著者:</strong> ${escapeHtml(authorsStr)}</p>
          <p style="margin:0 0 4px 0;font-size:13px;color:#3c4043;"><strong>出版社:</strong> ${escapeHtml(publisher)} (${escapeHtml(publishedDate)})</p>
          <p style="margin:0;font-size:12px;color:#5f6368;"><strong>ISBN:</strong> ${book.isbn13}</p>
        </div>
      </div>
      ${description ? `<p style="margin:12px 0 0 0;color:#3c4043;font-size:14px;line-height:1.6;">${description}${book.description && book.description.length > 300 ? "..." : ""}</p>` : ""}
      ${linksHtml}

      <!-- Copyボタン -->
      <div style="margin-top:16px;text-align:center;">
        <a href="${escapeHtml(copyUrl)}" style="display:inline-block;padding:14px 28px;background:#1a73e8;color:#fff;font-size:16px;font-weight:600;text-decoration:none;border-radius:8px;min-width:120px;">📋 Copy プロンプト</a>
      </div>
    </div>
  `;
}

/**
 * 書籍とトークンのペア
 */
interface BookWithToken {
  book: Book;
  token: string;
}

/**
 * メール全体のHTMLをレンダリングする
 * @param booksWithTokens - 書籍とトークンのペアの配列
 * @param baseUrl - CopyページのベースURL
 * @returns HTMLメール本文
 */
function renderBookEmail(booksWithTokens: BookWithToken[], baseUrl: string): string {
  const cards = booksWithTokens.map(({ book, token }) => renderBookCard(book, token, baseUrl)).join("");
  const totalBooks = booksWithTokens.length;
  const date = new Date().toLocaleDateString("ja-JP", {
    timeZone: process.env.APP_TZ || "Asia/Tokyo",
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
  });

  return `
<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="format-detection" content="telephone=no">
  <style>
    @media only screen and (max-width: 600px) {
      .container { padding: 12px !important; }
      .card { padding: 14px !important; margin-bottom: 16px !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;background:#f5f5f5;">
  <div class="container" style="max-width:640px;margin:0 auto;padding:20px;">
    <div style="background:#fff;border-radius:12px;padding:24px;box-shadow:0 2px 8px rgba(0,0,0,0.1);">
      <header style="margin-bottom:24px;text-align:center;">
        <h1 style="margin:0;color:#1a73e8;font-size:26px;font-weight:600;">📚 Book Digest</h1>
        <p style="margin:8px 0 0 0;color:#5f6368;font-size:14px;">${date}</p>
        <p style="margin:4px 0 0 0;color:#5f6368;font-size:13px;">${totalBooks} 冊の書籍</p>
      </header>

      <main>
        ${cards || "<p style='text-align:center;color:#666;'>No books to report.</p>"}
      </main>

      <footer style="margin-top:32px;padding-top:20px;border-top:2px solid #e8eaed;text-align:center;">
        <div style="margin-bottom:16px;padding:12px;background:#e8f0fe;border-radius:6px;">
          <p style="margin:0 0 8px 0;font-size:13px;color:#1967d2;font-weight:500;">💡 使い方</p>
          <p style="margin:0;font-size:12px;color:#3c4043;line-height:1.6;">
            各書籍の「Copy プロンプト」ボタンをタップすると、<br>
            Deep Research用のテキストをコピーできます。
          </p>
        </div>
        <p style="margin:0;font-size:11px;color:#9aa0a6;">
          Generated by Vibe CLI v3.0
        </p>
      </footer>
    </div>
  </div>
</body>
</html>
  `;
}

/**
 * 書籍ダイジェストメールを送信する
 * @param books - 送信対象の書籍リスト
 * @param jobName - ジョブ名（配信記録用）
 * @description
 *   各書籍に対してDeep Research用プロンプトを生成し、
 *   トークンを発行してCopyリンク付きメールを送信する。
 */
export async function sendBookDigestEmail(books: Book[], jobName: string = "combined"): Promise<void> {
  const config = getSmtpConfig();

  if (!config.user || !config.pass || !config.to) {
    throw new MailerError("SMTP_USER, SMTP_PASS, and MAIL_TO must be set in environment");
  }

  if (books.length === 0) {
    console.log("No books to send, skipping email");
    return;
  }

  const baseUrl = getCopyPageBaseUrl();

  // 各書籍に対してプロンプトを生成しトークンを発行
  const booksWithTokens: BookWithToken[] = books.map((book) => {
    const promptText = buildDeepResearchPrompt(book);
    const token = createPromptWithToken(book.isbn13, promptText);
    return { book, token };
  });

  const transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.port === 465,
    auth: {
      user: config.user,
      pass: config.pass,
    },
  });

  const html = renderBookEmail(booksWithTokens, baseUrl);
  const date = new Date().toLocaleDateString("ja-JP", {
    timeZone: process.env.APP_TZ || "Asia/Tokyo",
  });

  await transporter.sendMail({
    from: config.user,
    to: config.to,
    subject: `[Vibe] Book Digest for ${date} (${books.length} books)`,
    html,
  });

  // Ver4.0: Record deliveries and mark books as delivered
  const isbn13List = books.map((b) => b.isbn13);

  // 1. deliveries に監査ログを記録（id を取得）
  const delivery = createBookDelivery(jobName, isbn13List);

  // 2. delivery_items に SSOT として記録
  recordDeliveryItems(delivery.id, jobName, isbn13List);

  // 3. books.last_delivered_at も更新（後方互換）
  markBooksDelivered(isbn13List);

  console.log(`Email sent to ${config.to} with ${books.length} books`);
}
