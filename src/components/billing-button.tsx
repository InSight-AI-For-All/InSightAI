"use client";

import { useFormStatus } from "react-dom";
import { LoaderCircle } from "lucide-react";
import type { PaidPlanId } from "@/lib/plans";
import { trackEvent } from "@/lib/telemetry/client";

function SubmitButton({ children, secondary, disabled, mode, plan }: { children: React.ReactNode; secondary: boolean; disabled: boolean; mode: "checkout" | "portal"; plan?: PaidPlanId }) {
  const { pending } = useFormStatus();
  return <button className={`button ${secondary ? "secondary" : ""}`} type="submit" disabled={pending || disabled} onClick={() => mode === "checkout" && trackEvent("upgrade_clicked", { plan: plan || "unknown" })}>{pending && <LoaderCircle className="spin" size={17} />}{pending ? "Opening Stripe" : children}</button>;
}

export function BillingButton({ mode = "checkout", plan, children, secondary = false, disabled = false }: { mode?: "checkout" | "portal"; plan?: PaidPlanId; children: React.ReactNode; secondary?: boolean; disabled?: boolean }) {
  return <form action={`/api/billing/${mode}`} method="post">{plan && <input type="hidden" name="plan" value={plan} />}<SubmitButton secondary={secondary} disabled={disabled} mode={mode} plan={plan}>{children}</SubmitButton></form>;
}