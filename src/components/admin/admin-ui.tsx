import Link from "next/link";
import { ArrowDownRight, ArrowUpRight, Database, SearchX } from "lucide-react";
import styles from "@/app/admin/admin.module.css";

export function AdminHeader({ eyebrow, title, description, children }: { eyebrow: string; title: string; description: string; children?: React.ReactNode }) {
  return <header className={styles.pageHeader}><div><p>{eyebrow}</p><h1>{title}</h1><span>{description}</span></div>{children}</header>;
}

export function RangeLinks({ current = 30 }: { current?: number }) {
  return <div className={styles.range} aria-label="Date range">{[1, 7, 30, 90].map((days) => <Link data-active={current === days} href={`?days=${days}`} key={days}>{days === 1 ? "24h" : `${days}d`}</Link>)}</div>;
}

export function MetricCard({ label, value, detail, trend, tone = "default" }: { label: string; value: React.ReactNode; detail?: string; trend?: number; tone?: "default" | "good" | "warning" | "danger" }) {
  return <article className={styles.metric} data-tone={tone}><span>{label}</span><strong>{value}</strong><footer>{detail && <small>{detail}</small>}{trend !== undefined && <em data-positive={trend >= 0}>{trend >= 0 ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}{Math.abs(trend)}%</em>}</footer></article>;
}

export function StatusBadge({ value }: { value: string | null | undefined }) {
  const normalized = (value || "unknown").toLowerCase();
  const tone = ["completed", "active", "healthy", "good", "paid", "admin", "success", "true"].some((item) => normalized.includes(item))
    ? "good"
    : ["failed", "critical", "error", "poor", "canceled", "false"].some((item) => normalized.includes(item))
      ? "danger"
      : ["warning", "degraded", "needs-improvement", "trialing", "started"].some((item) => normalized.includes(item))
        ? "warning"
        : "neutral";
  return <span className={styles.badge} data-tone={tone}>{value || "Unknown"}</span>;
}

export function AdminPanel({ title, description, children, className = "" }: { title: string; description?: string; children: React.ReactNode; className?: string }) {
  return <section className={`${styles.panel} ${className}`}><header><div><h2>{title}</h2>{description && <p>{description}</p>}</div></header>{children}</section>;
}

export function AdminTable({ children }: { children: React.ReactNode }) {
  return <div className={styles.tableWrap}><table className={styles.table}>{children}</table></div>;
}

export function EmptyAdminState({ title = "No operational data yet", description = "Events will appear here as the instrumented workflow is used." }: { title?: string; description?: string }) {
  return <div className={styles.empty}><SearchX size={28} /><h3>{title}</h3><p>{description}</p></div>;
}

export function PrivacyNotice() {
  return <aside className={styles.privacy}><Database size={18} /><span><strong>Metadata-only operational view.</strong> Raw claims, screenshots, prompts, secrets, payment methods, and OAuth tokens are not shown or collected here.</span></aside>;
}

export function formatNumber(value: number | string | null | undefined) {
  return Number(value || 0).toLocaleString();
}

export function formatMoney(cents: number | string | null | undefined) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(cents || 0) / 100);
}

export function formatDuration(milliseconds: number | string | null | undefined) {
  const value = Number(milliseconds || 0);
  return value >= 1_000 ? `${(value / 1_000).toFixed(1)}s` : `${Math.round(value)}ms`;
}

export function formatDate(value: string | null | undefined) {
  return value ? new Date(value).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "Never";
}