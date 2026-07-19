import type { Metadata } from "next";
import {
  AdminHeader,
  AdminPanel,
  AdminTable,
  EmptyAdminState,
  MetricCard,
  RangeLinks,
  StatusBadge,
  formatDate,
  formatDuration,
  formatNumber,
} from "@/components/admin/admin-ui";
import { requireAdmin } from "@/lib/admin/auth";
import { adminDateRange, getAdminAi } from "@/lib/admin/data";
import { recordAdminAudit } from "@/lib/telemetry/server";
import styles from "../admin.module.css";

export const metadata: Metadata = { title: "AI and search" };

type AiRow = Awaited<ReturnType<typeof getAdminAi>>["ai"][number];

function grouped<T extends string>(rows: AiRow[], key: (row: AiRow) => T) {
  return Object.values(rows.reduce<Record<string, { key: T; requests: number; cost: number; input: number; output: number }>>((groups, row) => {
    const value = key(row);
    const group = groups[value] || { key: value, requests: 0, cost: 0, input: 0, output: 0 };
    group.requests += 1;
    group.cost += Number(row.estimated_cost_usd || 0);
    group.input += Number(row.prompt_tokens || 0);
    group.output += Number(row.completion_tokens || 0);
    groups[value] = group;
    return groups;
  }, {})).sort((left, right) => right.cost - left.cost);
}

