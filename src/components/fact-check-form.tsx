"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { ArrowRight, FileText, Image as ImageIcon, Link2, LoaderCircle, ScanSearch, Upload, Zap } from "lucide-react";
import type { InputType } from "@/lib/fact-check/schema";
import styles from "./fact-check-form.module.css";

const modes = [
  { id: "text" as const, label: "Paste text", icon: FileText, title: "What claim should we examine?", help: "Paste a caption, quote, headline, or any factual claim." },
  { id: "link" as const, label: "Add a link", icon: Link2, title: "Where did you see it?", help: "Add the post or article URL. Include context for a stronger result." },
  { id: "screenshot" as const, label: "Screenshot", icon: ImageIcon, title: "Upload what you saw", help: "We will analyze visible text and imagery, while noting missing context." },
];

type ApiError = { error?: string; code?: string };

export function FactCheckForm({ initialMode = "text" }: { initialMode?: InputType }) {
  const router = useRouter();
  const [mode, setMode] = useState<InputType>(initialMode);
  const [text, setText] = useState("");
  const [url, setUrl] = useState("");
  const [image, setImage] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [limitReached, setLimitReached] = useState(false);

  useEffect(() => {
    if (!image) {
      setPreviewUrl("");
      return;
    }
    const objectUrl = URL.createObjectURL(image);
    setPreviewUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [image]);

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

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (mode === "text" && text.trim().length < 5) return setError("Enter at least 5 characters to check.");
    if (mode === "link" && !/^https?:\/\//i.test(url)) return setError("Enter a full http or https URL.");
    if (mode === "screenshot" && !image) return setError("Choose a screenshot to analyze.");

    setLoading(true);
    const formData = new FormData();
    formData.set("inputType", mode);
    formData.set("text", text);
    formData.set("url", url);
    formData.set("idempotencyKey", crypto.randomUUID());
    if (image) formData.set("image", image);

    try {
      const response = await fetch("/api/fact-check", { method: "POST", body: formData });
      const payload = (await response.json()) as ApiError & { factCheckId?: string };
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
    return <div className={`panel ${styles.loading}`} aria-live="polite"><div><span className={styles.loadingIcon}><ScanSearch className="spin" size={34} /></span><h2>Reading between the lines</h2><p>Separating claims, context, evidence, and uncertainty. This can take a few seconds.</p><div className={styles.loadingBar} /></div></div>;
  }

  if (limitReached) {
    return <div className={`panel ${styles.paywall}`}><div><span className="status-pill"><Zap size={15} /> Free checks used</span><h2>Keep your fact-check habit going.</h2><p>Starter includes 1,000 checks each month for $4.99, with your complete history in one place.</p><Link className="button" href="/pricing">View Starter plan <ArrowRight size={17} /></Link></div></div>;
  }

  const activeMode = modes.find((item) => item.id === mode)!;
  return (
    <section className={`panel ${styles.shell}`}>
      <div className={styles.tabs} role="tablist" aria-label="Input method">
        {modes.map(({ id, label, icon: Icon }) => <button className={`${styles.tab} ${mode === id ? styles.tabActive : ""}`} type="button" role="tab" aria-selected={mode === id} onClick={() => { setMode(id); setError(""); }} key={id}><Icon size={18} /> {label}</button>)}
      </div>
      <div className={styles.body}>
        <div className={styles.intro}><h2>{activeMode.title}</h2><p>{activeMode.help}</p></div>
        <form className={styles.form} onSubmit={submit}>
          {mode === "text" && <div className="form-field"><label htmlFor="claim-text">Claim or post text</label><textarea className="textarea" id="claim-text" value={text} onChange={(event) => setText(event.target.value)} maxLength={15_000} placeholder="Paste the claim exactly as you saw it…" /><small className="muted">{text.length.toLocaleString()} / 15,000</small></div>}
          {mode === "link" && <><div className="form-field"><label htmlFor="claim-url">Post or article URL</label><input className="input" id="claim-url" type="url" value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://…" /></div><div className="form-field"><label htmlFor="link-context">What does the post claim? <span className="muted">(recommended)</span></label><textarea className="textarea" id="link-context" value={text} onChange={(event) => setText(event.target.value)} maxLength={15_000} placeholder="Paste the caption or add context. InSight does not assume it can retrieve every page." /></div></>}
          {mode === "screenshot" && <><div className={styles.dropzone}>{previewUrl ? <Image src={previewUrl} alt="Screenshot preview" width={960} height={720} unoptimized /> : <div className={styles.uploadPrompt}><span className={styles.uploadIcon}><Upload size={23} /></span><strong>Choose or drop a screenshot</strong><small className="muted">JPG, PNG, or WebP · up to 5 MB</small></div>}<input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => chooseImage(event.target.files?.[0])} aria-label="Upload screenshot" /></div><div className="form-field"><label htmlFor="screenshot-context">Extra context <span className="muted">(optional)</span></label><textarea className="textarea" style={{ minHeight: 100 }} id="screenshot-context" value={text} onChange={(event) => setText(event.target.value)} maxLength={15_000} placeholder="Where did you see this, and what are you concerned about?" /></div></>}
          {error && <p className="alert" role="alert">{error}</p>}
          <div className={styles.formFooter}><p>InSight provides evidence-assisted analysis, not final authority. For consequential decisions, consult current primary sources or qualified professionals.</p><button className="button" type="submit"><ScanSearch size={18} /> InSight this</button></div>
        </form>
      </div>
    </section>
  );
}