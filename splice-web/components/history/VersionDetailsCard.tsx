'use client';

import React, { useState } from 'react';
import {
  IconClock,
  IconMovie,
  IconTag,
  IconPlus,
  IconVideo,
  IconDownload,
  IconGitBranch,
  IconGitCompare,
  IconChevronDown,
  IconChevronRight,
} from '@tabler/icons-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  VideoPlayer,
  VideoPlayerControlBar,
  VideoPlayerPlayButton,
  VideoPlayerTimeRange,
  VideoPlayerTimeDisplay,
  VideoPlayerMuteButton,
  VideoPlayerVolumeRange,
} from '@/components/ui/video_player';

import { Commit, Timeline, TimelineClip } from '@/lib/types';
import { API_URL } from '@/lib/api';
import { cn } from '@/lib/utils';

function formatRelativeDate(timestamp: string): string {
  try {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return timestamp;
  }
}

interface VersionDetailsCardProps {
  timeline: Timeline;
  selectedCommit: Commit | undefined;
  clips: TimelineClip[];
  activeHistoryClip: { clip: TimelineClip; offset: number; videoTime: number } | null;
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
}: VersionDetailsCardProps) {
  const [showTechDetails, setShowTechDetails] = useState(false);
  const [showSaveAsModal, setShowSaveAsModal] = useState(false);
  const [saveAsMessage, setSaveAsMessage] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [showAddTagInput, setShowAddTagInput] = useState(false);
  const [newTagInput, setNewTagInput] = useState('');
  const activeMediaHash = timeline.media_refs[0] || selectedCommit?.media_refs[0] || null;

  const handleSaveAsNewVersion = async () => {
    if (!selectedCommit || !saveAsMessage.trim()) return;
    setIsSaving(true);
    try {
      const res = await fetch(`${API_URL}/commits/save-as`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: selectedCommit.id, message: saveAsMessage.trim() }),
      });
      if (res.ok) {
        const newId = await res.json();
        setShowSaveAsModal(false);
        setSaveAsMessage('');
        if (onBranchCreated) onBranchCreated(newId);
      }
    } catch (err) {
      console.error('Error saving as:', err);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto flex flex-col gap-4">
      {/* Video preview — hero */}
      <div className="relative aspect-video bg-black rounded-2xl overflow-hidden shadow-lg">
        {activeHistoryClip?.clip.media_hash || activeMediaHash ? (
          <VideoPlayer className="w-full h-full">
            <video
              slot="media"
              ref={videoRef}
              src={`${API_URL}/media/${activeHistoryClip?.clip.media_hash || activeMediaHash}`}
              className="w-full h-full object-contain"
              playsInline
              preload="auto"
              suppressHydrationWarning
              onTimeUpdate={() => {
                const vid = videoRef.current;
                if (!vid || !isPlaying) return;
                if (activeHistoryClip) {
                  const clipEnd = activeHistoryClip.clip.duration;
                  if (vid.currentTime >= clipEnd - 0.05) {
                    const currentIndex = clips.findIndex((c) => c.id === activeHistoryClip.clip.id);
                    if (currentIndex >= 0 && currentIndex < clips.length - 1) {
                      const nextClip = clips[currentIndex + 1];
                      onSetVideoTime(nextClip.start_time);
                      if (nextClip.media_hash === activeHistoryClip.clip.media_hash) {
                        vid.currentTime = 0;
                        vid.play().catch(console.warn);
                      }
                    } else {
                      onSetIsPlaying(false);
                      onSetVideoTime(timeline.total_duration);
                      vid.pause();
                    }
                  } else {
                    onSetVideoTime(activeHistoryClip.clip.start_time + vid.currentTime);
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
                  if (isPlaying) videoRef.current.play().catch(console.warn);
                }
              }}
              onCanPlay={() => {
                if (videoRef.current && isPlaying && videoRef.current.paused) {
                  if (activeHistoryClip && Math.abs(videoRef.current.currentTime - activeHistoryClip.videoTime) > 0.3) {
                    videoRef.current.currentTime = activeHistoryClip.videoTime;
                  }
                  videoRef.current.play().catch(console.warn);
                }
              }}
            />
            <VideoPlayerControlBar>
              <VideoPlayerPlayButton />
              <VideoPlayerTimeRange />
              <VideoPlayerTimeDisplay showDuration />
              <VideoPlayerMuteButton />
              <VideoPlayerVolumeRange />
            </VideoPlayerControlBar>
          </VideoPlayer>
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center text-muted-foreground gap-2">
            <IconVideo className="size-10 opacity-30" />
            <span className="text-xs">No media linked</span>
          </div>
        )}
      </div>

      {/* Info + actions */}
      <div className="flex flex-col gap-3">
        {/* Title row */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-1">
              {timeline.is_head && (
                <Badge variant="default" className="text-[9px] font-semibold uppercase tracking-wider h-4 px-1.5">
                  Active
                </Badge>
              )}
              <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                <IconClock className="size-2.5" />
                {timeline.total_duration.toFixed(1)}s
              </span>
            </div>
            <h2 className="text-lg font-bold text-foreground leading-tight">
              {timeline.message}
            </h2>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              {timeline.author} · {formatRelativeDate(timeline.timestamp)}
            </p>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <Button
            variant="default"
            size="sm"
            onClick={onOpenInEditor}
            className="h-7 text-[11px] font-semibold gap-1 px-3"
          >
            <IconMovie className="size-3" />
            Open & Edit
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onSetExportTarget({ id: timeline.commit_id, message: timeline.message })}
            className="h-7 text-[11px] font-semibold gap-1 px-3"
          >
            <IconDownload className="size-3" />
            Export
          </Button>
          <div className="w-px h-3.5 bg-border/60 mx-0.5" />
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowSaveAsModal(!showSaveAsModal)}
            className="h-7 text-[11px] gap-1 px-2.5 text-muted-foreground hover:text-foreground"
          >
            <IconGitBranch className="size-3" />
            Branch
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onOpenDiff(timeline.commit_id)}
            className="h-7 text-[11px] gap-1 px-2.5 text-muted-foreground hover:text-foreground"
          >
            <IconGitCompare className="size-3" />
            Compare
          </Button>
        </div>

        {/* Branch modal — inline */}
        {showSaveAsModal && (
          <div className="p-3 bg-muted/30 border border-border/60 rounded-xl flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-foreground flex items-center gap-1.5">
                <IconGitBranch className="size-3 text-primary" />
                Create Branch
              </span>
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
                placeholder="Branch name..."
                className="h-7 text-[11px] flex-1"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSaveAsNewVersion();
                  if (e.key === 'Escape') setShowSaveAsModal(false);
                }}
              />
              <Button
                onClick={handleSaveAsNewVersion}
                size="sm"
                className="h-7 text-[11px] font-semibold shrink-0 px-3"
                disabled={!saveAsMessage.trim() || isSaving}
              >
                {isSaving ? '...' : 'Create'}
              </Button>
            </div>
          </div>
        )}

        {/* Tags */}
        <div className="flex items-center gap-2 py-1.5">
          <IconTag className="size-3 text-muted-foreground/50 shrink-0" />
          <div className="flex items-center gap-1.5 flex-wrap flex-1 min-w-0">
            {selectedCommit?.tags && selectedCommit.tags.length > 0 ? (
              selectedCommit.tags.map((tag) => (
                <Badge
                  key={tag}
                  variant="secondary"
                  className="text-[10px] gap-1 bg-amber-500/15 text-amber-300 border-amber-500/30 h-5 px-1.5"
                >
                  {tag}
                  <button
                    onClick={() => onRemoveTag(timeline.commit_id, tag)}
                    className="text-amber-400/40 hover:text-red-400 ml-0.5"
                  >
                    ✕
                  </button>
                </Badge>
              ))
            ) : (
              <span className="text-[10px] text-muted-foreground/40 italic">No tags</span>
            )}
          </div>

          <div className="flex items-center gap-0.5 shrink-0">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onAddTag(timeline.commit_id, 'Picture Lock')}
              className="h-6 text-[10px] px-2 border-border/40 text-muted-foreground hover:text-foreground"
            >
              + Lock
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onAddTag(timeline.commit_id, "Director's Cut")}
              className="h-6 text-[10px] px-2 border-border/40 text-muted-foreground hover:text-foreground"
            >
              + Director
            </Button>
            {showAddTagInput ? (
              <div className="flex items-center gap-1 ml-0.5">
                <Input
                  value={newTagInput}
                  onChange={(e) => setNewTagInput(e.target.value)}
                  placeholder="tag name"
                  className="h-6 w-24 text-[10px] px-2"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && newTagInput.trim()) {
                      onAddTag(timeline.commit_id, newTagInput);
                      setNewTagInput('');
                      setShowAddTagInput(false);
                    }
                    if (e.key === 'Escape') setShowAddTagInput(false);
                  }}
                />
              </div>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowAddTagInput(true)}
                className="h-6 text-[10px] px-2 text-muted-foreground/50 hover:text-muted-foreground"
              >
                +
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Track segments */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between text-[11px]">
          <span className="text-muted-foreground/60 font-medium">Timeline</span>
          <span className="text-muted-foreground/40 text-[10px]">
            {timeline.tracks.length} track{timeline.tracks.length !== 1 ? 's' : ''} · {clips.length} clip{clips.length !== 1 ? 's' : ''}
          </span>
        </div>
        <div className="flex flex-col gap-2">
          {timeline.tracks.map((track) => (
            <ScrollArea key={track.id} className="w-full" orientation="horizontal">
              <div className="h-9 bg-muted/20 rounded-xl p-1 flex gap-1 min-w-full items-center">
                {track.clips.map((clip, idx) => (
                  <div
                    key={clip.id}
                    className={cn(
                      'h-full flex-1 min-w-[80px] rounded-lg px-3 flex items-center justify-between text-[10px] transition-colors',
                      track.track_type === 'video'
                        ? 'bg-gradient-to-r from-primary/15 to-primary/5 text-foreground'
                        : 'bg-muted/40 text-foreground'
                    )}
                  >
                    <span className="truncate font-medium">{clip.name}</span>
                    <span className="text-muted-foreground/60 shrink-0 ml-2 tabular-nums">{clip.duration.toFixed(1)}s</span>
                  </div>
                ))}
              </div>
            </ScrollArea>
          ))}
        </div>
      </div>

      {/* Tech details */}
      <div className="mt-1 mb-8">
        <button
          onClick={() => setShowTechDetails(!showTechDetails)}
          className="flex items-center gap-1.5 w-full text-[10px] text-muted-foreground/40 hover:text-muted-foreground/70 transition-colors py-1"
        >
          {showTechDetails ? <IconChevronDown className="size-3" /> : <IconChevronRight className="size-3" />}
          <span>Technical Details</span>
        </button>
        {showTechDetails && (
          <div className="mt-2 grid grid-cols-3 gap-2 text-[9px]">
            <div className="bg-muted/20 rounded-lg p-2">
              <div className="text-muted-foreground/40 uppercase text-[8px] mb-0.5">Commit</div>
              <div className="text-foreground/80 truncate" title={timeline.commit_id}>{timeline.commit_id}</div>
            </div>
            <div className="bg-muted/20 rounded-lg p-2">
              <div className="text-muted-foreground/40 uppercase text-[8px] mb-0.5">Hash</div>
              <div className="text-primary/80 truncate" title={timeline.timeline_hash}>{timeline.timeline_hash}</div>
            </div>
            <div className="bg-muted/20 rounded-lg p-2">
              <div className="text-muted-foreground/40 uppercase text-[8px] mb-0.5">Parent</div>
              <div className="text-foreground/80 truncate">{timeline.parent_id || 'Root'}</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
