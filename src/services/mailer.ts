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
      <div style="margin-top:12px;padding:12px;background:#f8f9fa;border-radius:4px;">
        <ul style="margin:0 0 8px 0;padding-left:20px;">${keyPoints}</ul>
        <p style="margin:8px 0;"><strong>Takeaway:</strong> ${takeaway}</p>
        <p style="margin:8px 0;"><strong>Opinion:</strong> ${opinion}</p>
        ${nextActions}
        <p style="margin:8px 0;font-size:12px;color:#666;">Confidence: ${confidence}</p>
      </div>
    `;
  }

  return `
    <div style="margin-bottom:24px;padding:16px;border:1px solid #e0e0e0;border-radius:8px;background:#fff;">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;">
        <div style="flex:1;">
          <a href="${url}" style="color:#1a73e8;text-decoration:none;font-size:16px;font-weight:500;">${title}</a>
          <p style="margin:4px 0 0 0;font-size:12px;color:#666;">${domain}</p>
        </div>
        <div style="margin-left:12px;padding:4px 8px;background:#f0f0f0;border-radius:4px;font-family:monospace;font-size:11px;color:#666;">
          ID: ${shortId}
        </div>
      </div>
      ${item.snippet ? `<p style="margin:12px 0 0 0;color:#333;font-size:14px;">${escapeHtml(item.snippet)}</p>` : ""}
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
</head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;background:#f5f5f5;">
  <div style="max-width:640px;margin:0 auto;padding:24px;">
    <div style="background:#fff;border-radius:12px;padding:24px;box-shadow:0 2px 8px rgba(0,0,0,0.1);">
      <header style="margin-bottom:24px;text-align:center;">
        <h1 style="margin:0;color:#333;font-size:24px;">Vibe Digest</h1>
        <p style="margin:8px 0 0 0;color:#666;font-size:14px;">${date} - ${totalItems} items</p>
      </header>

      <main>
        ${sections || "<p style='text-align:center;color:#666;'>No new items to report.</p>"}
      </main>

      <footer style="margin-top:32px;padding-top:16px;border-top:1px solid #e0e0e0;text-align:center;">
        <p style="margin:0;font-size:12px;color:#999;">
          To rate items, run: <code style="background:#f0f0f0;padding:2px 6px;border-radius:4px;">vibe feedback good|bad &lt;ID&gt;</code>
        </p>
        <p style="margin:8px 0 0 0;font-size:12px;color:#999;">
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
