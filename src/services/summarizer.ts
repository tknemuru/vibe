import OpenAI from "openai";
import { Item, updateItemSummary, getItemByHash } from "../db/dao.js";

export interface Summary {
  key_points: string[];
  takeaway: string;
  opinion: string;
  confidence: "high" | "medium" | "low";
  next_actions?: string[];
}

export class SummarizerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SummarizerError";
  }
}

const SYSTEM_PROMPT = `あなたは記事要約アシスタントです。与えられたタイトル、スニペット、URLから記事の要点を抽出し、日本語で要約してください。

重要なルール：
1. 記事本文は読めないため、タイトルとスニペットのみから推測します
2. 推測する場合は「推測: 」と明示してください
3. 断定的な表現は避け、「〜と思われる」「〜の可能性がある」などを使用してください

出力は必ず以下のJSON形式で返してください：
{
  "key_points": ["要点1", "要点2", "要点3"],  // 2-4個の主要ポイント
  "takeaway": "この記事の重要な結論や学び",
  "opinion": "この記事についての所見（推測の場合は「推測: 」で明示）",
  "confidence": "high" または "medium" または "low",
  "next_actions": ["アクション1", "アクション2"]  // 0-2個、省略可
}`;

function getPrimaryModel(): string {
  return process.env.OPENAI_MODEL_PRIMARY || "gpt-4o-mini";
}

function getFallbackModel(): string {
  return process.env.OPENAI_MODEL_FALLBACK || "gpt-4o";
}

function validateSummary(data: unknown): Summary | null {
  if (!data || typeof data !== "object") {
    return null;
  }

  const obj = data as Record<string, unknown>;

  // Check key_points
  if (!Array.isArray(obj.key_points) || obj.key_points.length < 2) {
    return null;
  }
  if (!obj.key_points.every((p) => typeof p === "string" && p.length > 0)) {
    return null;
  }

  // Check takeaway
  if (typeof obj.takeaway !== "string" || obj.takeaway.length === 0) {
    return null;
  }

  // Check opinion
  if (typeof obj.opinion !== "string" || obj.opinion.length === 0) {
    return null;
  }

  // Check confidence
  if (!["high", "medium", "low"].includes(obj.confidence as string)) {
    return null;
  }

  // Check next_actions (optional)
  if (obj.next_actions !== undefined) {
    if (!Array.isArray(obj.next_actions)) {
      return null;
    }
    if (!obj.next_actions.every((a) => typeof a === "string")) {
      return null;
    }
  }

  // Check for assertion without speculation marker in opinion
  const opinion = obj.opinion as string;
  const hasSpeculationMarker =
    opinion.includes("推測") ||
    opinion.includes("思われる") ||
    opinion.includes("可能性") ||
    opinion.includes("かもしれない") ||
    opinion.includes("ようだ") ||
    opinion.includes("と考えられる");

  // If opinion is very assertive without markers, lower confidence
  const isAssertive =
    opinion.includes("である") ||
    opinion.includes("だ。") ||
    opinion.includes("です。");

  if (isAssertive && !hasSpeculationMarker) {
    // Still valid but we note this
    console.warn("Opinion appears assertive without speculation markers");
  }

  return {
    key_points: obj.key_points as string[],
    takeaway: obj.takeaway as string,
    opinion: obj.opinion as string,
    confidence: obj.confidence as "high" | "medium" | "low",
    next_actions: obj.next_actions as string[] | undefined,
  };
}

async function callOpenAI(
  client: OpenAI,
  model: string,
  item: Item
): Promise<Summary | null> {
  const userPrompt = `以下の記事情報を要約してください：

タイトル: ${item.title}
スニペット: ${item.snippet || "(なし)"}
URL: ${item.url}
ドメイン: ${item.domain}`;

  try {
    const response = await client.chat.completions.create({
      model,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
      response_format: { type: "json_object" },
      temperature: 0.3,
      max_tokens: 1000,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      return null;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch {
      console.error("Failed to parse JSON response:", content);
      return null;
    }

    return validateSummary(parsed);
  } catch (error) {
    console.error(`OpenAI API error (${model}):`, error);
    return null;
  }
}

export async function summarizeItem(item: Item): Promise<Summary> {
  // Check cache first
  if (item.summary_json) {
    try {
      const cached = JSON.parse(item.summary_json);
      const validated = validateSummary(cached);
      if (validated) {
        return validated;
      }
    } catch {
      // Invalid cached summary, regenerate
    }
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new SummarizerError("OPENAI_API_KEY must be set in environment");
  }

  const client = new OpenAI({ apiKey });
  const primaryModel = getPrimaryModel();
  const fallbackModel = getFallbackModel();

  // Try primary model
  console.log(`Summarizing with ${primaryModel}...`);
  let summary = await callOpenAI(client, primaryModel, item);

  // Fallback if primary fails
  if (!summary) {
    console.log(`Primary model failed, trying fallback ${fallbackModel}...`);
    summary = await callOpenAI(client, fallbackModel, item);
  }

  if (!summary) {
    throw new SummarizerError(
      `Failed to generate summary for item ${item.item_hash} with both models`
    );
  }

  // Cache the result
  updateItemSummary(item.item_hash, JSON.stringify(summary));

  return summary;
}

export async function summarizeItems(items: Item[]): Promise<Map<string, Summary>> {
  const results = new Map<string, Summary>();

  for (const item of items) {
    try {
      const summary = await summarizeItem(item);
      results.set(item.item_hash, summary);
    } catch (error) {
      console.error(`Failed to summarize ${item.item_hash}:`, error);
    }
  }

  return results;
}

export function getSummaryFromItem(item: Item): Summary | null {
  if (!item.summary_json) {
    return null;
  }
  try {
    return validateSummary(JSON.parse(item.summary_json));
  } catch {
    return null;
  }
}
