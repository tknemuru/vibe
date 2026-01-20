import { readFileSync, writeFileSync, existsSync } from "fs";
import { resolve } from "path";
import yaml from "js-yaml";

/**
 * Google Books API 検索オプション（必須）
 */
export interface GoogleBooksConfig {
  printType: string;    // 必須: "books" など
  langRestrict: string; // 必須: "ja" など
}

/**
 * Job defaults configuration (Ver2.0)
 * - interval: 自由形式許可（例: "3h", "1d", "30m"）
 * - freshness: 廃止
 * - mail_limit: メール掲載件数
 * - max_per_run: 収集上限/回
 * - fallback_limit: 0件時フォールバック件数
 */
export interface JobDefaults {
  interval: string;
  mail_limit: number;
  max_per_run: number;
  fallback_limit: number;
  // Legacy fields (for migration compatibility)
  limit?: number;
  freshness?: string;
  allowlist?: string[];
}

/**
 * Job configuration (Ver2.0)
 * - queries: 複数クエリ対応（配列）
 * - query: 単一クエリ（後方互換性）
 * - mail_limit/max_per_run: オプションのオーバーライド
 * - google_books: Google Books API 検索オプション（必須）
 */
export interface Job {
  name: string;
  queries?: string[];
  query?: string; // Legacy field for migration
  enabled: boolean;
  mail_limit?: number;
  max_per_run?: number;
  google_books: GoogleBooksConfig; // 必須
  // Legacy fields
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

  // interval: string（自由形式許可）
  if (typeof d.interval !== "string" || d.interval.trim() === "") {
    throw new JobsConfigError("defaults.interval must be a non-empty string (e.g., '3h', '1d')");
  }

  // mail_limit: positive number (with legacy fallback to limit)
  const mailLimit = d.mail_limit ?? d.limit;
  if (typeof mailLimit !== "number" || mailLimit < 1) {
    throw new JobsConfigError("defaults.mail_limit must be a positive number");
  }

  // max_per_run: positive number (default: 20)
  const maxPerRun = d.max_per_run ?? 20;
  if (typeof maxPerRun !== "number" || maxPerRun < 1) {
    throw new JobsConfigError("defaults.max_per_run must be a positive number");
  }

  // fallback_limit: positive number (default: 3)
  const fallbackLimit = d.fallback_limit ?? 3;
  if (typeof fallbackLimit !== "number" || fallbackLimit < 0) {
    throw new JobsConfigError("defaults.fallback_limit must be a non-negative number");
  }

  // allowlist: optional array of strings (legacy, kept for compatibility)
  if (d.allowlist !== undefined) {
    if (!Array.isArray(d.allowlist) || !d.allowlist.every((s) => typeof s === "string")) {
      throw new JobsConfigError("defaults.allowlist must be an array of strings");
    }
  }

  // freshness: ignored (deprecated)
  if (d.freshness !== undefined) {
    console.warn("[WARN] defaults.freshness is deprecated and will be ignored");
  }

  return {
    interval: d.interval,
    mail_limit: mailLimit,
    max_per_run: maxPerRun,
    fallback_limit: fallbackLimit,
    // Legacy fields for migration
    limit: typeof d.limit === "number" ? d.limit : undefined,
    freshness: typeof d.freshness === "string" ? d.freshness : undefined,
    allowlist: Array.isArray(d.allowlist) ? d.allowlist : undefined,
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

  // queries or query must be provided
  const hasQueries = Array.isArray(j.queries) && j.queries.length > 0;
  const hasQuery = typeof j.query === "string" && j.query.trim() !== "";

  if (!hasQueries && !hasQuery) {
    throw new JobsConfigError(`jobs[${index}] must have either 'queries' array or 'query' string`);
  }

  if (typeof j.enabled !== "boolean") {
    throw new JobsConfigError(`jobs[${index}].enabled must be a boolean`);
  }

  // google_books: 必須項目（先にバリデーション）
  if (!j.google_books || typeof j.google_books !== "object") {
    throw new JobsConfigError(`jobs[${index}].google_books is required`);
  }
  const gb = j.google_books as Record<string, unknown>;
  if (typeof gb.printType !== "string" || gb.printType.trim() === "") {
    throw new JobsConfigError(`jobs[${index}].google_books.printType is required`);
  }
  if (typeof gb.langRestrict !== "string" || gb.langRestrict.trim() === "") {
    throw new JobsConfigError(`jobs[${index}].google_books.langRestrict is required`);
  }

  const result: Job = {
    name: j.name.trim(),
    enabled: j.enabled,
    google_books: {
      printType: gb.printType.trim(),
      langRestrict: gb.langRestrict.trim(),
    },
  };

  // Handle queries array
  if (hasQueries) {
    const queriesArray = j.queries as unknown[];
    if (!queriesArray.every((q: unknown) => typeof q === "string" && (q as string).trim() !== "")) {
      throw new JobsConfigError(`jobs[${index}].queries must be an array of non-empty strings`);
    }
    result.queries = (queriesArray as string[]).map((q) => q.trim());
  }

  // Handle legacy query string
  if (hasQuery) {
    result.query = (j.query as string).trim();
    // If no queries array, convert query to queries for convenience
    if (!result.queries) {
      result.queries = [result.query];
    }
  }

  // Optional overrides
  if (j.mail_limit !== undefined) {
    if (typeof j.mail_limit !== "number" || j.mail_limit < 1) {
      throw new JobsConfigError(`jobs[${index}].mail_limit must be a positive number`);
    }
    result.mail_limit = j.mail_limit;
  }

  if (j.max_per_run !== undefined) {
    if (typeof j.max_per_run !== "number" || j.max_per_run < 1) {
      throw new JobsConfigError(`jobs[${index}].max_per_run must be a positive number`);
    }
    result.max_per_run = j.max_per_run;
  }

  // Legacy fields for compatibility
  if (j.limit !== undefined) {
    if (typeof j.limit !== "number" || j.limit < 1) {
      throw new JobsConfigError(`jobs[${index}].limit must be a positive number`);
    }
    result.limit = j.limit;
    // Use limit as mail_limit if mail_limit not set
    if (!result.mail_limit) {
      result.mail_limit = j.limit;
    }
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

/**
 * Get effective queries for a job (handles legacy query field)
 */
export function getJobQueries(job: Job): string[] {
  if (job.queries && job.queries.length > 0) {
    return job.queries;
  }
  if (job.query) {
    return [job.query];
  }
  return [];
}

/**
 * Get effective mail_limit for a job
 */
export function getJobMailLimit(job: Job, defaults: JobDefaults): number {
  return job.mail_limit ?? job.limit ?? defaults.mail_limit ?? defaults.limit ?? 5;
}

/**
 * Get effective max_per_run for a job
 */
export function getJobMaxPerRun(job: Job, defaults: JobDefaults): number {
  return job.max_per_run ?? defaults.max_per_run ?? 20;
}
