import Link from "next/link";
import {
  ArrowRight,
  Check,
  CircleCheckBig,
  GraduationCap,
  Image as ImageIcon,
  Link2,
  MessageSquareQuote,
  ScanSearch,
  ShieldCheck,
  Sparkles,
  Users,
  Zap,
} from "lucide-react";
import { LandingLiveDemo } from "@/components/landing-live-demo";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import styles from "./page.module.css";

const signals = ["TikTok claim", "Screenshot", "Headline", "Group chat", "Viral thread", "Creator clip"];

export default function HomePage() {
  return (
    <>
      <SiteHeader />
      <main>
        <section className={styles.hero}>
          <div className={styles.heroMesh} aria-hidden="true" />
          <div className={`container ${styles.heroInner}`}>
            <div className={styles.heroCopy}>
              <p className="eyebrow">Truth checks at feed speed</p>
              <h1>Know what&apos;s real before it goes viral.</h1>
              <p className={styles.heroLead}>Drop any post, screenshot, link, or claim. InSight separates fact from noise and gives you a truth score in seconds.</p>
              <div className={styles.heroActions}>
                <Link className="button" href="/login">InSight a post <ArrowRight size={18} /></Link>
                <Link className="button secondary" href="#live-demo">Watch it work</Link>
              </div>
              <div className={styles.heroTrust}><span><ShieldCheck size={15} /> 5 free checks</span><span><Sparkles size={15} /> No card</span><span><CircleCheckBig size={15} /> Private by default</span></div>
            </div>
            <div id="live-demo"><LandingLiveDemo /></div>
          </div>
          <div className={styles.scrollHint}>See what earns your trust <span>↓</span></div>
        </section>

        <div className={styles.signalRail} aria-hidden="true"><div>{[...signals, ...signals].map((signal, index) => <span key={`${signal}-${index}`}><ScanSearch size={14} /> {signal}</span>)}</div></div>

        <section className={styles.proofBand}>
          <div className="container">
            <div className={styles.sectionIntro}><p className="eyebrow">Not another true-or-false bot</p><h2>Context changes everything.</h2><p>InSight shows the uncertainty, detects opinion and satire, and tells you what to verify next.</p></div>
            <div className={styles.signalGrid}>
              <article><span>01</span><MessageSquareQuote size={23} /><h3>Claims, separated</h3><p>See the exact factual statements hiding inside a caption, clip, or screenshot.</p></article>
              <article><span>02</span><Zap size={23} /><h3>Scores, calibrated</h3><p>Truth and confidence are different signals. InSight makes both visible.</p></article>
              <article><span>03</span><ShieldCheck size={23} /><h3>Limits, included</h3><p>No fake certainty. Missing context and unverifiable inputs are called out directly.</p></article>
            </div>
          </div>
        </section>

        <section className={styles.workflowBand} id="how-it-works">
          <div className="container">
            <div className={styles.sectionIntro}><p className="eyebrow">Three inputs. One instinct.</p><h2>Before you repost it, InSight it.</h2></div>
            <div className={styles.workflow}>
              <div className={styles.inputStack}><span><MessageSquareQuote size={20} /> Paste the claim</span><span><Link2 size={20} /> Drop the link</span><span><ImageIcon size={20} /> Paste the screenshot</span></div>
              <div className={styles.workflowCore}><span><ScanSearch size={30} /></span><strong>InSight AI</strong><small>claims · context · confidence</small></div>
              <div className={styles.workflowOutput}><strong>62</strong><div><span>Mixed</span><small>74% confidence</small></div></div>
            </div>
          </div>
        </section>

        <section className={styles.audienceBand}>
          <div className="container">
            <div className={styles.audienceCopy}><p className="eyebrow">Made for the real internet</p><h2>Your feed moves fast. Your standards don&apos;t have to drop.</h2></div>
            <div className={styles.audienceList}><span><Sparkles size={18} /> Creators</span><span><GraduationCap size={18} /> Students</span><span><Users size={18} /> Group chats</span><span><ImageIcon size={18} /> Social scrollers</span></div>
          </div>
        </section>

        <section className={styles.pricingBand}>
          <div className="container">
            <div className={styles.sectionIntro}><p className="eyebrow">Less than one coffee</p><h2>Make checking a habit.</h2><p>Try every input type free. Upgrade when your curiosity becomes part of your daily scroll.</p></div>
            <div className={styles.pricingGrid}>
              <article className={styles.priceCard}><div><small>FREE</small><h3>$0</h3><p>Five complete checks. No card.</p></div><ul><li><Check size={17} /> Text, links, screenshots</li><li><Check size={17} /> Full scores and analysis</li><li><Check size={17} /> Private history</li></ul><Link className="button secondary" href="/login">Start with 5 free</Link></article>
              <article className={`${styles.priceCard} ${styles.featured}`}><span className={styles.popular}>DAILY SCROLLER</span><div><small>STARTER</small><h3>$4.99 <em>/ month</em></h3><p>Less than 1¢ per check.</p></div><ul><li><Check size={17} /> 1,000 checks monthly</li><li><Check size={17} /> Every analysis saved</li><li><Check size={17} /> Cancel any time</li></ul><Link className="button" href="/pricing">Get Starter <ArrowRight size={17} /></Link></article>
            </div>
          </div>
        </section>

        <section className={styles.safetyBand}>
          <div className={`container ${styles.safetyGrid}`}><div><ShieldCheck size={28} /><p className="eyebrow">Built with uncertainty visible</p><h2>A score is a starting point. Not a final authority.</h2></div><p>InSight uses AI-assisted analysis and can be wrong, incomplete, or outdated. High-stakes health, finance, legal, political, and election claims should always be checked against current primary sources.</p></div>
        </section>

        <section className={styles.faqBand}>
          <div className={`container ${styles.faqGrid}`}><div className={styles.sectionIntro}><p className="eyebrow">Questions are the point</p><h2>Good things to ask.</h2></div><div className={styles.faqList}><details><summary>Does InSight decide absolute truth?</summary><p>No. It gives evidence-assisted analysis with confidence and limitations, not a declaration of final truth.</p></details><details><summary>Does InSight open every link?</summary><p>Not yet. A bare URL is marked unverifiable unless you provide enough context to assess the claim itself.</p></details><details><summary>Can it detect opinion, memes, or satire?</summary><p>Yes. Non-factual content is classified directly instead of being forced into a misleading true-or-false result.</p></details><details><summary>Are screenshots private?</summary><p>Yes. They are stored in a private, user-scoped bucket and are not made public by the sharing tool.</p></details></div></div>
        </section>

        <section className={styles.finalCta}><div className="container"><span><ScanSearch size={28} /></span><h2>The next viral post is already loading.</h2><p>Know before you share.</p><Link className="button" href="/login">Get your 5 free checks <ArrowRight size={18} /></Link></div></section>
      </main>
      <SiteFooter />
    </>
  );
}