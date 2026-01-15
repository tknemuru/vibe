/**
 * Deep Research用プロンプトビルダー
 * @description
 *   書籍情報からDeep Research用のプロンプトを生成する。
 *   コピー対象のプロンプトにはdescriptionを含めない（指示書要件）。
 */

import { Book, getBookAuthors } from "../db/dao.js";

/**
 * Deep Research用プロンプトを構築する
 * @param book - 書籍エンティティ
 * @returns Deep Research用プロンプトテキスト（description除外）
 * @description
 *   - タイトル、著者、出版社、出版年、ISBNのみを含める
 *   - descriptionは意図的に除外（指示書要件）
 *   - Deep Researchに最適化されたフォーマット
 */
export function buildDeepResearchPrompt(book: Book): string {
  const authors = getBookAuthors(book);
  const authorsStr = authors.length > 0 ? authors.join(", ") : "不明";
  const publisher = book.publisher || "不明";
  const publishedDate = book.published_date || "不明";

  return `以下の書籍について、要約レポートを作成してください。

【書籍情報】
タイトル: ${book.title}
著者: ${authorsStr}
出版社: ${publisher}
出版年: ${publishedDate}
ISBN: ${book.isbn13}`;
}

/**
 * メール表示用の書籍情報インターフェース
 */
export interface DisplayBookInfo {
  title: string;
  authors: string;
  publisher: string;
  publishedDate: string;
  isbn13: string;
  description: string | null;
  coverUrl: string | null;
}

/**
 * メール表示用の書籍情報を構築する
 * @param book - 書籍エンティティ
 * @returns 表示用書籍情報（description含む、閲覧専用）
 * @description
 *   descriptionを含むが、これはメール閲覧用であり、
 *   コピー対象（prompt_text）には含めない。
 */
export function buildDisplayInfo(book: Book): DisplayBookInfo {
  const authors = getBookAuthors(book);

  return {
    title: book.title,
    authors: authors.length > 0 ? authors.join(", ") : "不明",
    publisher: book.publisher || "不明",
    publishedDate: book.published_date || "不明",
    isbn13: book.isbn13,
    description: book.description,
    coverUrl: book.cover_url,
  };
}
