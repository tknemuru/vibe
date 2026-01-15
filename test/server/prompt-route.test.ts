/**
 * プロンプトルートのテスト
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createTestDb } from "../helpers/test-db.js";
import { setDb } from "../../src/db/init.js";
import { createPromptWithToken } from "../../src/db/dao.js";
import { createApp } from "../../src/server/index.js";
import Database from "better-sqlite3";

describe("Prompt Route", () => {
  let testDb: Database.Database;
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    testDb = createTestDb();
    setDb(testDb);
    app = createApp();
  });

  afterEach(() => {
    setDb(null);
  });

  describe("GET /p/:token", () => {
    it("有効なトークンで200とCopyページを返す", async () => {
      const token = createPromptWithToken("9784873119083", "テストプロンプト");

      const res = await app.request(`/p/${token}`);

      expect(res.status).toBe(200);
      const html = await res.text();
      expect(html).toContain("テストプロンプト");
      expect(html).toContain("コピー");
      expect(html).toContain("Deep Research");
    });

    it("存在しないトークンで410を返す", async () => {
      const res = await app.request("/p/00000000000000000000000000000000");

      expect(res.status).toBe(410);
      const html = await res.text();
      expect(html).toContain("期限切れ");
    });

    it("無効なトークン形式で404を返す", async () => {
      const res = await app.request("/p/invalid-token");

      expect(res.status).toBe(404);
      const html = await res.text();
      expect(html).toContain("無効なリンク");
    });

    it("期限切れトークンで410を返す", async () => {
      // プロンプトを作成
      const promptId = testDb
        .prepare("INSERT INTO prompts (isbn13, prompt_text, created_at) VALUES (?, ?, ?)")
        .run("9784873119083", "テストプロンプト", new Date().toISOString()).lastInsertRowid;

      // 期限切れトークンを直接挿入
      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 1);
      testDb.prepare(
        "INSERT INTO prompt_tokens (token, prompt_id, expires_at, created_at) VALUES (?, ?, ?, ?)"
      ).run("11111111111111111111111111111111", promptId, pastDate.toISOString(), new Date().toISOString());

      const res = await app.request("/p/11111111111111111111111111111111");

      expect(res.status).toBe(410);
    });

    it("HTMLにコピーボタンが含まれる", async () => {
      const token = createPromptWithToken("9784873119083", "テストプロンプト");

      const res = await app.request(`/p/${token}`);
      const html = await res.text();

      expect(html).toContain("copy-btn");
      expect(html).toContain("navigator.clipboard.writeText");
    });
  });

  describe("GET /", () => {
    it("ヘルスチェックでJSONを返す", async () => {
      const res = await app.request("/");

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.status).toBe("ok");
      expect(json.name).toBe("Vibe Copy Server");
      expect(json.version).toBe("3.0.0");
    });
  });

  describe("404 Handler", () => {
    it("存在しないパスで404を返す", async () => {
      const res = await app.request("/unknown-path");

      expect(res.status).toBe(404);
      const json = await res.json();
      expect(json.error).toBe("Not Found");
    });
  });
});
