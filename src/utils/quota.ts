import { getApiUsage, incrementApiUsage } from "../db/dao.js";

const DEFAULT_DAILY_LIMIT = 95;
const DEFAULT_DAILY_OPENAI_LIMIT = 150;
const PROVIDER_GCS = "gcs";
const PROVIDER_OPENAI = "openai";

function getTodayDateString(timezone: string): string {
  const now = new Date();
  // Format as YYYY-MM-DD in the specified timezone
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return formatter.format(now);
}

export function getDailyLimit(): number {
  const envLimit = process.env.DAILY_QUERY_LIMIT;
  if (envLimit) {
    const parsed = parseInt(envLimit, 10);
    if (!isNaN(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return DEFAULT_DAILY_LIMIT;
}

export function getTimezone(): string {
  return process.env.APP_TZ || "Asia/Tokyo";
}

export function checkQuota(): { allowed: boolean; current: number; limit: number; date: string } {
  const timezone = getTimezone();
  const date = getTodayDateString(timezone);
  const limit = getDailyLimit();
  const current = getApiUsage(date, PROVIDER_GCS);

  return {
    allowed: current < limit,
    current,
    limit,
    date,
  };
}

export function consumeQuota(): { success: boolean; current: number; limit: number } {
  const timezone = getTimezone();
  const date = getTodayDateString(timezone);
  const limit = getDailyLimit();

  // Check before consuming
  const currentBefore = getApiUsage(date, PROVIDER_GCS);
  if (currentBefore >= limit) {
    return {
      success: false,
      current: currentBefore,
      limit,
    };
  }

  // Consume quota
  const newCount = incrementApiUsage(date, PROVIDER_GCS);

  return {
    success: true,
    current: newCount,
    limit,
  };
}

export function getQuotaStatus(): string {
  const quota = checkQuota();
  const remaining = quota.limit - quota.current;
  return `Quota: ${quota.current}/${quota.limit} used (${remaining} remaining) [${quota.date}]`;
}

// ============================================
// OpenAI API Quota Management
// ============================================

export function getOpenAIDailyLimit(): number {
  const envLimit = process.env.DAILY_OPENAI_LIMIT;
  if (envLimit) {
    const parsed = parseInt(envLimit, 10);
    if (!isNaN(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return DEFAULT_DAILY_OPENAI_LIMIT;
}

export function checkOpenAIQuota(): { allowed: boolean; current: number; limit: number; date: string } {
  const timezone = getTimezone();
  const date = getTodayDateString(timezone);
  const limit = getOpenAIDailyLimit();
  const current = getApiUsage(date, PROVIDER_OPENAI);

  return {
    allowed: current < limit,
    current,
    limit,
    date,
  };
}

export function consumeOpenAIQuota(): { success: boolean; current: number; limit: number } {
  const timezone = getTimezone();
  const date = getTodayDateString(timezone);
  const limit = getOpenAIDailyLimit();

  // Check before consuming
  const currentBefore = getApiUsage(date, PROVIDER_OPENAI);
  if (currentBefore >= limit) {
    return {
      success: false,
      current: currentBefore,
      limit,
    };
  }

  // Consume quota
  const newCount = incrementApiUsage(date, PROVIDER_OPENAI);

  return {
    success: true,
    current: newCount,
    limit,
  };
}

export function getOpenAIQuotaStatus(): string {
  const quota = checkOpenAIQuota();
  const remaining = quota.limit - quota.current;
  return `OpenAI Quota: ${quota.current}/${quota.limit} used (${remaining} remaining) [${quota.date}]`;
}