export default async function AdminAiPage({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  const admin = await requireAdmin();
  const { days } = adminDateRange((await searchParams).days);
  const { ai, searches } = await getAdminAi(days);
  await recordAdminAudit({ adminUserId: admin.id, action: "admin_page_viewed", targetType: "page", targetId: "ai", metadata: { days } });

  const completed = ai.filter((row) => row.status === "completed");
  const failed = ai.filter((row) => row.status === "failed");
  const cacheHits = completed.filter((row) => row.stage === "cache");
  const startedChecks = completed.filter((row) => row.stage === "classification").length + cacheHits.length;
  const totalCost = completed.reduce((sum, row) => sum + Number(row.estimated_cost_usd || 0), 0);
  const inputTokens = completed.reduce((sum, row) => sum + Number(row.prompt_tokens || 0), 0);
  const outputTokens = completed.reduce((sum, row) => sum + Number(row.completion_tokens || 0), 0);
  const latency = completed.length ? completed.reduce((sum, row) => sum + Number(row.latency_ms || 0), 0) / completed.length : 0;
  const models = grouped(completed, (row) => row.model);
  const users = grouped(completed.filter((row) => row.user_id), (row) => String(row.user_id));
  const expensive = [...completed].sort((left, right) => Number(right.estimated_cost_usd || 0) - Number(left.estimated_cost_usd || 0)).slice(0, 10);
  const searchSuccess = searches.filter((row) => row.status === "completed").length;

  return <>
    <AdminHeader eyebrow="AI operations" title="OpenAI and web search" description="Model routing, exact cost, cache efficiency, token volume, search use, latency, and failures.">
      <RangeLinks current={days} />
    </AdminHeader>
    <div className={styles.metricGrid}>
      <MetricCard label="AI cost" value={`$${totalCost.toFixed(4)}`} detail={`$${(totalCost / days).toFixed(4)} per day`} />
      <MetricCard label="Cost / check" value={`$${(totalCost / Math.max(1, startedChecks)).toFixed(4)}`} detail={`${startedChecks} checks`} />
      <MetricCard label="Cache hit rate" value={`${Math.round(cacheHits.length / Math.max(1, startedChecks) * 100)}%`} detail={`${cacheHits.length} exact hits`} tone={cacheHits.length ? "good" : "default"} />
      <MetricCard label="Search rate" value={`${Math.round(searches.length / Math.max(1, startedChecks) * 100)}%`} detail={`${searches.length} grounded runs`} />
      <MetricCard label="Avg input tokens" value={formatNumber(inputTokens / Math.max(1, completed.length))} />
      <MetricCard label="Avg output tokens" value={formatNumber(outputTokens / Math.max(1, completed.length))} />
      <MetricCard label="AI success" value={`${ai.length ? Math.round(completed.length / Math.max(1, completed.length + failed.length) * 100) : 0}%`} tone={failed.length ? "warning" : "good"} />
      <MetricCard label="AI latency" value={formatDuration(latency)} />
      <MetricCard label="Search success" value={`${searches.length ? Math.round(searchSuccess / searches.length * 100) : 0}%`} />
    </div>
    <div className={styles.dashboardGrid}>
      <AdminPanel title="Model breakdown" description="Stage requests, exact estimated spend, and token volume">
        <AdminTable><thead><tr><th>Model</th><th>Requests</th><th>Input</th><th>Output</th><th>Cost</th></tr></thead><tbody>{models.map((model) => <tr key={model.key}><td>{model.key}</td><td>{model.requests}</td><td>{formatNumber(model.input)}</td><td>{formatNumber(model.output)}</td><td>${model.cost.toFixed(5)}</td></tr>)}</tbody></AdminTable>
      </AdminPanel>
      <AdminPanel title="Cost by user" description="Top users by estimated AI spend">
        <AdminTable><thead><tr><th>User</th><th>Requests</th><th>Tokens</th><th>Cost</th></tr></thead><tbody>{users.slice(0, 10).map((user) => <tr key={user.key}><td><code>{user.key.slice(0, 8)}</code></td><td>{user.requests}</td><td>{formatNumber(user.input + user.output)}</td><td>${user.cost.toFixed(5)}</td></tr>)}</tbody></AdminTable>
      </AdminPanel>
    </div>
    <AdminPanel title="Most expensive requests" description="Highest estimated stage costs in the selected range">
      {expensive.length ? <AdminTable><thead><tr><th>Time</th><th>Model / stage</th><th>User</th><th>Input</th><th>Output</th><th>Cost</th><th>Route</th></tr></thead><tbody>{expensive.map((row) => <tr key={row.id}><td>{formatDate(row.created_at)}</td><td>{row.model}<br /><small>{row.stage}</small></td><td><code>{row.user_id ? String(row.user_id).slice(0, 8) : "anonymous"}</code></td><td>{formatNumber(row.prompt_tokens)}</td><td>{formatNumber(row.completion_tokens)}</td><td>${Number(row.estimated_cost_usd || 0).toFixed(6)}</td><td>{String((row.metadata as Record<string, unknown> | null)?.route || "unknown")}</td></tr>)}</tbody></AdminTable> : <EmptyAdminState />}
    </AdminPanel>
    <AdminPanel title="AI requests">
      {ai.length ? <AdminTable><thead><tr><th>Time</th><th>Status</th><th>Model / stage</th><th>Latency</th><th>Tokens</th><th>Cost</th><th>Retries</th><th>Diagnostics</th></tr></thead><tbody>{ai.map((row) => <tr key={row.id}><td>{formatDate(row.created_at)}</td><td><StatusBadge value={row.status} /></td><td>{row.model}<br /><small>{row.stage}</small></td><td>{formatDuration(row.latency_ms)}</td><td>{formatNumber(row.total_tokens)}</td><td>${Number(row.estimated_cost_usd || 0).toFixed(5)}</td><td>{row.retry_count}</td><td>{row.json_parse_failure ? "JSON repair" : row.timed_out ? "Timeout" : row.refusal ? "Refusal" : row.error_code || "—"}</td></tr>)}</tbody></AdminTable> : <EmptyAdminState />}
    </AdminPanel>
    <AdminPanel title="Web search">
      {searches.length ? <AdminTable><thead><tr><th>Time</th><th>Status</th><th>Calls</th><th>Sources</th><th>Citations</th><th>Latency</th><th>Failure</th></tr></thead><tbody>{searches.map((row) => <tr key={row.id}><td>{formatDate(row.created_at)}</td><td><StatusBadge value={row.status} /></td><td>{row.query_count}</td><td>{row.source_count}</td><td>{row.citation_count}</td><td>{formatDuration(row.latency_ms)}</td><td>{row.failure_reason || "—"}</td></tr>)}</tbody></AdminTable> : <EmptyAdminState title="No web searches in this range" />}
    </AdminPanel>
  </>;
}
