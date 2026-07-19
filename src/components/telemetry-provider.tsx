"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { getTelemetrySessionId, trackEvent } from "@/lib/telemetry/client";

const visitorKey = "insight.telemetry.visitor";

function post(body: Record<string, unknown>) {
  const payload = JSON.stringify({ ...body, sessionId: getTelemetrySessionId() });
  if (navigator.sendBeacon) {
    navigator.sendBeacon("/api/telemetry", new Blob([payload], { type: "application/json" }));
    return;
  }
  void fetch("/api/telemetry", { method: "POST", headers: { "Content-Type": "application/json" }, body: payload, keepalive: true });
}

function rating(name: string, value: number) {
  const limits: Record<string, [number, number]> = {
    LCP: [2_500, 4_000],
    INP: [200, 500],
    CLS: [0.1, 0.25],
    FCP: [1_800, 3_000],
    TTFB: [800, 1_800],
  };
  const threshold = limits[name];
  if (!threshold) return undefined;
  return value <= threshold[0] ? "good" : value <= threshold[1] ? "needs-improvement" : "poor";
}

export function TelemetryProvider() {
  const pathname = usePathname();

  useEffect(() => {
    const captureClientError = (error: Error, source: string) => {
      post({ kind: "error", message: error.message || "Client error", stack: error.stack, page: window.location.pathname, metadata: { source } });
    };
    const firstVisit = !window.localStorage.getItem(visitorKey);
    if (firstVisit) {
      window.localStorage.setItem(visitorKey, "1");
      trackEvent("first_visit");
    }
    trackEvent("session_started");

    const onError = (event: ErrorEvent) => captureClientError(event.error instanceof Error ? event.error : new Error(event.message), "window.error");
    const onRejection = (event: PromiseRejectionEvent) => captureClientError(event.reason instanceof Error ? event.reason : new Error("Unhandled promise rejection"), "unhandledrejection");
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    const onPageHide = () => trackEvent("session_ended");
    window.addEventListener("pagehide", onPageHide);

    if ("PerformanceObserver" in window) {
      const supported = PerformanceObserver.supportedEntryTypes;
      const observers: PerformanceObserver[] = [];
      for (const type of ["largest-contentful-paint", "paint", "layout-shift", "event"]) {
        if (!supported.includes(type)) continue;
        try {
          const observer = new PerformanceObserver((list) => {
            for (const entry of list.getEntries()) {
              let name = entry.name;
              let value = entry.duration || entry.startTime;
              if (type === "largest-contentful-paint") name = "LCP";
              if (entry.name === "first-contentful-paint") name = "FCP";
              if (type === "layout-shift") {
                const shift = entry as PerformanceEntry & { value?: number; hadRecentInput?: boolean };
                if (shift.hadRecentInput) continue;
                name = "CLS";
                value = shift.value || 0;
              }
              if (type === "event") name = "INP";
              if (!["LCP", "FCP", "CLS", "INP"].includes(name)) continue;
              post({ kind: "performance", metricName: name, value, rating: rating(name, value), page: window.location.pathname, metadata: {} });
            }
          });
          const options: PerformanceObserverInit & { durationThreshold?: number } = { type, buffered: true };
          if (type === "event") options.durationThreshold = 40;
          observer.observe(options);
          observers.push(observer);
        } catch {
          // Unsupported observer options are ignored without affecting the product.
        }
      }
      const navigation = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
      if (navigation) post({ kind: "performance", metricName: "TTFB", value: navigation.responseStart, rating: rating("TTFB", navigation.responseStart), page: window.location.pathname, metadata: {} });
      return () => {
        observers.forEach((observer) => observer.disconnect());
        window.removeEventListener("error", onError);
        window.removeEventListener("unhandledrejection", onRejection);
        window.removeEventListener("pagehide", onPageHide);
      };
    }

    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
      window.removeEventListener("pagehide", onPageHide);
    };
  }, []);

  useEffect(() => {
    trackEvent("page_viewed", { route: pathname });
    if (pathname === "/pricing") trackEvent("pricing_viewed");
    if (pathname.startsWith("/results/")) trackEvent("result_viewed");
  }, [pathname]);

  return null;
}