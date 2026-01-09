import nodemailer from "nodemailer";
import { Item, createDelivery, markItemsDelivered } from "../db/dao.js";
import { Summary, getSummaryFromItem } from "./summarizer.js";

export class MailerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MailerError";
  }
}

interface JobResults {
  jobName: string;
  items: Item[];
  summaries: Map<string, Summary>;
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

function shortenHash(hash: string): string {
  return hash.slice(0, 8);
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function renderItemCard(item: Item, summary: Summary | null): string {
  const shortId = shortenHash(item.item_hash);
  const domain = escapeHtml(item.domain);
  const title = escapeHtml(item.title);
  const url = escapeHtml(item.url);

  let summaryHtml = "";
  if (summary) {
    const keyPoints = summary.key_points
      .map((p) => `<li>${escapeHtml(p)}</li>`)
      .join("");
    const takeaway = escapeHtml(summary.takeaway);
    const opinion = escapeHtml(summary.opinion);
    const confidence = summary.confidence;
    const nextActions = summary.next_actions?.length
      ? `<p style="margin:8px 0;"><strong>Next:</strong> ${summary.next_actions.map(a => escapeHtml(a)).join(", ")}</p>`
      : "";

    summaryHtml = `
      <div style="margin-top:14px;padding:14px;background:#f8f9fa;border-left:3px solid #1a73e8;border-radius:4px;">
        <ul style="margin:0 0 10px 0;padding-left:20px;color:#3c4043;line-height:1.6;">${keyPoints}</ul>
        <p style="margin:10px 0;line-height:1.6;"><strong style="color:#1a73e8;">💡 Takeaway:</strong> ${takeaway}</p>
        <p style="margin:10px 0;line-height:1.6;"><strong style="color:#1a73e8;">💭 Opinion:</strong> ${opinion}</p>
        ${nextActions}
        <p style="margin:10px 0 0 0;font-size:11px;color:#5f6368;">Confidence: ${confidence}</p>
      </div>
    `;
  }

  return `
    <div class="card" style="margin-bottom:24px;padding:18px;border:2px solid #e8eaed;border-radius:8px;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,0.08);">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px;">
        <div style="flex:1;min-width:0;">
          <a class="title" href="${url}" style="color:#1a73e8;text-decoration:none;font-size:16px;font-weight:500;line-height:1.4;display:block;">${title}</a>
          <p style="margin:6px 0 0 0;font-size:12px;color:#5f6368;">${domain}</p>
        </div>
        <div class="id-box" style="margin-left:16px;padding:6px 12px;background:#e8f0fe;border:1px solid #d2e3fc;border-radius:6px;flex-shrink:0;">
          <div style="font-family:'Courier New',Consolas,monospace;font-size:13px;font-weight:bold;color:#1967d2;letter-spacing:0.5px;user-select:all;white-space:nowrap;">
            ${shortId}
          </div>
          <div style="font-size:9px;color:#5f6368;margin-top:2px;text-align:center;">ID</div>
        </div>
      </div>
      ${item.snippet ? `<p style="margin:8px 0 0 0;color:#3c4043;font-size:14px;line-height:1.5;">${escapeHtml(item.snippet)}</p>` : ""}
      ${summaryHtml}
    </div>
  `;
}

function renderJobSection(result: JobResults): string {
  if (result.items.length === 0) {
    return "";
  }

  const cards = result.items
    .map((item) => {
      const summary = result.summaries.get(item.item_hash) || getSummaryFromItem(item);
      return renderItemCard(item, summary);
    })
    .join("");

  return `
    <div style="margin-bottom:32px;">
      <h2 style="margin:0 0 16px 0;padding-bottom:8px;border-bottom:2px solid #1a73e8;color:#333;">${escapeHtml(result.jobName)}</h2>
      ${cards}
    </div>
  `;
}

function renderEmail(results: JobResults[]): string {
  const sections = results
    .filter((r) => r.items.length > 0)
    .map(renderJobSection)
    .join("");

  const totalItems = results.reduce((sum, r) => sum + r.items.length, 0);
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
      .title { font-size: 15px !important; }
      .id-box { margin-left: 8px !important; padding: 4px 8px !important; }
      .footer-box { padding: 10px !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;background:#f5f5f5;">
  <div class="container" style="max-width:640px;margin:0 auto;padding:20px;">
    <div style="background:#fff;border-radius:12px;padding:24px;box-shadow:0 2px 8px rgba(0,0,0,0.1);">
      <header style="margin-bottom:24px;text-align:center;">
        <h1 style="margin:0;color:#1a73e8;font-size:26px;font-weight:600;">📬 Vibe Digest</h1>
        <p style="margin:8px 0 0 0;color:#5f6368;font-size:14px;">${date}</p>
        <p style="margin:4px 0 0 0;color:#5f6368;font-size:13px;">${totalItems} 件の新着記事</p>
      </header>

      <main>
        ${sections || "<p style='text-align:center;color:#666;'>No new items to report.</p>"}
      </main>

      <footer style="margin-top:32px;padding-top:20px;border-top:2px solid #e8eaed;text-align:center;">
        <div class="footer-box" style="margin-bottom:16px;padding:12px;background:#f8f9fa;border-radius:6px;">
          <p style="margin:0 0 8px 0;font-size:13px;color:#3c4043;font-weight:500;">📝 評価方法</p>
          <p style="margin:0 0 4px 0;font-size:12px;color:#5f6368;">
            各記事のIDをコピーして、以下のコマンドで評価してください：
          </p>
          <div style="margin:8px 0;padding:8px 12px;background:#fff;border:1px solid #dadce0;border-radius:4px;font-family:'Courier New',Consolas,monospace;font-size:12px;color:#1a73e8;word-break:break-all;">
            vibe feedback good &lt;ID&gt;
          </div>
          <div style="margin:8px 0;padding:8px 12px;background:#fff;border:1px solid #dadce0;border-radius:4px;font-family:'Courier New',Consolas,monospace;font-size:12px;color:#d93025;word-break:break-all;">
            vibe feedback bad &lt;ID&gt;
          </div>
          <p style="margin:8px 0 0 0;font-size:11px;color:#5f6368;">
            複数のIDを一度に評価可能（例: vibe feedback good abc123 def456）
          </p>
        </div>
        <p style="margin:0;font-size:11px;color:#9aa0a6;">
          Generated by Vibe CLI
        </p>
      </footer>
    </div>
  </div>
</body>
</html>
  `;
}

export async function sendDigestEmail(results: JobResults[]): Promise<void> {
  const config = getSmtpConfig();

  if (!config.user || !config.pass || !config.to) {
    throw new MailerError("SMTP_USER, SMTP_PASS, and MAIL_TO must be set in environment");
  }

  const transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.port === 465,
    auth: {
      user: config.user,
      pass: config.pass,
    },
  });

  const totalItems = results.reduce((sum, r) => sum + r.items.length, 0);
  if (totalItems === 0) {
    console.log("No items to send, skipping email");
    return;
  }

  const html = renderEmail(results);
  const date = new Date().toLocaleDateString("ja-JP", {
    timeZone: process.env.APP_TZ || "Asia/Tokyo",
  });

  await transporter.sendMail({
    from: config.user,
    to: config.to,
    subject: `[Vibe] Digest for ${date} (${totalItems} items)`,
    html,
  });

  // Record deliveries and mark items as delivered
  for (const result of results) {
    if (result.items.length > 0) {
      const hashes = result.items.map((i) => i.item_hash);
      createDelivery(result.jobName, hashes);
      markItemsDelivered(hashes);
    }
  }

  console.log(`Email sent to ${config.to} with ${totalItems} items`);
}

export { JobResults };
