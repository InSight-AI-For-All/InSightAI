import type { Metadata } from "next";
import Link from "next/link";
import { Search } from "lucide-react";
import { AdminHeader, AdminPanel, AdminTable, EmptyAdminState, RangeLinks, StatusBadge, formatDate } from "@/components/admin/admin-ui";
import { requireAdmin } from "@/lib/admin/auth";
import { adminDateRange, getAdminErrors } from "@/lib/admin/data";
import { recordAdminAudit } from "@/lib/telemetry/server";
import styles from "../admin.module.css";

export const metadata: Metadata = { title: "Errors" };

export default async function AdminErrorsPage({ searchParams }: { searchParams: Promise<{ days?: string; q?: string; severity?: string; type?: string }> }) {
  const admin = await requireAdmin(); const filters = await searchParams; const { days } = adminDateRange(filters.days); const errors = await getAdminErrors(days, filters);
  await recordAdminAudit({ adminUserId: admin.id, action: "admin_page_viewed", targetType: "page", targetId: "errors", metadata: { days } });
  const uniqueUsers = new Set(errors.map((error) => error.user_id).filter(Boolean)).size; const fingerprints = new Set(errors.map((error) => error.fingerprint)).size;
  return <><AdminHeader eyebrow="Reliability" title="Errors" description={`${errors.length} occurrences · ${fingerprints} signatures · ${uniqueUsers} affected users`}><RangeLinks current={days} /></AdminHeader><form className={styles.filters}><input type="hidden" name="days" value={days} /><input className="input" name="q" defaultValue={filters.q} placeholder="Search message or endpoint" /><select className="select" name="severity" defaultValue={filters.severity || ""}><option value="">All severities</option><option>info</option><option>warning</option><option>error</option><option>critical</option></select><select className="select" name="type" defaultValue={filters.type || ""}><option value="">All types</option><option>client_error</option><option>api_error</option><option>database_error</option><option>auth_error</option><option>ai_error</option><option>search_error</option><option>payment_error</option><option>upload_error</option></select><button className="button"><Search size={16} /> Filter</button></form><AdminPanel title="Error occurrences" description="Sanitized messages and admin-only details">{errors.length ? <AdminTable><thead><tr><th>Time</th><th>Severity</th><th>Type</th><th>Message</th><th>Endpoint/page</th><th>User</th><th>Request</th></tr></thead><tbody>{errors.map((error) => <tr key={error.id}><td>{formatDate(error.created_at)}</td><td><StatusBadge value={error.severity} /></td><td>{error.error_type}</td><td><Link href={`/admin/errors/${error.id}`}>{error.message}</Link></td><td>{error.endpoint || error.page || "—"}</td><td><code>{error.user_id ? String(error.user_id).slice(0, 8) : "anonymous"}</code></td><td><code>{error.request_id ? String(error.request_id).slice(0, 8) : "—"}</code></td></tr>)}</tbody></AdminTable> : <EmptyAdminState title="No errors match this range" />}</AdminPanel></>;
}