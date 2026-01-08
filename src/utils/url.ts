import { createHash } from "crypto";

const UTM_PARAMS = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"];
const TRACKING_PARAMS = ["ref", "fbclid", "gclid", "dclid", "msclkid"];

export function normalizeUrl(url: string): string {
  try {
    const parsed = new URL(url);

    // Remove tracking parameters
    const paramsToRemove = [...UTM_PARAMS, ...TRACKING_PARAMS];
    for (const param of paramsToRemove) {
      parsed.searchParams.delete(param);
    }

    // Normalize hostname to lowercase
    parsed.hostname = parsed.hostname.toLowerCase();

    // Remove default ports
    if (
      (parsed.protocol === "http:" && parsed.port === "80") ||
      (parsed.protocol === "https:" && parsed.port === "443")
    ) {
      parsed.port = "";
    }

    // Remove trailing slash from pathname (except root)
    if (parsed.pathname !== "/" && parsed.pathname.endsWith("/")) {
      parsed.pathname = parsed.pathname.slice(0, -1);
    }

    // Sort search params for consistency
    parsed.searchParams.sort();

    // Remove fragment
    parsed.hash = "";

    return parsed.toString();
  } catch {
    // If URL is invalid, return as-is
    return url;
  }
}

export function extractDomain(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.hostname.toLowerCase();
  } catch {
    return "";
  }
}

export function generateItemHash(url: string): string {
  const normalized = normalizeUrl(url);
  return createHash("sha256").update(normalized).digest("hex").slice(0, 16);
}
