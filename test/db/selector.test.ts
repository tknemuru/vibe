/**
 * Selector（書籍選択ロジック）のユニットテスト
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createTestDb, insertTestBook, createTestBookInput } from "../helpers/test-db.js";
import { setDb } from "../../src/db/init.js";
import {
  selectBooksForMail,
  listUndeliveredBooks,
  listRecentBooks,
} from "../../src/db/dao.js";
import Database from "better-sqlite3";

describe("Selector", () => {
  let testDb: Database.Database;

  beforeEach(() => {
    testDb = createTestDb();
    setDb(testDb);
  });

  afterEach(() => {
    setDb(null);
  });

  describe("listUndeliveredBooks", () => {
    it("未配信の書籍のみを返す", () => {
      // 未配信の書籍を追加
      insertTestBook(testDb, createTestBookInput({ isbn13: "9784873119083", title: "未配信1" }));
      insertTestBook(testDb, createTestBookInput({ isbn13: "9784873119090", title: "未配信2" }));
      // 配信済みの書籍を追加
      insertTestBook(testDb, createTestBookInput({ isbn13: "9784873119106", title: "配信済み" }), { delivered: true });

      const books = listUndeliveredBooks(10);

      expect(books).toHaveLength(2);
      expect(books.map(b => b.title)).toContain("未配信1");
      expect(books.map(b => b.title)).toContain("未配信2");
      expect(books.map(b => b.title)).not.toContain("配信済み");
    });

    it("limitで件数を制限できる", () => {
      insertTestBook(testDb, createTestBookInput({ isbn13: "9784873119083" }));
      insertTestBook(testDb, createTestBookInput({ isbn13: "9784873119090" }));
      insertTestBook(testDb, createTestBookInput({ isbn13: "9784873119106" }));

      const books = listUndeliveredBooks(2);

      expect(books).toHaveLength(2);
    });

    it("書籍がない場合は空配列を返す", () => {
      const books = listUndeliveredBooks(10);
      expect(books).toHaveLength(0);
    });
  });

  describe("listRecentBooks", () => {
    it("配信状態に関わらず最近の書籍を返す", () => {
      // 異なるlast_seen_atで書籍を追加
      const now = new Date();
      const older = new Date(now.getTime() - 60000); // 1分前
      const oldest = new Date(now.getTime() - 120000); // 2分前

      insertTestBook(testDb, createTestBookInput({ isbn13: "9784873119083", title: "最新" }),
        { lastSeenAt: now.toISOString() });
      insertTestBook(testDb, createTestBookInput({ isbn13: "9784873119090", title: "古い" }),
        { lastSeenAt: older.toISOString() });
      insertTestBook(testDb, createTestBookInput({ isbn13: "9784873119106", title: "配信済み最古" }),
        { lastSeenAt: oldest.toISOString(), delivered: true });

      const books = listRecentBooks(10);

      expect(books).toHaveLength(3);
      // last_seen_at DESC でソートされているか
      expect(books[0].title).toBe("最新");
      expect(books[1].title).toBe("古い");
      expect(books[2].title).toBe("配信済み最古");
    });

    it("limitで件数を制限できる", () => {
      insertTestBook(testDb, createTestBookInput({ isbn13: "9784873119083" }));
      insertTestBook(testDb, createTestBookInput({ isbn13: "9784873119090" }));
      insertTestBook(testDb, createTestBookInput({ isbn13: "9784873119106" }));

      const books = listRecentBooks(2);

      expect(books).toHaveLength(2);
    });
  });

  describe("selectBooksForMail", () => {
    it("未配信書籍がある場合は未配信書籍を優先して返す", () => {
      insertTestBook(testDb, createTestBookInput({ isbn13: "9784873119083", title: "未配信" }));
      insertTestBook(testDb, createTestBookInput({ isbn13: "9784873119090", title: "配信済み" }), { delivered: true });

      const result = selectBooksForMail(5, 3);

      expect(result.isFallback).toBe(false);
      expect(result.books).toHaveLength(1);
      expect(result.books[0].title).toBe("未配信");
    });

    it("未配信書籍がない場合はフォールバックで最近の書籍を返す", () => {
      insertTestBook(testDb, createTestBookInput({ isbn13: "9784873119083", title: "配信済み1" }), { delivered: true });
      insertTestBook(testDb, createTestBookInput({ isbn13: "9784873119090", title: "配信済み2" }), { delivered: true });

      const result = selectBooksForMail(5, 3);

      expect(result.isFallback).toBe(true);
      expect(result.books).toHaveLength(2);
    });

    it("書籍が0件の場合は空配列とisFallback=trueを返す", () => {
      const result = selectBooksForMail(5, 3);

      expect(result.isFallback).toBe(true);
      expect(result.books).toHaveLength(0);
    });

    it("mailLimitで未配信書籍の件数を制限できる", () => {
      insertTestBook(testDb, createTestBookInput({ isbn13: "9784873119083" }));
      insertTestBook(testDb, createTestBookInput({ isbn13: "9784873119090" }));
      insertTestBook(testDb, createTestBookInput({ isbn13: "9784873119106" }));
      insertTestBook(testDb, createTestBookInput({ isbn13: "9784873119113" }));
      insertTestBook(testDb, createTestBookInput({ isbn13: "9784873119120" }));

      const result = selectBooksForMail(3, 2);

      expect(result.isFallback).toBe(false);
      expect(result.books).toHaveLength(3);
    });

    it("fallbackLimitでフォールバック時の件数を制限できる", () => {
      insertTestBook(testDb, createTestBookInput({ isbn13: "9784873119083" }), { delivered: true });
      insertTestBook(testDb, createTestBookInput({ isbn13: "9784873119090" }), { delivered: true });
      insertTestBook(testDb, createTestBookInput({ isbn13: "9784873119106" }), { delivered: true });
      insertTestBook(testDb, createTestBookInput({ isbn13: "9784873119113" }), { delivered: true });
      insertTestBook(testDb, createTestBookInput({ isbn13: "9784873119120" }), { delivered: true });

      const result = selectBooksForMail(5, 2);

      expect(result.isFallback).toBe(true);
      expect(result.books).toHaveLength(2);
    });
  });
});
