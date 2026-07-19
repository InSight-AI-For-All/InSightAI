import type { Metadata } from "next";
import { AdminHeader, AdminPanel, AdminTable, EmptyAdminState, RangeLinks, formatDate } from "@/components/admin/admin-ui";
import { requireAdmin } from "@/lib/admin/auth";
import { adminDateRange, getAdminAudit } from "@/lib/admin/data";
import { recordAdminAudit } from "@/lib/telemetry/server";

export const metadata: Metadata = { title: "Audit log" };

export default async function AdminAuditPage({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  const admin = await requireAdmin(); const { days } = adminDateRange((await searchParams).days); const events = await getAdminAudit(days);
  await recordAdminAudit({ adminUserId: admin.id, action: "admin_page_viewed", targetType: "page", targetId: "audit", metadata: { days } });
  return <><AdminHeader eyebrow="Privileged access" title="Admin audit log" description="Immutable application-level record of portal access, user views, role changes, settings changes, and exports."><RangeLinks current={days} /></AdminHeader><AdminPanel title="Admin actions">{events.length ? <AdminTable><thead><tr><th>Time</th><th>Admin</th><th>Action</th><th>Target</th><th>Request</th><th>Metadata</th></tr></thead><tbody>{events.map((event) => <tr key={event.id}><td>{formatDate(event.created_at)}</td><td><code>{event.admin_user_id ? String(event.admin_user_id).slice(0, 8) : "deleted"}</code></td><td>{event.action}</td><td>{event.target_type || "—"} {event.target_id ? <code>{String(event.target_id).slice(0, 18)}</code> : null}</td><td><code>{event.request_id ? String(event.request_id).slice(0, 8) : "—"}</code></td><td><code>{JSON.stringify(event.metadata || {})}</code></td></tr>)}</tbody></AdminTable> : <EmptyAdminState />}</AdminPanel></>;
}