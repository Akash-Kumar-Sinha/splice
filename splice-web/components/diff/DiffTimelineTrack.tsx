"use client";

import React from "react";
import { TimeDisplay, TimelineSlider } from "@/components/video-component";

import { TimelineClip, TimelineDiff } from "@/lib/types";

import { cn } from "@/lib/utils";

interface DiffTimelineTrackProps {
  label: string;
  clips: TimelineClip[];
  duration: number;
  currentTime: number;
  activeClipId: string | null;
  activeClipName: string | null;
  onSeek: (time: number) => void;
  variant: "a" | "b";
  diff?: TimelineDiff | null;
  clipStatuses?: { isAdded: boolean; isRemoved: boolean; isMoved: boolean }[];
}

export default function DiffTimelineTrack({
  label,
  clips,
  duration,
  currentTime,
  activeClipId,
  activeClipName,
  onSeek,
  variant,
  diff,
}: DiffTimelineTrackProps) {
  const timeLabel = variant === "a" ? "timeA" : "timeB";
  const displayTime = Math.min(currentTime, duration);

  return (
    <div className="flex flex-col gap-1.5 pt-1">
      <div className="flex items-center justify-between text-[11px] font-mono text-muted-foreground">
        <span
          className={cn(
            "font-semibold flex items-center gap-1",
            variant === "a" ? "text-foreground" : "text-primary",
          )}
        >
          <span>Timeline {label}:</span>
          <span className="text-[10px] opacity-70">({clips.length} clips)</span>
        </span>
        <span
          className={cn(
            "text-[10px] font-mono",
            variant === "a" ? "" : "text-primary font-bold",
          )}
        >
          {activeClipName || "Finished"}
        </span>
      </div>

      <div className="relative h-10 bg-background border border-border rounded-lg p-1 flex gap-1 items-center overflow-hidden">
        {clips.length === 0 ? (
          <div className="w-full text-center text-[10px] font-mono text-muted-foreground">
            Empty timeline
          </div>
        ) : (
          clips.map((clip, idx) => {
            const widthPct = Math.max(5, (clip.duration / duration) * 100);
            const isActive = activeClipId === clip.id;
            const isRemoved =
              variant === "a" &&
              diff?.removed.some((r) => r.clip_index === idx);
            const isAdded =
              variant === "b" && diff?.added.some((a) => a.clip_index === idx);
            const isMoved =
              variant === "b" &&
              diff?.moved.some(([m]) => m.clip_index === idx);

            return (
              <div
                key={`clip-${variant}-${idx}`}
                onClick={() => onSeek(clip.start_time)}
                style={{ width: `${widthPct}%` }}
                className={cn(
                  "h-full rounded-md px-1.5 py-0.5 flex flex-col justify-center text-[10px] font-mono border cursor-pointer transition-all truncate select-none",
                  isActive
                    ? variant === "a"
                      ? "bg-primary/25 border-primary text-foreground font-bold shadow-sm ring-1 ring-primary/40"
                      : "bg-primary/30 border-primary text-foreground font-bold shadow-sm ring-1 ring-primary"
                    : isRemoved
                      ? "bg-rose-500/20 border-rose-500/40 text-rose-300"
                      : isAdded
                        ? "bg-emerald-500/20 border-emerald-500/60 text-emerald-300"
                        : isMoved
                          ? "bg-amber-500/20 border-amber-500/60 text-amber-300"
                          : "bg-muted/40 border-border text-muted-foreground hover:bg-muted/70",
                )}
                title={`Click to jump: ${clip.name} (${clip.duration.toFixed(1)}s)`}
              >
                <span className="truncate leading-tight text-[10px]">
                  {clip.name}
                </span>
                <span className="text-[8px] opacity-70 leading-tight">
                  {clip.start_time.toFixed(1)}s -{" "}
                  {(clip.start_time + clip.duration).toFixed(1)}s
                </span>
              </div>
            );
          })
        )}

        {duration > 0 && (
          <div
            style={{ left: `${(displayTime / duration) * 100}%` }}
            className={cn(
              "absolute top-0 bottom-0 w-0.5 pointer-events-none z-10 transition-all duration-75",
              variant === "a"
                ? "bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.8)]"
                : "bg-primary shadow-[0_0_8px_rgba(255,255,255,0.8)]",
            )}
          />
        )}
      </div>

      <div>
        <TimeDisplay
          currentTime={displayTime}
          duration={duration}
          showDuration={true}
        />

        <TimelineSlider
          currentTime={displayTime}
          duration={duration}
          onSeek={onSeek}
          showTimeDisplay={false}
        />
      </div>
    </div>
  );
}
