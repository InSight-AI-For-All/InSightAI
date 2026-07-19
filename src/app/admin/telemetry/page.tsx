import type { Metadata } from "next";
import { Search } from "lucide-react";
import { AdminHeader, AdminPanel, AdminTable, EmptyAdminState, PrivacyNotice, RangeLinks, formatDate } from "@/components/admin/admin-ui";
import { requireAdmin } from "@/lib/admin/auth";
import { adminDateRange, getTelemetryEvents } from "@/lib/admin/data";
import { recordAdminAudit } from "@/lib/telemetry/server";
import styles from "../admin.module.css";

export const metadata: Metadata = { title: "Telemetry" };

export default async function AdminTelemetryPage({ searchParams }: { searchParams: Promise<{ days?: string; q?: string; event?: string }> }) {
  const admin = await requireAdmin(); const filters = await searchParams; const { days } = adminDateRange(filters.days); const events = await getTelemetryEvents(days, { query: filters.q, event: filters.event });
  await recordAdminAudit({ adminUserId: admin.id, action: "admin_page_viewed", targetType: "page", targetId: "telemetry", metadata: { days } });
  return <><AdminHeader eyebrow="Product analytics" title="Telemetry events" description="Searchable user-journey, acquisition, navigation, product, auth, and billing events."><RangeLinks current={days} /></AdminHeader><PrivacyNotice /><form className={styles.filters}><input type="hidden" name="days" value={days} /><input className="input" name="q" defaultValue={filters.q} placeholder="Search event or page" /><input className="input" name="event" defaultValue={filters.event} placeholder="Exact event name" /><button className="button"><Search size={16} /> Filter</button></form><AdminPanel title={`${events.length} recent events`} description="Latest 500 matching records">{events.length ? <AdminTable><thead><tr><th>Time</th><th>Event</th><th>Category</th><th>User/session</th><th>Page</th><th>Device</th><th>Browser / OS</th><th>Referrer</th></tr></thead><tbody>{events.map((event) => <tr key={event.id}><td>{formatDate(event.created_at)}</td><td>{event.event_name}</td><td>{event.event_category}</td><td><code>{event.user_id ? String(event.user_id).slice(0, 8) : String(event.session_id || "anon").slice(0, 8)}</code></td><td>{event.page || "—"}</td><td>{event.device_type || "unknown"}</td><td>{event.browser || "—"}<br /><small>{event.operating_system || "—"}</small></td><td>{event.referrer_host || "Direct"}</td></tr>)}</tbody></AdminTable> : <EmptyAdminState />}</AdminPanel></>;
}