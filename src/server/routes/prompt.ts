/**
 * プロンプトルート
 * @description
 *   GET /p/:token でCopyページを提供する。
 */

import { Hono } from "hono";
import { getPromptByToken } from "../../db/dao.js";
import { renderCopyPage, renderErrorPage } from "../views/copy-page.js";

/**
 * プロンプトルーターを作成する
 * @returns Honoルーター
 */
export function createPromptRouter(): Hono {
  const router = new Hono();

  /**
   * GET /p/:token
   * トークンを検証してCopyページを返す
   */
  router.get("/:token", (c) => {
    const token = c.req.param("token");

    if (!token || token.length !== 32) {
      return c.html(
        renderErrorPage(404, "無効なリンクです。メールのリンクを再度ご確認ください。"),
        404
      );
    }

    const result = getPromptByToken(token);

    if (!result) {
      // トークンが存在しないか期限切れ
      // 期限切れかどうかを判別するために追加のクエリが必要だが、
      // シンプルに410を返す（期限切れの可能性が高い）
      return c.html(
        renderErrorPage(410, "このリンクは期限切れです。新しいメールをご確認ください。"),
        410
      );
    }

    return c.html(renderCopyPage(result.promptText));
  });

  return router;
}
