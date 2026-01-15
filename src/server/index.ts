/**
 * Honoサーバーアプリケーション
 * @description
 *   Copyページを提供するHTTPサーバー。
 *   vibe serve コマンドから起動される。
 */

import { Hono } from "hono";
import { createPromptRouter } from "./routes/prompt.js";

/**
 * Honoアプリケーションを作成する
 * @returns 設定済みのHonoアプリケーション
 */
export function createApp(): Hono {
  const app = new Hono();

  // ヘルスチェック
  app.get("/", (c) => {
    return c.json({
      status: "ok",
      name: "Vibe Copy Server",
      version: "3.0.0",
    });
  });

  // プロンプトルート (/p/:token)
  app.route("/p", createPromptRouter());

  // 404ハンドラ
  app.notFound((c) => {
    return c.json(
      {
        error: "Not Found",
        message: "The requested resource was not found",
      },
      404
    );
  });

  // エラーハンドラ
  app.onError((err, c) => {
    console.error("Server error:", err);
    return c.json(
      {
        error: "Internal Server Error",
        message: err.message,
      },
      500
    );
  });

  return app;
}
