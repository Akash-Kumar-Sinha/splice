"use client";

import React, { useState } from "react";
import { motion } from "framer-motion";



import {
  IconClock,
  IconMovie,
  IconTag,
  IconVideo,
  IconDownload,
  IconGitBranch,
  IconGitCompare,
  IconChevronDown,
  IconChevronRight,
  IconPlayerPlay,
  IconPlayerPause,
} from "@tabler/icons-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  PlayPauseButton,
  SkipBackwardButton,
  SkipForwardButton,
  TimelineSlider,
  TimeDisplay,
  VolumeRange,
  MuteButton,
} from "@/components/video-component";

import { Commit, Timeline, TimelineClip } from "@/lib/types";
import { API_URL } from "@/lib/api";
import { cn, safePlay, safePause } from "@/lib/utils";

import { useRepository } from "@/lib/repo-context";



function formatRelativeDate(timestamp: string): string {
  try {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return timestamp;
  }
}

interface VersionDetailsCardProps {
  timeline: Timeline;
  selectedCommit: Commit | undefined;
  clips: TimelineClip[];
  activeHistoryClip: {
    clip: TimelineClip;
    offset: number;
    videoTime: number;
  } | null;
  videoTime: number;
  isPlaying: boolean;
  isMuted: boolean;
  volume: number;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  onTogglePlay: () => void;
  onSeek: (time: number) => void;
  onSetVideoTime: (time: number) => void;
  onSetVideoDuration: (dur: number) => void;
  onSetIsMuted: (v: boolean) => void;
  onSetVolume: (v: number) => void;
  onSetIsPlaying: (v: boolean) => void;
  onOpenInEditor: () => void;
  onOpenDiff: (commitId: string) => void;
  onSetExportTarget: (target: { id: string; message: string } | null) => void;
  onAddTag: (commitId: string, label: string) => void;
  onRemoveTag: (commitId: string, label: string) => void;
  onBranchCreated?: (newCommitId: string) => void;
  allCommits?: Commit[];
  onSelectCommit?: (commitId: string) => void;
}

