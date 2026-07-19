"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  Bot,
  ChartNoAxesCombined,
  CircleDollarSign,
  ClipboardCheck,
  Gauge,
  LayoutDashboard,
  ScrollText,
  Settings,
  ShieldAlert,
  Users,
} from "lucide-react";
import styles from "@/app/admin/admin.module.css";

const items = [
  ["/admin/overview", "Overview", LayoutDashboard],
  ["/admin/users", "Users", Users],
  ["/admin/telemetry", "Telemetry", Activity],
  ["/admin/errors", "Errors", ShieldAlert],
  ["/admin/fact-checks", "Fact checks", ClipboardCheck],
  ["/admin/ai", "AI & search", Bot],
  ["/admin/revenue", "Revenue", CircleDollarSign],
  ["/admin/performance", "Performance", Gauge],
  ["/admin/audit", "Audit log", ScrollText],
  ["/admin/settings", "Settings", Settings],
] as const;

export function AdminNavigation() {
  const pathname = usePathname();
  return (
    <nav className={styles.navigation} aria-label="Admin portal">
      {items.map(([href, label, Icon]) => (
        <Link className={pathname === href || pathname.startsWith(`${href}/`) ? styles.active : ""} href={href} key={href}>
          <Icon size={18} aria-hidden="true" /><span>{label}</span>
        </Link>
      ))}
      <Link href="/dashboard"><ChartNoAxesCombined size={18} /><span>Customer app</span></Link>
    </nav>
  );
}