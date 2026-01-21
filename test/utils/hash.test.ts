/**
 * hash ユーティリティのユニットテスト
 */

import { describe, it, expect } from "vitest";
import { computeQuerySetHash, shortHash } from "../../src/utils/hash.js";

describe("computeQuerySetHash", () => {
  it("クエリ配列からハッシュを計算できる", () => {
    const hash = computeQuerySetHash(["query1", "query2"]);
    expect(hash).toHaveLength(64); // SHA-256 hex
  });

  it("同じクエリ配列は同じハッシュを返す", () => {
    const hash1 = computeQuerySetHash(["query1", "query2"]);
    const hash2 = computeQuerySetHash(["query1", "query2"]);
    expect(hash1).toBe(hash2);
  });

  it("クエリ順序に依存しない（ソートされる）", () => {
    const hash1 = computeQuerySetHash(["query1", "query2"]);
    const hash2 = computeQuerySetHash(["query2", "query1"]);
    expect(hash1).toBe(hash2);
  });

  it("前後の空白は trim される", () => {
    const hash1 = computeQuerySetHash(["query1", "query2"]);
    const hash2 = computeQuerySetHash(["  query1  ", "  query2  "]);
    expect(hash1).toBe(hash2);
  });

  it("連続空白は単一スペースに正規化される", () => {
    const hash1 = computeQuerySetHash(["hello world"]);
    const hash2 = computeQuerySetHash(["hello    world"]);
    expect(hash1).toBe(hash2);
  });

  it("大文字小文字は区別される（lowercase しない）", () => {
    const hash1 = computeQuerySetHash(["Query"]);
    const hash2 = computeQuerySetHash(["query"]);
    expect(hash1).not.toBe(hash2);
  });

  it("異なるクエリ配列は異なるハッシュを返す", () => {
    const hash1 = computeQuerySetHash(["query1"]);
    const hash2 = computeQuerySetHash(["query2"]);
    expect(hash1).not.toBe(hash2);
  });

  it("空配列でもハッシュを計算できる", () => {
    const hash = computeQuerySetHash([]);
    expect(hash).toHaveLength(64);
  });
});

describe("shortHash", () => {
  it("ハッシュを16文字に短縮する", () => {
    const fullHash = "abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890";
    const short = shortHash(fullHash);
    expect(short).toBe("abcdef1234567890");
    expect(short).toHaveLength(16);
  });

  it("16文字未満のハッシュはそのまま返す", () => {
    const short = shortHash("abc123");
    expect(short).toBe("abc123");
  });
});
