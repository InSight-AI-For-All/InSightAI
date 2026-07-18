"use client";

import { useState } from "react";

export function PricingValue() {
  const [checks, setChecks] = useState(120);
  const costPerCheck = 4.99 / checks;

  return <section className="pricing-value"><div><p className="eyebrow">Make it make sense</p><h2>How often does your feed make you pause?</h2><p>At {checks} checks a month, Starter costs about <strong>{costPerCheck < 0.01 ? "less than 1¢" : `${Math.ceil(costPerCheck * 100)}¢`}</strong> per answer.</p></div><div className="pricing-slider"><div><span>A few times</span><strong>{checks} checks</strong><span>Every day</span></div><input type="range" min="20" max="1000" step="20" value={checks} onChange={(event) => setChecks(Number(event.target.value))} aria-label="Estimated checks per month" /><small>That is roughly {Math.max(1, Math.round(checks / 30))} checks per day.</small></div></section>;
}