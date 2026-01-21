import crypto from "crypto";

/**
 * クエリ配列を正規化してSHA-256ハッシュを計算する
 * @param queries - クエリ文字列の配列
 * @returns SHA-256ハッシュ（64文字）
 * @description
 *   - trim: 前後の空白を除去
 *   - 連続空白の正規化: \s+ を単一スペースに置換
 *   - ソート: クエリ順序に依存しない
 *   - lowercase は行わない: Google Books API のクエリ解釈に影響を与える可能性があるため
 */
export function computeQuerySetHash(queries: string[]): string {
  const normalized = queries
    .map((q) => q.trim().replace(/\s+/g, " "))
    .sort()
    .join("\n");
  return crypto.createHash("sha256").update(normalized).digest("hex");
}

/**
 * ハッシュ値をログ用に短縮する
 * @param hash - フルのハッシュ値（64文字）
 * @returns 短縮ハッシュ（先頭16文字）
 */
export function shortHash(hash: string): string {
  return hash.slice(0, 16);
}
