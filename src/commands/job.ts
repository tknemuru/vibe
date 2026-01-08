import { Command } from "commander";
import {
  loadJobsConfig,
  saveJobsConfig,
  addJob,
  updateJob,
  removeJob,
  setJobEnabled,
  findJob,
  JobsConfigError,
} from "../config/jobs.js";

function handleError(error: unknown): void {
  if (error instanceof JobsConfigError) {
    console.error(`Error: ${error.message}`);
  } else {
    console.error(`Unexpected error: ${error}`);
  }
  process.exit(1);
}

export const jobCommand = new Command("job")
  .description("Manage search jobs");

// vibe job ls
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
      console.log("  Status   Name                           Query");
      console.log("  " + "-".repeat(70));

      for (const job of config.jobs) {
        const status = job.enabled ? "[ON] " : "[OFF]";
        const name = job.name.padEnd(30);
        const query = job.query.length > 35 ? job.query.slice(0, 32) + "..." : job.query;
        console.log(`  ${status}  ${name} ${query}`);
      }

      console.log(`\n  Total: ${config.jobs.length} job(s)`);
      console.log(`\n  Defaults: interval=${config.defaults.interval}, limit=${config.defaults.limit}, freshness=${config.defaults.freshness}`);
      console.log(`  Allowlist: ${config.defaults.allowlist.join(", ")}`);
    } catch (error) {
      handleError(error);
    }
  });

// vibe job add
jobCommand
  .command("add")
  .description("Add a new job")
  .requiredOption("-n, --name <name>", "Job name (unique)")
  .requiredOption("-q, --query <query>", "Search query")
  .option("--limit <limit>", "Override default limit", parseInt)
  .option("--allowlist <domains>", "Override allowlist (comma-separated)")
  .option("--disabled", "Create job as disabled")
  .action((options) => {
    try {
      let config = loadJobsConfig();

      const newJob = {
        name: options.name,
        query: options.query,
        enabled: !options.disabled,
        ...(options.limit && { limit: options.limit }),
        ...(options.allowlist && { allowlist: options.allowlist.split(",").map((s: string) => s.trim()) }),
      };

      config = addJob(config, newJob);
      saveJobsConfig(config);

      console.log(`Job "${options.name}" added successfully.`);
    } catch (error) {
      handleError(error);
    }
  });

// vibe job update
jobCommand
  .command("update <name>")
  .description("Update an existing job")
  .option("-q, --query <query>", "New search query")
  .option("--limit <limit>", "New limit", parseInt)
  .option("--allowlist <domains>", "New allowlist (comma-separated)")
  .action((name, options) => {
    try {
      let config = loadJobsConfig();

      const updates: Record<string, unknown> = {};
      if (options.query) updates.query = options.query;
      if (options.limit) updates.limit = options.limit;
      if (options.allowlist) updates.allowlist = options.allowlist.split(",").map((s: string) => s.trim());

      if (Object.keys(updates).length === 0) {
        console.log("No updates provided. Use --query, --limit, or --allowlist.");
        process.exit(1);
      }

      config = updateJob(config, name, updates);
      saveJobsConfig(config);

      console.log(`Job "${name}" updated successfully.`);
    } catch (error) {
      handleError(error);
    }
  });

// vibe job rm
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

// vibe job enable
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

// vibe job disable
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

// vibe job show
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

      console.log(`\nJob: ${job.name}`);
      console.log("-".repeat(40));
      console.log(`  Query:     ${job.query}`);
      console.log(`  Enabled:   ${job.enabled}`);
      console.log(`  Limit:     ${job.limit ?? config.defaults.limit} (${job.limit ? "custom" : "default"})`);
      console.log(`  Allowlist: ${(job.allowlist ?? config.defaults.allowlist).join(", ")} (${job.allowlist ? "custom" : "default"})`);
    } catch (error) {
      handleError(error);
    }
  });
