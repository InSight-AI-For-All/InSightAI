"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CircleUserRound,
  CreditCard,
  History,
  LayoutDashboard,
  Plus,
} from "lucide-react";

const navigation = [
  { href: "/dashboard", label: "Home", icon: LayoutDashboard },
  { href: "/history", label: "History", icon: History },
  { href: "/check", label: "Check", icon: Plus, primary: true },
  { href: "/pricing", label: "Plan", icon: CreditCard },
  { href: "/account", label: "You", icon: CircleUserRound },
];

function isActive(pathname: string, href: string) {
  return pathname === href || (href === "/history" && pathname.startsWith("/results/"));
}

export function DesktopNavigation() {
  const pathname = usePathname();

  return (
    <nav className="app-nav" aria-label="Workspace navigation">
      {navigation.filter((item) => !item.primary).map(({ href, label, icon: Icon }) => (
        <Link href={href} className={isActive(pathname, href) ? "active" : ""} aria-current={isActive(pathname, href) ? "page" : undefined} key={href}>
          <Icon size={19} />
          <span>{label === "You" ? "Settings" : label}</span>
        </Link>
      ))}
    </nav>
  );
}

export function MobileNavigation() {
  const pathname = usePathname();

  return (
    <nav className="mobile-tab-bar" aria-label="Mobile workspace navigation">
      {navigation.map(({ href, label, icon: Icon, primary }) => (
        <Link href={href} className={`${primary ? "primary" : ""} ${isActive(pathname, href) ? "active" : ""}`} aria-current={isActive(pathname, href) ? "page" : undefined} key={href}>
          <span className="mobile-tab-icon"><Icon size={primary ? 24 : 20} /></span>
          <span>{label}</span>
        </Link>
      ))}
    </nav>
  );
}