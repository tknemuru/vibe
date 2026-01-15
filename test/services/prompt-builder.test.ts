/**
 * Prompt Builderのユニットテスト
 */

import { describe, it, expect } from "vitest";
import { buildDeepResearchPrompt, buildDisplayInfo } from "../../src/services/prompt-builder.js";
import type { Book } from "../../src/db/dao.js";

/**
 * テスト用の書籍データを生成する
 */
function createTestBook(overrides: Partial<Book> = {}): Book {
  return {
    isbn13: "9784873119083",
    title: "テスト書籍タイトル",
    authors_json: JSON.stringify(["著者A", "著者B"]),
    publisher: "テスト出版社",
    published_date: "2024-01-15",
    description: "これはテスト用の説明文です。Deep Researchには含めません。",
    cover_url: "https://example.com/cover.jpg",
    links_json: null,
    source: "test",
    first_seen_at: new Date().toISOString(),
    last_seen_at: new Date().toISOString(),
    last_delivered_at: null,
    ...overrides,
  };
}

describe("buildDeepResearchPrompt", () => {
  it("タイトル、著者、出版社、出版年、ISBNを含む", () => {
    const book = createTestBook();
    const prompt = buildDeepResearchPrompt(book);

    expect(prompt).toContain("タイトル: テスト書籍タイトル");
    expect(prompt).toContain("著者: 著者A, 著者B");
    expect(prompt).toContain("出版社: テスト出版社");
    expect(prompt).toContain("出版年: 2024-01-15");
    expect(prompt).toContain("ISBN: 9784873119083");
  });

  it("descriptionを含まない", () => {
    const book = createTestBook({
      description: "この説明はプロンプトに含まれてはいけません。",
    });
    const prompt = buildDeepResearchPrompt(book);

    expect(prompt).not.toContain("説明");
    expect(prompt).not.toContain("この説明はプロンプトに含まれてはいけません");
  });

  it("著者がない場合は「不明」と表示", () => {
    const book = createTestBook({ authors_json: null });
    const prompt = buildDeepResearchPrompt(book);

    expect(prompt).toContain("著者: 不明");
  });

  it("出版社がない場合は「不明」と表示", () => {
    const book = createTestBook({ publisher: null });
    const prompt = buildDeepResearchPrompt(book);

    expect(prompt).toContain("出版社: 不明");
  });

  it("出版年がない場合は「不明」と表示", () => {
    const book = createTestBook({ published_date: null });
    const prompt = buildDeepResearchPrompt(book);

    expect(prompt).toContain("出版年: 不明");
  });

  it("空の著者配列の場合は「不明」と表示", () => {
    const book = createTestBook({ authors_json: "[]" });
    const prompt = buildDeepResearchPrompt(book);

    expect(prompt).toContain("著者: 不明");
  });

  it("要約レポート作成の依頼文を含む", () => {
    const book = createTestBook();
    const prompt = buildDeepResearchPrompt(book);

    expect(prompt).toContain("以下の書籍について、要約レポートを作成してください");
    expect(prompt).toContain("【書籍情報】");
  });
});

describe("buildDisplayInfo", () => {
  it("全てのフィールドを正しく変換する", () => {
    const book = createTestBook();
    const info = buildDisplayInfo(book);

    expect(info.title).toBe("テスト書籍タイトル");
    expect(info.authors).toBe("著者A, 著者B");
    expect(info.publisher).toBe("テスト出版社");
    expect(info.publishedDate).toBe("2024-01-15");
    expect(info.isbn13).toBe("9784873119083");
    expect(info.description).toBe("これはテスト用の説明文です。Deep Researchには含めません。");
    expect(info.coverUrl).toBe("https://example.com/cover.jpg");
  });

  it("descriptionを含む（表示用）", () => {
    const book = createTestBook({
      description: "表示用の説明文",
    });
    const info = buildDisplayInfo(book);

    expect(info.description).toBe("表示用の説明文");
  });

  it("descriptionがnullの場合はnullを返す", () => {
    const book = createTestBook({ description: null });
    const info = buildDisplayInfo(book);

    expect(info.description).toBeNull();
  });

  it("著者がない場合は「不明」と表示", () => {
    const book = createTestBook({ authors_json: null });
    const info = buildDisplayInfo(book);

    expect(info.authors).toBe("不明");
  });
});
