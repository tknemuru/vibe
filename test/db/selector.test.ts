/**
 * Selector（書籍選択ロジック）のユニットテスト
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  createTestDb,
  insertTestBook,
  createTestBookInput,
  insertTestDelivery,
  insertTestDeliveryItem,
} from "../helpers/test-db.js";
import { setDb } from "../../src/db/init.js";
import {
  selectBooksForMail,
  listUndeliveredBooks,
  listRecentBooks,
  listUndeliveredBooksForJob,
  selectBooksForMailByJob,
  recordDeliveryItems,
  resetDeliveryItems,
  getDeliveryStatsForJob,
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

  // ============================================
  // Ver4.0: ジョブ別配信履歴テスト
  // ============================================

  describe("listUndeliveredBooksForJob (Ver4.0)", () => {
    it("特定ジョブで未配信の書籍のみを返す", () => {
      // 書籍を追加
      insertTestBook(testDb, createTestBookInput({ isbn13: "9784873119083", title: "書籍A" }));
      insertTestBook(testDb, createTestBookInput({ isbn13: "9784873119090", title: "書籍B" }));

      // job-a で書籍Aを配信済みにする
      const deliveryId = insertTestDelivery(testDb, "job-a", ["9784873119083"]);
      insertTestDeliveryItem(testDb, deliveryId, "job-a", "9784873119083");

      // job-a では書籍Bのみ未配信
      const booksForJobA = listUndeliveredBooksForJob("job-a", 10);
      expect(booksForJobA).toHaveLength(1);
      expect(booksForJobA[0].title).toBe("書籍B");

      // job-b では両方未配信
      const booksForJobB = listUndeliveredBooksForJob("job-b", 10);
      expect(booksForJobB).toHaveLength(2);
    });

    it("同一書籍が異なるジョブで独立して配信される", () => {
      insertTestBook(testDb, createTestBookInput({ isbn13: "9784873119083", title: "共通書籍" }));

      // job-a で配信済み
      const deliveryIdA = insertTestDelivery(testDb, "job-a", ["9784873119083"]);
      insertTestDeliveryItem(testDb, deliveryIdA, "job-a", "9784873119083");

      // job-a では未配信0件
      expect(listUndeliveredBooksForJob("job-a", 10)).toHaveLength(0);

      // job-b では未配信1件
      expect(listUndeliveredBooksForJob("job-b", 10)).toHaveLength(1);

      // job-b でも配信
      const deliveryIdB = insertTestDelivery(testDb, "job-b", ["9784873119083"]);
      insertTestDeliveryItem(testDb, deliveryIdB, "job-b", "9784873119083");

      // 両方とも未配信0件
      expect(listUndeliveredBooksForJob("job-a", 10)).toHaveLength(0);
      expect(listUndeliveredBooksForJob("job-b", 10)).toHaveLength(0);
    });

    it("delivery_items が空なら全書籍が未配信として返る", () => {
      insertTestBook(testDb, createTestBookInput({ isbn13: "9784873119083" }));
      insertTestBook(testDb, createTestBookInput({ isbn13: "9784873119090" }));
      insertTestBook(testDb, createTestBookInput({ isbn13: "9784873119106" }));

      const books = listUndeliveredBooksForJob("any-job", 10);
      expect(books).toHaveLength(3);
    });
  });

  describe("selectBooksForMailByJob (Ver4.0)", () => {
    it("未配信書籍がある場合は未配信書籍を返す", () => {
      insertTestBook(testDb, createTestBookInput({ isbn13: "9784873119083", title: "未配信" }));

      const result = selectBooksForMailByJob("job-a", 5, 3);

      expect(result.isFallback).toBe(false);
      expect(result.books).toHaveLength(1);
      expect(result.books[0].title).toBe("未配信");
    });

    it("未配信0件時は空配列を返す（フォールバックなし）", () => {
      insertTestBook(testDb, createTestBookInput({ isbn13: "9784873119083" }));

      // 配信済みにする
      const deliveryId = insertTestDelivery(testDb, "job-a", ["9784873119083"]);
      insertTestDeliveryItem(testDb, deliveryId, "job-a", "9784873119083");

      const result = selectBooksForMailByJob("job-a", 5, 3);

      expect(result.isFallback).toBe(false);
      expect(result.books).toHaveLength(0);
    });
  });

  describe("recordDeliveryItems (Ver4.0)", () => {
    it("配信アイテムを記録できる", () => {
      insertTestBook(testDb, createTestBookInput({ isbn13: "9784873119083" }));
      insertTestBook(testDb, createTestBookInput({ isbn13: "9784873119090" }));

      // 配信記録を作成
      const deliveryId = insertTestDelivery(testDb, "job-a", ["9784873119083", "9784873119090"]);

      // delivery_items に記録
      const count = recordDeliveryItems(deliveryId, "job-a", ["9784873119083", "9784873119090"]);

      expect(count).toBe(2);

      // 未配信が0件になっている
      const books = listUndeliveredBooksForJob("job-a", 10);
      expect(books).toHaveLength(0);
    });

    it("同一ペアは重複挿入されない（INSERT OR IGNORE）", () => {
      insertTestBook(testDb, createTestBookInput({ isbn13: "9784873119083" }));

      const deliveryId = insertTestDelivery(testDb, "job-a", ["9784873119083"]);

      // 初回
      const count1 = recordDeliveryItems(deliveryId, "job-a", ["9784873119083"]);
      expect(count1).toBe(1);

      // 2回目（重複）
      const count2 = recordDeliveryItems(deliveryId, "job-a", ["9784873119083"]);
      expect(count2).toBe(0);
    });
  });

  describe("resetDeliveryItems (Ver4.0)", () => {
    it("ジョブ指定でそのジョブの delivery_items のみ削除", () => {
      insertTestBook(testDb, createTestBookInput({ isbn13: "9784873119083" }));
      insertTestBook(testDb, createTestBookInput({ isbn13: "9784873119090" }));

      // job-a と job-b で配信
      const deliveryIdA = insertTestDelivery(testDb, "job-a", ["9784873119083"]);
      insertTestDeliveryItem(testDb, deliveryIdA, "job-a", "9784873119083");

      const deliveryIdB = insertTestDelivery(testDb, "job-b", ["9784873119090"]);
      insertTestDeliveryItem(testDb, deliveryIdB, "job-b", "9784873119090");

      // job-a のみリセット
      const resetCount = resetDeliveryItems({ jobName: "job-a" });
      expect(resetCount).toBe(1);

      // job-a は未配信1件
      expect(listUndeliveredBooksForJob("job-a", 10)).toHaveLength(2);

      // job-b は未配信1件のまま
      expect(listUndeliveredBooksForJob("job-b", 10)).toHaveLength(1);
    });

    it("オプションなしで全 delivery_items を削除", () => {
      insertTestBook(testDb, createTestBookInput({ isbn13: "9784873119083" }));
      insertTestBook(testDb, createTestBookInput({ isbn13: "9784873119090" }));

      const deliveryId = insertTestDelivery(testDb, "job-a", ["9784873119083", "9784873119090"]);
      insertTestDeliveryItem(testDb, deliveryId, "job-a", "9784873119083");
      insertTestDeliveryItem(testDb, deliveryId, "job-a", "9784873119090");

      const resetCount = resetDeliveryItems();
      expect(resetCount).toBe(2);

      // 全て未配信に戻る
      expect(listUndeliveredBooksForJob("job-a", 10)).toHaveLength(2);
    });
  });

  describe("getDeliveryStatsForJob (Ver4.0)", () => {
    it("ジョブ別の統計情報を取得できる", () => {
      insertTestBook(testDb, createTestBookInput({ isbn13: "9784873119083" }));
      insertTestBook(testDb, createTestBookInput({ isbn13: "9784873119090" }));
      insertTestBook(testDb, createTestBookInput({ isbn13: "9784873119106" }));

      // 2冊を配信済みにする
      const deliveryId = insertTestDelivery(testDb, "job-a", ["9784873119083", "9784873119090"]);
      insertTestDeliveryItem(testDb, deliveryId, "job-a", "9784873119083");
      insertTestDeliveryItem(testDb, deliveryId, "job-a", "9784873119090");

      const stats = getDeliveryStatsForJob("job-a");

      expect(stats.total).toBe(3);
      expect(stats.delivered).toBe(2);
      expect(stats.undelivered).toBe(1);
    });

    it("配信履歴がないジョブは全て未配信", () => {
      insertTestBook(testDb, createTestBookInput({ isbn13: "9784873119083" }));
      insertTestBook(testDb, createTestBookInput({ isbn13: "9784873119090" }));

      const stats = getDeliveryStatsForJob("new-job");

      expect(stats.total).toBe(2);
      expect(stats.delivered).toBe(0);
      expect(stats.undelivered).toBe(2);
    });
  });
});
