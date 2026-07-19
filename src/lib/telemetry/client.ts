"use client";

import type { PublicTelemetryEvent, SafeMetadata } from "@/lib/telemetry/types";

const sessionKey = "insight.telemetry.session";

export function getTelemetrySessionId() {
  try {
    const existing = window.sessionStorage.getItem(sessionKey);
    if (existing && /^[0-9a-f-]{36}$/i.test(existing)) return existing;
    const created = crypto.randomUUID();
    window.sessionStorage.setItem(sessionKey, created);
    return created;
  } catch {
    return undefined;
  }
}

export function trackEvent(eventName: PublicTelemetryEvent, metadata: SafeMetadata = {}) {
  const body = JSON.stringify({ kind: "event", eventName, sessionId: getTelemetrySessionId(), metadata });
  if (navigator.sendBeacon) {
    navigator.sendBeacon("/api/telemetry", new Blob([body], { type: "application/json" }));
    return;
  }
  void fetch("/api/telemetry", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    keepalive: true,
  });
}