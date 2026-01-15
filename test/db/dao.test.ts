/**
 * DAOレイヤーのユニットテスト
 */

import { describe, it, expect } from "vitest";
import { normalizeIsbn13 } from "../../src/db/dao.js";

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
