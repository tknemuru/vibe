import { Command } from "commander";
import {
  loadJobsConfig,
  saveJobsConfig,
  addJob,
  updateJob,
  removeJob,
  setJobEnabled,
  findJob,
  getJobQueries,
  getJobMailLimit,
  getJobMaxPerRun,
  JobsConfigError,
} from "../config/jobs.js";
import { resetCollectCursorsByJob } from "../db/dao.js";

/**
 * dre job add 時の google_books デフォルト値
 */
const DEFAULT_GOOGLE_BOOKS = {
  printType: "books",
  langRestrict: "ja",
};

function handleError(error: unknown): void {
  if (error instanceof JobsConfigError) {
    console.error(`Error: ${error.message}`);
  } else {
    console.error(`Unexpected error: ${error}`);
  }
  process.exit(1);
}

export const jobCommand = new Command("job")
  .description("Manage book collection jobs");

// dre job ls
jobCommand
  .command("ls")
  .description("List all jobs")
  .action(() => {
    try {
      const config = loadJobsConfig();

      if (config.jobs.length === 0) {
        console.log("No jobs defined.");
        return;
      }

      console.log("\nJobs:\n");
      console.log("  Status   Name                           Queries");
      console.log("  " + "-".repeat(70));

      for (const job of config.jobs) {
        const status = job.enabled ? "[ON] " : "[OFF]";
        const name = job.name.padEnd(30);
        const queries = getJobQueries(job);
        const queryStr = queries.length > 1
          ? `${queries[0]} (+${queries.length - 1} more)`
          : queries[0] || "(no query)";
        const displayQuery = queryStr.length > 35 ? queryStr.slice(0, 32) + "..." : queryStr;
        console.log(`  ${status}  ${name} ${displayQuery}`);
      }

      console.log(`\n  Total: ${config.jobs.length} job(s)`);
      console.log(`\n  Defaults:`);
      console.log(`    interval=${config.defaults.interval}`);
      console.log(`    mail_limit=${config.defaults.mail_limit}`);
      console.log(`    max_per_run=${config.defaults.max_per_run}`);
      console.log(`    fallback_limit=${config.defaults.fallback_limit}`);
    } catch (error) {
      handleError(error);
    }
  });

// dre job add
jobCommand
  .command("add")
  .description("Add a new job")
  .requiredOption("-n, --name <name>", "Job name (unique)")
  .option("-q, --query <query>", "Single search query")
  .option("--queries <queries>", "Multiple search queries (comma-separated)")
  .option("--mail-limit <limit>", "Override default mail_limit", parseInt)
  .option("--max-per-run <limit>", "Override default max_per_run", parseInt)
  .option("--print-type <type>", "Google Books printType (default: books)")
  .option("--lang-restrict <lang>", "Google Books langRestrict (default: ja)")
  .option("--disabled", "Create job as disabled")
  .action((options) => {
    try {
      let config = loadJobsConfig();

      // Handle queries
      let queries: string[] | undefined;
      if (options.queries) {
        queries = options.queries.split(",").map((s: string) => s.trim()).filter((s: string) => s);
      } else if (options.query) {
        queries = [options.query.trim()];
      }

      if (!queries || queries.length === 0) {
        console.error("Error: Either --query or --queries is required");
        process.exit(1);
      }

      const newJob = {
        name: options.name,
        queries,
        enabled: !options.disabled,
        google_books: {
          printType: options.printType ?? DEFAULT_GOOGLE_BOOKS.printType,
          langRestrict: options.langRestrict ?? DEFAULT_GOOGLE_BOOKS.langRestrict,
        },
        ...(options.mailLimit && { mail_limit: options.mailLimit }),
        ...(options.maxPerRun && { max_per_run: options.maxPerRun }),
      };

      config = addJob(config, newJob);
      saveJobsConfig(config);

      console.log(`Job "${options.name}" added successfully.`);
      console.log(`  Queries: ${queries.join(", ")}`);
      console.log(`  google_books: printType=${newJob.google_books.printType}, langRestrict=${newJob.google_books.langRestrict}`);
    } catch (error) {
      handleError(error);
    }
  });

