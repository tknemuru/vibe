/**
 * DAOレイヤーのユニットテスト
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  normalizeIsbn13,
  getCollectCursor,
  upsertCollectCursor,
  resetCollectCursorsByJob,
  listCollectCursors,
} from "../../src/db/dao.js";
import { setDb } from "../../src/db/init.js";
import { createTestDb } from "../helpers/test-db.js";

describe("normalizeIsbn13", () => {
  it("ISBN-13をそのまま返す", () => {
    expect(normalizeIsbn13("9784873119083")).toBe("9784873119083");
  });

  it("ハイフン付きISBN-13を正規化する", () => {
    expect(normalizeIsbn13("978-4-87311-908-3")).toBe("9784873119083");
  });

  it("スペース付きISBN-13を正規化する", () => {
    expect(normalizeIsbn13("978 4873119083")).toBe("9784873119083");
  });

  it("ISBN-10をISBN-13に変換する", () => {
    // ISBN-10: 4873119081 -> ISBN-13: 9784873119083
    expect(normalizeIsbn13("4873119081")).toBe("9784873119083");
  });

  it("ハイフン付きISBN-10を正規化してISBN-13に変換する", () => {
    expect(normalizeIsbn13("4-87311-908-1")).toBe("9784873119083");
  });

  it("ISBN-10のチェックディジットがXの場合も変換できる", () => {
    // ISBN-10: 080442957X -> ISBN-13: 9780804429573
    expect(normalizeIsbn13("080442957X")).toBe("9780804429573");
  });

  it("無効なISBNにはnullを返す", () => {
    expect(normalizeIsbn13("")).toBeNull();
    expect(normalizeIsbn13("12345")).toBeNull();
    expect(normalizeIsbn13("abcdefghij")).toBeNull();
    expect(normalizeIsbn13("12345678901234")).toBeNull();
  });

  it("nullや空文字にはnullを返す", () => {
    expect(normalizeIsbn13("")).toBeNull();
  });
});

describe("CollectCursor DAO", () => {
  let db: ReturnType<typeof createTestDb>;

  beforeEach(() => {
    db = createTestDb();
    setDb(db);
  });

  afterEach(() => {
    db.close();
    setDb(null);
  });

  describe("getCollectCursor", () => {
    it("存在しないカーソルはundefinedを返す", () => {
      const result = getCollectCursor("test-job", "abc123");
      expect(result).toBeUndefined();
    });

    it("存在するカーソルを取得できる", () => {
      db.prepare(
        `INSERT INTO collect_cursor (job_name, query_set_hash, start_index, is_exhausted, last_updated_at)
         VALUES (?, ?, ?, ?, datetime('now'))`
      ).run("test-job", "abc123", 40, 0);

      const result = getCollectCursor("test-job", "abc123");
      expect(result).toBeDefined();
      expect(result?.job_name).toBe("test-job");
      expect(result?.query_set_hash).toBe("abc123");
      expect(result?.start_index).toBe(40);
      expect(result?.is_exhausted).toBe(false);
    });

    it("is_exhausted が 1 の場合は true を返す", () => {
      db.prepare(
        `INSERT INTO collect_cursor (job_name, query_set_hash, start_index, is_exhausted, last_updated_at)
         VALUES (?, ?, ?, ?, datetime('now'))`
      ).run("test-job", "abc123", 100, 1);

      const result = getCollectCursor("test-job", "abc123");
      expect(result?.is_exhausted).toBe(true);
    });
  });

  describe("upsertCollectCursor", () => {
    it("新規カーソルを作成できる", () => {
      upsertCollectCursor("test-job", "abc123", 40, false);

      const result = getCollectCursor("test-job", "abc123");
      expect(result?.start_index).toBe(40);
      expect(result?.is_exhausted).toBe(false);
    });

    it("既存カーソルを更新できる", () => {
      upsertCollectCursor("test-job", "abc123", 40, false);
      upsertCollectCursor("test-job", "abc123", 80, true);

      const result = getCollectCursor("test-job", "abc123");
      expect(result?.start_index).toBe(80);
      expect(result?.is_exhausted).toBe(true);
    });

    it("UPDATE時もlast_updated_atが更新される", async () => {
      upsertCollectCursor("test-job", "abc123", 40, false);
      const firstResult = getCollectCursor("test-job", "abc123");
      const firstUpdatedAt = firstResult?.last_updated_at;

      // SQLite datetime('now') は秒精度なので、1秒以上待つ必要がある
      await new Promise((resolve) => setTimeout(resolve, 1100));
      upsertCollectCursor("test-job", "abc123", 80, false);

      const secondResult = getCollectCursor("test-job", "abc123");
      expect(secondResult?.last_updated_at).not.toBe(firstUpdatedAt);
    });

    it("boolean変換が正しく行われる", () => {
      upsertCollectCursor("test-job", "abc123", 0, true);

      const row = db
        .prepare("SELECT is_exhausted FROM collect_cursor WHERE job_name = ? AND query_set_hash = ?")
        .get("test-job", "abc123") as { is_exhausted: number };
      expect(row.is_exhausted).toBe(1);

      const result = getCollectCursor("test-job", "abc123");
      expect(result?.is_exhausted).toBe(true);
    });
  });

  describe("resetCollectCursorsByJob", () => {
    it("指定ジョブのカーソルを全て削除する", () => {
      upsertCollectCursor("job-a", "hash1", 40, false);
      upsertCollectCursor("job-a", "hash2", 80, true);
      upsertCollectCursor("job-b", "hash1", 20, false);

      const deletedCount = resetCollectCursorsByJob("job-a");

      expect(deletedCount).toBe(2);
      expect(getCollectCursor("job-a", "hash1")).toBeUndefined();
      expect(getCollectCursor("job-a", "hash2")).toBeUndefined();
      expect(getCollectCursor("job-b", "hash1")).toBeDefined();
    });

    it("存在しないジョブの場合は0を返す", () => {
      const deletedCount = resetCollectCursorsByJob("non-existent");
      expect(deletedCount).toBe(0);
    });
  });

  describe("listCollectCursors", () => {
    it("全カーソルを取得できる", () => {
      upsertCollectCursor("job-a", "hash1", 40, false);
      upsertCollectCursor("job-b", "hash2", 80, true);

      const cursors = listCollectCursors();

      expect(cursors.length).toBe(2);
    });

    it("ジョブ名でフィルタできる", () => {
      upsertCollectCursor("job-a", "hash1", 40, false);
      upsertCollectCursor("job-a", "hash2", 60, false);
      upsertCollectCursor("job-b", "hash3", 80, true);

      const cursors = listCollectCursors("job-a");

      expect(cursors.length).toBe(2);
      expect(cursors.every((c) => c.job_name === "job-a")).toBe(true);
    });
  });
});
