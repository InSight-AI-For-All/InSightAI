"use client";

import { useState } from "react";
import { LoaderCircle, LogOut } from "lucide-react";
import { useAuth } from "@/components/auth-provider";

export function SignOutButton({ compact = false }: { compact?: boolean }) {
  const { signOut } = useAuth();
  const [loading, setLoading] = useState(false);
  return <button className={compact ? "" : "button secondary"} type="button" title="Sign out" aria-label="Sign out" disabled={loading} onClick={() => { setLoading(true); void signOut(); }}>{loading ? <LoaderCircle className="spin" size={17} /> : <LogOut size={17} />}{compact ? null : loading ? "Signing out…" : "Sign out"}</button>;
}