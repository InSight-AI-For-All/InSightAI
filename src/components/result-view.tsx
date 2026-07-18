import { AlertTriangle, BookOpenCheck, CircleHelp, FileText, Lightbulb, Link2, ListChecks, ShieldCheck } from "lucide-react";
import { ShareResult } from "@/components/share-result";
import type { FactCheckRecord } from "@/lib/data";
import styles from "./result-view.module.css";

function scoreColor(score: number) {
  if (score >= 75) return "#23845f";
  if (score >= 45) return "#e2ad2e";
  return "#d55d4b";
}

export function ResultView({ check }: { check: FactCheckRecord }) {
  const result = check.result;
  const ringStyle = { "--score": result.truthScore, "--score-color": scoreColor(result.truthScore) } as React.CSSProperties;
  return (
    <>
      <section className="panel">
        <div className={styles.hero}>
          <div className={styles.heroCopy}><span className="status-pill">{result.verdict} · {result.category}</span><h1>{result.summary}</h1><p>{result.claimType} · Assessed {new Date(check.createdAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}</p><ShareResult verdict={result.verdict} category={result.category} truthScore={result.truthScore} confidenceScore={result.confidenceScore} summary={result.summary} /></div>
          <div className={styles.scoreRing} style={ringStyle} aria-label={`Truth score ${result.truthScore} out of 100`}><div className={styles.scoreInner}><strong>{result.truthScore}</strong><small>Truth score</small></div></div>
        </div>
        <div className={styles.confidence}><strong>Confidence</strong><div className={styles.confidenceTrack}><span style={{ width: `${result.confidenceScore}%` }} /></div><span>{result.confidenceScore} / 100</span></div>
      </section>
      <section className={styles.source}><span>{check.inputType === "link" ? <Link2 size={18} /> : <FileText size={18} />}</span><div><small>What you checked</small><p>{check.submittedUrl || check.rawText || "Private screenshot"}</p></div></section>
      <div className={styles.grid}>
        <section className={`panel ${styles.section}`}><h2><BookOpenCheck size={21} /> Analysis</h2><p>{result.analysis}</p></section>
        <section className={`panel ${styles.section}`}><h2><ListChecks size={21} /> Key claims</h2>{result.keyClaims.length ? <ol className={styles.claims}>{result.keyClaims.map((claim, index) => <li key={`${claim}-${index}`}><span>{index + 1}</span>{claim}</li>)}</ol> : <p>No discrete factual claims were detected.</p>}</section>
        <section className={`panel ${styles.section}`}><h2><ShieldCheck size={21} /> Evidence assessment</h2><p>{result.evidenceAssessment}</p></section>
        <section className={`panel ${styles.section}`}><h2><CircleHelp size={21} /> Limits of this check</h2><p>{result.limitations}</p></section>
        <section className={`panel ${styles.section} ${styles.action}`} style={{ gridColumn: "1 / -1" }}><h2><Lightbulb size={21} /> Before you share</h2><p>{result.recommendedAction}</p></section>
      </div>
      <div className={styles.disclaimer}><AlertTriangle size={20} /><span>{result.disclaimer} InSight does not have live web retrieval in this version, and its output should be checked against current primary sources for consequential decisions.</span></div>
    </>
  );
}