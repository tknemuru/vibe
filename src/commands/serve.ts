/**
 * dre serve コマンド
 * @description
 *   HTTPサーバーを起動してCopyページを提供する。
 */

import { Command } from "commander";
import { serve } from "@hono/node-server";
import { createApp } from "../server/index.js";

/**
 * serve コマンドを作成する
 * @returns Commander コマンド
 */
export function createServeCommand(): Command {
  const cmd = new Command("serve")
    .description("HTTPサーバーを起動してCopyページを提供する")
    .option("--host <host>", "バインドするホスト", "0.0.0.0")
    .option("--port <port>", "ポート番号", "8787")
    .action(async (options) => {
      const host = options.host as string;
      const port = parseInt(options.port as string, 10);

      if (isNaN(port) || port < 1 || port > 65535) {
        console.error("Error: Invalid port number");
        process.exit(1);
      }

      const app = createApp();

      console.log(`Starting DRE Copy Server...`);
      console.log(`  Host: ${host}`);
      console.log(`  Port: ${port}`);
      console.log(`  URL: http://${host === "0.0.0.0" ? "localhost" : host}:${port}`);
      console.log();
      console.log("Press Ctrl+C to stop the server.");

      serve({
        fetch: app.fetch,
        hostname: host,
        port,
      });
    });

  return cmd;
}
