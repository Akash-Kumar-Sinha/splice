"use client";

import React from "react";
import { TimeDisplay } from "@/components/video-component";

import { TimelineClip, TimelineDiff } from "@/lib/types";

import { cn } from "@/lib/utils";

interface DiffTimelineTrackProps {
  label?: string;
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
  label: _label,
  clips,

  duration,
  currentTime,
  activeClipId,
  activeClipName,
  onSeek,
  variant,
  diff,
}: DiffTimelineTrackProps) {
  const displayTime = Math.min(currentTime, duration);

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1">
          <span className={cn(
            "inline-block size-1.5 rounded-full",
            variant === "a" ? "bg-amber-400" : "bg-primary"
          )} />
          {clips.length} clip{clips.length !== 1 ? "s" : ""}
        </span>
        <span className="truncate max-w-[120px] text-right">
          {activeClipName || "—"}
        </span>
      </div>

      <div className="relative h-8 bg-muted/15 rounded-lg p-0.5 flex gap-0.5 items-center overflow-hidden">
        {clips.length === 0 ? (
          <div className="w-full text-center text-[9px] text-muted-foreground">
            Empty
          </div>
        ) : (
          clips.map((clip, idx) => {
            const widthPct = Math.max(5, (clip.duration / duration) * 100);
            const isActive = activeClipId === clip.id;
            const isRemoved = variant === "a" && diff?.removed.some((r) => r.clip_index === idx);
            const isAdded = variant === "b" && diff?.added.some((a) => a.clip_index === idx);
            const isMoved = variant === "b" && diff?.moved.some(([m]) => m.clip_index === idx);

            return (
              <div
                key={`clip-${variant}-${idx}`}
                onClick={() => onSeek(clip.start_time)}
                style={{ width: `${widthPct}%` }}
                className={cn(
                  "h-full rounded-md px-1.5 flex items-center text-[9px] cursor-pointer transition-all truncate select-none",
                  isActive
                    ? variant === "a"
                      ? "bg-amber-400/20 text-amber-200 ring-1 ring-amber-400/30"
                      : "bg-primary/20 text-primary-foreground ring-1 ring-primary/30"
                    : isRemoved
                      ? "bg-rose-500/20 text-rose-300"
                      : isAdded
                        ? "bg-emerald-500/20 text-emerald-300"
                        : isMoved
                          ? "bg-amber-500/20 text-amber-300"
                          : "bg-muted/30 text-muted-foreground hover:bg-muted/50"
                )}
                title={clip.name}
              >
                <span className="truncate">{clip.name}</span>
              </div>
            );
          })
        )}

        {/* Playhead */}
        {duration > 0 && clips.length > 0 && (
          <div
            style={{ left: `${(displayTime / duration) * 100}%` }}
            className={cn(
              "absolute top-0 bottom-0 w-px pointer-events-none z-10",
              variant === "a" ? "bg-amber-400/80" : "bg-primary/80"
            )}
          />
        )}
      </div>

      <TimeDisplay currentTime={displayTime} duration={duration} showDuration />
    </div>
  );
}
