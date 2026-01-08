import { readFileSync, writeFileSync, existsSync } from "fs";
import { resolve } from "path";
import yaml from "js-yaml";

export interface JobDefaults {
  interval: "3h";
  limit: number;
  freshness: "Week";
  allowlist: string[];
}

export interface Job {
  name: string;
  query: string;
  enabled: boolean;
  limit?: number;
  allowlist?: string[];
}

export interface JobsConfig {
  defaults: JobDefaults;
  jobs: Job[];
}

const JOBS_FILE_PATH = resolve(process.cwd(), "config/jobs.yaml");

export class JobsConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "JobsConfigError";
  }
}

function validateDefaults(defaults: unknown): JobDefaults {
  if (!defaults || typeof defaults !== "object") {
    throw new JobsConfigError("defaults section is required");
  }

  const d = defaults as Record<string, unknown>;

  // interval must be "3h" (MVP fixed)
  if (d.interval !== "3h") {
    throw new JobsConfigError('defaults.interval must be "3h" (MVP fixed)');
  }

  // limit must be a positive number
  if (typeof d.limit !== "number" || d.limit < 1) {
    throw new JobsConfigError("defaults.limit must be a positive number");
  }

  // freshness must be "Week" (MVP fixed)
  if (d.freshness !== "Week") {
    throw new JobsConfigError('defaults.freshness must be "Week" (MVP fixed)');
  }

  // allowlist must be an array of strings
  if (!Array.isArray(d.allowlist) || !d.allowlist.every((s) => typeof s === "string")) {
    throw new JobsConfigError("defaults.allowlist must be an array of strings");
  }

  return {
    interval: "3h",
    limit: d.limit,
    freshness: "Week",
    allowlist: d.allowlist,
  };
}

function validateJob(job: unknown, index: number): Job {
  if (!job || typeof job !== "object") {
    throw new JobsConfigError(`jobs[${index}] must be an object`);
  }

  const j = job as Record<string, unknown>;

  if (typeof j.name !== "string" || j.name.trim() === "") {
    throw new JobsConfigError(`jobs[${index}].name must be a non-empty string`);
  }

  if (typeof j.query !== "string" || j.query.trim() === "") {
    throw new JobsConfigError(`jobs[${index}].query must be a non-empty string`);
  }

  if (typeof j.enabled !== "boolean") {
    throw new JobsConfigError(`jobs[${index}].enabled must be a boolean`);
  }

  const result: Job = {
    name: j.name.trim(),
    query: j.query.trim(),
    enabled: j.enabled,
  };

  // Optional overrides
  if (j.limit !== undefined) {
    if (typeof j.limit !== "number" || j.limit < 1) {
      throw new JobsConfigError(`jobs[${index}].limit must be a positive number`);
    }
    result.limit = j.limit;
  }

  if (j.allowlist !== undefined) {
    if (!Array.isArray(j.allowlist) || !j.allowlist.every((s) => typeof s === "string")) {
      throw new JobsConfigError(`jobs[${index}].allowlist must be an array of strings`);
    }
    result.allowlist = j.allowlist;
  }

  return result;
}

export function loadJobsConfig(): JobsConfig {
  if (!existsSync(JOBS_FILE_PATH)) {
    throw new JobsConfigError(
      `config/jobs.yaml not found at ${JOBS_FILE_PATH}\n` +
        "Create the file with defaults and jobs sections."
    );
  }

  let content: string;
  try {
    content = readFileSync(JOBS_FILE_PATH, "utf-8");
  } catch (error) {
    throw new JobsConfigError(`Failed to read config/jobs.yaml: ${error}`);
  }

  let parsed: unknown;
  try {
    parsed = yaml.load(content);
  } catch (error) {
    throw new JobsConfigError(
      `Invalid YAML in config/jobs.yaml: ${error}\n` +
        "Check for syntax errors (indentation, colons, quotes)."
    );
  }

  if (!parsed || typeof parsed !== "object") {
    throw new JobsConfigError("config/jobs.yaml must contain a YAML object");
  }

  const config = parsed as Record<string, unknown>;

  const defaults = validateDefaults(config.defaults);

  if (!Array.isArray(config.jobs)) {
    throw new JobsConfigError("jobs section must be an array");
  }

  const jobs = config.jobs.map((job, index) => validateJob(job, index));

  // Check for duplicate names
  const names = new Set<string>();
  for (const job of jobs) {
    if (names.has(job.name)) {
      throw new JobsConfigError(`Duplicate job name: "${job.name}"`);
    }
    names.add(job.name);
  }

  return { defaults, jobs };
}

export function saveJobsConfig(config: JobsConfig): void {
  const content = yaml.dump(config, {
    indent: 2,
    lineWidth: 120,
    noRefs: true,
  });

  try {
    writeFileSync(JOBS_FILE_PATH, content, "utf-8");
  } catch (error) {
    throw new JobsConfigError(`Failed to write config/jobs.yaml: ${error}`);
  }
}

export function findJob(config: JobsConfig, name: string): Job | undefined {
  return config.jobs.find((j) => j.name === name);
}

export function addJob(config: JobsConfig, job: Job): JobsConfig {
  if (findJob(config, job.name)) {
    throw new JobsConfigError(`Job "${job.name}" already exists`);
  }
  return {
    ...config,
    jobs: [...config.jobs, job],
  };
}

export function updateJob(
  config: JobsConfig,
  name: string,
  updates: Partial<Omit<Job, "name">>
): JobsConfig {
  const index = config.jobs.findIndex((j) => j.name === name);
  if (index === -1) {
    throw new JobsConfigError(`Job "${name}" not found`);
  }

  const updatedJobs = [...config.jobs];
  updatedJobs[index] = { ...updatedJobs[index], ...updates };

  return { ...config, jobs: updatedJobs };
}

export function removeJob(config: JobsConfig, name: string): JobsConfig {
  const index = config.jobs.findIndex((j) => j.name === name);
  if (index === -1) {
    throw new JobsConfigError(`Job "${name}" not found`);
  }

  return {
    ...config,
    jobs: config.jobs.filter((j) => j.name !== name),
  };
}

export function setJobEnabled(config: JobsConfig, name: string, enabled: boolean): JobsConfig {
  return updateJob(config, name, { enabled });
}
