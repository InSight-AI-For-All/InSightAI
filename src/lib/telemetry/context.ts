import { UAParser } from "ua-parser-js";

export type ParsedClientContext = {
  browser: string;
  deviceType: string;
  operatingSystem: string;
};

function family(name?: string, version?: string) {
  return [name || "Unknown", version?.split(".")[0]].filter(Boolean).join(" ").slice(0, 80);
}

export function parseUserAgent(userAgent: string | null | undefined): ParsedClientContext {
  if (!userAgent) return { browser: "Unknown", deviceType: "unknown", operatingSystem: "Unknown" };
  const result = new UAParser(userAgent.slice(0, 1_000)).getResult();
  return {
    browser: family(result.browser.name, result.browser.version),
    deviceType: (result.device.type || "desktop").slice(0, 40),
    operatingSystem: family(result.os.name, result.os.version),
  };
}

export function safeReferrerHost(value: string | null | undefined) {
  if (!value) return undefined;
  try {
    return new URL(value).hostname.replace(/^www\./, "").slice(0, 255);
  } catch {
    return undefined;
  }
}