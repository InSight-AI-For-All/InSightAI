import Link from "next/link";
import { Brand } from "@/components/brand";

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="container footer-inner">
        <div>
          <Brand />
          <p className="muted" style={{ margin: "14px 0 0", maxWidth: 420 }}>
            Evidence-assisted analysis, not a final authority on truth.
          </p>
        </div>
        <div className="footer-links">
          <Link href="/pricing">Pricing</Link>
          <Link href="/terms">Terms &amp; safety</Link>
          <Link href="/login">Sign in</Link>
          <span>© {new Date().getFullYear()} InSight AI</span>
        </div>
      </div>
    </footer>
  );
}