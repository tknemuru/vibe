/**
 * dre job cursor reset コマンドのテスト
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { setDb } from "../../src/db/init.js";
import { createTestDb } from "../helpers/test-db.js";
import {
  upsertCollectCursor,
  getCollectCursor,
  resetCollectCursorsByJob,
} from "../../src/db/dao.js";

describe("job cursor reset command", () => {
  let db: ReturnType<typeof createTestDb>;

  beforeEach(() => {
    db = createTestDb();
    setDb(db);
  });

  afterEach(() => {
    db.close();
    setDb(null);
  });

  it("resetCollectCursorsByJob で指定ジョブのカーソルがリセットされる", () => {
    // Setup
    upsertCollectCursor("test-job", "hash1", 40, false);
    upsertCollectCursor("test-job", "hash2", 80, true);
    upsertCollectCursor("other-job", "hash3", 20, false);

    // Act
    const count = resetCollectCursorsByJob("test-job");

    // Assert
    expect(count).toBe(2);
    expect(getCollectCursor("test-job", "hash1")).toBeUndefined();
    expect(getCollectCursor("test-job", "hash2")).toBeUndefined();
    expect(getCollectCursor("other-job", "hash3")).toBeDefined();
  });

  it("存在しないジョブをリセットしても 0 を返す", () => {
    const count = resetCollectCursorsByJob("non-existent-job");
    expect(count).toBe(0);
  });

  it("リセット後は新しいカーソルとして start_index=0 から開始できる", () => {
    // Setup: 枯渇状態のカーソルを作成
    upsertCollectCursor("test-job", "hash1", 100, true);

    // Act: リセット
    resetCollectCursorsByJob("test-job");

    // Assert: カーソルが削除されている
    const cursor = getCollectCursor("test-job", "hash1");
    expect(cursor).toBeUndefined();

    // 新しくカーソルを作成すると start_index=0 から
    upsertCollectCursor("test-job", "hash1", 0, false);
    const newCursor = getCollectCursor("test-job", "hash1");
    expect(newCursor?.start_index).toBe(0);
    expect(newCursor?.is_exhausted).toBe(false);
  });
});
