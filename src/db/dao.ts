import { getDb } from "./init.js";
import { generateItemHash, normalizeUrl, extractDomain } from "../utils/url.js";

// ============================================
// Types
// ============================================

export interface Item {
  item_hash: string;
  url: string;
  title: string;
  snippet: string | null;
  domain: string;
  first_seen_at: string;
  last_seen_at: string;
  last_delivered_at: string | null;
  summary_json: string | null;
}

export interface Delivery {
  id: number;
  job_name: string;
  delivered_at: string;
  item_hashes_json: string;
}

export interface Feedback {
  id: number;
  item_hash: string;
  rating: number;
  note: string | null;
  created_at: string;
}

export interface JobState {
  job_name: string;
  last_success_at: string | null;
  last_run_at: string | null;
}

export interface ApiUsage {
  date: string;
  provider: string;
  count: number;
}

// ============================================
// Items
// ============================================

export function upsertItem(
  url: string,
  title: string,
  snippet: string | null
): Item {
  const db = getDb();
  const normalizedUrl = normalizeUrl(url);
  const itemHash = generateItemHash(url);
  const domain = extractDomain(url);
  const now = new Date().toISOString();

  const existing = db
    .prepare("SELECT * FROM items WHERE item_hash = ?")
    .get(itemHash) as Item | undefined;

  if (existing) {
    // Update last_seen_at
    db.prepare(
      "UPDATE items SET last_seen_at = ?, title = ?, snippet = ? WHERE item_hash = ?"
    ).run(now, title, snippet, itemHash);

    return {
      ...existing,
      last_seen_at: now,
      title,
      snippet,
    };
  } else {
    // Insert new item
    db.prepare(
      `INSERT INTO items (item_hash, url, title, snippet, domain, first_seen_at, last_seen_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(itemHash, normalizedUrl, title, snippet, domain, now, now);

    return {
      item_hash: itemHash,
      url: normalizedUrl,
      title,
      snippet,
      domain,
      first_seen_at: now,
      last_seen_at: now,
      last_delivered_at: null,
      summary_json: null,
    };
  }
}

export function getItemByHash(hash: string): Item | undefined {
  const db = getDb();
  return db.prepare("SELECT * FROM items WHERE item_hash = ?").get(hash) as
    | Item
    | undefined;
}

export function getUndeliveredItems(limit: number = 100): Item[] {
  const db = getDb();
  return db
    .prepare(
      `SELECT * FROM items
       WHERE last_delivered_at IS NULL
       ORDER BY first_seen_at DESC
       LIMIT ?`
    )
    .all(limit) as Item[];
}

export function markItemsDelivered(itemHashes: string[]): void {
  const db = getDb();
  const now = new Date().toISOString();
  const stmt = db.prepare(
    "UPDATE items SET last_delivered_at = ? WHERE item_hash = ?"
  );

  const transaction = db.transaction((hashes: string[]) => {
    for (const hash of hashes) {
      stmt.run(now, hash);
    }
  });

  transaction(itemHashes);
}

export function updateItemSummary(itemHash: string, summaryJson: string): void {
  const db = getDb();
  db.prepare("UPDATE items SET summary_json = ? WHERE item_hash = ?").run(
    summaryJson,
    itemHash
  );
}

export function getItemsWithoutSummary(limit: number = 10): Item[] {
  const db = getDb();
  return db
    .prepare(
      `SELECT * FROM items
       WHERE summary_json IS NULL
       ORDER BY first_seen_at DESC
       LIMIT ?`
    )
    .all(limit) as Item[];
}

// ============================================
// Deliveries
// ============================================

export function createDelivery(
  jobName: string,
  itemHashes: string[]
): Delivery {
  const db = getDb();
  const now = new Date().toISOString();
  const itemHashesJson = JSON.stringify(itemHashes);

  const result = db
    .prepare(
      `INSERT INTO deliveries (job_name, delivered_at, item_hashes_json)
       VALUES (?, ?, ?)`
    )
    .run(jobName, now, itemHashesJson);

  return {
    id: result.lastInsertRowid as number,
    job_name: jobName,
    delivered_at: now,
    item_hashes_json: itemHashesJson,
  };
}

export function getDeliveriesByJob(jobName: string): Delivery[] {
  const db = getDb();
  return db
    .prepare("SELECT * FROM deliveries WHERE job_name = ? ORDER BY delivered_at DESC")
    .all(jobName) as Delivery[];
}

// ============================================
// Feedback
// ============================================

export function addFeedback(
  itemHash: string,
  rating: number,
  note: string | null = null
): Feedback {
  const db = getDb();
  const now = new Date().toISOString();

  const result = db
    .prepare(
      `INSERT INTO feedback (item_hash, rating, note, created_at)
       VALUES (?, ?, ?, ?)`
    )
    .run(itemHash, rating, note, now);

  return {
    id: result.lastInsertRowid as number,
    item_hash: itemHash,
    rating,
    note,
    created_at: now,
  };
}

export function getFeedbackByItem(itemHash: string): Feedback[] {
  const db = getDb();
  return db
    .prepare("SELECT * FROM feedback WHERE item_hash = ? ORDER BY created_at DESC")
    .all(itemHash) as Feedback[];
}

export function getItemsNeedingFeedback(): Item[] {
  const db = getDb();
  return db
    .prepare(
      `SELECT i.* FROM items i
       WHERE i.last_delivered_at IS NOT NULL
       AND NOT EXISTS (
         SELECT 1 FROM feedback f WHERE f.item_hash = i.item_hash
       )
       ORDER BY i.last_delivered_at DESC`
    )
    .all() as Item[];
}

export function hasItemFeedback(itemHash: string): boolean {
  const db = getDb();
  const result = db
    .prepare("SELECT 1 FROM feedback WHERE item_hash = ? LIMIT 1")
    .get(itemHash);
  return !!result;
}

export function getDomainFeedbackStats(): Map<string, { good: number; bad: number }> {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT i.domain,
              SUM(CASE WHEN f.rating > 0 THEN 1 ELSE 0 END) as good,
              SUM(CASE WHEN f.rating < 0 THEN 1 ELSE 0 END) as bad
       FROM feedback f
       JOIN items i ON f.item_hash = i.item_hash
       GROUP BY i.domain`
    )
    .all() as { domain: string; good: number; bad: number }[];

  const stats = new Map<string, { good: number; bad: number }>();
  for (const row of rows) {
    stats.set(row.domain, { good: row.good, bad: row.bad });
  }
  return stats;
}

// ============================================
// Job State
// ============================================

export function getJobState(jobName: string): JobState | undefined {
  const db = getDb();
  return db
    .prepare("SELECT * FROM job_state WHERE job_name = ?")
    .get(jobName) as JobState | undefined;
}

export function updateJobState(
  jobName: string,
  updates: { last_success_at?: string; last_run_at?: string }
): void {
  const db = getDb();

  const existing = getJobState(jobName);
  if (!existing) {
    db.prepare(
      `INSERT INTO job_state (job_name, last_success_at, last_run_at)
       VALUES (?, ?, ?)`
    ).run(jobName, updates.last_success_at || null, updates.last_run_at || null);
  } else {
    const sets: string[] = [];
    const values: (string | null)[] = [];

    if (updates.last_success_at !== undefined) {
      sets.push("last_success_at = ?");
      values.push(updates.last_success_at);
    }
    if (updates.last_run_at !== undefined) {
      sets.push("last_run_at = ?");
      values.push(updates.last_run_at);
    }

    if (sets.length > 0) {
      values.push(jobName);
      db.prepare(`UPDATE job_state SET ${sets.join(", ")} WHERE job_name = ?`).run(
        ...values
      );
    }
  }
}

// ============================================
// API Usage
// ============================================

export function getApiUsage(date: string, provider: string): number {
  const db = getDb();
  const row = db
    .prepare("SELECT count FROM api_usage WHERE date = ? AND provider = ?")
    .get(date, provider) as { count: number } | undefined;
  return row?.count ?? 0;
}

export function incrementApiUsage(date: string, provider: string): number {
  const db = getDb();

  db.prepare(
    `INSERT INTO api_usage (date, provider, count) VALUES (?, ?, 1)
     ON CONFLICT(date, provider) DO UPDATE SET count = count + 1`
  ).run(date, provider);

  return getApiUsage(date, provider);
}