// dre job update
jobCommand
  .command("update <name>")
  .description("Update an existing job")
  .option("-q, --query <query>", "New single search query")
  .option("--queries <queries>", "New search queries (comma-separated)")
  .option("--mail-limit <limit>", "New mail_limit", parseInt)
  .option("--max-per-run <limit>", "New max_per_run", parseInt)
  .action((name, options) => {
    try {
      let config = loadJobsConfig();

      const updates: Record<string, unknown> = {};

      if (options.queries) {
        updates.queries = options.queries.split(",").map((s: string) => s.trim()).filter((s: string) => s);
        updates.query = undefined; // Clear legacy field
      } else if (options.query) {
        updates.queries = [options.query.trim()];
        updates.query = options.query.trim();
      }

      if (options.mailLimit) updates.mail_limit = options.mailLimit;
      if (options.maxPerRun) updates.max_per_run = options.maxPerRun;

      if (Object.keys(updates).length === 0) {
        console.log("No updates provided. Use --query, --queries, --mail-limit, or --max-per-run.");
        process.exit(1);
      }

      config = updateJob(config, name, updates);
      saveJobsConfig(config);

      console.log(`Job "${name}" updated successfully.`);
    } catch (error) {
      handleError(error);
    }
  });

// dre job rm
jobCommand
  .command("rm <name>")
  .description("Remove a job")
  .action((name) => {
    try {
      let config = loadJobsConfig();
      config = removeJob(config, name);
      saveJobsConfig(config);

      console.log(`Job "${name}" removed successfully.`);
    } catch (error) {
      handleError(error);
    }
  });

// dre job enable
jobCommand
  .command("enable <name>")
  .description("Enable a job")
  .action((name) => {
    try {
      let config = loadJobsConfig();

      const job = findJob(config, name);
      if (!job) {
        throw new JobsConfigError(`Job "${name}" not found`);
      }

      if (job.enabled) {
        console.log(`Job "${name}" is already enabled.`);
        return;
      }

      config = setJobEnabled(config, name, true);
      saveJobsConfig(config);

      console.log(`Job "${name}" enabled.`);
    } catch (error) {
      handleError(error);
    }
  });

// dre job disable
jobCommand
  .command("disable <name>")
  .description("Disable a job")
  .action((name) => {
    try {
      let config = loadJobsConfig();

      const job = findJob(config, name);
      if (!job) {
        throw new JobsConfigError(`Job "${name}" not found`);
      }

      if (!job.enabled) {
        console.log(`Job "${name}" is already disabled.`);
        return;
      }

      config = setJobEnabled(config, name, false);
      saveJobsConfig(config);

      console.log(`Job "${name}" disabled.`);
    } catch (error) {
      handleError(error);
    }
  });

// dre job show
jobCommand
  .command("show <name>")
  .description("Show details of a job")
  .action((name) => {
    try {
      const config = loadJobsConfig();
      const job = findJob(config, name);

      if (!job) {
        throw new JobsConfigError(`Job "${name}" not found`);
      }

      const queries = getJobQueries(job);
      const mailLimit = getJobMailLimit(job, config.defaults);
      const maxPerRun = getJobMaxPerRun(job, config.defaults);

      console.log(`\nJob: ${job.name}`);
      console.log("-".repeat(40));
      console.log(`  Enabled:      ${job.enabled}`);
      console.log(`  Queries:`);
      for (const q of queries) {
        console.log(`    - ${q}`);
      }
      console.log(`  mail_limit:   ${mailLimit} (${job.mail_limit ? "custom" : "default"})`);
      console.log(`  max_per_run:  ${maxPerRun} (${job.max_per_run ? "custom" : "default"})`);
    } catch (error) {
      handleError(error);
    }
  });

// dre job cursor - カーソル関連操作
const cursorCommand = new Command("cursor")
  .description("Cursor related operations");

cursorCommand
  .command("reset <job-name>")
  .description("Reset cursor/exhausted state for a job")
  .requiredOption("--yes", "Confirm the reset (required for safety)")
  .action((jobName) => {
    try {
      const count = resetCollectCursorsByJob(jobName);
      console.log(`Reset ${count} cursor(s) for job: ${jobName}`);
    } catch (error) {
      handleError(error);
    }
  });

jobCommand.addCommand(cursorCommand);
