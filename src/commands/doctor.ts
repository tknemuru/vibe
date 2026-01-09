import { Command } from "commander";
import { existsSync } from "fs";
import { resolve } from "path";
import { getQuotaStatus, getOpenAIQuotaStatus } from "../utils/quota.js";

interface EnvCheck {
  key: string;
  description: string;
  required: boolean;
  setup_url?: string;
  setup_hint?: string;
}

const ENV_CHECKS: EnvCheck[] = [
  // Google Search
  {
    key: "GCS_API_KEY",
    description: "Google Custom Search API Key",
    required: true,
    setup_url: "https://developers.google.com/custom-search/v1/introduction",
    setup_hint: "Google Cloud Console > APIs & Services > Credentials",
  },
  {
    key: "GCS_CX",
    description: "Google Custom Search Engine ID",
    required: true,
    setup_url: "https://programmablesearchengine.google.com/",
    setup_hint: "Create a Programmable Search Engine and copy the CX ID",
  },
  // OpenAI
  {
    key: "OPENAI_API_KEY",
    description: "OpenAI API Key",
    required: true,
    setup_url: "https://platform.openai.com/api-keys",
    setup_hint: "OpenAI Platform > API Keys > Create new secret key",
  },
  {
    key: "OPENAI_MODEL_PRIMARY",
    description: "Primary OpenAI model (default: gpt-4o-mini)",
    required: false,
  },
  {
    key: "OPENAI_MODEL_FALLBACK",
    description: "Fallback OpenAI model (default: gpt-4o)",
    required: false,
  },
  // Gmail SMTP
  {
    key: "SMTP_HOST",
    description: "SMTP host (default: smtp.gmail.com)",
    required: false,
  },
  {
    key: "SMTP_PORT",
    description: "SMTP port (default: 587)",
    required: false,
  },
  {
    key: "SMTP_USER",
    description: "SMTP username (your Gmail address)",
    required: true,
    setup_hint: "Your Gmail address (e.g., user@gmail.com)",
  },
  {
    key: "SMTP_PASS",
    description: "SMTP password (Gmail App Password)",
    required: true,
    setup_url: "https://myaccount.google.com/apppasswords",
    setup_hint: "Google Account > Security > 2-Step Verification > App passwords",
  },
  {
    key: "MAIL_TO",
    description: "Recipient email address",
    required: true,
    setup_hint: "Email address to receive digest notifications",
  },
  // App
  {
    key: "APP_TZ",
    description: "Application timezone (default: Asia/Tokyo)",
    required: false,
  },
  {
    key: "DAILY_QUERY_LIMIT",
    description: "Daily Google Search query limit (default: 95)",
    required: false,
  },
  {
    key: "DAILY_OPENAI_LIMIT",
    description: "Daily OpenAI API call limit (default: 150)",
    required: false,
  },
];

function checkEnvVar(check: EnvCheck): { ok: boolean; value?: string } {
  const value = process.env[check.key];
  if (!value) {
    return { ok: false };
  }
  // Mask sensitive values
  const isSensitive = check.key.includes("KEY") || check.key.includes("PASS");
  const displayValue = isSensitive ? `${value.slice(0, 4)}...` : value;
  return { ok: true, value: displayValue };
}

function checkFile(path: string, description: string): { ok: boolean; path: string } {
  const fullPath = resolve(process.cwd(), path);
  return { ok: existsSync(fullPath), path: fullPath };
}

export const doctorCommand = new Command("doctor")
  .description("Check configuration and environment setup")
  .action(() => {
    console.log("Vibe Configuration Diagnostic\n");
    console.log("=".repeat(50));

    let hasErrors = false;

    // Check .env file
    console.log("\n[Files]");
    const envFile = checkFile(".env", ".env file");
    console.log(`  ${envFile.ok ? "OK" : "NG"} .env file`);
    if (!envFile.ok) {
      console.log(`     -> Create .env file in project root: ${process.cwd()}`);
      console.log(`     -> On Windows: type nul > .env`);
      console.log(`     -> On Unix/Mac: touch .env`);
      console.log(`     -> Then add required environment variables (see below)`);
      hasErrors = true;
    }

    const jobsFile = checkFile("config/jobs.yaml", "jobs.yaml");
    console.log(`  ${jobsFile.ok ? "OK" : "NG"} config/jobs.yaml`);
    if (!jobsFile.ok) {
      console.log(`     -> Create config/jobs.yaml with job definitions`);
    }

    const dataDir = checkFile("data", "data directory");
    console.log(`  ${dataDir.ok ? "OK" : "NG"} data/ directory`);
    if (!dataDir.ok) {
      console.log(`     -> Run: mkdir -p data`);
    }

    // Check environment variables
    console.log("\n[Environment Variables]");

    const requiredChecks = ENV_CHECKS.filter(c => c.required);
    const optionalChecks = ENV_CHECKS.filter(c => !c.required);

    console.log("\n  Required:");
    for (const check of requiredChecks) {
      const result = checkEnvVar(check);
      const status = result.ok ? "OK" : "NG";
      console.log(`    ${status} ${check.key}`);
      if (!result.ok) {
        console.log(`       -> ${check.description}`);
        if (check.setup_url) {
          console.log(`       -> Get it: ${check.setup_url}`);
        }
        if (check.setup_hint) {
          console.log(`       -> Hint: ${check.setup_hint}`);
        }
        hasErrors = true;
      } else {
        console.log(`       = ${result.value}`);
      }
    }

    console.log("\n  Optional (with defaults):");
    for (const check of optionalChecks) {
      const result = checkEnvVar(check);
      const status = result.ok ? "SET" : "DEFAULT";
      console.log(`    ${status} ${check.key}`);
      if (result.ok) {
        console.log(`       = ${result.value}`);
      } else {
        console.log(`       -> ${check.description}`);
      }
    }

    // API Quota Status
    console.log("\n[API Quota Status]");
    try {
      console.log(`  ${getQuotaStatus()}`);
      console.log(`  ${getOpenAIQuotaStatus()}`);
    } catch (error) {
      console.log("  Unable to check quota status (database may not be initialized)");
    }

    // Summary
    console.log("\n" + "=".repeat(50));
    if (hasErrors) {
      console.log("\nStatus: INCOMPLETE");
      console.log("Please fix the issues above before running vibe.");
      process.exit(1);
    } else {
      console.log("\nStatus: OK");
      console.log("All required configurations are set.");
    }
  });
