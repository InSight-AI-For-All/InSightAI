import Link from "next/link";
import { ScanSearch } from "lucide-react";

export function Brand() {
  return (
    <Link className="brand" href="/" aria-label="InSight AI home">
      <span className="brand-mark" aria-hidden="true">
        <ScanSearch size={19} strokeWidth={2.4} />
      </span>
      <span>InSight AI</span>
    </Link>
  );
}