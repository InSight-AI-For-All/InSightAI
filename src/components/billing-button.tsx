"use client";

import { useFormStatus } from "react-dom";
import { LoaderCircle } from "lucide-react";
import type { PaidPlanId } from "@/lib/plans";

function SubmitButton({ children, secondary, disabled }: { children: React.ReactNode; secondary: boolean; disabled: boolean }) {
  const { pending } = useFormStatus();
  return <button className={`button ${secondary ? "secondary" : ""}`} type="submit" disabled={pending || disabled}>{pending && <LoaderCircle className="spin" size={17} />}{pending ? "Opening Stripe" : children}</button>;
}

export function BillingButton({ mode = "checkout", plan, children, secondary = false, disabled = false }: { mode?: "checkout" | "portal"; plan?: PaidPlanId; children: React.ReactNode; secondary?: boolean; disabled?: boolean }) {
  return <form action={`/api/billing/${mode}`} method="post">{plan && <input type="hidden" name="plan" value={plan} />}<SubmitButton secondary={secondary} disabled={disabled}>{children}</SubmitButton></form>;
}