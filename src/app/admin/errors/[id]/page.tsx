import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AdminHeader, AdminPanel, StatusBadge, formatDate } from "@/components/admin/admin-ui";
import { requireAdmin } from "@/lib/admin/auth";
import { getAdminError } from "@/lib/admin/data";
import { recordAdminAudit } from "@/lib/telemetry/server";
import styles from "../../admin.module.css";

export const metadata: Metadata = { title: "Error detail" };

export default async function AdminErrorDetail({ params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin(); const { id } = await params; const error = await getAdminError(id); if (!error) notFound();
  await recordAdminAudit({ adminUserId: admin.id, action: "admin_error_viewed", targetType: "error", targetId: id });
  return <><AdminHeader eyebrow="Error detail" title={error.message} description="Sanitized diagnostic context. Stack traces are restricted to administrators." /><AdminPanel title="Occurrence"><dl className={styles.detail}><div><dt>Severity</dt><dd><StatusBadge value={error.severity} /></dd></div><div><dt>Type</dt><dd>{error.error_type}</dd></div><div><dt>Occurred</dt><dd>{formatDate(error.created_at)}</dd></div><div><dt>Fingerprint</dt><dd><code>{error.fingerprint}</code></dd></div><div><dt>Endpoint</dt><dd>{error.endpoint || "—"}</dd></div><div><dt>Page</dt><dd>{error.page || "—"}</dd></div><div><dt>User</dt><dd><code>{error.user_id || "anonymous"}</code></dd></div><div><dt>Request</dt><dd><code>{error.request_id || "—"}</code></dd></div><div><dt>Browser</dt><dd>{error.browser || "—"}</dd></div><div><dt>Device / OS</dt><dd>{error.device_type || "—"} · {error.operating_system || "—"}</dd></div></dl></AdminPanel><AdminPanel title="Stack trace" description="Secrets and request payloads are redacted before storage."><pre className={styles.stack}>{error.stack_trace || "No stack trace was available for this occurrence."}</pre></AdminPanel></>;
}