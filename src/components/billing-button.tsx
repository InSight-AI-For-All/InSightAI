"use client";

import { useFormStatus } from "react-dom";
import { LoaderCircle } from "lucide-react";

function SubmitButton({ children, secondary }: { children: React.ReactNode; secondary: boolean }) {
  const { pending } = useFormStatus();
  return <button className={`button ${secondary ? "secondary" : ""}`} type="submit" disabled={pending}>{pending && <LoaderCircle className="spin" size={17} />}{pending ? "Opening Stripe" : children}</button>;
}

export function BillingButton({ mode = "checkout", children, secondary = false }: { mode?: "checkout" | "portal"; children: React.ReactNode; secondary?: boolean }) {
  return <form action={`/api/billing/${mode}`} method="post"><SubmitButton secondary={secondary}>{children}</SubmitButton></form>;
}