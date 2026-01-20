/**
 * Google Books Collector ユニットテスト
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { GoogleBooksCollector, GoogleBooksSearchOptions } from "../../src/collectors/google-books.js";

// fetch をモック
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

// 環境変数をモック
const originalEnv = process.env;

describe("GoogleBooksCollector", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    process.env = { ...originalEnv, GOOGLE_BOOKS_API_KEY: "test-api-key" };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  const defaultOptions: GoogleBooksSearchOptions = {
    printType: "books",
    langRestrict: "ja",
  };

  describe("リクエストパラメータ", () => {
    it("リクエスト URL に printType が含まれること", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ totalItems: 0, items: [] }),
      });

      const collector = new GoogleBooksCollector();
      await collector.collect(["test query"], 10, { printType: "books", langRestrict: "ja" });

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const url = new URL(mockFetch.mock.calls[0][0]);
      expect(url.searchParams.get("printType")).toBe("books");
    });

    it("リクエスト URL に langRestrict が含まれること", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ totalItems: 0, items: [] }),
      });

      const collector = new GoogleBooksCollector();
      await collector.collect(["test query"], 10, { printType: "books", langRestrict: "ja" });

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const url = new URL(mockFetch.mock.calls[0][0]);
      expect(url.searchParams.get("langRestrict")).toBe("ja");
    });

    it("printType / langRestrict をカスタム値で上書きできること", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ totalItems: 0, items: [] }),
      });

      const collector = new GoogleBooksCollector();
      await collector.collect(["test query"], 10, { printType: "magazines", langRestrict: "en" });

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const url = new URL(mockFetch.mock.calls[0][0]);
      expect(url.searchParams.get("printType")).toBe("magazines");
      expect(url.searchParams.get("langRestrict")).toBe("en");
    });
  });

  describe("ISBN フィルタリング", () => {
    it("ISBN のない volume がスキップされること", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          totalItems: 3,
          items: [
            {
              id: "vol1",
              volumeInfo: {
                title: "Book with ISBN",
                industryIdentifiers: [{ type: "ISBN_13", identifier: "9784873119083" }],
              },
            },
            {
              id: "vol2",
              volumeInfo: {
                title: "Book without ISBN",
                industryIdentifiers: [{ type: "OTHER", identifier: "OTHER123" }],
              },
            },
            {
              id: "vol3",
              volumeInfo: {
                title: "Book with no identifiers",
              },
            },
          ],
        }),
      });

      const collector = new GoogleBooksCollector();
      const result = await collector.collect(["test"], 10, defaultOptions);

      expect(result.totalBooks).toBe(1);
      expect(result.totalSkipped).toBe(2);
      expect(result.results[0].books[0].isbn13).toBe("9784873119083");
    });

    it("ISBN-13 が正しく抽出されること", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          totalItems: 1,
          items: [
            {
              id: "vol1",
              volumeInfo: {
                title: "Test Book",
                industryIdentifiers: [{ type: "ISBN_13", identifier: "9784873119083" }],
              },
            },
          ],
        }),
      });

      const collector = new GoogleBooksCollector();
      const result = await collector.collect(["test"], 10, defaultOptions);

      expect(result.results[0].books[0].isbn13).toBe("9784873119083");
    });

    it("ISBN-10 が ISBN-13 に変換されること", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          totalItems: 1,
          items: [
            {
              id: "vol1",
              volumeInfo: {
                title: "Test Book",
                industryIdentifiers: [{ type: "ISBN_10", identifier: "4873119081" }],
              },
            },
          ],
        }),
      });

      const collector = new GoogleBooksCollector();
      const result = await collector.collect(["test"], 10, defaultOptions);

      // ISBN-10 -> ISBN-13 変換
      expect(result.results[0].books[0].isbn13).toMatch(/^978/);
    });
  });

  describe("ログ出力", () => {
    it("ログに printType / langRestrict が出力されること", async () => {
      const consoleSpy = vi.spyOn(console, "log");

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          totalItems: 10,
          items: [
            {
              id: "vol1",
              volumeInfo: {
                title: "Test Book",
                industryIdentifiers: [{ type: "ISBN_13", identifier: "9784873119083" }],
              },
            },
          ],
        }),
      });

      const collector = new GoogleBooksCollector();
      await collector.collect(["test query"], 10, { printType: "books", langRestrict: "ja" });

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("printType=books")
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("langRestrict=ja")
      );

      consoleSpy.mockRestore();
    });
  });

  describe("エラーハンドリング", () => {
    it("API キーが未設定の場合エラーをログに出力し空結果を返すこと", async () => {
      delete process.env.GOOGLE_BOOKS_API_KEY;
      const consoleSpy = vi.spyOn(console, "error");

      const collector = new GoogleBooksCollector();
      const result = await collector.collect(["test"], 10, defaultOptions);

      // エラーがログに出力される
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("GOOGLE_BOOKS_API_KEY")
      );
      // 空の結果が返る
      expect(result.totalBooks).toBe(0);

      consoleSpy.mockRestore();
    });
  });
});
