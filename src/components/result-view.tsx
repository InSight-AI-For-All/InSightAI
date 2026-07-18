import {
  AlertTriangle,
  BookOpenCheck,
  CheckCircle2,
  CircleHelp,
  ExternalLink,
  FileText,
  Globe2,
  HelpCircle,
  Lightbulb,
  Link2,
  ListChecks,
  Scale,
  SearchCheck,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import { ShareResult } from "@/components/share-result";
import type { FactCheckRecord } from "@/lib/data";
import styles from "./result-view.module.css";

function scoreColor(score: number) {
  if (score >= 75) return "#23845f";
  if (score >= 45) return "#e2ad2e";
  return "#d55d4b";
}

function EvidenceIcon({ stance }: { stance: "supports" | "contradicts" | "context" | "unclear" }) {
  if (stance === "supports") return <CheckCircle2 size={17} />;
  if (stance === "contradicts") return <XCircle size={17} />;
  return <HelpCircle size={17} />;
}

export function ResultView({ check }: { check: FactCheckRecord }) {
  const result = check.result;
  const ringStyle = {
    "--score": result.truthScore ?? 0,
    "--score-color": result.truthScore === null ? "#7d8199" : scoreColor(result.truthScore),
  } as React.CSSProperties;
  const sourcesByUrl = new Map(result.sources.map((source) => [source.url, source]));
  const assessedAt = new Date(check.createdAt).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });

  return (
    <>
      <section className="panel">
        <div className={styles.hero}>
          <div className={styles.heroCopy}>
            <span className="status-pill">{result.verdict} · {result.category}</span>
            <h1>{result.summary}</h1>
            <p>{result.claimType} · Assessed {assessedAt}</p>
            <ShareResult
              verdict={result.verdict}
              category={result.category}
              truthScore={result.truthScore}
              confidenceScore={result.confidenceScore}
              summary={result.summary}
            />
          </div>
          <div
            className={styles.scoreRing}
            style={ringStyle}
            aria-label={result.truthScore === null ? "No truth score assigned" : `Truth score ${result.truthScore} out of 100`}
          >
            <div className={styles.scoreInner}>
              <strong>{result.truthScore ?? "—"}</strong>
              <small>{result.truthScore === null ? "Not scored" : "Truth score"}</small>
            </div>
          </div>
        </div>
        <div className={styles.confidence}>
          <strong>Analysis confidence</strong>
          <div className={styles.confidenceTrack}><span style={{ width: `${result.confidenceScore}%` }} /></div>
          <span>{result.confidenceScore} / 100</span>
        </div>
      </section>

      <section className={styles.source}>
        <span>{check.inputType === "link" ? <Link2 size={18} /> : <FileText size={18} />}</span>
        <div><small>What you checked</small><p>{check.submittedUrl || check.rawText || "Private screenshot"}</p></div>
      </section>

      <section className={styles.methodology} aria-label="Verification methodology">
        <div><SearchCheck size={19} /><span><strong>{result.methodology.searchPerformed ? "Live research" : "Classification only"}</strong><small>{result.methodology.searchPerformed ? "Web evidence retrieved" : "No factual search required"}</small></span></div>
        <div><Globe2 size={19} /><span><strong>{result.methodology.sourceCount} sources</strong><small>{result.methodology.independentSourceCount} independent publishers</small></span></div>
        <div><ShieldCheck size={19} /><span><strong>{result.methodology.evidenceQuality} evidence</strong><small>{result.methodology.tier1SourceCount} primary · {result.methodology.tier2SourceCount} established</small></span></div>
      </section>

      <div className={styles.grid}>
        {result.claims.length > 0 ? (
          <section className={`panel ${styles.section} ${styles.claimSection}`}>
            <h2><ListChecks size={21} /> Claim-by-claim findings</h2>
            <div className={styles.claimList}>
              {result.claims.map((claim, index) => (
                <article className={styles.claimItem} key={claim.id}>
                  <header>
                    <span>Claim {index + 1}</span>
                    <span className="status-pill">{claim.verdict}</span>
                    <strong>{claim.truthScore === null ? "Not scored" : `${claim.truthScore} / 100`}</strong>
                  </header>
                  <h3>{claim.text}</h3>
                  <p>{claim.reasoning}</p>
                  {claim.evidence.length > 0 ? (
                    <div className={styles.evidenceList}>
                      {claim.evidence.map((evidence, evidenceIndex) => {
                        const source = sourcesByUrl.get(evidence.sourceUrl);
                        return (
                          <a href={evidence.sourceUrl} target="_blank" rel="noreferrer" data-stance={evidence.stance} key={`${evidence.sourceUrl}-${evidenceIndex}`}>
                            <span className={styles.stance}><EvidenceIcon stance={evidence.stance} /> {evidence.stance}</span>
                            <span><strong>{source?.title || new URL(evidence.sourceUrl).hostname}</strong><small>{source?.tierLabel || "Verified web source"}</small><p>{evidence.evidenceSummary}</p></span>
                            <ExternalLink size={15} />
                          </a>
                        );
                      })}
                    </div>
                  ) : (
                    <p className={styles.noEvidence}>No verified directional evidence was available for this claim.</p>
                  )}
                </article>
              ))}
            </div>
          </section>
        ) : (
          <section className={`panel ${styles.section}`}>
            <h2><ListChecks size={21} /> Key claims</h2>
            {result.keyClaims.length ? <ol className={styles.claims}>{result.keyClaims.map((claim, index) => <li key={`${claim}-${index}`}><span>{index + 1}</span>{claim}</li>)}</ol> : <p>No discrete factual claims were detected.</p>}
          </section>
        )}

        <section className={`panel ${styles.section}`}><h2><BookOpenCheck size={21} /> Analysis</h2><p>{result.analysis}</p></section>
        <section className={`panel ${styles.section}`}><h2><ShieldCheck size={21} /> Evidence assessment</h2><p>{result.evidenceAssessment}</p></section>
        <section className={`panel ${styles.section}`}><h2><Scale size={21} /> Why this score</h2><p>{result.scoreRationale}</p></section>
        <section className={`panel ${styles.section}`}><h2><AlertTriangle size={21} /> Uncertainty</h2><p>{result.uncertainties}</p></section>
        <section className={`panel ${styles.section}`}><h2><CircleHelp size={21} /> Limits of this check</h2><p>{result.limitations}</p></section>

        {result.sources.length > 0 && (
          <section className={`panel ${styles.section} ${styles.sources}`}>
            <h2><Globe2 size={21} /> Sources checked</h2>
            <div className={styles.sourceList}>
              {result.sources.map((source) => (
                <a href={source.url} target="_blank" rel="noreferrer" key={source.url}>
                  <span>
                    <strong>{source.title}</strong>
                    <small>{source.publisher || new URL(source.url).hostname.replace(/^www\./, "")} {source.publicationDate ? `· ${source.publicationDate}` : ""}</small>
                    <em data-tier={source.tier}>{source.tierLabel}</em>
                  </span>
                  <ExternalLink size={16} />
                </a>
              ))}
            </div>
          </section>
        )}

        <section className={`panel ${styles.section} ${styles.action}`}>
          <h2><Lightbulb size={21} /> Before you share</h2><p>{result.recommendedAction}</p>
        </section>
      </div>

      <div className={styles.disclaimer}>
        <AlertTriangle size={20} />
        <span>{result.disclaimer} Web sources can be incomplete, unavailable, or change over time. Check current primary sources for consequential decisions.</span>
      </div>
    </>
  );
}