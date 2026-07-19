"use client";

import { useEffect, useState } from "react";
import { Check, Heart, MessageCircle, Send } from "lucide-react";
import { LogoMark } from "@/components/brand";
import styles from "@/app/page.module.css";

const steps = ["Post detected", "Claims separated", "Context checked", "Score ready"];

export function LandingLiveDemo() {
  const [step, setStep] = useState(0);

  useEffect(() => {
    const interval = window.setInterval(() => setStep((current) => (current + 1) % steps.length), 1_700);
    return () => window.clearInterval(interval);
  }, []);

  return (
    <div className={styles.liveDemo} aria-label="Animated example of InSight analyzing a social post">
      <div className={styles.socialPost}>
        <div className={styles.postMeta}><span className={styles.avatar}>DC</span><div><strong>daily.context</strong><small>For you · 2h</small></div><span>•••</span></div>
        <p>“This viral study proves students learn 40% faster when they multitask.”</p>
        <div className={styles.postMedia}><span>40%</span><small>FASTER LEARNING?</small></div>
        <div className={styles.postActions}><span><Heart size={18} /> 28.4K</span><span><MessageCircle size={18} /> 1,903</span><span><Send size={18} /></span></div>
      </div>
      <div className={styles.scanBridge}>
        <span><LogoMark size={36} /></span>
        <div>{steps.map((label, index) => <i className={index <= step ? styles.scanActive : ""} key={label}>{index < step ? <Check size={11} /> : null}{label}</i>)}</div>
      </div>
      <div className={`${styles.liveResult} ${step === 3 ? styles.liveResultReady : ""}`}>
        <div><span className="status-pill">Misleading · Science</span><strong>48</strong><small>Truth score</small></div>
        <div><h3>The statistic overstates the research.</h3><p>The study measured task switching, not faster learning. The viral post removes that context.</p><span className={styles.confidence}>81% confidence</span></div>
      </div>
    </div>
  );
}