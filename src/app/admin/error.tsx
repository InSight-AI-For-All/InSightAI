"use client";

import { AlertTriangle, RotateCcw } from "lucide-react";
import styles from "./admin.module.css";

export default function AdminError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <div className={styles.errorState}><AlertTriangle size={30} /><h1>Operations data could not load.</h1><p>The customer application is unaffected. Retry this admin query.</p><button className="button" onClick={reset}><RotateCcw size={17} /> Retry</button></div>;
}