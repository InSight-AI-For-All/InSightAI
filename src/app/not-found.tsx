import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { LogoMark } from "@/components/brand";

export default function NotFound() {
  return <main className="standalone-state"><span><LogoMark size={62} /></span><p className="eyebrow">404 · Unverifiable</p><h1>We couldn&apos;t find that page.</h1><p>The link may be old, private, or no longer available.</p><Link className="button" href="/"><ArrowLeft size={17} /> Back to InSight</Link></main>;
}