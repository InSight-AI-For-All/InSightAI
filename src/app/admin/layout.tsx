import type { Metadata } from "next";
import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { AdminNavigation } from "@/components/admin/admin-navigation";
import { Brand } from "@/components/brand";
import { requireAdmin } from "@/lib/admin/auth";
import { recordAdminAudit } from "@/lib/telemetry/server";
import styles from "./admin.module.css";

export const metadata: Metadata = { title: { default: "Admin command center", template: "%s | InSight AI Admin" }, robots: { index: false, follow: false } };

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const admin = await requireAdmin();
  await recordAdminAudit({ adminUserId: admin.id, action: "admin_login", metadata: { surface: "admin_portal" } });
  return <div className={styles.shell}><aside className={styles.sidebar}><Brand href="/admin/overview" priority /><div className={styles.command}><ShieldCheck size={16} /><span><strong>Command center</strong><small>Restricted operations</small></span></div><AdminNavigation /><footer><strong>{admin.fullName || "Administrator"}</strong><span>{admin.email}</span><Link href="/dashboard">Return to app</Link></footer></aside><div className={styles.mobileHeader}><Brand href="/admin/overview" /><span>Admin</span></div><main className={styles.main}>{children}</main></div>;
}