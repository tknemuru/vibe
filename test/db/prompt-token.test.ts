/**
 * プロンプトとトークンのDAO関数テスト
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createTestDb } from "../helpers/test-db.js";
import { setDb } from "../../src/db/init.js";
import {
  createPrompt,
  issueToken,
  getPromptByToken,
  createPromptWithToken,
  cleanupExpiredTokens,
} from "../../src/db/dao.js";
import Database from "better-sqlite3";

describe("Prompts & Tokens DAO", () => {
  let testDb: Database.Database;

  beforeEach(() => {
    testDb = createTestDb();
    setDb(testDb);
  });

  afterEach(() => {
    setDb(null);
  });

  describe("createPrompt", () => {
    it("プロンプトを作成してIDを返す", () => {
      const promptId = createPrompt("9784873119083", "テストプロンプト");
      expect(promptId).toBeGreaterThan(0);
    });

    it("同じISBNで複数のプロンプトを作成できる", () => {
      const id1 = createPrompt("9784873119083", "プロンプト1");
      const id2 = createPrompt("9784873119083", "プロンプト2");
      expect(id2).toBeGreaterThan(id1);
    });
  });

  describe("issueToken", () => {
    it("プロンプトIDに対してトークンを発行する", () => {
      const promptId = createPrompt("9784873119083", "テストプロンプト");
      const token = issueToken(promptId);

      expect(token).toHaveLength(32); // 16 bytes = 32 hex chars
      expect(token).toMatch(/^[a-f0-9]{32}$/);
    });

    it("同じプロンプトに対して複数のトークンを発行できる", () => {
      const promptId = createPrompt("9784873119083", "テストプロンプト");
      const token1 = issueToken(promptId);
      const token2 = issueToken(promptId);

      expect(token1).not.toBe(token2);
    });

    it("有効期限を指定してトークンを発行できる", () => {
      const promptId = createPrompt("9784873119083", "テストプロンプト");
      const token = issueToken(promptId, 7); // 7日間

      // トークンが発行されていることを確認
      const result = getPromptByToken(token);
      expect(result).not.toBeNull();
    });
  });

  describe("getPromptByToken", () => {
    it("有効なトークンでプロンプトを取得できる", () => {
      const promptId = createPrompt("9784873119083", "テストプロンプトテキスト");
      const token = issueToken(promptId);

      const result = getPromptByToken(token);

      expect(result).not.toBeNull();
      expect(result?.promptText).toBe("テストプロンプトテキスト");
      expect(result?.isbn13).toBe("9784873119083");
    });

    it("存在しないトークンではnullを返す", () => {
      const result = getPromptByToken("nonexistent-token");
      expect(result).toBeNull();
    });

    it("期限切れトークンではnullを返す", () => {
      const promptId = createPrompt("9784873119083", "テストプロンプト");

      // 過去の日付でトークンを直接挿入
      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 1);

      testDb.prepare(
        `INSERT INTO prompt_tokens (token, prompt_id, expires_at, created_at)
         VALUES (?, ?, ?, ?)`
      ).run("expired-token", promptId, pastDate.toISOString(), new Date().toISOString());

      const result = getPromptByToken("expired-token");
      expect(result).toBeNull();
    });
  });

  describe("createPromptWithToken", () => {
    it("プロンプト作成とトークン発行を一括で行う", () => {
      const token = createPromptWithToken("9784873119083", "一括テストプロンプト");

      expect(token).toHaveLength(32);

      const result = getPromptByToken(token);
      expect(result).not.toBeNull();
      expect(result?.promptText).toBe("一括テストプロンプト");
      expect(result?.isbn13).toBe("9784873119083");
    });

    it("有効期限を指定して一括処理できる", () => {
      const token = createPromptWithToken("9784873119083", "テストプロンプト", 60);

      const result = getPromptByToken(token);
      expect(result).not.toBeNull();
    });
  });

  describe("cleanupExpiredTokens", () => {
    it("期限切れトークンを削除する", () => {
      const promptId = createPrompt("9784873119083", "テストプロンプト");

      // 期限切れトークンを直接挿入
      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 1);
      testDb.prepare(
        `INSERT INTO prompt_tokens (token, prompt_id, expires_at, created_at)
         VALUES (?, ?, ?, ?)`
      ).run("expired-1", promptId, pastDate.toISOString(), new Date().toISOString());
      testDb.prepare(
        `INSERT INTO prompt_tokens (token, prompt_id, expires_at, created_at)
         VALUES (?, ?, ?, ?)`
      ).run("expired-2", promptId, pastDate.toISOString(), new Date().toISOString());

      // 有効なトークンも追加
      const validToken = issueToken(promptId);

      const deleted = cleanupExpiredTokens();

      expect(deleted).toBe(2);
      expect(getPromptByToken("expired-1")).toBeNull();
      expect(getPromptByToken("expired-2")).toBeNull();
      expect(getPromptByToken(validToken)).not.toBeNull();
    });

    it("期限切れトークンがなければ0を返す", () => {
      const promptId = createPrompt("9784873119083", "テストプロンプト");
      issueToken(promptId);

      const deleted = cleanupExpiredTokens();
      expect(deleted).toBe(0);
    });
  });
});
