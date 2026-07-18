"use client";

import { AlertTriangle, RotateCcw } from "lucide-react";

export default function AppError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <div className="route-state"><span className="error"><AlertTriangle size={28} /></span><p className="eyebrow">Signal interrupted</p><h1>That screen didn&apos;t load.</h1><p>Your data is still safe. Try the request one more time.</p><button className="button" type="button" onClick={reset}><RotateCcw size={17} /> Try again</button></div>;
}