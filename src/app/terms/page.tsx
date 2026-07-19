import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight, ShieldCheck } from "lucide-react";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";

export const metadata: Metadata = { title: "Terms & safety" };

const sections = [
  ["analysis", "Evidence-assisted analysis"],
  ["decisions", "High-impact decisions"],
  ["content", "Links and screenshots"],
  ["people", "Public figures"],
  ["privacy", "Your content"],
  ["subscriptions", "Subscriptions"],
] as const;

export default function TermsPage() {
  return (
    <>
      <SiteHeader />
      <main className="legal-page">
        <article className="container">
          <p className="eyebrow">Terms &amp; safety</p>
          <h1>Use InSight as a signal, not a final verdict.</h1>
          <p className="legal-updated">Last updated July 17, 2026</p>
          <nav className="legal-index" aria-label="On this page">
            <span><ShieldCheck size={20} /> On this page</span>
            {sections.map(([id, label]) => (
              <Link href={`#${id}`} key={id}>{label}<ArrowUpRight size={14} /></Link>
            ))}
          </nav>
          <section id="analysis">
            <h2>Evidence-assisted analysis</h2>
            <p>InSight AI uses automated systems to analyze user-provided content. Results may be incomplete, inaccurate, outdated, or affected by missing context. A truth score is an evidence-assisted estimate, not a guarantee or declaration of absolute truth.</p>
          </section>
          <section id="decisions">
            <h2>High-impact decisions</h2>
            <p>Do not rely on InSight alone for medical, legal, financial, election, emergency, or other consequential decisions. Confirm current information with primary sources and appropriately qualified professionals.</p>
          </section>
          <section id="content">
            <h2>Links and screenshots</h2>
            <p>InSight may search and open public web pages to assess submitted claims. Access can fail because of paywalls, login requirements, robots rules, indexing gaps, or changing content. Screenshots can omit surrounding context and may be altered; InSight does not authenticate their origin.</p>
          </section>
          <section id="people">
            <h2>Public figures and allegations</h2>
            <p>Automated analysis must not be treated as proof of wrongdoing. Avoid using results to harass, defame, or target another person. Check serious allegations through reliable, independent reporting and official records.</p>
          </section>
          <section id="privacy">
            <h2>Your content</h2>
            <p>Do not upload content you lack the right to process, highly sensitive personal information, or unlawful material. Screenshots are validated, processed in server memory, and sent to the configured AI provider for analysis without being persisted by the application. Submitted content may be used by the configured provider to perform web searches. Share graphics are generated locally and do not publish private result URLs.</p>
          </section>
          <section id="subscriptions">
            <h2>Subscriptions</h2>
            <p>The Starter plan renews monthly until cancelled through the Stripe billing portal. Limits are enforced server-side. Failures before an AI request starts are not counted. Once AI analysis starts, the attempt counts toward your plan even if a result cannot be completed.</p>
          </section>
          <section>
            <h2>Service availability</h2>
            <p>The service may be changed, interrupted, or withdrawn. These product terms are a starter policy and should be reviewed by qualified counsel before public launch. By using InSight, you accept this safety notice and agree to use results responsibly.</p>
          </section>
        </article>
      </main>
      <SiteFooter />
    </>
  );
}