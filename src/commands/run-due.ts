import { Command } from "commander";
import {
  loadJobsConfig,
  Job,
  getJobQueries,
} from "../config/jobs.js";
import {
  getJobState,
  updateJobState,
  upsertBook,
  selectBooksForMailByJob,
  getDeliveryStatsForJob,
  Book,
} from "../db/dao.js";
import { createGoogleBooksCollector } from "../collectors/google-books.js";
import { CollectorError } from "../collectors/index.js";
import { getGoogleBooksQuotaStatus } from "../utils/quota.js";
import { sendBookDigestEmail, MailerError } from "../services/mailer.js";

const DUE_INTERVAL_MS = 3 * 60 * 60 * 1000; // 3 hours in milliseconds

function log(level: "INFO" | "WARN" | "ERROR", message: string): void {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] [${level}] ${message}`);
}

function isJobDue(jobName: string): boolean {
  const state = getJobState(jobName);

  if (!state?.last_success_at) {
    log("INFO", `[Due] job=${jobName}: due=true (never run before)`);
    return true;
  }

  const lastSuccess = new Date(state.last_success_at).getTime();
  const now = Date.now();
  const elapsedMs = now - lastSuccess;
  const isDue = elapsedMs >= DUE_INTERVAL_MS;

  log(
    "INFO",
    `[Due] job=${jobName}, input: last_success_at=${state.last_success_at}, elapsed=${Math.round(elapsedMs / 60000)}min, threshold=${Math.round(DUE_INTERVAL_MS / 60000)}min, due=${isDue}`
  );

  return isDue;
}

/**
 * ジョブ実行結果（サマリ用）
 */
interface JobRunResult {
  jobName: string;
  books: Book[];
  totalItems: number;
  totalReturned: number;
  totalSkipped: number;
  insertedCount: number;
  updatedCount: number;
}

/**
 * Ver2.0 Book Pipeline
 * Flow: collect -> select -> mail
 */
async function runJobV2(
  job: Job,
  defaults: { mail_limit: number; max_per_run: number; fallback_limit: number }
): Promise<JobRunResult | null> {
  const jobName = job.name;
  log("INFO", `Processing job: ${jobName}`);

  // Update last_run_at
  updateJobState(jobName, { last_run_at: new Date().toISOString() });

  // Get effective settings
  const queries = getJobQueries(job);
  const maxPerRun = job.max_per_run ?? defaults.max_per_run;

  try {
    // 1. Collect books
    log("INFO", `Collecting books for queries: ${JSON.stringify(queries)}`);
    log("INFO", `max_per_run=${maxPerRun}`);

    const collector = createGoogleBooksCollector();
    const collectResult = await collector.collect(queries, maxPerRun, job.google_books);

    log(
      "INFO",
      `Collected ${collectResult.totalBooks} book(s), skipped ${collectResult.totalSkipped} (no ISBN)`
    );

    // Upsert collected books to database
    let insertedCount = 0;
    let updatedCount = 0;
    for (const queryResult of collectResult.results) {
      for (const bookInput of queryResult.books) {
        try {
          const result = upsertBook(bookInput);
          if (result.action === "inserted") {
            insertedCount++;
          } else {
            updatedCount++;
          }
        } catch (error) {
          log("WARN", `Failed to upsert book ${bookInput.isbn13}: ${error}`);
        }
      }
    }
    log("INFO", `[Upsert] inserted=${insertedCount}, updated=${updatedCount}, total=${insertedCount + updatedCount}`);

    // Mark success
    updateJobState(jobName, { last_success_at: new Date().toISOString() });

    // Return result for summary - selection happens after all jobs complete
    return {
      jobName,
      books: [],
      totalItems: collectResult.totalItems,
      totalReturned: collectResult.totalReturned,
      totalSkipped: collectResult.totalSkipped,
      insertedCount,
      updatedCount,
    };
  } catch (error) {
    if (error instanceof CollectorError) {
      log("ERROR", `Collector error for ${jobName}: ${error.message}`);
    } else {
      log("ERROR", `Error processing ${jobName}: ${error}`);
    }
    return null;
  }
}

export const runDueCommand = new Command("run-due")
  .description("Run all due jobs and send book digest email")
  .option("--dry-run", "Check which jobs are due without running them")
  .option("--force", "Run all enabled jobs regardless of due status")
  .option("--force-mail", "Force send email even with 0 books (for testing)")
  .action(async (options) => {
    log("INFO", "Starting dre run-due (Ver2.0 - Book Collection Mode)");
    log("INFO", getGoogleBooksQuotaStatus());

    try {
      const config = loadJobsConfig();
      const enabledJobs = config.jobs.filter((j) => j.enabled);

      if (enabledJobs.length === 0) {
        log("WARN", "No enabled jobs found");
        return;
      }

      log("INFO", `Found ${enabledJobs.length} enabled job(s)`);

      // Check which jobs are due
      const dueJobs = options.force
        ? enabledJobs
        : enabledJobs.filter((j) => isJobDue(j.name));

      if (dueJobs.length === 0) {
        log("INFO", "No jobs are due at this time");
        return;
      }

      log("INFO", `${dueJobs.length} job(s) are due: ${dueJobs.map((j) => j.name).join(", ")}`);

      if (options.dryRun) {
        log("INFO", "Dry run - not executing jobs");
        return;
      }

      // Get defaults from config
      const defaults = {
        mail_limit: config.defaults.mail_limit,
        max_per_run: config.defaults.max_per_run,
        fallback_limit: config.defaults.fallback_limit,
      };

      // Process each due job (collect books)
      const results: JobRunResult[] = [];
      for (const job of dueJobs) {
        const result = await runJobV2(job, defaults);
        if (result) {
          results.push(result);
        }
      }

      // Select books for mail (after all jobs completed)
      // Ver4.0: ジョブ名 "combined" を使用して delivery_items で管理
      const jobName = "combined";
      const statsBeforeSelect = getDeliveryStatsForJob(jobName);
      log("INFO", `Selecting books: job=${jobName}, mail_limit=${defaults.mail_limit}, fallback_limit=${defaults.fallback_limit}`);
      const selection = selectBooksForMailByJob(jobName, defaults.mail_limit, defaults.fallback_limit);

      // Select 内訳ログ
      log("INFO", `[Select] job=${jobName}, total=${statsBeforeSelect.total}, delivered=${statsBeforeSelect.delivered}, undelivered=${statsBeforeSelect.undelivered}, selected=${selection.books.length} (mail_limit=${defaults.mail_limit})`);

      // Ver4.0: 未配信0件時はメール送信しない（重複は許さない）
      if (selection.books.length === 0 && !options.forceMail) {
        const stats = getDeliveryStatsForJob(jobName);
        log("INFO", `[Selector] job=${jobName}, 0 undelivered books, skipping mail`);
        log("INFO", `[Selector] Tip: Run 'dre mail reset --job ${jobName}' to reset delivery history`);
        console.log("\n=== No undelivered books ===");
        console.log(`Total books: ${stats.total}`);
        console.log(`Delivered: ${stats.delivered}`);
        console.log(`Undelivered: ${stats.undelivered}`);
        console.log("\nRun 'dre mail reset' to reset delivery status.");
      } else if (selection.books.length > 0 || options.forceMail) {
        // Send mail
        try {
          await sendBookDigestEmail(selection.books, jobName);
          log("INFO", `Email sent with ${selection.books.length} book(s)`);
        } catch (error) {
          if (error instanceof MailerError) {
            log("ERROR", `Mailer error: ${error.message}`);
          } else {
            throw error;
          }
        }
      }

      // パイプラインサマリログ
      const summaryTotalItems = results.reduce((sum, r) => sum + r.totalItems, 0);
      const summaryTotalReturned = results.reduce((sum, r) => sum + r.totalReturned, 0);
      const summaryTotalSkipped = results.reduce((sum, r) => sum + r.totalSkipped, 0);
      const summaryInserted = results.reduce((sum, r) => sum + r.insertedCount, 0);
      const summaryUpdated = results.reduce((sum, r) => sum + r.updatedCount, 0);
      const afterIsbnFilter = summaryTotalReturned - summaryTotalSkipped;

      // ISBN hit rate 計算
      const isbnHitRate = summaryTotalReturned > 0
        ? ((afterIsbnFilter / summaryTotalReturned) * 100).toFixed(1)
        : "N/A";

      console.log("\n=== Pipeline Summary ===");
      console.log(`API totalItems:     ${summaryTotalItems}`);
      console.log(`API returned:       ${summaryTotalReturned}`);
      console.log(`After ISBN filter:  ${afterIsbnFilter}`);
      console.log(`ISBN hit rate:      ${isbnHitRate}% (${afterIsbnFilter}/${summaryTotalReturned})`);
      console.log(`Upsert result:      inserted=${summaryInserted}, updated=${summaryUpdated}`);
      console.log(`DB undelivered:     ${statsBeforeSelect.undelivered}`);
      console.log(`Selected for mail:  ${selection.books.length}`);

      // ボトルネック判定
      if (summaryTotalReturned < summaryTotalItems && summaryTotalItems > 0) {
        console.log(`\nBottleneck: API returned (${summaryTotalReturned}) << totalItems (${summaryTotalItems}) -> pagination may help`);
      } else if (summaryTotalSkipped > 0 && summaryTotalSkipped > summaryTotalReturned * 0.3) {
        console.log(`\nBottleneck: ISBN filter skipped ${summaryTotalSkipped} items (${Math.round(summaryTotalSkipped / summaryTotalReturned * 100)}%)`);
      } else if (statsBeforeSelect.undelivered === 0) {
        console.log(`\nBottleneck: All books already delivered. Run 'dre mail reset' to re-deliver.`);
      }

      log("INFO", getGoogleBooksQuotaStatus());
      log("INFO", "Completed dre run-due");
    } catch (error) {
      log("ERROR", `Fatal error: ${error}`);
      log("ERROR", "Run 'dre doctor' to diagnose configuration issues");
      process.exit(1);
    }
  });
