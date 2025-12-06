"use client";

import React from "react";

export type VoiceBubbleStatus = "idle" | "listening" | "thinking" | "speaking";

type Props = {
  status: VoiceBubbleStatus;
  label?: string;
};

const STATUS_LABELS: Record<VoiceBubbleStatus, string> = {
  idle: "Ready",
  listening: "Listening…",
  thinking: "Thinking…",
  speaking: "Speaking…",
};

export function VoiceBubble({ status, label }: Props) {
  const displayLabel = label ?? STATUS_LABELS[status];

  return (
    <div className="flex flex-col items-center gap-4">
      <div className={`voice-orb voice-orb--${status}`}>
        <div className="voice-orb-ring" />
        <div className="voice-orb-core" />
        <div className="voice-orb-glow" />
      </div>

      <div className="text-[11px] tracking-[0.22em] uppercase text-slate-200/80 dark:text-slate-200 text-center">
        {displayLabel}
      </div>
    </div>
  );
}
