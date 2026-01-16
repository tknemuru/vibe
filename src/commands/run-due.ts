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
 * Ver2.0 Book Pipeline
 * Flow: collect -> select -> mail
 */
async function runJobV2(
  job: Job,
  defaults: { mail_limit: number; max_per_run: number; fallback_limit: number }
): Promise<{ jobName: string; books: Book[] } | null> {
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
    const collectResult = await collector.collect(queries, maxPerRun);

    log(
      "INFO",
      `Collected ${collectResult.totalBooks} book(s), skipped ${collectResult.totalSkipped} (no ISBN)`
    );

    // Upsert collected books to database
    let upsertedCount = 0;
    for (const queryResult of collectResult.results) {
      for (const bookInput of queryResult.books) {
        try {
          upsertBook(bookInput);
          upsertedCount++;
        } catch (error) {
          log("WARN", `Failed to upsert book ${bookInput.isbn13}: ${error}`);
        }
      }
    }
    log("INFO", `Upserted ${upsertedCount} book(s) to database`);

    // Mark success
    updateJobState(jobName, { last_success_at: new Date().toISOString() });

    // Return empty for now - selection happens after all jobs complete
    return {
      jobName,
      books: [],
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
    log("INFO", "Starting vibe run-due (Ver2.0 - Book Collection Mode)");
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
      const results: { jobName: string; books: Book[] }[] = [];
      for (const job of dueJobs) {
        const result = await runJobV2(job, defaults);
        if (result) {
          results.push(result);
        }
      }

      // Select books for mail (after all jobs completed)
      // Ver4.0: ジョブ名 "combined" を使用して delivery_items で管理
      const jobName = "combined";
      log("INFO", `Selecting books: job=${jobName}, mail_limit=${defaults.mail_limit}, fallback_limit=${defaults.fallback_limit}`);
      const selection = selectBooksForMailByJob(jobName, defaults.mail_limit, defaults.fallback_limit);

      log("INFO", `Selected ${selection.books.length} undelivered book(s)`);

      // Ver4.0: 未配信0件時はメール送信しない（重複は許さない）
      if (selection.books.length === 0 && !options.forceMail) {
        const stats = getDeliveryStatsForJob(jobName);
        log("INFO", `[Selector] job=${jobName}, 0 undelivered books, skipping mail`);
        log("INFO", `[Selector] Tip: Run 'vibe mail reset --job ${jobName}' to reset delivery history`);
        console.log("\n=== No undelivered books ===");
        console.log(`Total books: ${stats.total}`);
        console.log(`Delivered: ${stats.delivered}`);
        console.log(`Undelivered: ${stats.undelivered}`);
        console.log("\nRun 'vibe mail reset' to reset delivery status.");
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

      log("INFO", getGoogleBooksQuotaStatus());
      log("INFO", "Completed vibe run-due");
    } catch (error) {
      log("ERROR", `Fatal error: ${error}`);
      log("ERROR", "Run 'vibe doctor' to diagnose configuration issues");
      process.exit(1);
    }
  });
