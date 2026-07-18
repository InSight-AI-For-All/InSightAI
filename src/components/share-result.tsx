"use client";

import { useState } from "react";
import { Check, Download, Share2 } from "lucide-react";

type ShareResultProps = {
  verdict: string;
  category: string;
  truthScore: number | null;
  confidenceScore: number;
  summary: string;
};

function wrapText(context: CanvasRenderingContext2D, text: string, maxWidth: number) {
  const words = text.split(" ");
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const nextLine = line ? `${line} ${word}` : word;
    if (context.measureText(nextLine).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = nextLine;
    }
  }
  if (line) lines.push(line);
  return lines.slice(0, 5);
}

async function createShareImage(result: ShareResultProps) {
  const canvas = document.createElement("canvas");
  canvas.width = 1080;
  canvas.height = 1920;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Image generation is not supported in this browser.");

  const background = context.createLinearGradient(0, 0, 1080, 1920);
  background.addColorStop(0, "#151637");
  background.addColorStop(0.48, "#080912");
  background.addColorStop(1, "#11131f");
  context.fillStyle = background;
  context.fillRect(0, 0, 1080, 1920);

  const signal = context.createLinearGradient(110, 180, 940, 1620);
  signal.addColorStop(0, "rgba(140,124,255,.42)");
  signal.addColorStop(1, "rgba(198,255,74,.12)");
  context.fillStyle = signal;
  context.beginPath();
  context.roundRect(70, 90, 940, 1740, 54);
  context.fill();
  context.strokeStyle = "rgba(255,255,255,.18)";
  context.lineWidth = 2;
  context.stroke();

  context.fillStyle = "#c6ff4a";
  context.font = "700 40px Manrope, sans-serif";
  context.fillText("INSIGHT AI", 140, 200);
  context.fillStyle = "#aaaec1";
  context.font = "600 30px Manrope, sans-serif";
  context.fillText("KNOW BEFORE YOU SHARE", 140, 255);

  context.fillStyle = "#f8f8ff";
  context.font = "700 250px Arial, sans-serif";
  context.fillText(result.truthScore === null ? "N/A" : String(result.truthScore), 135, 700);
  context.fillStyle = "#c6ff4a";
  context.font = "700 72px Manrope, sans-serif";
  context.fillText("/ 100", 680, 700);
  context.fillStyle = "#a8a9bd";
  context.font = "650 34px Manrope, sans-serif";
  context.fillText(result.truthScore === null ? "NOT FACT-CHECKABLE" : "TRUTH SCORE", 145, 770);

  context.fillStyle = "rgba(255,255,255,.09)";
  context.beginPath();
  context.roundRect(130, 850, 820, 120, 34);
  context.fill();
  context.fillStyle = "#f7f7ff";
  context.font = "700 38px Manrope, sans-serif";
  context.fillText(result.verdict, 175, 925);
  context.textAlign = "right";
  context.fillStyle = "#49d8ff";
  context.fillText(`${result.confidenceScore}% CONFIDENCE`, 900, 925);
  context.textAlign = "left";

  context.fillStyle = "#9d91ff";
  context.font = "700 30px Manrope, sans-serif";
  context.fillText(result.category.toUpperCase(), 140, 1080);
  context.fillStyle = "#f7f7ff";
  context.font = "650 58px Manrope, sans-serif";
  wrapText(context, result.summary, 800).forEach((line, index) => context.fillText(line, 140, 1180 + index * 74));

  context.fillStyle = "#a8a9bd";
  context.font = "500 28px Manrope, sans-serif";
  context.fillText("AI-assisted analysis · Not final authority", 140, 1700);
  context.fillStyle = "#c6ff4a";
  context.font = "700 30px Manrope, sans-serif";
  context.fillText("insight this before you repost it", 140, 1760);

  return new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Could not create the image.")), "image/png"));
}

export function ShareResult(props: ShareResultProps) {
  const [state, setState] = useState<"idle" | "working" | "done">("idle");

  async function share() {
    setState("working");
    try {
      const blob = await createShareImage(props);
      const file = new File([blob], "insight-result.png", { type: "image/png" });
      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ title: "My InSight result", text: props.truthScore === null ? `${props.verdict} · No truth score assigned` : `${props.verdict} · Truth score ${props.truthScore}/100`, files: [file] });
      } else {
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = file.name;
        link.click();
        URL.revokeObjectURL(link.href);
      }
      setState("done");
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") setState("idle");
      else setState("idle");
    }
  }

  return <button className="button" type="button" onClick={share} disabled={state === "working"}>{state === "done" ? <Check size={18} /> : state === "working" ? <Download className="spin" size={18} /> : <Share2 size={18} />}{state === "done" ? "Share card ready" : state === "working" ? "Creating card" : "Share this InSight"}</button>;
}