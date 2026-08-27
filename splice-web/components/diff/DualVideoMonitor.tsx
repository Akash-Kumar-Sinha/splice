"use client";

import React from "react";
import { IconVideo, IconVolumeOff, IconMovie } from "@tabler/icons-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { VideoPlayer } from "@/components/ui/video_player";
import { Commit, TimelineClip, TimelineDiff } from "@/lib/types";
import { API_URL } from "@/lib/api";
import DiffTimelineTrack from "./DiffTimelineTrack";


interface DualVideoMonitorProps {
  baseCommit: Commit | undefined;
  targetCommit: Commit | undefined;
  mediaHashA: string | null;
  mediaHashB: string | null;
  clipsA: TimelineClip[];
  clipsB: TimelineClip[];
  durationA: number;
  durationB: number;
  timeA: number;
  timeB: number;
  activeClipA: { clip: TimelineClip; videoTime: number } | null;
  activeClipB: { clip: TimelineClip; videoTime: number } | null;
  audioFocus: "a" | "b" | "both";
  isPlaying: boolean;
  videoRefA: React.RefObject<HTMLVideoElement | null>;
  videoRefB: React.RefObject<HTMLVideoElement | null>;
  diff: TimelineDiff | null;
  onSetAudioFocus: (mode: "a" | "b" | "both") => void;
  onSeekA: (time: number) => void;
  onSeekB: (time: number) => void;
}

