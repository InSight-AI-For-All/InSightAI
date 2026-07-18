import Link from "next/link";
import { CircleUserRound, LogOut, Plus } from "lucide-react";
import { DesktopNavigation, MobileNavigation } from "@/components/app-navigation";
import { Brand } from "@/components/brand";
import { requireUser } from "@/lib/auth";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const displayName = user.user_metadata.full_name || user.email?.split("@")[0] || "Account";

  return (
    <div className="app-frame">
      <aside className="app-sidebar">
        <Brand href="/dashboard" />
        <Link className="button app-new-check" href="/check"><Plus size={18} /> New check</Link>
        <DesktopNavigation />
        <div className="app-account">
          <CircleUserRound size={23} />
          <span><strong>{displayName}</strong><small>{user.email}</small></span>
          <form action="/auth/signout" method="post"><button type="submit" title="Sign out" aria-label="Sign out"><LogOut size={17} /></button></form>
        </div>
      </aside>
      <div className="app-main">
        <header className="mobile-app-header"><Brand href="/dashboard" /><Link className="mobile-profile-link" href="/account" aria-label="Open account"><CircleUserRound size={22} /></Link></header>
        <main>{children}</main>
        <MobileNavigation />
      </div>
    </div>
  );
}