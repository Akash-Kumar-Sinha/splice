'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  IconGitCompare,
  IconPlus,
  IconMinus,
  IconArrowsExchange,
  IconMovie,
  IconArrowRight,
  IconClock,
  IconSparkles,
  IconPlayerPlay,
  IconPlayerPause,
  IconPlayerSkipBack,
  IconPlayerSkipForward,
  IconVolume,
  IconVolumeOff,
  IconVideo,
} from '@tabler/icons-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Commit, Timeline } from './HistoryPanel';
import { cn } from '@/lib/utils';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export interface ClipRef {
  media: string;
  track_index: number;
  clip_index: number;
}

export interface TimeRange {
  in_point: number;
  out_point: number;
  position: number;
}

export interface TimelineDiff {
  added: ClipRef[];
  removed: ClipRef[];
  moved: [ClipRef, TimeRange, TimeRange][];
  effects_changed: ClipRef[];
  summary: string;
}

interface DiffInspectorProps {
  commits: Commit[];
  baseCommitId: string | null;
  targetCommitId: string | null;
  onSelectBase: (id: string) => void;
  onSelectTarget: (id: string) => void;
  onClose?: () => void;
}

export default function DiffInspector({
  commits,
  baseCommitId,
  targetCommitId,
  onSelectBase,
  onSelectTarget,
  onClose,
}: DiffInspectorProps) {
  const [diff, setDiff] = useState<TimelineDiff | null>(null);
  const [loading, setLoading] = useState<boolean>(false);

  // Timeline structures for version A and version B
  const [timelineA, setTimelineA] = useState<Timeline | null>(null);
  const [timelineB, setTimelineB] = useState<Timeline | null>(null);

  // Dual Synced Video Players State
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [masterTime, setMasterTime] = useState<number>(0);
  const [audioFocus, setAudioFocus] = useState<'a' | 'b' | 'both'>('b');

  const videoRefA = useRef<HTMLVideoElement | null>(null);
  const videoRefB = useRef<HTMLVideoElement | null>(null);

  const baseCommit = commits.find((c) => c.id === baseCommitId);
  const targetCommit = commits.find((c) => c.id === targetCommitId);

  // Fetch Diff
  useEffect(() => {
    if (!baseCommitId || !targetCommitId || baseCommitId === targetCommitId) {
      setDiff(null);
      return;
    }

    const fetchDiff = async () => {
      setLoading(true);
      try {
        const res = await fetch(
          `${API_URL}/commits/diff?from=${baseCommitId}&to=${targetCommitId}`
        );
        if (res.ok) {
          const data: TimelineDiff = await res.json();
          setDiff(data);
        }
      } catch (err) {
        console.error('Failed to load diff:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchDiff();
  }, [baseCommitId, targetCommitId]);

  // Fetch reconstructed timeline A
  useEffect(() => {
    if (!baseCommitId) {
      setTimelineA(null);
      return;
    }
    fetch(`${API_URL}/commits/${baseCommitId}/revert?mode=preview`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => setTimelineA(data))
      .catch(console.error);
  }, [baseCommitId]);

  // Fetch reconstructed timeline B
  useEffect(() => {
    if (!targetCommitId) {
      setTimelineB(null);
      return;
    }
    fetch(`${API_URL}/commits/${targetCommitId}/revert?mode=preview`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => setTimelineB(data))
      .catch(console.error);
  }, [targetCommitId]);

  const clipsA = timelineA?.tracks[0]?.clips || [];
  const clipsB = timelineB?.tracks[0]?.clips || [];

  const durationA = timelineA?.total_duration || 10;
  const durationB = timelineB?.total_duration || 10;
  const maxDuration = Math.max(0.1, durationA, durationB);

  // Calculate active clip for Version A at given time
  const getClipInfoA = useCallback(
    (time: number) => {
      for (const clip of clipsA) {
        if (time >= clip.start_time && time < clip.start_time + clip.duration) {
          const offset = time - clip.start_time;
          return { clip, offset, videoTime: offset };
        }
      }
      if (clipsA.length > 0) {
        const last = clipsA[clipsA.length - 1];
        if (time >= last.start_time + last.duration) {
          return { clip: last, offset: last.duration, videoTime: last.duration };
        }
        return { clip: clipsA[0], offset: 0, videoTime: 0 };
      }
      return null;
    },
    [clipsA]
  );

  // Calculate active clip for Version B at given time
  const getClipInfoB = useCallback(
    (time: number) => {
      for (const clip of clipsB) {
        if (time >= clip.start_time && time < clip.start_time + clip.duration) {
          const offset = time - clip.start_time;
          return { clip, offset, videoTime: offset };
        }
      }
      if (clipsB.length > 0) {
        const last = clipsB[clipsB.length - 1];
        if (time >= last.start_time + last.duration) {
          return { clip: last, offset: last.duration, videoTime: last.duration };
        }
        return { clip: clipsB[0], offset: 0, videoTime: 0 };
      }
      return null;
    },
    [clipsB]
  );

  const activeClipA = getClipInfoA(masterTime);
  const activeClipB = getClipInfoB(masterTime);

  const mediaHashA = activeClipA?.clip.media_hash || baseCommit?.media_refs[0] || null;
  const mediaHashB = activeClipB?.clip.media_hash || targetCommit?.media_refs[0] || null;

  // Sync video audio mute according to audioFocus selection
  useEffect(() => {
    if (videoRefA.current) {
      videoRefA.current.muted = audioFocus === 'b';
    }
    if (videoRefB.current) {
      videoRefB.current.muted = audioFocus === 'a';
    }
  }, [audioFocus]);

  // Master Play/Pause toggle
  const toggleMasterPlay = () => {
    if (isPlaying) {
      setIsPlaying(false);
      videoRefA.current?.pause();
      videoRefB.current?.pause();
    } else {
      if (masterTime >= maxDuration - 0.1) {
        handleMasterSeek(0);
      }
      setIsPlaying(true);
      videoRefA.current?.play().catch(console.warn);
      videoRefB.current?.play().catch(console.warn);
    }
  };

  // Master Seek
  const handleMasterSeek = (time: number) => {
    const clamped = Math.max(0, Math.min(time, maxDuration));
    setMasterTime(clamped);

    const infoA = getClipInfoA(clamped);
    if (videoRefA.current && infoA) {
      videoRefA.current.currentTime = infoA.videoTime;
    }
    const infoB = getClipInfoB(clamped);
    if (videoRefB.current && infoB) {
      videoRefB.current.currentTime = infoB.videoTime;
    }
  };

  // Master playback ticker
  useEffect(() => {
    if (!isPlaying) return;

    const interval = setInterval(() => {
      setMasterTime((prev) => {
        const next = prev + 0.05;
        if (next >= maxDuration) {
          setIsPlaying(false);
          videoRefA.current?.pause();
          videoRefB.current?.pause();
          return maxDuration;
        }
        return next;
      });
    }, 50);

    return () => clearInterval(interval);
  }, [isPlaying, maxDuration]);

  return (
    <Card className="p-6 bg-card/60 border border-border flex flex-col gap-6 shadow-xl">
      {/* Header with Commit Selector */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-border">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-primary/10 text-primary border border-primary/20">
            <IconGitCompare className="size-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-base text-foreground">Dual-View Comparison & Visual Diff</h3>
              <Badge variant="outline" className="font-mono text-[10px]">
                Side-by-Side Sync Player
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground font-mono">
              Compare two versions simultaneously with synchronized lockstep video playback and structural timeline diffing.
            </p>
          </div>
        </div>

        {onClose && (
          <Button variant="ghost" size="sm" onClick={onClose}>
            ✕ Close Diff
          </Button>
        )}
      </div>

      {/* Selectors Strip */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Base Version A */}
        <div className="bg-background/60 border border-border rounded-xl p-3 flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-mono uppercase text-muted-foreground font-semibold">
              Base Version (A)
            </span>
            <Badge variant="outline" className="font-mono text-[10px]">
              {baseCommitId ? `${baseCommitId.slice(0, 8)}...` : 'None'}
            </Badge>
          </div>
          <select
            value={baseCommitId || ''}
            onChange={(e) => onSelectBase(e.target.value)}
            className="w-full bg-card border border-border rounded-lg text-xs font-mono p-2 text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="" disabled>
              Select base version...
            </option>
            {commits.map((c) => (
              <option key={`base-${c.id}`} value={c.id}>
                {c.message} ({c.id.slice(0, 7)})
              </option>
            ))}
          </select>
          {baseCommit && (
            <div className="text-[11px] font-mono text-muted-foreground truncate">
              {baseCommit.author} • {baseCommit.media_refs.length} media segment(s) • {durationA.toFixed(1)}s
            </div>
          )}
        </div>

        {/* Target Version B */}
        <div className="bg-background/60 border border-border rounded-xl p-3 flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-mono uppercase text-primary font-semibold">
              Compare Target (B)
            </span>
            <Badge variant="default" className="font-mono text-[10px]">
              {targetCommitId ? `${targetCommitId.slice(0, 8)}...` : 'None'}
            </Badge>
          </div>
          <select
            value={targetCommitId || ''}
            onChange={(e) => onSelectTarget(e.target.value)}
            className="w-full bg-card border border-border rounded-lg text-xs font-mono p-2 text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="" disabled>
              Select target version to compare...
            </option>
            {commits.map((c) => (
              <option key={`target-${c.id}`} value={c.id}>
                {c.message} ({c.id.slice(0, 7)})
              </option>
            ))}
          </select>
          {targetCommit && (
            <div className="text-[11px] font-mono text-muted-foreground truncate">
              {targetCommit.author} • {targetCommit.media_refs.length} media segment(s) • {durationB.toFixed(1)}s
            </div>
          )}
        </div>
      </div>

      {/* Synchronized Side-by-Side Dual Video Monitors */}
      <div className="bg-background/80 border border-border rounded-2xl p-4 flex flex-col gap-4 shadow-inner">
        <div className="flex items-center justify-between text-xs font-mono text-muted-foreground border-b border-border pb-2">
          <div className="flex items-center gap-2">
            <IconMovie className="size-4 text-primary" />
            <span className="font-semibold text-foreground">Synchronized Dual Video Comparison</span>
          </div>

          {/* Audio Switcher */}
          <div className="flex items-center gap-1.5 bg-muted/40 p-1 rounded-lg border border-border">
            <span className="text-[10px] text-muted-foreground mr-1">Audio:</span>
            <Button
              variant={audioFocus === 'a' ? 'secondary' : 'ghost'}
              size="xs"
              onClick={() => setAudioFocus('a')}
              className="text-[10px] h-5 px-1.5"
            >
              Audio A
            </Button>
            <Button
              variant={audioFocus === 'b' ? 'secondary' : 'ghost'}
              size="xs"
              onClick={() => setAudioFocus('b')}
              className="text-[10px] h-5 px-1.5"
            >
              Audio B
            </Button>
            <Button
              variant={audioFocus === 'both' ? 'secondary' : 'ghost'}
              size="xs"
              onClick={() => setAudioFocus('both')}
              className="text-[10px] h-5 px-1.5"
            >
              Both
            </Button>
          </div>
        </div>

        {/* Dual Video Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Monitor A (Base) */}
          <div className="flex flex-col gap-2 bg-card/40 p-3 rounded-xl border border-border">
            <div className="flex items-center justify-between text-xs font-mono">
              <Badge variant="outline" className="text-[10px] truncate max-w-[200px]">
                Version A: {baseCommit?.message || 'Base'}
              </Badge>
              <span className="text-muted-foreground text-[10px]">
                {Math.min(masterTime, durationA).toFixed(2)}s / {durationA.toFixed(1)}s
              </span>
            </div>

            <div className="relative aspect-video bg-black rounded-lg overflow-hidden flex items-center justify-center border border-border">
              {mediaHashA ? (
                <video
                  ref={videoRefA}
                  src={`${API_URL}/media/${mediaHashA}`}
                  className="w-full h-full object-contain"
                  playsInline
                  preload="auto"
                  onLoadedMetadata={() => {
                    if (videoRefA.current && activeClipA) {
                      videoRefA.current.currentTime = activeClipA.videoTime;
                      if (isPlaying) {
                        videoRefA.current.play().catch(console.warn);
                      }
                    }
                  }}
                />
              ) : (
                <div className="text-muted-foreground font-mono text-xs flex flex-col items-center gap-1">
                  <IconVideo className="size-6 text-muted-foreground/40" />
                  <span>No media for Version A</span>
                </div>
              )}

              {audioFocus === 'b' && (
                <div className="absolute top-2 right-2 bg-black/70 rounded-md p-1">
                  <IconVolumeOff className="size-3 text-muted-foreground" />
                </div>
              )}
            </div>
          </div>

          {/* Monitor B (Target) */}
          <div className="flex flex-col gap-2 bg-card/40 p-3 rounded-xl border border-border">
            <div className="flex items-center justify-between text-xs font-mono">
              <Badge variant="default" className="text-[10px] truncate max-w-[200px]">
                Version B: {targetCommit?.message || 'Target'}
              </Badge>
              <span className="text-primary text-[10px] font-bold">
                {Math.min(masterTime, durationB).toFixed(2)}s / {durationB.toFixed(1)}s
              </span>
            </div>

            <div className="relative aspect-video bg-black rounded-lg overflow-hidden flex items-center justify-center border border-border">
              {mediaHashB ? (
                <video
                  ref={videoRefB}
                  src={`${API_URL}/media/${mediaHashB}`}
                  className="w-full h-full object-contain"
                  playsInline
                  preload="auto"
                  onLoadedMetadata={() => {
                    if (videoRefB.current && activeClipB) {
                      videoRefB.current.currentTime = activeClipB.videoTime;
                      if (isPlaying) {
                        videoRefB.current.play().catch(console.warn);
                      }
                    }
                  }}
                />
              ) : (
                <div className="text-muted-foreground font-mono text-xs flex flex-col items-center gap-1">
                  <IconVideo className="size-6 text-muted-foreground/40" />
                  <span>No media for Version B</span>
                </div>
              )}

              {audioFocus === 'a' && (
                <div className="absolute top-2 right-2 bg-black/70 rounded-md p-1">
                  <IconVolumeOff className="size-3 text-muted-foreground" />
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Master Synced Playback Transport Controls */}
        <div className="flex flex-col gap-2 pt-2 border-t border-border/50">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-1.5">
              <Button
                variant="outline"
                size="icon-sm"
                onClick={() => handleMasterSeek(0)}
                title="Jump Both to Start"
              >
                <IconPlayerSkipBack />
              </Button>
              <Button
                size="sm"
                onClick={toggleMasterPlay}
                className="font-mono font-bold"
              >
                {isPlaying ? (
                  <>
                    <IconPlayerPause data-icon="inline-start" /> Pause Both
                  </>
                ) : (
                  <>
                    <IconPlayerPlay data-icon="inline-start" /> Play Both Synced
                  </>
                )}
              </Button>
              <Button
                variant="outline"
                size="icon-sm"
                onClick={() => handleMasterSeek(maxDuration)}
                title="Jump Both to End"
              >
                <IconPlayerSkipForward />
              </Button>
            </div>

            <Badge variant="outline" className="font-mono text-primary font-bold">
              Sync Playhead: {masterTime.toFixed(2)}s / {maxDuration.toFixed(1)}s
            </Badge>
          </div>

          {/* Master Synchronized Timeline Scrubber */}
          <input
            type="range"
            min="0"
            max={maxDuration}
            step="0.05"
            value={masterTime}
            onChange={(e) => handleMasterSeek(parseFloat(e.target.value))}
            className="w-full accent-primary cursor-pointer"
          />
        </div>
      </div>

      {/* Auto-Note Summary Banner */}
      {diff && (
        <div className="bg-primary/10 border border-primary/30 rounded-xl p-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 font-mono text-xs text-primary">
            <IconSparkles className="size-4 shrink-0" />
            <span>
              <strong>Auto-Generated Commit Note:</strong> &ldquo;{diff.summary}&rdquo;
            </span>
          </div>

          {/* Color-Coded Stats Legend */}
          <div className="flex items-center gap-2 flex-wrap">
            <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/40 text-[10px] gap-1 font-mono">
              <IconPlus className="size-2.5" /> {diff.added.length} Added
            </Badge>
            <Badge className="bg-rose-500/20 text-rose-400 border-rose-500/40 text-[10px] gap-1 font-mono">
              <IconMinus className="size-2.5" /> {diff.removed.length} Removed
            </Badge>
            <Badge className="bg-amber-500/20 text-amber-300 border-amber-500/40 text-[10px] gap-1 font-mono">
              <IconArrowsExchange className="size-2.5" /> {diff.moved.length} Modified/Trimmed
            </Badge>
          </div>
        </div>
      )}

      {/* Diff Visual Tracks */}
      {loading ? (
        <div className="py-12 flex items-center justify-center font-mono text-xs text-muted-foreground gap-2">
          <div className="size-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          Computing Myers timeline diff...
        </div>
      ) : diff ? (
        <div className="flex flex-col gap-4">
          {/* Base A Timeline Track Preview */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between text-xs font-mono text-muted-foreground">
              <span className="font-semibold text-foreground">
                Base Track A ({baseCommit?.message || 'Version A'})
              </span>
              <span className="text-[10px]">
                {baseCommit?.media_refs.length || 0} clip(s)
              </span>
            </div>
            <div className="h-16 bg-background border border-border rounded-xl p-2 relative flex gap-2 overflow-x-auto items-center">
              {baseCommit?.media_refs.length === 0 ? (
                <div className="w-full text-center text-xs font-mono text-muted-foreground">
                  Empty track
                </div>
              ) : (
                baseCommit?.media_refs.map((hash, idx) => {
                  const isRemoved = diff.removed.some(
                    (r) => r.media === hash || r.clip_index === idx
                  );
                  const isMoved = diff.moved.some(
                    ([m]) => m.media === hash || m.clip_index === idx
                  );

                  return (
                    <div
                      key={`a-${idx}`}
                      className={cn(
                        'h-full flex-1 min-w-[120px] rounded-lg p-2 flex flex-col justify-between text-[11px] font-mono border-2 transition-all',
                        isRemoved
                          ? 'bg-rose-500/20 border-rose-500 text-rose-300'
                          : isMoved
                            ? 'bg-amber-500/20 border-amber-500 text-amber-300'
                            : 'bg-secondary/40 border-border text-muted-foreground'
                      )}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold truncate">Clip #{idx + 1}</span>
                        {isRemoved && (
                          <Badge variant="outline" className="text-[9px] border-rose-500 text-rose-400 px-1 py-0">
                            REMOVED
                          </Badge>
                        )}
                        {isMoved && (
                          <Badge variant="outline" className="text-[9px] border-amber-500 text-amber-300 px-1 py-0">
                            MODIFIED
                          </Badge>
                        )}
                      </div>
                      <div className="truncate text-[9px] opacity-80">{hash.slice(0, 10)}...</div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Transition Indicator */}
          <div className="flex items-center justify-center my-1 text-muted-foreground text-xs font-mono gap-2">
            <Separator className="flex-1" />
            <span className="flex items-center gap-1 text-primary bg-background px-3 py-1 rounded-full border border-border">
              <IconArrowRight className="size-3.5" /> Delta Evolution
            </span>
            <Separator className="flex-1" />
          </div>

          {/* Target B Timeline Track Preview */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between text-xs font-mono text-primary">
              <span className="font-semibold text-foreground">
                Target Track B ({targetCommit?.message || 'Version B'})
              </span>
              <span className="text-[10px]">
                {targetCommit?.media_refs.length || 0} clip(s)
              </span>
            </div>
            <div className="h-16 bg-background border border-border rounded-xl p-2 relative flex gap-2 overflow-x-auto items-center">
              {targetCommit?.media_refs.length === 0 ? (
                <div className="w-full text-center text-xs font-mono text-muted-foreground">
                  Empty track
                </div>
              ) : (
                targetCommit?.media_refs.map((hash, idx) => {
                  const isAdded = diff.added.some(
                    (a) => a.media === hash || a.clip_index === idx
                  );
                  const isMoved = diff.moved.some(
                    ([m]) => m.media === hash || m.clip_index === idx
                  );

                  return (
                    <div
                      key={`b-${idx}`}
                      className={cn(
                        'h-full flex-1 min-w-[120px] rounded-lg p-2 flex flex-col justify-between text-[11px] font-mono border-2 transition-all',
                        isAdded
                          ? 'bg-emerald-500/20 border-emerald-500 text-emerald-300'
                          : isMoved
                            ? 'bg-amber-500/20 border-amber-500 text-amber-300'
                            : 'bg-secondary/40 border-border text-muted-foreground'
                      )}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold truncate">Clip #{idx + 1}</span>
                        {isAdded && (
                          <Badge variant="outline" className="text-[9px] border-emerald-500 text-emerald-300 px-1 py-0">
                            ADDED
                          </Badge>
                        )}
                        {isMoved && (
                          <Badge variant="outline" className="text-[9px] border-amber-500 text-amber-300 px-1 py-0">
                            TRIMMED
                          </Badge>
                        )}
                      </div>
                      <div className="truncate text-[9px] opacity-80">{hash.slice(0, 10)}...</div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Detailed Changes List */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2">
            {/* Added */}
            <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-xl p-3 flex flex-col gap-1.5">
              <span className="text-xs font-mono font-semibold text-emerald-400 flex items-center gap-1">
                <IconPlus className="size-3.5" /> Added ({diff.added.length})
              </span>
              <div className="text-[11px] font-mono text-muted-foreground">
                {diff.added.length === 0 ? (
                  <span>None</span>
                ) : (
                  diff.added.map((a, i) => (
                    <div key={i} className="truncate">
                      • Track {a.track_index + 1}, Clip #{a.clip_index + 1}
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Removed */}
            <div className="bg-rose-500/5 border border-rose-500/20 rounded-xl p-3 flex flex-col gap-1.5">
              <span className="text-xs font-mono font-semibold text-rose-400 flex items-center gap-1">
                <IconMinus className="size-3.5" /> Removed ({diff.removed.length})
              </span>
              <div className="text-[11px] font-mono text-muted-foreground">
                {diff.removed.length === 0 ? (
                  <span>None</span>
                ) : (
                  diff.removed.map((r, i) => (
                    <div key={i} className="truncate">
                      • Track {r.track_index + 1}, Clip #{r.clip_index + 1}
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Moved/Trimmed */}
            <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-3 flex flex-col gap-1.5">
              <span className="text-xs font-mono font-semibold text-amber-300 flex items-center gap-1">
                <IconArrowsExchange className="size-3.5" /> Modified / Trimmed ({diff.moved.length})
              </span>
              <div className="text-[11px] font-mono text-muted-foreground">
                {diff.moved.length === 0 ? (
                  <span>None</span>
                ) : (
                  diff.moved.map(([m, rangeA, rangeB], i) => (
                    <div key={i} className="truncate">
                      • Clip #{m.clip_index + 1}: {rangeA.out_point.toFixed(1)}s → {rangeB.out_point.toFixed(1)}s
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="text-center py-8 font-mono text-xs text-muted-foreground">
          Select two distinct versions above to compute and visualize their differences.
        </div>
      )}
    </Card>
  );
}
