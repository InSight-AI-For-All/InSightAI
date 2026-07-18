import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { Brand } from "@/components/brand";

export async function SiteHeader() {
  const user = await getCurrentUser();

  return (
    <header className="site-header">
      <div className="container site-header-inner">
        <Brand />
        <nav className="site-nav" aria-label="Main navigation">
          <Link href="/#how-it-works">How it works</Link>
          <Link className="nav-pricing" href="/pricing">Pricing</Link>
          <Link className="button" href={user ? "/dashboard" : "/login"}>
            {user ? "Dashboard" : "InSight a post"}
            <ArrowRight size={17} aria-hidden="true" />
          </Link>
        </nav>
      </div>
    </header>
  );
}