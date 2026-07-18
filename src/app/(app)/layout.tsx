import Link from "next/link";
import { CircleUserRound, CreditCard, History, LayoutDashboard, LogOut, Plus, Settings } from "lucide-react";
import { Brand } from "@/components/brand";
import { requireUser } from "@/lib/auth";

const navigation = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
  { href: "/check", label: "New check", icon: Plus },
  { href: "/history", label: "History", icon: History },
  { href: "/pricing", label: "Plan", icon: CreditCard },
  { href: "/account", label: "Account", icon: Settings },
];

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const displayName = user.user_metadata.full_name || user.email?.split("@")[0] || "Account";

  return (
    <div className="app-frame">
      <aside className="app-sidebar">
        <Brand />
        <Link className="button app-new-check" href="/check"><Plus size={18} /> New check</Link>
        <nav className="app-nav" aria-label="Dashboard navigation">
          {navigation.map(({ href, label, icon: Icon }) => (
            <Link href={href} key={href}><Icon size={18} /> {label}</Link>
          ))}
        </nav>
        <div className="app-account">
          <CircleUserRound size={23} />
          <span><strong>{displayName}</strong><small>{user.email}</small></span>
          <form action="/auth/signout" method="post"><button type="submit" title="Sign out" aria-label="Sign out"><LogOut size={17} /></button></form>
        </div>
      </aside>
      <div className="app-main">
        <header className="mobile-app-header"><Brand /><Link className="button" href="/check"><Plus size={17} /> Check</Link></header>
        <main>{children}</main>
        <nav className="mobile-tab-bar" aria-label="Mobile dashboard navigation">
          {navigation.slice(0, 4).map(({ href, label, icon: Icon }) => <Link href={href} key={href}><Icon size={19} /><span>{label}</span></Link>)}
        </nav>
      </div>
    </div>
  );
}