export default function VersionDetailsCard({
  timeline,
  selectedCommit,
  clips,
  activeHistoryClip,
  videoTime,
  isPlaying,
  isMuted,
  volume,
  videoRef,
  onTogglePlay,
  onSeek,
  onSetVideoTime,
  onSetVideoDuration,
  onSetIsMuted,
  onSetVolume,
  onSetIsPlaying,
  onOpenInEditor,
  onOpenDiff,
  onSetExportTarget,
  onAddTag,
  onRemoveTag,
  onBranchCreated,
  allCommits,
  onSelectCommit,
}: VersionDetailsCardProps) {
  const { activeRepo } = useRepository();

  const parentCommit = allCommits?.find((c) => c.id === selectedCommit?.parent);
  const [showTechDetails, setShowTechDetails] = useState(false);

  const [showSaveAsModal, setShowSaveAsModal] = useState(false);
  const [saveAsMessage, setSaveAsMessage] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [showAddTagInput, setShowAddTagInput] = useState(false);
  const [newTagInput, setNewTagInput] = useState("");
  const activeMediaHash =
    timeline.media_refs[0] || selectedCommit?.media_refs[0] || null;

  const handleSaveAsNewVersion = async () => {
    if (!selectedCommit || !saveAsMessage.trim()) return;
    setIsSaving(true);
    try {
      const res = await fetch(`${API_URL}/commits/save-as`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          from: selectedCommit.id,
          message: saveAsMessage.trim(),
          repo_id: activeRepo?.id,
        }),
      });

      if (res.ok) {
        const newId = await res.json();
        setShowSaveAsModal(false);
        setSaveAsMessage("");
        if (onBranchCreated) onBranchCreated(newId);
      }
    } catch (err) {
      console.error("Error saving as:", err);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <motion.div
      className="max-w-3xl mx-auto flex flex-col gap-4"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
    >
      {/* Video preview — hero card */}
      <div className="flex flex-col bg-card/60 border border-border rounded-2xl overflow-hidden shadow-lg">
        <div
          className="relative aspect-video bg-black flex items-center justify-center cursor-pointer group"
          onClick={onTogglePlay}
        >
          {activeHistoryClip?.clip.media_hash || activeMediaHash ? (
            <>
              <video
                ref={videoRef}
                src={`${API_URL}/media/${activeHistoryClip?.clip.media_hash || activeMediaHash}`}
                className="w-full h-full object-contain select-none"
                playsInline
                preload="auto"
                suppressHydrationWarning
                onTimeUpdate={() => {
                  const vid = videoRef.current;
                  if (!vid || !isPlaying) return;
                  if (activeHistoryClip) {
                    const inPoint = activeHistoryClip.clip.in_point ?? 0;
                    const clipOut =
                      activeHistoryClip.clip.out_point ??
                      inPoint + activeHistoryClip.clip.duration;
                    if (vid.currentTime >= clipOut - 0.05) {
                      const currentIndex = clips.findIndex(
                        (c) => c.id === activeHistoryClip.clip.id,
                      );
                      if (
                        currentIndex >= 0 &&
                        currentIndex < clips.length - 1
                      ) {
                        const nextClip = clips[currentIndex + 1];
                        const nextIn = nextClip.in_point ?? 0;
                        onSetVideoTime(nextClip.start_time);
                        vid.currentTime = nextIn;
                        if (
                          nextClip.media_hash ===
                          activeHistoryClip.clip.media_hash
                        ) {
                          safePlay(vid);
                        }
                      } else {
                        onSetIsPlaying(false);
                        onSetVideoTime(timeline.total_duration);
                        safePause(vid);
                      }
                    } else {
                      const elapsedInClip = Math.max(
                        0,
                        vid.currentTime - inPoint,
                      );
                      onSetVideoTime(
                        activeHistoryClip.clip.start_time + elapsedInClip,
                      );
                    }
                  } else {
                    onSetVideoTime(vid.currentTime);
                  }
                }}
                onLoadedMetadata={(e) => {
                  const dur = (e.target as HTMLVideoElement).duration || 10;
                  onSetVideoDuration(dur);
                  if (videoRef.current && activeHistoryClip) {
                    videoRef.current.currentTime = activeHistoryClip.videoTime;
                    if (isPlaying) safePlay(videoRef.current);
                  }
                }}
                onCanPlay={() => {
                  if (
                    videoRef.current &&
                    isPlaying &&
                    videoRef.current.paused
                  ) {
                    if (
                      activeHistoryClip &&
                      Math.abs(
                        videoRef.current.currentTime -
                          activeHistoryClip.videoTime,
                      ) > 0.3
                    ) {
                      videoRef.current.currentTime =
                        activeHistoryClip.videoTime;
                    }
                    safePlay(videoRef.current);
                  }
                }}
              />

              {/* Center Play Overlay Icon */}
              <div
                className={cn(
                  "absolute inset-0 flex items-center justify-center bg-black/30 transition-opacity pointer-events-none",
                  isPlaying
                    ? "opacity-0 group-hover:opacity-100"
                    : "opacity-100",
                )}
              >
                <div className="size-14 rounded-full bg-background/80 backdrop-blur-md border border-border flex items-center justify-center text-foreground shadow-xl">
                  {isPlaying ? (
                    <IconPlayerPause className="size-6" />
                  ) : (
                    <IconPlayerPlay className="size-6 ml-0.5" />
                  )}
                </div>
              </div>
            </>
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center text-muted-foreground gap-2">
              <IconVideo className="size-10 opacity-30" />
              <span className="text-xs">No media linked</span>
            </div>
          )}
        </div>

        {/* Transport Control Bar */}
        <div className="p-3 flex flex-col gap-2.5 bg-card border-t border-border">
          <div className="flex flex-col gap-1">
            <TimelineSlider
              currentTime={videoTime}
              duration={timeline.total_duration}
              onSeek={onSeek}
              showTimeDisplay={false}
              isPlaying={isPlaying}
            />
            <div className="flex items-center justify-between text-[10px] text-muted-foreground px-0.5">
              <TimeDisplay
                currentTime={videoTime}
                duration={timeline.total_duration}
                showDuration={false}
              />
              <TimeDisplay
                currentTime={timeline.total_duration}
                duration={timeline.total_duration}
                showDuration={false}
              />
            </div>
          </div>

          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 px-0.5 py-1">
              <SkipBackwardButton
                onClick={() => onSeek(Math.max(0, videoTime - 5))}
                onSeekStart={() => onSeek(0)}
                title="Step backward 5s (or double click to jump to start)"
              />

              <PlayPauseButton
                isPlaying={isPlaying}
                onToggle={onTogglePlay}
                playLabel="Play"
                pauseLabel="Pause"
              />

              <SkipForwardButton
                onClick={() =>
                  onSeek(Math.min(timeline.total_duration, videoTime + 5))
                }
                onSeekEnd={() => onSeek(timeline.total_duration)}
                title="Step forward 5s (or double click to jump to end)"
              />
            </div>

            <div className="flex items-center gap-1">
              <MuteButton
                isMuted={isMuted}
                onToggleMute={() => onSetIsMuted(!isMuted)}
                volume={volume}
              />
              <VolumeRange
                volume={volume}
                onVolumeChange={(v) => {
                  onSetVolume(v);
                  if (isMuted && v > 0) onSetIsMuted(false);
                }}
                isMuted={isMuted}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Info + actions */}
      <div className="flex flex-col gap-3">
        {/* Title row */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-1.5">
              {timeline.is_head && (
                <Badge
                  variant="default"
                  className="text-[9px] font-semibold uppercase tracking-wider h-5 px-2"
                >
                  Active
                </Badge>
              )}
              <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground/60">
                <IconClock className="size-3" />
                {timeline.total_duration.toFixed(1)}s
              </span>
            </div>
            <h2 className="text-lg font-bold text-foreground leading-tight">
              {timeline.message}
            </h2>
            <p className="text-[11px] text-muted-foreground/60 mt-0.5">
              {timeline.author} · {formatRelativeDate(timeline.timestamp)}
            </p>

            {parentCommit && (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-2 bg-muted/20 border border-border/40 px-2.5 py-1 rounded-lg w-fit">
                <IconGitBranch className="size-3.5 text-primary shrink-0" />
                <span>Branched from:</span>
                <button
                  onClick={() => onSelectCommit?.(parentCommit.id)}
                  className="text-foreground font-semibold hover:text-primary hover:underline transition-colors"
                  title={`View parent origin version: ${parentCommit.message}`}
                >
                  &ldquo;{parentCommit.message}&rdquo;
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant="default"
            size="sm"
            onClick={onOpenInEditor}
            className="h-8 text-[11px] font-semibold gap-1.5 px-4 rounded-lg"
          >
            <IconMovie className="size-3.5" />
            Open & Edit
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              onSetExportTarget({
                id: timeline.commit_id,
                message: timeline.message,
              })
            }
            className="h-8 text-[11px] font-semibold gap-1.5 px-4 rounded-lg border-border/50"
          >
            <IconDownload className="size-3.5" />
            Export
          </Button>
          <div className="w-px h-4 bg-border/50 mx-0.5" />
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowSaveAsModal(!showSaveAsModal)}
            className="h-8 text-[11px] gap-1.5 px-3 text-muted-foreground/70 hover:text-foreground rounded-lg"
          >
            <IconGitBranch className="size-3.5" />
            Branch
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onOpenDiff(timeline.commit_id)}
            className="h-8 text-[11px] gap-1.5 px-3 text-muted-foreground/70 hover:text-foreground rounded-lg"
          >
            <IconGitCompare className="size-3.5" />
            Compare
          </Button>
        </div>

        {/* Branch modal — inline */}
        {showSaveAsModal && (
          <div className="p-3 bg-muted/30 border border-border/60 rounded-xl flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <div className="flex flex-col gap-0.5">
                <span className="text-[11px] font-semibold text-foreground flex items-center gap-1.5">
                  <IconGitBranch className="size-3 text-primary" />
                  Create Branch from &ldquo;{timeline.message}&rdquo;
                </span>
                <span className="text-[10px] text-muted-foreground/60">
                  Creates an independent fork starting directly from this version
                </span>
              </div>
              <button
                onClick={() => setShowSaveAsModal(false)}
                className="text-muted-foreground hover:text-foreground text-xs"
              >
                ✕
              </button>
            </div>
            <div className="flex items-center gap-2">
              <Input
                value={saveAsMessage}
                onChange={(e) => setSaveAsMessage(e.target.value)}
                placeholder="e.g. Color Graded Version, Alternate Cut..."
                className="h-7 text-[11px] flex-1"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSaveAsNewVersion();
                  if (e.key === "Escape") setShowSaveAsModal(false);
                }}
              />

              <Button
                onClick={handleSaveAsNewVersion}
                size="sm"
                className="h-7 text-[11px] font-semibold shrink-0 px-3"
                disabled={!saveAsMessage.trim() || isSaving}
              >
                {isSaving ? "..." : "Create"}
              </Button>
            </div>
          </div>
        )}

        {/* Tags */}
        <div className="flex items-center gap-2 py-2">
          <IconTag className="size-3.5 text-muted-foreground/40 shrink-0" />
          <div className="flex items-center gap-1.5 flex-wrap flex-1 min-w-0">
            {selectedCommit?.tags && selectedCommit.tags.filter((t) => t !== 'Branch').length > 0 ? (
              selectedCommit.tags
                .filter((tag) => tag !== 'Branch')
                .map((tag) => (
                  <Badge
                    key={tag}
                    variant="secondary"
                    className="text-[10px] gap-1.5 bg-amber-500/10 text-amber-400/80 border-amber-500/20 h-5 px-2"
                  >
                    {tag}
                    <button
                      onClick={() => onRemoveTag(timeline.commit_id, tag)}
                      className="text-amber-400/30 hover:text-red-400 ml-0.5 transition-colors"
                    >
                      ✕
                    </button>
                  </Badge>
                ))
            ) : (
              <span className="text-[10px] text-muted-foreground/40">
                No tags
              </span>
            )}
          </div>


          <div className="flex items-center gap-1 shrink-0">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onAddTag(timeline.commit_id, "Picture Lock")}
              className="h-6 text-[10px] px-2.5 border-border/40 text-muted-foreground/60 hover:text-foreground rounded-md"
            >
              + Lock
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onAddTag(timeline.commit_id, "Director's Cut")}
              className="h-6 text-[10px] px-2.5 border-border/40 text-muted-foreground/60 hover:text-foreground rounded-md"
            >
              + Director
            </Button>
            {showAddTagInput ? (
              <div className="flex items-center gap-1 ml-0.5">
                <Input
                  value={newTagInput}
                  onChange={(e) => setNewTagInput(e.target.value)}
                  placeholder="tag name"
                  className="h-6 w-24 text-[10px] px-2 rounded-md"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && newTagInput.trim()) {
                      onAddTag(timeline.commit_id, newTagInput);
                      setNewTagInput("");
                      setShowAddTagInput(false);
                    }
                    if (e.key === "Escape") setShowAddTagInput(false);
                  }}
                />
              </div>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowAddTagInput(true)}
                className="h-6 text-[10px] px-2 text-muted-foreground/40 hover:text-muted-foreground rounded-md"
              >
                +
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Track segments */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between text-[11px]">
          <span className="text-muted-foreground/50 font-semibold">Timeline</span>
          <span className="text-muted-foreground/40 text-[10px]">
            {timeline.tracks.length} track
            {timeline.tracks.length !== 1 ? "s" : ""} · {clips.length} clip
            {clips.length !== 1 ? "s" : ""}
          </span>
        </div>
        <div className="flex flex-col gap-2">
          {timeline.tracks.map((track) => (
            <ScrollArea
              key={track.id}
              className="w-full"
              orientation="horizontal"
            >
              <div className="h-10 bg-muted/20 rounded-xl p-1.5 flex gap-1.5 min-w-full items-center border border-border/30">
                {track.clips.map((clip, _idx) => (
                  <div
                    key={clip.id}
                    className={cn(
                      "h-full flex-1 min-w-[80px] rounded-lg px-3 flex items-center justify-between text-[10px] transition-colors",
                      track.track_type === "video"
                        ? "bg-gradient-to-r from-primary/12 to-primary/5 text-foreground border border-primary/10"
                        : "bg-muted/40 text-foreground border border-border/20",
                    )}
                  >
                    <span className="truncate font-medium">{clip.name}</span>
                    <span className="text-muted-foreground/50 shrink-0 ml-2 tabular-nums">
                      {clip.duration.toFixed(1)}s
                    </span>
                  </div>
                ))}
              </div>
            </ScrollArea>
          ))}
        </div>
      </div>

      {/* Tech details */}
      <div className="mt-2 mb-8">
        <button
          onClick={() => setShowTechDetails(!showTechDetails)}
          className="flex items-center gap-1.5 w-full text-[11px] text-muted-foreground/40 hover:text-muted-foreground/60 transition-colors py-1.5"
        >
          {showTechDetails ? (
            <IconChevronDown className="size-3.5" />
          ) : (
            <IconChevronRight className="size-3.5" />
          )}
          <span className="font-medium">Technical Details</span>
        </button>
        {showTechDetails && (
          <div className="mt-2 grid grid-cols-3 gap-2.5 text-[9px]">
            <div className="bg-muted/20 rounded-xl p-3 border border-border/20">
              <div className="text-muted-foreground/40 uppercase text-[8px] font-semibold tracking-wider mb-1">
                Commit
              </div>
              <div
                className="text-foreground/70 truncate font-medium"
                title={timeline.commit_id}
              >
                {timeline.commit_id}
              </div>
            </div>
            <div className="bg-muted/20 rounded-xl p-3 border border-border/20">
              <div className="text-muted-foreground/40 uppercase text-[8px] font-semibold tracking-wider mb-1">
                Hash
              </div>
              <div
                className="text-primary/70 truncate font-medium"
                title={timeline.timeline_hash}
              >
                {timeline.timeline_hash}
              </div>
            </div>
            <div className="bg-muted/20 rounded-xl p-3 border border-border/20">
              <div className="text-muted-foreground/40 uppercase text-[8px] font-semibold tracking-wider mb-1">
                Parent
              </div>
              <div className="text-foreground/70 truncate font-medium">
                {timeline.parent_id || "Root"}
              </div>
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
}
