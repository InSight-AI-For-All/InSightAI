export const publicTelemetryEvents = [
  "first_visit",
  "page_viewed",
  "session_started",
  "session_ended",
  "signup_started",
  "login_started",
  "login_completed",
  "login_failed",
  "pricing_viewed",
  "upgrade_clicked",
  "result_viewed",
  "result_shared",
] as const;

export type PublicTelemetryEvent = (typeof publicTelemetryEvents)[number];

export type TelemetryCategory =
  | "acquisition"
  | "auth"
  | "navigation"
  | "product"
  | "billing"
  | "admin"
  | "system";

export type SafeMetadataValue = string | number | boolean | null;
export type SafeMetadata = Record<string, SafeMetadataValue | SafeMetadataValue[]>;

export type ClientContext = {
  sessionId?: string;
  page?: string;
  browser?: string;
  deviceType?: string;
  operatingSystem?: string;
  referrerHost?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
};

export type ErrorType =
  | "client_error"
  | "api_error"
  | "database_error"
  | "auth_error"
  | "ai_error"
  | "search_error"
  | "payment_error"
  | "upload_error"
  | "unknown_error";

export type ErrorSeverity = "info" | "warning" | "error" | "critical";