export function BillingButton({ mode = "checkout", children, secondary = false }: { mode?: "checkout" | "portal"; children: React.ReactNode; secondary?: boolean }) {
  return <form action={`/api/billing/${mode}`} method="post"><button className={`button ${secondary ? "secondary" : ""}`} type="submit">{children}</button></form>;
}