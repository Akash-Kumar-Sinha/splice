'use client';

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';

import {
  IconGitCompare,
  IconPlus,
  IconMinus,
  IconArrowsExchange,
  IconMovie,
  IconArrowRight,
  IconSparkles,
  IconPlayerPlay,
  IconPlayerPause,
  IconPlayerSkipBack,
  IconPlayerSkipForward,
  IconVolumeOff,
  IconVideo,
  IconChevronDown,
  IconCheck,
  IconGitBranch,
  IconFolder,
  IconTarget,
} from '@tabler/icons-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import {
  VideoPlayer,
  VideoPlayerControlBar,
  VideoPlayerPlayButton,
  VideoPlayerTimeRange,
  VideoPlayerTimeDisplay,
  VideoPlayerMuteButton,
  VideoPlayerVolumeRange,
} from '@/components/ui/video_player';

import { Spinner } from '@/components/ui/spinner';
import { ScrollArea } from '@/components/ui/scroll-area';
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

  // Group all commits by their project root tree
  const treeGroups = useMemo(() => {
    const commitMap = new Map<string, Commit>(commits.map((c) => [c.id, c]));
    const getRootId = (id: string) => {
      let curr = commitMap.get(id);
      const visited = new Set<string>();
      while (curr && curr.parent && commitMap.has(curr.parent) && !visited.has(curr.id)) {
        visited.add(curr.id);
        curr = commitMap.get(curr.parent);
      }
      return curr ? curr.id : id;
    };

    const map = new Map<string, { root: Commit; members: Commit[] }>();
    for (const c of commits) {
      const rootId = getRootId(c.id);
      const rootCommit = commitMap.get(rootId) || c;
      if (!map.has(rootId)) {
        map.set(rootId, { root: rootCommit, members: [] });
      }
      map.get(rootId)!.members.push(c);
    }
    return map;
  }, [commits]);

  // Find the project tree group that baseCommit belongs to
  const activeTreeGroup = useMemo(() => {
    if (!baseCommitId) return null;
    for (const [, group] of treeGroups) {
      if (group.members.some((m) => m.id === baseCommitId)) {
        return group;
      }
    }
    return null;
  }, [baseCommitId, treeGroups]);

  // Ensure Target Version defaults to another cut from the SAME project tree
  useEffect(() => {
    if (activeTreeGroup && activeTreeGroup.members.length > 0) {
      const isTargetInSameTree = activeTreeGroup.members.some((m) => m.id === targetCommitId);
      if (!isTargetInSameTree || targetCommitId === baseCommitId) {
        // Pick candidate: direct parent, direct child, or another version in the same tree
        const candidate =
          activeTreeGroup.members.find((m) => m.id === baseCommit?.parent) ||
          activeTreeGroup.members.find((m) => m.parent === baseCommitId) ||
          activeTreeGroup.members.find((m) => m.id !== baseCommitId) ||
          activeTreeGroup.members[0];

        if (candidate && candidate.id !== targetCommitId) {
          onSelectTarget(candidate.id);
        }
      }
    }
  }, [baseCommitId, activeTreeGroup, targetCommitId, baseCommit, onSelectTarget]);

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
    fetch(`${API_URL}/commits/${baseCommitId}/revert?mode=preview`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data) setTimelineA(data);
      })
      .catch((err) => console.error('Failed to fetch timeline A:', err));
  }, [baseCommitId]);

  // Fetch reconstructed timeline B
  useEffect(() => {
    if (!targetCommitId) {
      setTimelineB(null);
      return;
    }
    fetch(`${API_URL}/commits/${targetCommitId}/revert?mode=preview`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data) setTimelineB(data);
      })
      .catch((err) => console.error('Failed to fetch timeline B:', err));
  }, [targetCommitId]);

  const clipsA = timelineA?.tracks?.[0]?.clips || [];
  const clipsB = timelineB?.tracks?.[0]?.clips || [];

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

  const mediaHashA =
    activeClipA?.clip.media_hash ||
    clipsA[0]?.media_hash ||
    timelineA?.media_refs?.[0] ||
    baseCommit?.media_refs?.[0] ||
    baseCommit?.timeline_hash ||
    null;

  const mediaHashB =
    activeClipB?.clip.media_hash ||
    clipsB[0]?.media_hash ||
    timelineB?.media_refs?.[0] ||
    targetCommit?.media_refs?.[0] ||
    targetCommit?.timeline_hash ||
    null;


  // Two-way audio mode setter with DOM event notification
  const handleSetAudioMode = useCallback((mode: 'a' | 'b' | 'both') => {
    setAudioFocus(mode);
    if (videoRefA.current) {
      const shouldMuteA = mode === 'b';
      videoRefA.current.muted = shouldMuteA;
      if (!shouldMuteA && videoRefA.current.volume === 0) {
        videoRefA.current.volume = 1;
      }
    }
    if (videoRefB.current) {
      const shouldMuteB = mode === 'a';
      videoRefB.current.muted = shouldMuteB;
      if (!shouldMuteB && videoRefB.current.volume === 0) {
        videoRefB.current.volume = 1;
      }
    }
  }, []);

  // Sync video audio mute whenever audioFocus changes
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

  // Individual Seek for Version A
  const handleSeekA = (timeA: number) => {
    const clamped = Math.max(0, Math.min(timeA, durationA));
    handleMasterSeek(clamped);
  };

  // Individual Seek for Version B
  const handleSeekB = (timeB: number) => {
    const clamped = Math.max(0, Math.min(timeB, durationB));
    handleMasterSeek(clamped);
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

  const timeA = Math.min(masterTime, durationA);
  const timeB = Math.min(masterTime, durationB);

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
              Compare two versions simultaneously with synchronized lockstep video playback and individual visual timelines.
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
      <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] gap-4 items-stretch">
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

          <DropdownMenu>
            <DropdownMenuTrigger className="w-full bg-card hover:bg-muted/50 border border-border rounded-lg text-xs font-mono p-2 text-foreground flex items-center justify-between transition-colors outline-none focus:ring-1 focus:ring-primary cursor-pointer">
              <span className="truncate flex items-center gap-2">
                <IconGitBranch className="size-3.5 text-primary shrink-0" />
                <span className="font-semibold text-foreground truncate">
                  {baseCommit ? `${baseCommit.message} (${baseCommit.id.slice(0, 7)})` : 'Select base version...'}
                </span>
              </span>
              <IconChevronDown className="size-4 text-muted-foreground shrink-0 ml-2" />
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-[360px] max-h-72 overflow-y-auto p-1.5 rounded-2xl bg-popover/95 border border-border backdrop-blur-md shadow-2xl z-50">
              {Array.from(treeGroups.entries()).map(([rootId, group], gIdx) => (
                <React.Fragment key={`base-grp-frag-${rootId}`}>
                  {gIdx > 0 && <DropdownMenuSeparator className="my-1.5 opacity-60" />}
                  <DropdownMenuGroup>
                    <DropdownMenuLabel className="px-2.5 py-1 text-[11px] font-mono font-bold text-muted-foreground uppercase flex items-center gap-1.5">
                      <IconFolder className="size-3 text-primary" />
                      Project: {group.root.message} ({group.members.length})
                    </DropdownMenuLabel>
                    {group.members.map((c) => (
                      <DropdownMenuItem
                        key={`base-${c.id}`}
                        onClick={() => onSelectBase(c.id)}
                        className={cn(
                          "flex items-center justify-between px-2.5 py-2 rounded-xl text-xs font-mono cursor-pointer transition-colors",
                          c.id === baseCommitId ? "bg-primary/15 text-primary font-bold" : "hover:bg-accent hover:text-accent-foreground"
                        )}
                      >
                        <div className="flex flex-col truncate pr-2">
                          <span className="truncate text-foreground font-medium">{c.message}</span>
                          <span className="text-[10px] text-muted-foreground opacity-80">{c.id.slice(0, 7)} • {c.author}</span>
                        </div>
                        {c.id === baseCommitId && <IconCheck className="size-4 text-primary shrink-0 ml-1" />}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuGroup>
                </React.Fragment>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {baseCommit && (
            <div className="text-[11px] font-mono text-muted-foreground truncate">
              {baseCommit.author} • {clipsA.length || baseCommit.media_refs.length} media segment(s) • {durationA.toFixed(1)}s
            </div>
          )}
        </div>

        {/* Radial Separator Vertical */}
        <div className="hidden md:flex items-center justify-center px-0.5">
          <div className="w-px h-full min-h-[70px] bg-gradient-to-b from-transparent via-border to-transparent [mask-image:radial-gradient(ellipse_at_center,black_50%,transparent_100%)]" />
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

          <DropdownMenu>
            <DropdownMenuTrigger className="w-full bg-card hover:bg-muted/50 border border-border rounded-lg text-xs font-mono p-2 text-foreground flex items-center justify-between transition-colors outline-none focus:ring-1 focus:ring-primary cursor-pointer">
              <span className="truncate flex items-center gap-2">
                <IconTarget className="size-3.5 text-primary shrink-0" />
                <span className="font-semibold text-foreground truncate">
                  {targetCommit ? `${targetCommit.message} (${targetCommit.id.slice(0, 7)})` : 'Select target version...'}
                </span>
              </span>
              <IconChevronDown className="size-4 text-muted-foreground shrink-0 ml-2" />
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-[360px] max-h-72 overflow-y-auto p-1.5 rounded-2xl bg-popover/95 border border-border backdrop-blur-md shadow-2xl z-50">
              {/* Same Project Tree (Recommended) */}
              {activeTreeGroup && (
                <DropdownMenuGroup>
                  <DropdownMenuLabel className="px-2.5 py-1 text-[11px] font-mono font-bold text-primary uppercase flex items-center gap-1.5">
                    <IconTarget className="size-3 text-primary" />
                    🎯 Same Project: {activeTreeGroup.root.message}
                  </DropdownMenuLabel>
                  {activeTreeGroup.members.map((c) => (
                    <DropdownMenuItem
                      key={`target-same-${c.id}`}
                      onClick={() => onSelectTarget(c.id)}
                      className={cn(
                        "flex items-center justify-between px-2.5 py-2 rounded-xl text-xs font-mono cursor-pointer transition-colors",
                        c.id === targetCommitId ? "bg-primary/15 text-primary font-bold" : "hover:bg-accent hover:text-accent-foreground"
                      )}
                    >
                      <div className="flex flex-col truncate pr-2">
                        <span className="truncate text-foreground font-medium flex items-center gap-1.5">
                          {c.message}
                          {c.id === baseCommitId && (
                            <Badge variant="outline" className="text-[9px] py-0 px-1 font-mono text-muted-foreground">
                              Base (A)
                            </Badge>
                          )}
                        </span>
                        <span className="text-[10px] text-muted-foreground opacity-80">{c.id.slice(0, 7)} • {c.author}</span>
                      </div>
                      {c.id === targetCommitId && <IconCheck className="size-4 text-primary shrink-0 ml-1" />}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuGroup>
              )}

              {/* Other Projects */}
              {Array.from(treeGroups.entries())
                .filter(([rootId]) => rootId !== activeTreeGroup?.root.id)
                .map(([rootId, group]) => (
                  <React.Fragment key={`target-other-frag-${rootId}`}>
                    <DropdownMenuSeparator className="my-1.5 opacity-60" />
                    <DropdownMenuGroup>
                      <DropdownMenuLabel className="px-2.5 py-1 text-[11px] font-mono font-bold text-muted-foreground uppercase flex items-center gap-1.5">
                        <IconFolder className="size-3 text-muted-foreground" />
                        Other Project: {group.root.message}
                      </DropdownMenuLabel>
                      {group.members.map((c) => (
                        <DropdownMenuItem
                          key={`target-other-opt-${c.id}`}
                          onClick={() => onSelectTarget(c.id)}
                          className={cn(
                            "flex items-center justify-between px-2.5 py-2 rounded-xl text-xs font-mono cursor-pointer transition-colors",
                            c.id === targetCommitId ? "bg-primary/15 text-primary font-bold" : "hover:bg-accent hover:text-accent-foreground"
                          )}
                        >
                          <div className="flex flex-col truncate pr-2">
                            <span className="truncate text-foreground font-medium">{c.message}</span>
                            <span className="text-[10px] text-muted-foreground opacity-80">{c.id.slice(0, 7)} • {c.author}</span>
                          </div>
                          {c.id === targetCommitId && <IconCheck className="size-4 text-primary shrink-0 ml-1" />}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuGroup>
                  </React.Fragment>
                ))}
            </DropdownMenuContent>
          </DropdownMenu>




          {targetCommit && (
            <div className="text-[11px] font-mono text-muted-foreground truncate">
              {targetCommit.author} • {clipsB.length || targetCommit.media_refs.length} media segment(s) • {durationB.toFixed(1)}s
            </div>
          )}
        </div>
      </div>

      {/* Synchronized Side-by-Side Dual Video Monitors with Individual Timelines */}
      <div className="bg-background/80 border border-border rounded-2xl p-4 flex flex-col gap-4 shadow-inner">
        <div className="flex items-center justify-between text-xs font-mono text-muted-foreground border-b border-border pb-2">
          <div className="flex items-center gap-2">
            <IconMovie className="size-4 text-primary" />
            <span className="font-semibold text-foreground">Synchronized Dual Video Comparison & Individual Timelines</span>
          </div>

          {/* Audio Switcher */}
          <div className="flex items-center gap-1.5 bg-muted/40 p-1 rounded-lg border border-border">
            <span className="text-[10px] text-muted-foreground mr-1 font-semibold">Audio:</span>
            <Button
              variant={audioFocus === 'a' ? 'default' : 'ghost'}
              size="xs"
              onClick={() => handleSetAudioMode('a')}
              className="text-[10px] h-5 px-2 font-mono font-bold"
              title="Listen to Version A only (Mute B)"
            >
              Audio A
            </Button>
            <Button
              variant={audioFocus === 'b' ? 'default' : 'ghost'}
              size="xs"
              onClick={() => handleSetAudioMode('b')}
              className="text-[10px] h-5 px-2 font-mono font-bold"
              title="Listen to Version B only (Mute A)"
            >
              Audio B
            </Button>
            <Button
              variant={audioFocus === 'both' ? 'default' : 'ghost'}
              size="xs"
              onClick={() => handleSetAudioMode('both')}
              className="text-[10px] h-5 px-2 font-mono font-bold"
              title="Play audio from both versions simultaneously"
            >
              Both
            </Button>
          </div>
        </div>

        {/* Dual Video Grid with Embedded Individual Timelines */}
        <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] gap-4 items-stretch">
          {/* Monitor A (Base) + Individual Timeline */}
          <div className="flex flex-col gap-2.5 bg-card/40 p-3.5 rounded-xl border border-border">
            <div className="flex items-center justify-between text-xs font-mono">
              <Badge variant="outline" className="text-[10px] truncate max-w-[200px]">
                Version A: {baseCommit?.message || 'Base'}
              </Badge>
              <Badge variant="secondary" className="font-mono text-[10px]">
                {timeA.toFixed(2)}s / {durationA.toFixed(1)}s
              </Badge>
            </div>

            {/* Video Box */}
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
                    muted={audioFocus === 'b'}
                    suppressHydrationWarning
                    onVolumeChange={(e) => {
                      const vidA = e.currentTarget;
                      const isAMuted = vidA.muted || vidA.volume === 0;
                      const vidB = videoRefB.current;
                      const isBMuted = vidB ? (vidB.muted || vidB.volume === 0) : true;
                      if (!isAMuted && !isBMuted) {
                        setAudioFocus('both');
                      } else if (!isAMuted) {
                        setAudioFocus('a');
                      } else if (!isBMuted) {
                        setAudioFocus('b');
                      }
                    }}
                    onLoadedMetadata={() => {
                      if (videoRefA.current) {
                        videoRefA.current.muted = audioFocus === 'b';
                        if (activeClipA) {
                          videoRefA.current.currentTime = activeClipA.videoTime;
                        }
                        if (isPlaying) {
                          videoRefA.current.play().catch(console.warn);
                        }
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
                <div className="text-muted-foreground font-mono text-xs flex flex-col items-center gap-1">
                  <IconVideo className="size-6 text-muted-foreground/40" />
                  <span>No media for Version A</span>
                </div>
              )}

              {audioFocus === 'b' && (
                <button
                  onClick={() => handleSetAudioMode('a')}
                  title="Click to unmute Audio A"
                  className="absolute top-2 right-2 bg-black/80 hover:bg-black text-amber-300 rounded-md px-1.5 py-0.5 z-10 flex items-center gap-1 text-[10px] font-mono border border-border/50 cursor-pointer shadow transition-all"
                >
                  <IconVolumeOff className="size-3 text-amber-300" />
                  <span>Muted</span>
                </button>
              )}
            </div>

            {/* Version A Individual Timeline Track */}
            <div className="flex flex-col gap-1.5 pt-1">
              <div className="flex items-center justify-between text-[11px] font-mono text-muted-foreground">
                <span className="font-semibold text-foreground flex items-center gap-1">
                  <span>Timeline A:</span>
                  <span className="text-[10px] opacity-70">({clipsA.length} clips)</span>
                </span>
                <span className="text-[10px] font-mono">
                  {activeClipA ? activeClipA.clip.name : 'Finished'}
                </span>
              </div>

              {/* Visual Multi-Clip Blocks for Version A */}
              <div className="relative h-10 bg-background border border-border rounded-lg p-1 flex gap-1 items-center overflow-hidden">
                {clipsA.length === 0 ? (
                  <div className="w-full text-center text-[10px] font-mono text-muted-foreground">
                    Empty timeline
                  </div>
                ) : (
                  clipsA.map((clip, idx) => {
                    const widthPct = Math.max(5, (clip.duration / durationA) * 100);
                    const isActive = activeClipA?.clip.id === clip.id;
                    const isRemoved = diff?.removed.some((r) => r.clip_index === idx);

                    return (
                      <div
                        key={`clip-a-${idx}`}
                        onClick={() => handleSeekA(clip.start_time)}
                        style={{ width: `${widthPct}%` }}
                        className={cn(
                          'h-full rounded-md px-1.5 py-0.5 flex flex-col justify-center text-[10px] font-mono border cursor-pointer transition-all truncate select-none',
                          isActive
                            ? 'bg-primary/25 border-primary text-foreground font-bold shadow-sm ring-1 ring-primary/40'
                            : isRemoved
                              ? 'bg-rose-500/20 border-rose-500/40 text-rose-300'
                              : 'bg-muted/40 border-border text-muted-foreground hover:bg-muted/70'
                        )}
                        title={`Click to jump: ${clip.name} (${clip.duration.toFixed(1)}s)`}
                      >
                        <span className="truncate leading-tight text-[10px]">{clip.name}</span>
                        <span className="text-[8px] opacity-70 leading-tight">
                          {clip.start_time.toFixed(1)}s - {(clip.start_time + clip.duration).toFixed(1)}s
                        </span>
                      </div>
                    );
                  })
                )}

                {/* Playhead marker indicator on Timeline A */}
                {durationA > 0 && (
                  <div
                    style={{ left: `${(timeA / durationA) * 100}%` }}
                    className="absolute top-0 bottom-0 w-0.5 bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.8)] z-10 pointer-events-none transition-all duration-75"
                  />
                )}
              </div>

              {/* Scrubber slider for Timeline A */}
              <div className="flex items-center gap-2 pt-1">
                <input
                  type="range"
                  min="0"
                  max={durationA || 1}
                  step="0.05"
                  value={timeA}
                  onChange={(e) => handleSeekA(parseFloat(e.target.value))}
                  className="flex-1 h-2 bg-muted rounded-lg appearance-none cursor-pointer accent-primary hover:accent-primary/80 transition-all"
                />
                <span className="text-[10px] font-mono text-muted-foreground w-16 text-right tabular-nums">
                  {timeA.toFixed(1)}s / {durationA.toFixed(1)}s
                </span>
              </div>
            </div>
          </div>

          {/* Radial Separator Vertical */}
          <div className="hidden md:flex items-center justify-center px-0.5">
            <div className="w-px h-full min-h-[380px] bg-gradient-to-b from-transparent via-border to-transparent [mask-image:radial-gradient(ellipse_at_center,black_60%,transparent_100%)]" />
          </div>

          {/* Monitor B (Target) + Individual Timeline */}
          <div className="flex flex-col gap-2.5 bg-card/40 p-3.5 rounded-xl border border-border">

            <div className="flex items-center justify-between text-xs font-mono">
              <Badge variant="default" className="text-[10px] truncate max-w-[200px]">
                Version B: {targetCommit?.message || 'Target'}
              </Badge>
              <Badge variant="default" className="font-mono text-[10px] bg-primary text-primary-foreground font-bold">
                {timeB.toFixed(2)}s / {durationB.toFixed(1)}s
              </Badge>
            </div>

            {/* Video Box */}
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
                    muted={audioFocus === 'a'}
                    suppressHydrationWarning
                    onVolumeChange={(e) => {
                      const vidB = e.currentTarget;
                      const isBMuted = vidB.muted || vidB.volume === 0;
                      const vidA = videoRefA.current;
                      const isAMuted = vidA ? (vidA.muted || vidA.volume === 0) : true;
                      if (!isAMuted && !isBMuted) {
                        setAudioFocus('both');
                      } else if (!isBMuted) {
                        setAudioFocus('b');
                      } else if (!isAMuted) {
                        setAudioFocus('a');
                      }
                    }}
                    onLoadedMetadata={() => {
                      if (videoRefB.current) {
                        videoRefB.current.muted = audioFocus === 'a';
                        if (activeClipB) {
                          videoRefB.current.currentTime = activeClipB.videoTime;
                        }
                        if (isPlaying) {
                          videoRefB.current.play().catch(console.warn);
                        }
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
                <div className="text-muted-foreground font-mono text-xs flex flex-col items-center gap-1">
                  <IconVideo className="size-6 text-muted-foreground/40" />
                  <span>No media for Version B</span>
                </div>
              )}

              {audioFocus === 'a' && (
                <button
                  onClick={() => handleSetAudioMode('b')}
                  title="Click to unmute Audio B"
                  className="absolute top-2 right-2 bg-black/80 hover:bg-black text-amber-300 rounded-md px-1.5 py-0.5 z-10 flex items-center gap-1 text-[10px] font-mono border border-border/50 cursor-pointer shadow transition-all"
                >
                  <IconVolumeOff className="size-3 text-amber-300" />
                  <span>Muted</span>
                </button>
              )}
            </div>


            {/* Version B Individual Timeline Track */}
            <div className="flex flex-col gap-1.5 pt-1">
              <div className="flex items-center justify-between text-[11px] font-mono text-muted-foreground">
                <span className="font-semibold text-primary flex items-center gap-1">
                  <span>Timeline B:</span>
                  <span className="text-[10px] opacity-70">({clipsB.length} clips)</span>
                </span>
                <span className="text-[10px] font-mono text-primary font-bold">
                  {activeClipB ? activeClipB.clip.name : 'Finished'}
                </span>
              </div>

              {/* Visual Multi-Clip Blocks for Version B */}
              <div className="relative h-10 bg-background border border-border rounded-lg p-1 flex gap-1 items-center overflow-hidden">
                {clipsB.length === 0 ? (
                  <div className="w-full text-center text-[10px] font-mono text-muted-foreground">
                    Empty timeline
                  </div>
                ) : (
                  clipsB.map((clip, idx) => {
                    const widthPct = Math.max(5, (clip.duration / durationB) * 100);
                    const isActive = activeClipB?.clip.id === clip.id;
                    const isAdded = diff?.added.some((a) => a.clip_index === idx);
                    const isMoved = diff?.moved.some(([m]) => m.clip_index === idx);

                    return (
                      <div
                        key={`clip-b-${idx}`}
                        onClick={() => handleSeekB(clip.start_time)}
                        style={{ width: `${widthPct}%` }}
                        className={cn(
                          'h-full rounded-md px-1.5 py-0.5 flex flex-col justify-center text-[10px] font-mono border cursor-pointer transition-all truncate select-none',
                          isActive
                            ? 'bg-primary/30 border-primary text-foreground font-bold shadow-sm ring-1 ring-primary'
                            : isAdded
                              ? 'bg-emerald-500/20 border-emerald-500/60 text-emerald-300'
                              : isMoved
                                ? 'bg-amber-500/20 border-amber-500/60 text-amber-300'
                                : 'bg-muted/40 border-border text-muted-foreground hover:bg-muted/70'
                        )}
                        title={`Click to jump: ${clip.name} (${clip.duration.toFixed(1)}s)`}
                      >
                        <span className="truncate leading-tight text-[10px]">{clip.name}</span>
                        <span className="text-[8px] opacity-70 leading-tight">
                          {clip.start_time.toFixed(1)}s - {(clip.start_time + clip.duration).toFixed(1)}s
                        </span>
                      </div>
                    );
                  })
                )}

                {/* Playhead marker indicator on Timeline B */}
                {durationB > 0 && (
                  <div
                    className="absolute top-0 bottom-0 w-0.5 bg-primary pointer-events-none z-10 shadow-[0_0_8px_rgba(255,255,255,0.8)]"
                    style={{ left: `${(timeB / durationB) * 100}%` }}
                  />
                )}
              </div>

              {/* Version B Individual Scrubber */}
              <div className="flex items-center gap-2 pt-1">
                <input
                  type="range"
                  min="0"
                  max={durationB || 1}
                  step="0.05"
                  value={timeB}
                  onChange={(e) => handleSeekB(parseFloat(e.target.value))}
                  className="flex-1 h-2 bg-muted rounded-lg appearance-none cursor-pointer accent-primary hover:accent-primary/80 transition-all"
                />
                <span className="text-[10px] font-mono text-muted-foreground w-16 text-right tabular-nums">
                  {timeB.toFixed(1)}s / {durationB.toFixed(1)}s
                </span>
              </div>
            </div>
          </div>
        </div>


        {/* Master Synced Playback Transport Controls */}
        <div className="flex flex-col gap-2 pt-3 border-t border-border/50">
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

      {/* Detailed Diff Inspection Overview */}
      {loading ? (
        <div className="py-12 flex items-center justify-center font-mono text-xs text-muted-foreground gap-2">
          <Spinner className="size-5 text-primary" />
          Computing Myers timeline diff...
        </div>
      ) : diff ? (

        <div className="flex flex-col gap-4">
          {/* Comparison Delta Overview */}
          <div className="flex items-center justify-center my-1 text-muted-foreground text-xs font-mono gap-2">
            <Separator className="flex-1" />
            <span className="flex items-center gap-1 text-primary bg-background px-3 py-1 rounded-full border border-border">
              <IconArrowRight className="size-3.5" /> Diff Breakdown
            </span>
            <Separator className="flex-1" />
          </div>

          {/* Detailed Changes List */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-1">
            {/* Added */}
            <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-xl p-3 flex flex-col gap-1.5">
              <span className="text-xs font-mono font-semibold text-emerald-400 flex items-center gap-1">
                <IconPlus className="size-3.5" /> Added Clips ({diff.added.length})
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
                <IconMinus className="size-3.5" /> Removed Clips ({diff.removed.length})
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
