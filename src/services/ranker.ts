import { Item, getUndeliveredItems, getDomainFeedbackStats } from "../db/dao.js";
import { getDb } from "../db/init.js";

interface ScoredItem {
  item: Item;
  score: number;
  breakdown: {
    freshness: number;
    domain: number;
    textMatch: number;
  };
}

// Score weights
const WEIGHTS = {
  freshness: 1.0,
  domain: 0.5,
  textMatch: 0.3,
};

// Maximum score caps to prevent extreme values
const SCORE_CAPS = {
  domain: 5,
  textMatch: 3,
};

function calculateFreshnessScore(firstSeenAt: string): number {
  const now = Date.now();
  const seen = new Date(firstSeenAt).getTime();
  const hoursOld = (now - seen) / (1000 * 60 * 60);

  // Newer items get higher scores
  // 0 hours = 10 points, 24 hours = 5 points, 168 hours (1 week) = 0 points
  const score = Math.max(0, 10 - (hoursOld / 168) * 10);
  return score;
}

function calculateDomainScore(
  domain: string,
  domainStats: Map<string, { good: number; bad: number }>
): number {
  const stats = domainStats.get(domain);
  if (!stats) {
    return 0; // Neutral for unknown domains
  }

  // Calculate net score with diminishing returns
  const netScore = stats.good - stats.bad;
  const cappedScore = Math.max(-SCORE_CAPS.domain, Math.min(SCORE_CAPS.domain, netScore));
  return cappedScore;
}

function getPositiveKeywords(): Set<string> {
  // Get words from Good-rated items
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT i.title, i.snippet
       FROM items i
       JOIN feedback f ON i.item_hash = f.item_hash
       WHERE f.rating > 0`
    )
    .all() as { title: string; snippet: string | null }[];

  const words = new Set<string>();
  for (const row of rows) {
    const text = `${row.title} ${row.snippet || ""}`.toLowerCase();
    const tokens = text.split(/\W+/).filter((w) => w.length > 2);
    for (const token of tokens) {
      words.add(token);
    }
  }
  return words;
}

function getNegativeKeywords(): Set<string> {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT i.title, i.snippet
       FROM items i
       JOIN feedback f ON i.item_hash = f.item_hash
       WHERE f.rating < 0`
    )
    .all() as { title: string; snippet: string | null }[];

  const words = new Set<string>();
  for (const row of rows) {
    const text = `${row.title} ${row.snippet || ""}`.toLowerCase();
    const tokens = text.split(/\W+/).filter((w) => w.length > 2);
    for (const token of tokens) {
      words.add(token);
    }
  }
  return words;
}

function calculateTextMatchScore(
  title: string,
  snippet: string | null,
  positiveKeywords: Set<string>,
  negativeKeywords: Set<string>
): number {
  const text = `${title} ${snippet || ""}`.toLowerCase();
  const tokens = text.split(/\W+/).filter((w) => w.length > 2);

  let positiveMatches = 0;
  let negativeMatches = 0;

  for (const token of tokens) {
    if (positiveKeywords.has(token) && !negativeKeywords.has(token)) {
      positiveMatches++;
    }
    if (negativeKeywords.has(token) && !positiveKeywords.has(token)) {
      negativeMatches++;
    }
  }

  const netScore = positiveMatches - negativeMatches;
  return Math.max(-SCORE_CAPS.textMatch, Math.min(SCORE_CAPS.textMatch, netScore));
}

function scoreItem(
  item: Item,
  domainStats: Map<string, { good: number; bad: number }>,
  positiveKeywords: Set<string>,
  negativeKeywords: Set<string>
): ScoredItem {
  const freshness = calculateFreshnessScore(item.first_seen_at);
  const domain = calculateDomainScore(item.domain, domainStats);
  const textMatch = calculateTextMatchScore(
    item.title,
    item.snippet,
    positiveKeywords,
    negativeKeywords
  );

  const score =
    freshness * WEIGHTS.freshness +
    domain * WEIGHTS.domain +
    textMatch * WEIGHTS.textMatch;

  return {
    item,
    score,
    breakdown: { freshness, domain, textMatch },
  };
}

export interface RankResult {
  items: Item[];
  scored: ScoredItem[];
}

export function rankItems(limit: number): RankResult {
  // Get candidate items (undelivered)
  const candidates = getUndeliveredItems(limit * 3); // Get more candidates for better selection

  if (candidates.length === 0) {
    return { items: [], scored: [] };
  }

  // Get feedback data for scoring
  const domainStats = getDomainFeedbackStats();
  const positiveKeywords = getPositiveKeywords();
  const negativeKeywords = getNegativeKeywords();

  // Score all candidates
  const scored = candidates.map((item) =>
    scoreItem(item, domainStats, positiveKeywords, negativeKeywords)
  );

  // Sort by score (descending)
  scored.sort((a, b) => b.score - a.score);

  // Take top items
  const topScored = scored.slice(0, limit);

  return {
    items: topScored.map((s) => s.item),
    scored: topScored,
  };
}

export function explainRanking(scored: ScoredItem[]): string[] {
  return scored.map((s, i) => {
    const { freshness, domain, textMatch } = s.breakdown;
    return (
      `${i + 1}. [${s.score.toFixed(2)}] ${s.item.title.slice(0, 40)}... ` +
      `(fresh:${freshness.toFixed(1)}, domain:${domain.toFixed(1)}, text:${textMatch.toFixed(1)})`
    );
  });
}
