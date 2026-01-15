/**
 * run-due フロー統合テスト
 * @description
 *   collect → select → mail → deliveries保存 → last_delivered_at更新
 *   の一連のフローをテストする。
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createTestDb, insertTestBook, createTestBookInput } from "../helpers/test-db.js";
import { setDb } from "../../src/db/init.js";
import {
  upsertBook,
  selectBooksForMail,
  markBooksDelivered,
  createBookDelivery,
  getBookByIsbn,
  getUndeliveredBookCount,
  createPromptWithToken,
  getPromptByToken,
} from "../../src/db/dao.js";
import { buildDeepResearchPrompt } from "../../src/services/prompt-builder.js";
import Database from "better-sqlite3";

describe("run-due フロー統合テスト", () => {
  let testDb: Database.Database;

  beforeEach(() => {
    testDb = createTestDb();
    setDb(testDb);
  });

  afterEach(() => {
    setDb(null);
  });

  describe("書籍収集 → 選択 → 配信記録フロー", () => {
    it("新規書籍をupsertして選択できる", () => {
      // 1. 書籍を収集（upsert）
      const book1 = upsertBook({
        isbn13: "9784873119083",
        title: "テスト書籍1",
        authors: ["著者A"],
        publisher: "出版社A",
        published_date: "2024-01-01",
        description: "説明1",
        source: "google_books",
      });

      const book2 = upsertBook({
        isbn13: "9784873119090",
        title: "テスト書籍2",
        authors: ["著者B"],
        publisher: "出版社B",
        published_date: "2024-02-01",
        description: "説明2",
        source: "google_books",
      });

      expect(book1.isbn13).toBe("9784873119083");
      expect(book2.isbn13).toBe("9784873119090");

      // 2. 書籍を選択
      const { books, isFallback } = selectBooksForMail(5, 3);

      expect(isFallback).toBe(false);
      expect(books).toHaveLength(2);
    });

    it("配信後にlast_delivered_atが更新される", () => {
      // 書籍を追加
      upsertBook({
        isbn13: "9784873119083",
        title: "テスト書籍",
        authors: ["著者"],
        source: "google_books",
      });

      // 選択
      const { books } = selectBooksForMail(5, 3);
      expect(books).toHaveLength(1);
      expect(books[0].last_delivered_at).toBeNull();

      // 配信記録作成
      const isbn13List = books.map(b => b.isbn13);
      createBookDelivery("test-job", isbn13List);
      markBooksDelivered(isbn13List);

      // 確認
      const updated = getBookByIsbn("9784873119083");
      expect(updated?.last_delivered_at).not.toBeNull();
    });

    it("配信後は未配信書籍として選択されない", () => {
      // 書籍を追加
      upsertBook({
        isbn13: "9784873119083",
        title: "テスト書籍",
        source: "google_books",
      });

      // 最初の選択
      const first = selectBooksForMail(5, 3);
      expect(first.books).toHaveLength(1);
      expect(first.isFallback).toBe(false);

      // 配信
      markBooksDelivered(["9784873119083"]);

      // 2回目の選択
      const second = selectBooksForMail(5, 3);
      expect(second.isFallback).toBe(true); // 未配信がないのでフォールバック
      expect(second.books).toHaveLength(1); // フォールバックで取得
    });

    it("ISBN-13の重複排除が機能する", () => {
      // 同じISBNで2回upsert
      upsertBook({
        isbn13: "9784873119083",
        title: "初回タイトル",
        source: "google_books",
      });

      upsertBook({
        isbn13: "9784873119083",
        title: "更新タイトル",
        source: "google_books",
      });

      // 1レコードのみ
      const { books } = selectBooksForMail(10, 3);
      expect(books).toHaveLength(1);
      expect(books[0].title).toBe("更新タイトル");
    });
  });

  describe("プロンプト生成 → トークン発行フロー", () => {
    it("書籍からプロンプトを生成しトークンを発行できる", () => {
      // 書籍を作成
      const book = upsertBook({
        isbn13: "9784873119083",
        title: "Deep Research テスト",
        authors: ["著者A", "著者B"],
        publisher: "テスト出版社",
        published_date: "2024-05-01",
        description: "この説明はプロンプトに含まれない",
        source: "google_books",
      });

      // プロンプト生成
      const promptText = buildDeepResearchPrompt(book);

      // descriptionが含まれていないことを確認
      expect(promptText).toContain("タイトル: Deep Research テスト");
      expect(promptText).toContain("著者: 著者A, 著者B");
      expect(promptText).not.toContain("この説明はプロンプトに含まれない");

      // トークン発行
      const token = createPromptWithToken(book.isbn13, promptText);
      expect(token).toHaveLength(32);

      // トークンからプロンプト取得
      const result = getPromptByToken(token);
      expect(result).not.toBeNull();
      expect(result?.promptText).toBe(promptText);
      expect(result?.isbn13).toBe(book.isbn13);
    });

    it("複数書籍に対してそれぞれトークンが発行される", () => {
      const book1 = upsertBook({
        isbn13: "9784873119083",
        title: "書籍1",
        source: "google_books",
      });

      const book2 = upsertBook({
        isbn13: "9784873119090",
        title: "書籍2",
        source: "google_books",
      });

      const prompt1 = buildDeepResearchPrompt(book1);
      const prompt2 = buildDeepResearchPrompt(book2);

      const token1 = createPromptWithToken(book1.isbn13, prompt1);
      const token2 = createPromptWithToken(book2.isbn13, prompt2);

      // 異なるトークン
      expect(token1).not.toBe(token2);

      // それぞれ正しいプロンプトを返す
      expect(getPromptByToken(token1)?.promptText).toContain("書籍1");
      expect(getPromptByToken(token2)?.promptText).toContain("書籍2");
    });
  });

  describe("エンドツーエンドフロー", () => {
    it("collect → select → prompt生成 → token発行 → mail記録 → 状態更新", () => {
      // 1. Collect: 書籍を収集
      const collectedBooks = [
        { isbn13: "9784873119083", title: "書籍A", authors: ["著者1"], source: "google_books" },
        { isbn13: "9784873119090", title: "書籍B", authors: ["著者2"], source: "google_books" },
        { isbn13: "9784873119106", title: "書籍C", authors: ["著者3"], source: "google_books" },
      ];

      for (const input of collectedBooks) {
        upsertBook(input);
      }

      expect(getUndeliveredBookCount()).toBe(3);

      // 2. Select: メール用に選択
      const { books, isFallback } = selectBooksForMail(2, 1);
      expect(books).toHaveLength(2);
      expect(isFallback).toBe(false);

      // 3. Prompt & Token: 各書籍にトークン発行
      const booksWithTokens = books.map(book => {
        const promptText = buildDeepResearchPrompt(book);
        const token = createPromptWithToken(book.isbn13, promptText);
        return { book, token };
      });

      expect(booksWithTokens).toHaveLength(2);
      for (const { token } of booksWithTokens) {
        expect(getPromptByToken(token)).not.toBeNull();
      }

      // 4. Mail記録: 配信記録を作成
      const isbn13List = books.map(b => b.isbn13);
      const delivery = createBookDelivery("test-job", isbn13List);
      expect(delivery.job_name).toBe("test-job");

      // 5. 状態更新: 配信済みにマーク
      markBooksDelivered(isbn13List);

      // 6. 検証: 未配信は1冊になる
      expect(getUndeliveredBookCount()).toBe(1);

      // 配信済み書籍のlast_delivered_atが設定されている
      for (const isbn13 of isbn13List) {
        const book = getBookByIsbn(isbn13);
        expect(book?.last_delivered_at).not.toBeNull();
      }

      // 次回選択では残り1冊が選ばれる
      const nextSelection = selectBooksForMail(5, 3);
      expect(nextSelection.books).toHaveLength(1);
      expect(nextSelection.isFallback).toBe(false);
      // 配信されなかった1冊が選ばれる（順序は登録順に依存）
      expect(nextSelection.books[0].last_delivered_at).toBeNull();
    });
  });
});