export default function DualVideoMonitor({
  baseCommit,
  targetCommit,
  mediaHashA,
  mediaHashB,
  clipsA,
  clipsB,
  durationA,
  durationB,
  timeA,
  timeB,
  activeClipA,
  activeClipB,
  audioFocus,
  isPlaying,
  videoRefA,
  videoRefB,
  diff,
  onSetAudioFocus,
  onSeekA,
  onSeekB,
}: DualVideoMonitorProps) {
  return (
    <div className="bg-background/80 border border-border rounded-2xl p-4 flex flex-col gap-4 shadow-inner">
      <div className="flex items-center justify-between text-xs font-mono text-muted-foreground border-b border-border pb-2">
        <div className="flex items-center gap-2">
          <IconMovie className="size-4 text-primary" />
          <span className="font-semibold text-foreground">
            Synchronized Dual Video Comparison
          </span>
        </div>
        <div className="flex items-center gap-1.5 bg-muted/40 p-1 rounded-lg border border-border">
          <span className="text-[10px] text-muted-foreground mr-1 font-semibold">
            Audio:
          </span>
          {(["a", "b", "both"] as const).map((mode) => (
            <Button
              key={mode}
              variant={audioFocus === mode ? "default" : "ghost"}
              size="xs"
              onClick={() => onSetAudioFocus(mode)}
              className="text-[10px] h-5 px-2 font-mono font-bold"
            >
              {mode === "both" ? "Both" : `Audio ${mode.toUpperCase()}`}
            </Button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] gap-4 items-stretch">
        {/* Version A */}
        <div className="flex flex-col gap-2.5 bg-card/40 p-3.5 rounded-xl border border-border">
          <div className="flex items-center justify-between text-xs font-mono min-w-0">
            <Badge
              variant="outline"
              className="text-[10px] min-w-0 max-w-full truncate inline-block"
              title={`Version A: ${baseCommit?.message || "Base"}`}
            >
              <span className="font-bold text-muted-foreground mr-1">Version A:</span>
              <span>{baseCommit?.message || "Base"}</span>
            </Badge>
          </div>


          <div className="relative aspect-video bg-black rounded-lg overflow-hidden flex items-center justify-center border border-border">
            {mediaHashA ? (
              <VideoPlayer className="w-full h-full rounded-lg overflow-hidden border border-border">
                <video
                  slot="media"
                  ref={videoRefA}
                  src={`${API_URL}/media/${mediaHashA}`}
                  className="w-full h-full object-contain"
                  playsInline
                  preload="auto"
                  muted={audioFocus === "b"}
                  suppressHydrationWarning
                  onLoadedMetadata={() => {
                    if (videoRefA.current && activeClipA) {
                      videoRefA.current.currentTime = activeClipA.videoTime;
                      if (isPlaying) {
                        videoRefA.current.play().catch(console.warn);
                      }
                    }
                  }}
                  onCanPlay={() => {
                    if (
                      videoRefA.current &&
                      isPlaying &&
                      videoRefA.current.paused
                    ) {
                      if (
                        activeClipA &&
                        Math.abs(
                          videoRefA.current.currentTime - activeClipA.videoTime,
                        ) > 0.3
                      ) {
                        videoRefA.current.currentTime = activeClipA.videoTime;
                      }
                      videoRefA.current.play().catch(console.warn);
                    }
                  }}
                />
              </VideoPlayer>
            ) : (
              <div className="text-muted-foreground font-mono text-xs flex flex-col items-center gap-1">
                <IconVideo className="size-6 text-muted-foreground/40" />
                <span>No media for Version A</span>
              </div>
            )}

            {audioFocus === "b" && (
              <button
                onClick={() => onSetAudioFocus("a")}
                title="Click to unmute Audio A"
                className="absolute top-2 right-2 bg-black/80 hover:bg-black text-amber-300 rounded-md px-1.5 py-0.5 z-10 flex items-center gap-1 text-[10px] font-mono border border-border/50 cursor-pointer shadow transition-all"
              >
                <IconVolumeOff className="size-3 text-amber-300" />
                <span>Muted</span>
              </button>
            )}
          </div>

          <DiffTimelineTrack
            label="A"
            clips={clipsA}
            duration={durationA}
            currentTime={timeA}
            activeClipId={activeClipA?.clip.id || null}
            activeClipName={activeClipA?.clip.name || null}
            onSeek={onSeekA}
            variant="a"
            diff={diff}
          />
        </div>

        <div className="hidden md:flex items-center justify-center px-0.5">
          <div className="w-px h-full min-h-[380px] bg-gradient-to-b from-transparent via-border to-transparent [mask-image:radial-gradient(ellipse_at_center,black_60%,transparent_100%)]" />
        </div>

        {/* Version B */}
        <div className="flex flex-col gap-2.5 bg-card/40 p-3.5 rounded-xl border border-border">
          <div className="flex items-center justify-between text-xs font-mono min-w-0">
            <Badge
              variant="default"
              className="text-[10px] min-w-0 max-w-full truncate inline-block"
              title={`Version B: ${targetCommit?.message || "Target"}`}
            >
              <span className="font-bold mr-1">Version B:</span>
              <span>{targetCommit?.message || "Target"}</span>
            </Badge>
          </div>



          <div className="relative aspect-video bg-black rounded-lg overflow-hidden flex items-center justify-center border border-border">
            {mediaHashB ? (
              <VideoPlayer className="w-full h-full rounded-lg overflow-hidden border border-border">
                <video
                  slot="media"
                  ref={videoRefB}
                  src={`${API_URL}/media/${mediaHashB}`}
                  className="w-full h-full object-contain"
                  playsInline
                  preload="auto"
                  muted={audioFocus === "a"}
                  suppressHydrationWarning
                  onLoadedMetadata={() => {
                    if (videoRefB.current && activeClipB) {
                      videoRefB.current.currentTime = activeClipB.videoTime;
                      if (isPlaying) {
                        videoRefB.current.play().catch(console.warn);
                      }
                    }
                  }}
                  onCanPlay={() => {
                    if (
                      videoRefB.current &&
                      isPlaying &&
                      videoRefB.current.paused
                    ) {
                      if (
                        activeClipB &&
                        Math.abs(
                          videoRefB.current.currentTime - activeClipB.videoTime,
                        ) > 0.3
                      ) {
                        videoRefB.current.currentTime = activeClipB.videoTime;
                      }
                      videoRefB.current.play().catch(console.warn);
                    }
                  }}
                />
              </VideoPlayer>
            ) : (
              <div className="text-muted-foreground font-mono text-xs flex flex-col items-center gap-1">
                <IconVideo className="size-6 text-muted-foreground/40" />
                <span>No media for Version B</span>
              </div>
            )}

            {audioFocus === "a" && (
              <button
                onClick={() => onSetAudioFocus("b")}
                title="Click to unmute Audio B"
                className="absolute top-2 right-2 bg-black/80 hover:bg-black text-amber-300 rounded-md px-1.5 py-0.5 z-10 flex items-center gap-1 text-[10px] font-mono border border-border/50 cursor-pointer shadow transition-all"
              >
                <IconVolumeOff className="size-3 text-amber-300" />
                <span>Muted</span>
              </button>
            )}
          </div>

          <DiffTimelineTrack
            label="B"
            clips={clipsB}
            duration={durationB}
            currentTime={timeB}
            activeClipId={activeClipB?.clip.id || null}
            activeClipName={activeClipB?.clip.name || null}
            onSeek={onSeekB}
            variant="b"
            diff={diff}
          />
        </div>
      </div>
    </div>
  );
}
