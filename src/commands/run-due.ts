import { Command } from "commander";
import { loadJobsConfig, Job } from "../config/jobs.js";
import { getJobState, updateJobState } from "../db/dao.js";
import { checkQuota, getQuotaStatus } from "../utils/quota.js";
import { collectSearchResults, SearchError } from "../services/search.js";
import { rankItems } from "../services/ranker.js";
import { summarizeItems } from "../services/summarizer.js";
import { sendDigestEmail, JobResults } from "../services/mailer.js";

const DUE_INTERVAL_MS = 3 * 60 * 60 * 1000; // 3 hours in milliseconds

function log(level: "INFO" | "WARN" | "ERROR", message: string): void {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] [${level}] ${message}`);
}

function isJobDue(jobName: string): boolean {
  const state = getJobState(jobName);
  if (!state?.last_success_at) {
    return true; // Never run before
  }

  const lastSuccess = new Date(state.last_success_at).getTime();
  const now = Date.now();
  return now - lastSuccess >= DUE_INTERVAL_MS;
}

async function runJob(
  job: Job,
  defaults: { limit: number; allowlist: string[] }
): Promise<JobResults | null> {
  const jobName = job.name;
  log("INFO", `Processing job: ${jobName}`);

  // Update last_run_at
  updateJobState(jobName, { last_run_at: new Date().toISOString() });

  // Get effective settings
  const limit = job.limit ?? defaults.limit;
  const allowlist = job.allowlist ?? defaults.allowlist;

  try {
    // 1. Check quota
    const quota = checkQuota();
    if (!quota.allowed) {
      log("WARN", `Quota limit reached (${quota.current}/${quota.limit}). Skipping search.`);
      return null;
    }

    // 2. Search
    log("INFO", `Searching: "${job.query}" (limit=${limit})`);
    const searchResult = await collectSearchResults(job.query, allowlist, limit * 2);
    log("INFO", `Found ${searchResult.items.length} items`);

    if (searchResult.items.length === 0) {
      log("INFO", "No new items found");
      updateJobState(jobName, { last_success_at: new Date().toISOString() });
      return { jobName, items: [], summaries: new Map() };
    }

    // 3. Rank
    log("INFO", "Ranking items...");
    const ranked = rankItems(limit);
    log("INFO", `Ranked ${ranked.items.length} items for delivery`);

    if (ranked.items.length === 0) {
      log("INFO", "No items to deliver after ranking");
      updateJobState(jobName, { last_success_at: new Date().toISOString() });
      return { jobName, items: [], summaries: new Map() };
    }

    // 4. Summarize
    log("INFO", "Generating summaries...");
    const summaries = await summarizeItems(ranked.items);
    log("INFO", `Generated ${summaries.size} summaries`);

    // Mark success
    updateJobState(jobName, { last_success_at: new Date().toISOString() });

    return {
      jobName,
      items: ranked.items,
      summaries,
    };
  } catch (error) {
    if (error instanceof SearchError) {
      log("ERROR", `Search error for ${jobName}: ${error.message}`);
    } else {
      log("ERROR", `Error processing ${jobName}: ${error}`);
    }
    return null;
  }
}

export const runDueCommand = new Command("run-due")
  .description("Run all due jobs and send digest email")
  .option("--dry-run", "Check which jobs are due without running them")
  .option("--force", "Run all enabled jobs regardless of due status")
  .action(async (options) => {
    log("INFO", "Starting vibe run-due");
    log("INFO", getQuotaStatus());

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

      // Process each due job
      const results: JobResults[] = [];
      for (const job of dueJobs) {
        const quota = checkQuota();
        if (!quota.allowed) {
          log("WARN", `Stopping: quota limit reached (${quota.current}/${quota.limit})`);
          break;
        }

        const result = await runJob(job, {
          limit: config.defaults.limit,
          allowlist: config.defaults.allowlist,
        });

        if (result && result.items.length > 0) {
          results.push(result);
        }
      }

      // Send email if we have results
      if (results.length > 0) {
        const totalItems = results.reduce((sum, r) => sum + r.items.length, 0);
        log("INFO", `Sending email with ${totalItems} item(s) from ${results.length} job(s)`);

        try {
          await sendDigestEmail(results);
          log("INFO", "Email sent successfully");
        } catch (error) {
          log("ERROR", `Failed to send email: ${error}`);
        }
      } else {
        log("INFO", "No items to send");
      }

      log("INFO", getQuotaStatus());
      log("INFO", "Completed vibe run-due");
    } catch (error) {
      log("ERROR", `Fatal error: ${error}`);
      process.exit(1);
    }
  });
