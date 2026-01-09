import OpenAI from "openai";
import { Item, updateItemSummary, getItemByHash } from "../db/dao.js";
import { checkOpenAIQuota, consumeOpenAIQuota } from "../utils/quota.js";

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

【最重要ルール】
1. 記事本文は読めません。タイトルとスニペットのみで判断します
2. 不明な点は「不明」と明記してください。無理に推測しないこと
3. 推測する場合は必ず「推測: 」で始めてください
4. 断定的な表現（「〜である」「〜だ」）は絶対に使用しないこと
5. 推測表現を使用：「〜と思われる」「〜の可能性がある」「〜かもしれない」「〜と考えられる」

【出力形式】
以下のJSON形式で返してください：
{
  "key_points": ["要点1", "要点2", "要点3"],  // 2-4個。タイトル/スニペットから読み取れる主要ポイントのみ
  "takeaway": "この記事から得られる学びや結論（推測表現を使用）",
  "opinion": "この記事についての所見（必ず「推測: 」で始める）",
  "confidence": "high" または "medium" または "low",  // 情報が限られているので通常は"low"または"medium"
  "next_actions": ["具体的なアクション"]  // 1個を推奨。例：「記事全文を読んで詳細を確認する」「公式ドキュメントで仕様を確認する」
}

【例】
良い例：
- opinion: "推測: この記事はReactの新機能について解説していると思われる"
- takeaway: "Reactの最新バージョンには新しいフックが追加された可能性がある"

悪い例（絶対にNG）：
- opinion: "この記事はReactの新機能について解説している"（断定形）
- takeaway: "Reactには新しいフックがある"（推測マーカーなし）`;

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

  // Check for speculation marker in opinion (REQUIRED)
  const opinion = obj.opinion as string;
  const hasSpeculationMarker =
    opinion.includes("推測") ||
    opinion.includes("思われる") ||
    opinion.includes("可能性") ||
    opinion.includes("かもしれない") ||
    opinion.includes("ようだ") ||
    opinion.includes("と考えられる") ||
    opinion.includes("不明");

  // Opinion MUST start with "推測:" or contain speculation markers
  if (!opinion.startsWith("推測:") && !hasSpeculationMarker) {
    console.warn("⚠️  Opinion lacks required speculation marker (推測:) - REJECTED");
    return null;
  }

  // Check for problematic assertive expressions
  const hasProblematicAssertion =
    opinion.includes("である。") ||
    opinion.includes("である」") ||
    (opinion.includes("だ。") && !opinion.includes("ようだ。"));

  if (hasProblematicAssertion) {
    console.warn("⚠️  Opinion contains assertive expressions without proper hedging - REJECTED");
    return null;
  }

  // Warn if next_actions is missing or empty
  if (!obj.next_actions || (obj.next_actions as string[]).length === 0) {
    console.warn("⚠️  next_actions is empty - consider adding at least one action");
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

  // Check quota before making API calls
  const quotaCheck = checkOpenAIQuota();
  if (!quotaCheck.allowed) {
    throw new SummarizerError(
      `Daily OpenAI quota limit reached (${quotaCheck.current}/${quotaCheck.limit}). ` +
        "Summarization skipped to prevent charges."
    );
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

  // Consume quota after successful API response
  const consumeResult = consumeOpenAIQuota();
  if (!consumeResult.success) {
    // This shouldn't happen since we checked before, but handle it anyway
    console.warn("OpenAI quota consumption failed after successful summarization");
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
