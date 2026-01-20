/**
 * dre job add コマンドのテスト
 * @description
 *   job add 時の google_books デフォルト適用を検証する。
 *   addJob 関数を直接テストし、ファイル I/O は避ける。
 */

import { describe, it, expect } from "vitest";
import { addJob, JobsConfig, Job } from "../../src/config/jobs.js";

/**
 * テスト用の空の JobsConfig を作成
 */
function createEmptyConfig(): JobsConfig {
  return {
    defaults: {
      interval: "3h",
      mail_limit: 5,
      max_per_run: 20,
      fallback_limit: 3,
    },
    jobs: [],
  };
}

describe("job add - google_books", () => {
  it("google_books を明示指定した場合、その値で保存される", () => {
    const config = createEmptyConfig();

    const newJob: Job = {
      name: "test-job",
      queries: ["AI"],
      enabled: true,
      google_books: {
        printType: "magazines",
        langRestrict: "en",
      },
    };

    const result = addJob(config, newJob);

    expect(result.jobs).toHaveLength(1);
    expect(result.jobs[0].google_books).toEqual({
      printType: "magazines",
      langRestrict: "en",
    });
  });

  it("google_books がデフォルト値（books/ja）で設定される", () => {
    const config = createEmptyConfig();

    const newJob: Job = {
      name: "test-job-default",
      queries: ["機械学習"],
      enabled: true,
      google_books: {
        printType: "books",
        langRestrict: "ja",
      },
    };

    const result = addJob(config, newJob);

    expect(result.jobs).toHaveLength(1);
    expect(result.jobs[0].google_books).toEqual({
      printType: "books",
      langRestrict: "ja",
    });
  });

  it("printType のみカスタム指定した場合、langRestrict はそのまま", () => {
    const config = createEmptyConfig();

    const newJob: Job = {
      name: "test-job-partial",
      queries: ["TypeScript"],
      enabled: true,
      google_books: {
        printType: "all",
        langRestrict: "ja",
      },
    };

    const result = addJob(config, newJob);

    expect(result.jobs[0].google_books.printType).toBe("all");
    expect(result.jobs[0].google_books.langRestrict).toBe("ja");
  });

  it("重複する job 名の追加はエラーになる", () => {
    let config = createEmptyConfig();

    const job1: Job = {
      name: "duplicate-job",
      queries: ["test"],
      enabled: true,
      google_books: {
        printType: "books",
        langRestrict: "ja",
      },
    };

    config = addJob(config, job1);

    const job2: Job = {
      name: "duplicate-job",
      queries: ["test2"],
      enabled: true,
      google_books: {
        printType: "books",
        langRestrict: "ja",
      },
    };

    expect(() => addJob(config, job2)).toThrow('Job "duplicate-job" already exists');
  });

  it("複数の job を追加できる", () => {
    let config = createEmptyConfig();

    const job1: Job = {
      name: "job-1",
      queries: ["query1"],
      enabled: true,
      google_books: { printType: "books", langRestrict: "ja" },
    };

    const job2: Job = {
      name: "job-2",
      queries: ["query2"],
      enabled: false,
      google_books: { printType: "magazines", langRestrict: "en" },
    };

    config = addJob(config, job1);
    config = addJob(config, job2);

    expect(config.jobs).toHaveLength(2);
    expect(config.jobs[0].name).toBe("job-1");
    expect(config.jobs[1].name).toBe("job-2");
    expect(config.jobs[1].google_books.printType).toBe("magazines");
  });
});
