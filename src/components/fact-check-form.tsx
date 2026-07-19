"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { ArrowRight, Check, FileText, Image as ImageIcon, Link2, ScanSearch, Sparkles, Upload, Zap } from "lucide-react";
import { readFactCheckApiResponse } from "@/lib/api-response";
import type { InputType } from "@/lib/fact-check/schema";
import styles from "./fact-check-form.module.css";

const modes = [
  { id: "text" as const, label: "Paste text", icon: FileText, title: "What claim should we examine?", help: "Paste a caption, quote, headline, or any factual claim." },
  { id: "link" as const, label: "Add a link", icon: Link2, title: "Where did you see it?", help: "Add the post or article URL. Include context for a stronger result." },
  { id: "screenshot" as const, label: "Screenshot", icon: ImageIcon, title: "Upload what you saw", help: "We will analyze visible text and imagery, while noting missing context." },
];

const analysisSteps = [
  "Extracting the key claims",
  "Separating fact from opinion",
  "Evaluating context and evidence",
  "Calibrating the confidence score",
  "Building your InSight",
];

export function FactCheckForm({ initialMode = "text", configured = true }: { initialMode?: InputType; configured?: boolean }) {
  const router = useRouter();
  const [mode, setMode] = useState<InputType>(initialMode);
  const [text, setText] = useState("");
  const [url, setUrl] = useState("");
  const [image, setImage] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState(0);
  const [limitReached, setLimitReached] = useState(false);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    if (!image) {
      setPreviewUrl("");
      return;
    }
    const objectUrl = URL.createObjectURL(image);
    setPreviewUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [image]);

  useEffect(() => {
    if (!loading) return;
    const interval = window.setInterval(
      () => setLoadingStep((current) => Math.min(current + 1, analysisSteps.length - 1)),
      10_000,
    );
    return () => window.clearInterval(interval);
  }, [loading]);

  function chooseImage(file?: File) {
    setError("");
    if (!file) return setImage(null);
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setError("Choose a JPG, PNG, or WebP screenshot.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError("The screenshot must be 5 MB or smaller.");
      return;
    }
    setImage(file);
  }

  function pasteImage(event: React.ClipboardEvent<HTMLDivElement>) {
    const file = Array.from(event.clipboardData.files).find((item) => item.type.startsWith("image/"));
    if (file) chooseImage(file);
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (!configured) return setError("Fact checking is temporarily unavailable while server configuration is completed.");
    if (mode === "text" && text.trim().length < 5) return setError("Enter at least 5 characters to check.");
    if (mode === "link" && !/^https?:\/\//i.test(url)) return setError("Enter a full http or https URL.");
    if (mode === "screenshot" && !image) return setError("Choose a screenshot to analyze.");

    setLoading(true);
    setLoadingStep(0);
    const formData = new FormData();
    formData.set("inputType", mode);
    formData.set("text", text);
    formData.set("url", url);
    formData.set("idempotencyKey", crypto.randomUUID());
    if (image) formData.set("image", image);

    try {
      const response = await fetch("/api/fact-check", { method: "POST", body: formData });
      const payload = await readFactCheckApiResponse(response);
      if (response.status === 402 || payload.code === "LIMIT_REACHED") {
        setLimitReached(true);
        return;
      }
      if (!response.ok || !payload.factCheckId) throw new Error(payload.error || "The check could not be completed.");
      router.push(`/results/${payload.factCheckId}`);
      router.refresh();
    } catch (submissionError) {
      setError(submissionError instanceof Error ? submissionError.message : "The check could not be completed.");
      setLoading(false);
    }
  }

  if (loading && !limitReached) {
    return <div className={`panel ${styles.loading}`} aria-live="polite"><div className={styles.loadingVisual}><span className={styles.loadingOrbit}><ScanSearch size={34} /></span><span className={styles.loadingPulse} /></div><p className="eyebrow">Analysis in progress</p><h2>{analysisSteps[loadingStep]}</h2><p>InSight is searching and comparing sources. Thorough checks can take up to two minutes.</p><div className={styles.loadingSteps}>{analysisSteps.map((step, index) => <span className={index <= loadingStep ? styles.loadingStepActive : ""} key={step}>{index < loadingStep ? <Check size={13} /> : <span>{index + 1}</span>}{step}</span>)}</div><div className={styles.loadingBar}><span style={{ width: `${((loadingStep + 1) / analysisSteps.length) * 100}%` }} /></div></div>;
  }

  if (limitReached) {
    return <div className={`panel ${styles.paywall}`}><div className={styles.paywallGlow}><Zap size={28} /></div><div><span className="status-pill"><Sparkles size={15} /> Free checks used</span><h2>Your curiosity has momentum.</h2><p>Starter unlocks 1,000 checks every month for $4.99, so the next suspicious post never gets a free pass.</p><Link className="button" href="/pricing">Unlock Starter <ArrowRight size={17} /></Link></div></div>;
  }

  const activeMode = modes.find((item) => item.id === mode)!;
  return (
    <section className={`panel ${styles.shell}`}>
      <div className={styles.tabs} role="tablist" aria-label="Input method">
        {modes.map(({ id, label, icon: Icon }) => <button className={`${styles.tab} ${mode === id ? styles.tabActive : ""}`} type="button" role="tab" aria-selected={mode === id} aria-controls={`input-panel-${id}`} onClick={() => { setMode(id); setError(""); }} key={id}><Icon size={18} /> {label}</button>)}
      </div>
      <div className={styles.body} id={`input-panel-${mode}`} role="tabpanel">
        <div className={styles.intro}><h2>{activeMode.title}</h2><p>{activeMode.help}</p></div>
        <form className={styles.form} onSubmit={submit}>
          {mode === "text" && <div className="form-field"><label htmlFor="claim-text">Claim or post text</label><textarea className="textarea" id="claim-text" value={text} onChange={(event) => setText(event.target.value)} maxLength={15_000} placeholder="Paste the claim exactly as you saw it…" /><small className="muted">{text.length.toLocaleString()} / 15,000</small></div>}
          {mode === "link" && <><div className="form-field"><label htmlFor="claim-url">Post or article URL</label><input className="input" id="claim-url" type="url" value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://…" /></div><div className="form-field"><label htmlFor="link-context">What does the post claim? <span className="muted">(recommended)</span></label><textarea className="textarea" id="link-context" value={text} onChange={(event) => setText(event.target.value)} maxLength={15_000} placeholder="Paste the caption or add context to focus the web search." /></div></>}
          {mode === "screenshot" && <><div className={`${styles.dropzone} ${dragging ? styles.dropzoneDragging : ""}`} onPaste={pasteImage} onDragEnter={() => setDragging(true)} onDragLeave={() => setDragging(false)} onDrop={(event) => { event.preventDefault(); setDragging(false); chooseImage(event.dataTransfer.files?.[0]); }} onDragOver={(event) => event.preventDefault()}>{previewUrl ? <div className={styles.preview}><Image src={previewUrl} alt="Screenshot preview" width={960} height={720} unoptimized /><span><Check size={15} /> Ready to analyze</span></div> : <div className={styles.uploadPrompt}><span className={styles.uploadIcon}><Upload size={24} /></span><strong>Drop, paste, or choose a screenshot</strong><small>JPG, PNG, or WebP · up to 5 MB</small><kbd>Ctrl V</kbd></div>}<input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => chooseImage(event.target.files?.[0])} aria-label="Upload screenshot" aria-describedby="screenshot-upload-help" /></div><span className={styles.uploadHelp} id="screenshot-upload-help">Press Enter to browse for a JPG, PNG, or WebP image up to 5 MB, or paste an image from the clipboard.</span><div className="form-field"><label htmlFor="screenshot-context">Extra context <span className="muted">(optional)</span></label><textarea className="textarea" style={{ minHeight: 100 }} id="screenshot-context" value={text} onChange={(event) => setText(event.target.value)} maxLength={15_000} placeholder="Where did you see this, and what are you concerned about?" /></div></>}
          {!configured && <p className="alert" role="status">Fact checking is temporarily unavailable while server configuration is completed.</p>}
          {error && <p className="alert" role="alert">{error}</p>}
          <div className={styles.formFooter}><p><Sparkles size={14} /> Evidence-assisted, not absolute truth. High-stakes claims should still be checked against primary sources.</p><button className="button" type="submit" disabled={!configured}><ScanSearch size={18} /> InSight this</button></div>
        </form>
      </div>
    </section>
  );
}