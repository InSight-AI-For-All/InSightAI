import Link from "next/link";
import {
  ArrowRight,
  BookOpenCheck,
  Check,
  GraduationCap,
  HeartPulse,
  Image as ImageIcon,
  Link2,
  MessageSquareQuote,
  ShieldCheck,
  Sparkles,
  Users,
  Zap,
} from "lucide-react";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import styles from "./page.module.css";

const tickerItems = [
  "Links",
  "Screenshots",
  "Claims",
  "Context",
  "Truth score",
  "Confidence score",
  "Opinion detection",
  "Share smarter",
];

export default function HomePage() {
  return (
    <>
      <SiteHeader />
      <main>
        <section className={styles.hero}>
          <div className={`container ${styles.heroInner}`}>
            <div className={styles.heroCopy}>
              <p className="eyebrow" style={{ color: "#78e2b4" }}>Truth checks for social speed</p>
              <h1>InSight AI</h1>
              <p className={styles.heroLead}>
                Fake posts move fast. Drop a link, screenshot, or claim and get a clear,
                evidence-assisted assessment before you share.
              </p>
              <div className={styles.heroActions}>
                <Link className="button accent" href="/login">
                  InSight a post <ArrowRight size={18} />
                </Link>
                <Link className="button secondary" href="#product-demo">
                  See an example
                </Link>
              </div>
              <p className={styles.heroNote}>
                <ShieldCheck size={16} /> Five free checks. No card required.
              </p>
            </div>
          </div>
        </section>

        <div className={styles.ticker} aria-hidden="true">
          <div className={styles.tickerInner}>
            {[...tickerItems, ...tickerItems].map((item, index) => (
              <span className={styles.tickerItem} key={`${item}-${index}`}>{item}</span>
            ))}
          </div>
        </div>

        <section className={styles.section}>
          <div className={`container ${styles.problemGrid}`}>
            <div>
              <p className="eyebrow">The share-button problem</p>
              <p className={styles.problemStatement}>
                The internet asks you to react instantly. Truth usually takes longer.
              </p>
            </div>
            <div className={styles.problemList}>
              <div className={styles.problemItem}>
                <span className={styles.iconBox}><Zap size={20} /></span>
                <div><h3>Virality beats context</h3><p>By the time a correction catches up, the original post has already traveled.</p></div>
              </div>
              <div className={styles.problemItem}>
                <span className={styles.iconBox}><MessageSquareQuote size={20} /></span>
                <div><h3>Not every claim is factual</h3><p>Opinion, satire, old context, and edited screenshots need different answers.</p></div>
              </div>
              <div className={styles.problemItem}>
                <span className={styles.iconBox}><BookOpenCheck size={20} /></span>
                <div><h3>Research has a time cost</h3><p>InSight turns a complicated first pass into a clear, readable starting point.</p></div>
              </div>
            </div>
          </div>
        </section>

        <section className={`${styles.section} ${styles.demoBand}`} id="product-demo">
          <div className={`container ${styles.demoGrid}`}>
            <div className={styles.demoIntro}>
              <p className="eyebrow">More than true or false</p>
              <h2>Understand what earns your trust.</h2>
              <p>
                InSight separates the claim, the evidence, and the uncertainty. You get a
                score you can scan and an explanation you can actually use.
              </p>
              <Link className="button" href="/login">Check your first claim <ArrowRight size={17} /></Link>
            </div>
            <div className={styles.demoWindow} aria-label="Example fact-check result">
              <div className={styles.demoTop}>
                <div className={styles.demoText}>
                  <span className="status-pill">Mixed · Science</span>
                  <h3>Some truth, missing context</h3>
                  <p>The core statistic is plausible, but the post leaves out the timeframe and comparison group.</p>
                </div>
                <div className={styles.score}><span>62</span></div>
              </div>
              <div className={styles.demoAnalysis}>
                <div><strong>Confidence · 74</strong><p>Enough information for a useful assessment, but not a definitive conclusion.</p></div>
                <div><strong>Before you share</strong><p>Find the original study and confirm the date, sample, and quoted measure.</p></div>
              </div>
            </div>
          </div>
        </section>

        <section className={styles.section} id="how-it-works">
          <div className="container">
            <div className={styles.sectionTitle}>
              <p className="eyebrow">One check, three steps</p>
              <h2>Drop it. Read it. Decide.</h2>
              <p>No research rabbit hole. Just a structured first pass built for the moment before reposting.</p>
            </div>
            <div className={styles.steps}>
              <div className={styles.step}><span className={styles.stepNumber}>01 · INPUT</span><h3>Bring the post</h3><p>Paste text, add a link, or upload a JPG, PNG, or WebP screenshot.</p></div>
              <div className={styles.step}><span className={styles.stepNumber}>02 · ANALYZE</span><h3>Separate the claims</h3><p>AI classifies what can be checked, examines context, and calibrates uncertainty.</p></div>
              <div className={styles.step}><span className={styles.stepNumber}>03 · CHOOSE</span><h3>Share with context</h3><p>Read the evidence assessment and take the recommended verification step.</p></div>
            </div>
          </div>
        </section>

        <section className={`${styles.section} ${styles.audienceBand}`}>
          <div className="container">
            <div className={styles.sectionTitle}>
              <p className="eyebrow" style={{ color: "#78e2b4" }}>Built for the real feed</p>
              <h2>For people who care what happens after they hit share.</h2>
            </div>
            <div className={styles.audiences}>
              <span className={styles.audience}><Sparkles size={18} /> Creators</span>
              <span className={styles.audience}><GraduationCap size={18} /> Students</span>
              <span className={styles.audience}><BookOpenCheck size={18} /> Educators</span>
              <span className={styles.audience}><Users size={18} /> Communities</span>
              <span className={styles.audience}><HeartPulse size={18} /> Everyday researchers</span>
              <span className={styles.audience}><ImageIcon size={18} /> Social scrollers</span>
            </div>
          </div>
        </section>

        <section className={styles.section}>
          <div className="container">
            <div className={styles.sectionTitle}>
              <p className="eyebrow">Simple pricing</p>
              <h2>Start curious. Upgrade when it becomes a habit.</h2>
            </div>
            <div className={styles.pricingGrid}>
              <article className={styles.priceCard}>
                <h3>Free</h3><p className="muted">Try the complete product.</p>
                <div className={styles.price}>$0</div>
                <ul className={styles.priceList}><li><Check size={18} /> 5 fact checks total</li><li><Check size={18} /> Text, links, and screenshots</li><li><Check size={18} /> Saved check history</li></ul>
                <Link className="button secondary" href="/login">Start free</Link>
              </article>
              <article className={`${styles.priceCard} ${styles.priceCardFeatured}`}>
                <span className="status-pill">Most popular</span><h3 style={{ marginTop: 16 }}>Starter</h3><p className="muted">For your daily information diet.</p>
                <div className={styles.price}>$4.99 <small>/ month</small></div>
                <ul className={styles.priceList}><li><Check size={18} /> 1,000 checks every month</li><li><Check size={18} /> Full analysis and history</li><li><Check size={18} /> Cancel any time</li></ul>
                <Link className="button" href="/pricing">Choose Starter</Link>
              </article>
            </div>
          </div>
        </section>

        <section className={styles.section} style={{ background: "white" }}>
          <div className={`container ${styles.faqGrid}`}>
            <div className={styles.sectionTitle}><p className="eyebrow">Straight answers</p><h2>Worth questioning.</h2></div>
            <div className={styles.faqList}>
              <details><summary>Does InSight decide absolute truth?</summary><p>No. It provides evidence-assisted analysis with confidence and limitations. Important decisions should be checked against current primary sources and qualified experts.</p></details>
              <details><summary>Does it open every link I paste?</summary><p>Not yet. InSight does not pretend a page was retrieved when it was not. A bare link is marked unverifiable unless enough context is provided.</p></details>
              <details><summary>Can it detect opinion or satire?</summary><p>Yes. Those are classified directly rather than squeezed into a misleading true-or-false label.</p></details>
              <details><summary>Are screenshots private?</summary><p>Screenshots are stored in a private user-scoped bucket. They are sent to the configured AI provider for analysis and are never public by default.</p></details>
            </div>
          </div>
        </section>

        <section className={styles.finalCta}>
          <div className="container"><h2>Before you repost it, InSight it.</h2><Link className="button" href="/login">Get five free checks <ArrowRight size={18} /></Link></div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}