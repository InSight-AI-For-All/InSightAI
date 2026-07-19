import Image from "next/image";
import Link from "next/link";

export function LogoMark({ size = 44, className = "", priority = false }: { size?: number; className?: string; priority?: boolean }) {
  return <Image className={`logo-mark ${className}`} src="/brand/insight-ai-mark.png" width={size} height={size} alt="" aria-hidden="true" priority={priority} unoptimized />;
}

export function Brand({ href = "/", priority = false }: { href?: string; priority?: boolean }) {
  return (
    <Link className="brand" href={href} aria-label="InSight AI home">
      <LogoMark size={44} priority={priority} />
      <span className="brand-wordmark"><span>InSight</span> <span className="brand-wordmark-ai">AI</span></span>
    </Link>
  );
}