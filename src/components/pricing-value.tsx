"use client";

import { useState } from "react";

export function PricingValue() {
  const [checks, setChecks] = useState(60);
  const recommendation = checks <= 20
    ? { name: "Starter", price: 3.99, limit: 20 }
    : checks <= 80
      ? { name: "Pro", price: 12.99, limit: 80 }
      : { name: "Max", price: 24.99, limit: 180 };
  const costPerCheck = recommendation.price / recommendation.limit;

  return <section className="pricing-value"><div><p className="eyebrow">Find your fit</p><h2>How often does your feed make you pause?</h2><p>For about {checks} checks a month, <strong>{recommendation.name}</strong> gives you up to {recommendation.limit} checks at about <strong>{Math.ceil(costPerCheck * 100)}¢</strong> per included check.</p></div><div className="pricing-slider"><div><span>A few times</span><strong>{checks} checks</strong><span>Throughout the day</span></div><input type="range" min="10" max="180" step="10" value={checks} onChange={(event) => setChecks(Number(event.target.value))} aria-label="Estimated checks per month" /><small>That is roughly {Math.max(1, Math.round(checks / 30))} checks per day.</small></div></section>;
}