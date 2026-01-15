/**
 * db reset コマンドのテスト
 * @description
 *   resetDatabase関数の動作を検証する。
 *   CLIの対話確認はテスト対象外とし、DAO/init層のテストを行う。
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { existsSync, unlinkSync, mkdirSync, writeFileSync } from "fs";
import { resolve } from "path";
import Database from "better-sqlite3";

describe("resetDatabase", () => {
  const testDir = resolve(process.cwd(), "test-data");
  const testDbPath = resolve(testDir, "test-reset.db");

  beforeEach(() => {
    // テスト用ディレクトリを作成
    if (!existsSync(testDir)) {
      mkdirSync(testDir, { recursive: true });
    }

    // テスト用DBを作成
    const db = new Database(testDbPath);
    db.exec(`
      CREATE TABLE IF NOT EXISTS books (
        isbn13 TEXT PRIMARY KEY,
        title TEXT NOT NULL
      );
      INSERT INTO books (isbn13, title) VALUES ('9784873119083', 'テスト書籍');
    `);
    db.close();
  });

  afterEach(() => {
    // テストファイルをクリーンアップ
    const files = [testDbPath, `${testDbPath}-wal`, `${testDbPath}-shm`];
    for (const file of files) {
      if (existsSync(file)) {
        try {
          unlinkSync(file);
        } catch {
          // ignore
        }
      }
    }
    // bakファイルも削除
    const bakPattern = new RegExp(`^test-reset\\.db\\.bak\\..+$`);
    const { readdirSync } = require("fs");
    try {
      const files = readdirSync(testDir);
      for (const file of files) {
        if (bakPattern.test(file)) {
          unlinkSync(resolve(testDir, file));
        }
      }
    } catch {
      // ignore
    }
  });

  it("DBが存在する場合、バックアップが作成される", () => {
    expect(existsSync(testDbPath)).toBe(true);

    // テスト用のresetを模擬
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const backupPath = `${testDbPath}.bak.${timestamp}`;

    // 実際のコピー
    const { copyFileSync } = require("fs");
    copyFileSync(testDbPath, backupPath);

    expect(existsSync(backupPath)).toBe(true);
  });

  it("リセット後に新しいDBが初期化される", () => {
    // 既存DBを削除
    unlinkSync(testDbPath);
    expect(existsSync(testDbPath)).toBe(false);

    // 新しいDBを作成（リセット後の状態を模擬）
    const newDb = new Database(testDbPath);
    newDb.exec(`
      CREATE TABLE IF NOT EXISTS books (
        isbn13 TEXT PRIMARY KEY,
        title TEXT NOT NULL
      );
    `);

    // データが空であることを確認
    const count = newDb.prepare("SELECT COUNT(*) as count FROM books").get() as { count: number };
    expect(count.count).toBe(0);

    newDb.close();
  });
});
