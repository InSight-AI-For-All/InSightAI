"use client";

import { useState } from "react";
import { Check, LoaderCircle } from "lucide-react";

export function AccountForm({ fullName, email }: { fullName: string; email: string }) {
  const [name, setName] = useState(fullName);
  const [state, setState] = useState<"idle" | "saving" | "saved">("idle");
  const [error, setError] = useState("");

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setState("saving");
    setError("");
    try {
      const response = await fetch("/api/account", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fullName: name }) });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Profile could not be saved.");
      setState("saved");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Profile could not be saved. Try again.");
      setState("idle");
    }
  }

  return <form onSubmit={save} style={{ display: "grid", gap: 18 }}><div className="form-field"><label htmlFor="full-name">Full name</label><input className="input" id="full-name" value={name} onChange={(event) => { setName(event.target.value); setState("idle"); }} maxLength={100} /></div><div className="form-field"><label htmlFor="email">Email</label><input className="input" id="email" value={email} disabled /></div>{error && <p className="alert" role="alert">{error}</p>}<button className="button" type="submit" disabled={state === "saving" || !name.trim()} style={{ width: "fit-content" }}>{state === "saving" ? <LoaderCircle className="spin" size={17} /> : state === "saved" ? <Check size={17} /> : null}{state === "saved" ? "Saved" : state === "saving" ? "Saving…" : "Save profile"}</button></form>;
}