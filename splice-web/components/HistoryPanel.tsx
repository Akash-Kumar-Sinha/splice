'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  IconHistory,
  IconSearch,
  IconArrowBackUp,
  IconRefresh,
  IconClock,
  IconUser,
  IconMovie,
  IconCode,
  IconStar,
  IconStarFilled,
  IconTag,
  IconFilter,
  IconPlus,
  IconGitCompare,
  IconGitBranch,
  IconList,
  IconDeviceFloppy,
  IconPlayerPlay,
  IconPlayerPause,
  IconPlayerSkipBack,
  IconPlayerSkipForward,
  IconVolume,
  IconVolumeOff,
  IconVideo,
  IconChevronDown,
  IconChevronRight,
  IconSparkles,
  IconDownload,
  IconGitMerge,
  IconSquare,
  IconSquareCheckFilled,
} from '@tabler/icons-react';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
} from '@/components/ui/sidebar';
import {
  VideoPlayer,
  VideoPlayerControlBar,
  VideoPlayerPlayButton,
  VideoPlayerTimeRange,
  VideoPlayerTimeDisplay,
  VideoPlayerMuteButton,
  VideoPlayerVolumeRange,
  VideoPlayerSeekBackwardButton,
  VideoPlayerSeekForwardButton,
} from '@/components/ui/video_player';
import { Spinner } from '@/components/ui/spinner';
import { ScrollArea } from '@/components/ui/scroll-area';
import DiffInspector from './DiffInspector';
import ExportDialog from './ExportDialog';
import { Tree, Folder, File } from '@/components/ui/tree';




import { cn } from '@/lib/utils';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

function formatDate(isoStr: string): string {
  try {
    const d = new Date(isoStr);
    return isNaN(d.getTime()) ? isoStr.slice(0, 19).replace('T', ' ') : d.toLocaleString([], {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return isoStr;
  }
}


export interface Commit {
  id: string;
  parent: string | null;
  timestamp: string;
  author: string;
  message: string;
  timeline_hash: string;
  media_refs: string[];
  tags: string[];
}

export interface CommitTreeNode {
  commit: Commit;
  tags: string[];
  depth: number;
  children: CommitTreeNode[];
}

export interface TimelineClip {
  id: string;
  name: string;
  media_hash: string;
  start_time: number;
  duration: number;
  track_index: number;
}

export interface TimelineTrack {
  id: string;
  name: string;
  track_type: string;
  clips: TimelineClip[];
}

export interface Timeline {
  commit_id: string;
  parent_id: string | null;
  timeline_hash: string;
  message: string;
  author: string;
  timestamp: string;
  tracks: TimelineTrack[];
  media_refs: string[];
  mode: 'preview' | 'restore';
  is_head: boolean;
  total_duration: number;
}

export function useRevert(id: string) {
  return async (mode: 'preview' | 'restore'): Promise<Timeline> => {
    const res = await fetch(`${API_URL}/commits/${id}/revert?mode=${mode}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    if (!res.ok) {
      throw new Error(`Failed to ${mode} commit: ${res.statusText}`);
    }
    return res.json();
  };
}

interface HistoryPanelProps {
  initialCommits: Commit[];
  onOpenInEditor?: (timeline: Timeline) => void;
}

export default function HistoryPanel({ initialCommits, onOpenInEditor }: HistoryPanelProps) {
  const [commits, setCommits] = useState<Commit[]>(initialCommits);
  const [treeNodes, setTreeNodes] = useState<CommitTreeNode[]>([]);
  const [viewMode, setViewMode] = useState<'tree' | 'flat'>('tree');
  const [selectedCommitId, setSelectedCommitId] = useState<string | null>(
    initialCommits.length > 0 ? initialCommits[0].id : null
  );
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [timeline, setTimeline] = useState<Timeline | null>(null);

  const [loadingTimeline, setLoadingTimeline] = useState<boolean>(false);
  const [activeHeadId, setActiveHeadId] = useState<string | null>(
    initialCommits.length > 0 ? initialCommits[0].id : null
  );
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [starredOnly, setStarredOnly] = useState<boolean>(false);
  const [selectedTagFilter, setSelectedTagFilter] = useState<string | null>(null);
  const [newTagInput, setNewTagInput] = useState<string>('');
  const [showAddTagForId, setShowAddTagForId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'timeline' | 'json'>('timeline');
  const [showTechDetails, setShowTechDetails] = useState<boolean>(false);

  // Inspector Video Player Monitor state
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [videoTime, setVideoTime] = useState<number>(0);
  const [videoDuration, setVideoDuration] = useState<number>(10);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [volume, setVolume] = useState<number>(1);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  // Visual Diff state
  const [isDiffMode, setIsDiffMode] = useState<boolean>(false);
  const [diffBaseId, setDiffBaseId] = useState<string | null>(
    initialCommits.length > 1 ? initialCommits[1].id : initialCommits[0]?.id || null
  );
  const [diffTargetId, setDiffTargetId] = useState<string | null>(
    initialCommits.length > 0 ? initialCommits[0].id : null
  );

  // Branch / Duplicate Version state
  const [showSaveAsModal, setShowSaveAsModal] = useState<boolean>(false);
  const [saveAsMessage, setSaveAsMessage] = useState<string>('Alternate version cut');
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  // Multi-Select & Squash state
  const [selectedForSquash, setSelectedForSquash] = useState<string[]>([]);
  const [showSquashModal, setShowSquashModal] = useState<boolean>(false);
  const [squashMessage, setSquashMessage] = useState<string>('');
  const [isSquashing, setIsSquashing] = useState<boolean>(false);

  // Full-Res Export Dialog state
  const [exportTarget, setExportTarget] = useState<{ id: string; message: string } | null>(null);


  const handleToggleSelectForSquash = (commitId: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setSelectedForSquash((prev) =>
      prev.includes(commitId) ? prev.filter((id) => id !== commitId) : [...prev, commitId]
    );
  };

  const handleOpenSquashModal = () => {
    if (selectedForSquash.length < 2) return;
    const selectedCommits = commits.filter((c) => selectedForSquash.includes(c.id));
    selectedCommits.sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );
    const msgs = selectedCommits.map((c) => `- ${c.message}`).join('\n');
    setSquashMessage(`Squashed ${selectedCommits.length} versions:\n${msgs}`);
    setShowSquashModal(true);
  };

  const handleConfirmSquash = async () => {
    if (selectedForSquash.length < 2 || !squashMessage.trim()) return;
    setIsSquashing(true);
    try {
      const res = await fetch(`${API_URL}/commits/squash`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          commit_ids: selectedForSquash,
          message: squashMessage.trim(),
        }),
      });

      if (!res.ok) {
        throw new Error(`Squash failed with HTTP ${res.status}`);
      }

      const newId: string = await res.json();
      setStatusMessage(`Squashed ${selectedForSquash.length} versions into one`);
      setSelectedForSquash([]);
      setShowSquashModal(false);
      await refreshAll();
      await handleSelectCommit(newId, 'preview');
    } catch (err) {
      console.error('Error during squash:', err);
      setStatusMessage('Error collapsing versions');
    } finally {
      setIsSquashing(false);
    }
  };

  const fetchCommits = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/commits`, { cache: 'no-store' });
      if (res.ok) {
        const data: Commit[] = await res.json();
        setCommits(data);
        if (data.length > 0) {
          setActiveHeadId(data[0].id);
        }
      }
    } catch (err) {
      console.error('Error refreshing commits:', err);
    }
  }, []);


  const fetchTree = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/commits/tree`, { cache: 'no-store' });
      if (res.ok) {
        const data: CommitTreeNode[] = await res.json();
        setTreeNodes(data);
      }
    } catch (err) {
      console.error('Error fetching tree:', err);
    }
  }, []);

  const refreshAll = useCallback(async () => {
    await fetchCommits();
    await fetchTree();
  }, [fetchCommits, fetchTree]);

  useEffect(() => {
    setCommits(initialCommits);
  }, [initialCommits]);

  useEffect(() => {
    refreshAll();
  }, [refreshAll]);


  // Video volume sync
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.muted = isMuted;
      videoRef.current.volume = volume;
    }
  }, [isMuted, volume]);

  const handleSelectCommit = async (commitId: string, mode: 'preview' | 'restore' = 'preview') => {
    setSelectedCommitId(commitId);
    setLoadingTimeline(true);
    setStatusMessage(null);
    setIsPlaying(false);
    setVideoTime(0);

    try {
      const revertFn = useRevert(commitId);
      const data = await revertFn(mode);
      setTimeline(data);
      if (mode === 'restore') {
        setActiveHeadId(commitId);
        setStatusMessage(`Active working project set to "${data.message}"`);
        await refreshAll();
      }
    } catch (err) {
      console.error(`Error during ${mode}:`, err);
      setStatusMessage(`Error loading version`);
    } finally {
      setLoadingTimeline(false);
    }
  };

  const primaryTrack = timeline?.tracks[0];
  const clips = primaryTrack?.clips || [];

  const getActiveHistoryClipInfo = useCallback(
    (time: number) => {
      for (const clip of clips) {
        if (time >= clip.start_time && time < clip.start_time + clip.duration) {
          const offset = time - clip.start_time;
          return { clip, offset, videoTime: offset };
        }
      }
      if (clips.length > 0) {
        const last = clips[clips.length - 1];
        if (time >= last.start_time + last.duration) {
          return { clip: last, offset: last.duration, videoTime: last.duration };
        }
        return { clip: clips[0], offset: 0, videoTime: 0 };
      }
      return null;
    },
    [clips]
  );

  const activeHistoryClip = getActiveHistoryClipInfo(videoTime);

  const togglePlay = () => {
    if (!videoRef.current) return;
    if (isPlaying) {
      videoRef.current.pause();
      setIsPlaying(false);
    } else {
      if (videoTime >= (timeline?.total_duration || videoDuration) - 0.1) {
        handleSeek(0);
      }
      videoRef.current.play().catch(console.warn);
      setIsPlaying(true);
    }
  };

  const handleSeek = (time: number) => {
    const maxDur = timeline?.total_duration || videoDuration;
    const clamped = Math.max(0, Math.min(time, maxDur));
    setVideoTime(clamped);
    const info = getActiveHistoryClipInfo(clamped);
    if (videoRef.current && info) {
      videoRef.current.currentTime = info.videoTime;
    }
  };


  const handleOpenInEditor = () => {
    if (!timeline) return;
    if (onOpenInEditor) {
      onOpenInEditor(timeline);
    } else {
      handleSelectCommit(timeline.commit_id, 'restore');
    }
  };

  const handleSaveAsNewVersion = async () => {
    if (!selectedCommitId || !saveAsMessage.trim()) return;

    setStatusMessage('Creating duplicate version branch...');
    try {
      const res = await fetch(`${API_URL}/commits/save-as`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: selectedCommitId,
          message: saveAsMessage.trim(),
        }),
      });

      if (!res.ok) {
        throw new Error(`Failed to save as new version: ${res.statusText}`);
      }

      const newId: string = await res.json();
      setStatusMessage(`Created version "${saveAsMessage.trim()}"`);
      setShowSaveAsModal(false);
      await refreshAll();
      await handleSelectCommit(newId, 'preview');
    } catch (err) {
      console.error('Error in save as new version:', err);
      setStatusMessage('Error creating new version');
    }
  };

  const handleAddTag = async (commitId: string, label: string) => {
    if (!label.trim()) return;
    try {
      const res = await fetch(`${API_URL}/commits/${commitId}/tags`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label: label.trim() }),
      });
      if (res.ok) {
        setNewTagInput('');
        setShowAddTagForId(null);
        setStatusMessage(`Tagged as "${label}"`);
        await refreshAll();
      }
    } catch (err) {
      console.error('Error adding tag:', err);
    }
  };

  const handleRemoveTag = async (commitId: string, label: string) => {
    try {
      const res = await fetch(
        `${API_URL}/commits/${commitId}/tags/${encodeURIComponent(label)}`,
        {
          method: 'DELETE',
        }
      );
      if (res.ok) {
        setStatusMessage(`Removed tag "${label}"`);
        await refreshAll();
      }
    } catch (err) {
      console.error('Error removing tag:', err);
    }
  };

  const handleToggleStar = async (commit: Commit) => {
    const isStarred = commit.tags?.includes('Picture Lock') || commit.tags?.includes('Starred');
    if (isStarred) {
      if (commit.tags?.includes('Picture Lock')) {
        await handleRemoveTag(commit.id, 'Picture Lock');
      }
      if (commit.tags?.includes('Starred')) {
        await handleRemoveTag(commit.id, 'Starred');
      }
    } else {
      await handleAddTag(commit.id, 'Picture Lock');
    }
  };

  const [isDownloading, setIsDownloading] = useState<boolean>(false);

  const handleDownloadCommitVideo = async (commitId: string, message: string) => {

    setIsDownloading(true);
    try {
      const res = await fetch(`${API_URL}/commits/${commitId}/export`);
      if (!res.ok) {
        throw new Error(`Export failed with HTTP ${res.status}`);
      }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `splice_${message.replace(/[^a-zA-Z0-9_-]/g, '_')}_${commitId.slice(0, 6)}.mp4`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      setStatusMessage('Video downloaded successfully!');
    } catch (err: any) {
      console.error('Download error:', err);
      alert(`Download failed: ${err.message || err}`);
    } finally {
      setIsDownloading(false);
    }
  };

  const handleOpenDiffWithCommit = (commitId: string) => {
    const commitMap = new Map<string, Commit>(commits.map((c) => [c.id, c]));
    const targetCommit = commitMap.get(commitId);

    // Find root ID of this commit's tree
    let rootId = commitId;
    let curr = targetCommit;
    const visited = new Set<string>();
    while (curr && curr.parent && commitMap.has(curr.parent) && !visited.has(curr.id)) {
      visited.add(curr.id);
      curr = commitMap.get(curr.parent);
    }
    if (curr) rootId = curr.id;

    // Filter all commits belonging to the SAME project tree
    const sameTreeCommits = commits.filter((c) => {
      let rId = c.id;
      let walk: Commit | undefined = c;
      const v = new Set<string>();
      while (walk && walk.parent && commitMap.has(walk.parent) && !v.has(walk.id)) {
        v.add(walk.id);
        walk = commitMap.get(walk.parent);
      }
      if (walk) rId = walk.id;
      return rId === rootId;
    });

    const otherInSameTree =
      (targetCommit?.parent && commitMap.get(targetCommit.parent)) ||
      sameTreeCommits.find((c) => c.parent === commitId) ||
      sameTreeCommits.find((c) => c.id !== commitId) ||
      targetCommit;

    setDiffBaseId(commitId);
    setDiffTargetId(otherInSameTree ? otherInSameTree.id : commitId);
    setIsDiffMode(true);
  };



  useEffect(() => {
    if (selectedCommitId) {
      handleSelectCommit(selectedCommitId, 'preview');
    }
  }, []);

  const allUniqueTags = Array.from(new Set(commits.flatMap((c) => c.tags || [])));

  const filteredCommits = commits.filter((c) => {
    const matchesSearch =
      c.message.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.author.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.tags?.some((t) => t.toLowerCase().includes(searchQuery.toLowerCase()));

    const isStarred =
      c.tags?.includes('Picture Lock') ||
      c.tags?.includes("Director's Cut") ||
      c.tags?.includes('Starred') ||
      (c.tags && c.tags.length > 0);

    const matchesStarred = starredOnly ? isStarred : true;
    const matchesTagFilter = selectedTagFilter ? c.tags?.includes(selectedTagFilter) : true;

    return matchesSearch && matchesStarred && matchesTagFilter;
  });

  const selectedCommit = commits.find((c) => c.id === selectedCommitId);
  const activeMediaHash = timeline?.media_refs[0] || selectedCommit?.media_refs[0] || null;

  const [collapsedNodeIds, setCollapsedNodeIds] = useState<Set<string>>(new Set());

  const toggleCollapseNode = (nodeId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setCollapsedNodeIds((prev) => {
      const next = new Set(prev);
      if (next.has(nodeId)) {
        next.delete(nodeId);
      } else {
        next.add(nodeId);
      }
      return next;
    });
  };

  const handleCollapseAll = () => {
    const allParentIds = new Set<string>();
    const collectParentIds = (node: CommitTreeNode) => {
      if (node.children && node.children.length > 0) {
        allParentIds.add(node.commit.id);
        node.children.forEach(collectParentIds);
      }
    };
    treeNodes.forEach(collectParentIds);
    setCollapsedNodeIds(allParentIds);
  };

  const handleExpandAll = () => {
    setCollapsedNodeIds(new Set());
  };

  // Render individual tree node recursively with clean L-turn connector
  const renderTreeNode = (node: CommitTreeNode, parentId: string | null = null) => {
    const commit = node.commit;
    const isSelected = selectedCommitId === commit.id;
    const isSelectedForSquash = selectedForSquash.includes(commit.id);
    const isHead = activeHeadId === commit.id;
    const hasChildren = node.children && node.children.length > 0;
    const isCollapsed = collapsedNodeIds.has(node.commit.id);
    const hasStarTag =
      node.tags?.includes('Picture Lock') ||
      node.tags?.includes("Director's Cut") ||
      node.tags?.includes('Starred');

    const isLineHighlighted =
      hoveredNodeId === commit.id ||
      (parentId !== null && hoveredNodeId === parentId) ||
      isSelected ||
      (parentId !== null && selectedCommitId === parentId);

    const isParentHighlighted =
      isSelected ||
      hoveredNodeId === commit.id ||
      (hasChildren &&
        node.children.some(
          (c) =>
            c.commit.id === hoveredNodeId ||
            c.commit.id === selectedCommitId
        ));

    return (
      <div key={node.commit.id} className="flex flex-col w-full relative">
        {/* Commit Item Row */}
        <div
          onMouseEnter={() => setHoveredNodeId(node.commit.id)}
          onMouseLeave={() => setHoveredNodeId((curr) => curr === node.commit.id ? null : curr)}
          className="flex items-center gap-1.5 w-full py-0.5 relative z-10"
        >
          {/* L-shaped turn arrow connector (└──>) emerging directly from parent arrow line */}
          {parentId !== null && (
            <div className="absolute -left-3.5 -top-1 bottom-0 w-3.5 pointer-events-none z-0">
              {/* Vertical line descending from parent arrow down to center */}
              <div
                className={cn(
                  'absolute left-0 top-0 h-[calc(50%+4px)] w-px transition-colors duration-150',
                  isLineHighlighted
                    ? 'bg-primary shadow-[0_0_8px_rgba(var(--primary),0.8)]'
                    : 'bg-border/30'
                )}
              />
              {/* Horizontal turn arm into this node */}
              <div
                className={cn(
                  'absolute left-0 top-[calc(50%+3px)] w-3 h-px transition-colors duration-150',
                  isLineHighlighted
                    ? 'bg-primary shadow-[0_0_8px_rgba(var(--primary),0.8)]'
                    : 'bg-border/30'
                )}
              />
              {/* Rightward arrow pointer tip */}
              <div
                className={cn(
                  'absolute right-0 top-[calc(50%+1.5px)] size-1 border-t border-r rotate-45 transition-colors duration-150',
                  isLineHighlighted
                    ? 'border-primary shadow-[0_0_8px_rgba(var(--primary),0.8)]'
                    : 'border-border/40'
                )}
              />
            </div>
          )}


          {/* Collapsible toggle for branches with children */}
          {hasChildren ? (
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={(e) => toggleCollapseNode(node.commit.id, e)}
              className={cn(
                'size-5 shrink-0 rounded-md transition-all',
                isParentHighlighted
                  ? 'text-primary bg-primary/20 ring-1 ring-primary/40'
                  : isCollapsed
                  ? 'text-muted-foreground hover:text-foreground hover:bg-muted/80'
                  : 'text-primary/70 hover:bg-primary/15'
              )}
              title={isCollapsed ? 'Expand branches' : 'Collapse branches'}
            >
              {isCollapsed ? (
                <IconChevronRight className="size-3.5" />
              ) : (
                <IconChevronDown className="size-3.5" />
              )}
            </Button>
          ) : (
            <div className="size-5 shrink-0" />
          )}

          {/* Commit Card */}
          <div
            onClick={() => {
              if (isDiffMode) {
                setDiffBaseId(commit.id);
              } else {
                handleSelectCommit(commit.id, 'preview');
              }
            }}
            className={cn(
              'flex-1 min-w-0 text-left rounded-xl p-2.5 transition-all duration-150 border flex flex-col gap-1.5 cursor-pointer relative',
              isSelected && !isDiffMode
                ? 'bg-card border-primary ring-1 ring-primary/40 shadow-lg shadow-primary/10 brightness-110'
                : 'bg-card/30 border-border/40 hover:bg-card/90 hover:border-primary/60 hover:brightness-110 hover:shadow-md hover:shadow-primary/5',
              isSelectedForSquash && 'ring-1 ring-primary/80 border-primary/60 bg-primary/10',
              isDiffMode && diffBaseId === commit.id && 'border-amber-500 bg-amber-500/10',
              isDiffMode && diffTargetId === commit.id && 'border-primary bg-primary/10'
            )}
          >

            <div className="flex gap-2 items-center">
              {/* Squash Selection Checkbox */}
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={(e) => handleToggleSelectForSquash(commit.id, e)}
                className={cn(
                  'size-5 shrink-0 rounded transition-all',
                  isSelectedForSquash
                    ? 'text-primary bg-primary/15'
                    : 'text-muted-foreground/40 hover:text-muted-foreground'
                )}
                title={isSelectedForSquash ? 'Deselect from squash' : 'Select to squash'}
              >
                {isSelectedForSquash ? (
                  <IconSquareCheckFilled className="size-3.5 text-primary" />
                ) : (
                  <IconSquare className="size-3.5" />
                )}
              </Button>

              {/* Mini Frame Thumbnail */}
              <div className="relative size-9 rounded-lg overflow-hidden shrink-0 bg-black border border-border">
                <img
                  src={`${API_URL}/commits/${commit.id}/thumbnail`}
                  alt="Thumbnail"
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    (e.target as HTMLElement).style.display = 'none';
                  }}
                />
              </div>

              <div className="flex-1 min-w-0 flex flex-col">
                <div className="flex items-center justify-between gap-1">
                  <div className="flex items-center gap-1 flex-wrap">
                    {isHead && (
                      <Badge variant="default" className="text-[9px] px-1 py-0">
                        ACTIVE VERSION
                      </Badge>
                    )}
                    {node.depth === 0 ? (
                      <Badge
                        variant="outline"
                        className="text-[8px] px-1 py-0 bg-emerald-500/10 text-emerald-400 border-emerald-500/30 font-semibold"
                      >
                        ROOT PROJECT
                      </Badge>
                    ) : (
                      <Badge
                        variant="secondary"
                        className="text-[8px] px-1 py-0 bg-primary/10 text-primary border-primary/30"
                      >
                        <IconGitBranch className="size-2.5 mr-0.5" /> Branch #{node.depth}
                      </Badge>
                    )}
                  </div>

                  <Button
                    variant="ghost"
                    size="icon-xs"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleToggleStar(commit);
                    }}
                    title={hasStarTag ? 'Remove Star Tag' : 'Star (Picture Lock) & Proxy Render'}
                    className="size-5 hover:text-amber-400"
                  >
                    {hasStarTag ? (
                      <IconStarFilled className="size-3.5 text-amber-400" />
                    ) : (
                      <IconStar className="size-3.5 text-muted-foreground" />
                    )}
                  </Button>
                </div>

                <div className="font-semibold text-xs text-foreground truncate mt-0.5">
                  {commit.message}
                </div>
              </div>
            </div>

            {/* Tags Chips */}
            {node.tags && node.tags.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {node.tags.map((tag) => (
                  <Badge
                    key={tag}
                    variant="secondary"
                    className="font-mono text-[8px] px-1.5 py-0 gap-0.5 bg-amber-500/20 text-amber-300 border-amber-500/40"
                  >
                    <IconTag className="size-2" />
                    {tag}
                  </Badge>
                ))}
              </div>
            )}

            {/* Inline Video Player Preview on Starred Cards */}
            {hasStarTag && (
              <div
                onClick={(e) => e.stopPropagation()}
                className="mt-1.5 rounded-lg overflow-hidden border border-amber-500/30 bg-black aspect-video relative group shadow-sm"
              >
                <VideoPlayer className="w-full h-full rounded-lg overflow-hidden">
                  <video
                    slot="media"
                    src={`${API_URL}/commits/${commit.id}/preview.mp4`}
                    className="w-full h-full object-contain"
                    playsInline
                    preload="metadata"
                  />
                  <VideoPlayerControlBar>
                    <VideoPlayerPlayButton />
                    <VideoPlayerTimeRange />
                    <VideoPlayerTimeDisplay showDuration />
                    <VideoPlayerMuteButton />
                    <VideoPlayerVolumeRange />
                  </VideoPlayerControlBar>
                </VideoPlayer>
                <div className="absolute top-1.5 right-1.5 pointer-events-none z-10 flex items-center gap-1 bg-amber-500/90 text-black font-mono text-[8px] font-bold px-1.5 py-0.5 rounded shadow">
                  <IconStarFilled className="size-2.5" />
                  <span>INSTANT PROXY</span>
                </div>
              </div>
            )}

            {/* Collapsed Branch Count Indicator */}
            {hasChildren && isCollapsed && (
              <div className="text-[10px] text-muted-foreground flex items-center gap-1 font-mono pt-0.5">
                <IconGitBranch className="size-3 text-primary" />
                <span>+{node.children.length} branch(es) hidden (click arrow to expand)</span>
              </div>
            )}
          </div>
        </div>

        {/* Child branches */}
        {hasChildren && !isCollapsed && (
          <div className="relative ml-2.5 pl-3.5 flex flex-col gap-1.5 pt-1">
            {node.children.map((child) => renderTreeNode(child, node.commit.id))}
          </div>
        )}
      </div>
    );
  };

  return (
    <SidebarProvider
      className="h-full min-h-0 w-full overflow-hidden"
      style={{ "--sidebar-width": "22rem", "--sidebar-width-mobile": "18rem" } as React.CSSProperties}
    >
      <div className="flex flex-1 w-full h-full overflow-hidden bg-background text-foreground font-sans relative">
        {/* Sidebar: Version History & Saves */}
        <Sidebar className="border-r border-border bg-card/40" collapsible="offcanvas">
          <SidebarHeader className="p-3 border-b border-border flex flex-col gap-2.5">


            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <SidebarTrigger
                  className="size-7 text-muted-foreground hover:text-foreground hover:bg-muted shrink-0"
                  title="Close Sidebar (Cmd+B)"
                />
                <div className="flex items-center gap-1.5 font-semibold text-xs text-foreground">
                  <IconHistory className="size-4 text-primary" />
                  <span>Project Version History</span>
                </div>
              </div>

              <div className="flex items-center gap-1">
                {/* View Switcher & Tree Collapse Controls */}
                <div className="bg-muted/40 p-0.5 rounded-lg border border-border flex items-center gap-0.5">
                  <Button
                    variant={viewMode === 'tree' ? 'secondary' : 'ghost'}
                    size="icon-xs"
                    onClick={() => setViewMode('tree')}
                    title="Branch Tree View"
                  >
                    <IconGitBranch className="size-3" />
                  </Button>
                  <Button
                    variant={viewMode === 'flat' ? 'secondary' : 'ghost'}
                    size="icon-xs"
                    onClick={() => setViewMode('flat')}
                    title="Chronological List"
                  >
                    <IconList className="size-3" />
                  </Button>
                  {viewMode === 'tree' && (
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      onClick={collapsedNodeIds.size > 0 ? handleExpandAll : handleCollapseAll}
                      title={collapsedNodeIds.size > 0 ? 'Expand All Branches' : 'Collapse All Branches'}
                      className="text-muted-foreground hover:text-foreground border-l border-border/50 rounded-none pl-1"
                    >
                      {collapsedNodeIds.size > 0 ? (
                        <IconChevronRight className="size-3 text-primary" />
                      ) : (
                        <IconChevronDown className="size-3" />
                      )}
                    </Button>
                  )}
                </div>

                <Button
                  variant={isDiffMode ? 'default' : 'outline'}
                  size="xs"
                  onClick={() => setIsDiffMode(!isDiffMode)}
                  className="text-[10px] gap-1 font-mono"
                >
                  <IconGitCompare className="size-3" />
                  {isDiffMode ? 'Exit Diff' : 'Compare'}
                </Button>
              </div>

            </div>

            {/* Search Input */}
            <div className="relative">
              <IconSearch className="size-3.5 absolute left-2.5 top-2.5 text-muted-foreground" />
              <Input
                placeholder="Search versions, tags, notes..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 h-8 text-xs"
              />
            </div>

            {/* Filter Toggle Buttons */}
            <div className="flex flex-wrap items-center gap-1.5 pt-1">
              <Button
                variant={starredOnly ? 'default' : 'outline'}
                size="xs"
                onClick={() => {
                  setStarredOnly(!starredOnly);
                  setSelectedTagFilter(null);
                }}
                className="text-[10px]"
              >
                {starredOnly ? (
                  <IconStarFilled className="size-3 text-amber-400" />
                ) : (
                  <IconStar className="size-3" />
                )}
                {starredOnly ? 'Tagged Only' : 'Show All'}
              </Button>

              {allUniqueTags.map((tag) => (
                <Button
                  key={tag}
                  variant={selectedTagFilter === tag ? 'secondary' : 'ghost'}
                  size="xs"
                  onClick={() => {
                    setSelectedTagFilter(selectedTagFilter === tag ? null : tag);
                  }}
                  className={cn(
                    'text-[10px] h-6 px-2',
                    selectedTagFilter === tag && 'border border-primary'
                  )}
                >
                  <IconTag className="size-2.5" />
                  {tag}
                </Button>
              ))}
            </div>
          </SidebarHeader>

          <SidebarContent className="p-0 flex flex-col">
            {/* Sticky Squash Selected Action Bar */}
            {selectedForSquash.length >= 2 && (
              <div className="p-2.5 bg-primary/15 border-b border-primary/30 flex items-center justify-between gap-2 shrink-0 animate-in fade-in slide-in-from-top-2">
                <div className="flex items-center gap-1.5 text-xs font-mono">
                  <IconGitMerge className="size-4 text-primary" />
                  <span className="font-bold text-foreground">{selectedForSquash.length} selected</span>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    variant="default"
                    size="xs"
                    onClick={handleOpenSquashModal}
                    className="font-bold text-[11px] h-6 px-2 shadow bg-primary hover:bg-primary/90 text-primary-foreground"
                  >
                    Squash Selected
                  </Button>
                  <Button
                    variant="ghost"
                    size="xs"
                    onClick={() => setSelectedForSquash([])}
                    className="text-[10px] h-6 px-1.5 text-muted-foreground hover:text-foreground"
                  >
                    Clear
                  </Button>
                </div>
              </div>
            )}

            <ScrollArea className="h-full w-full p-2">
              <SidebarGroup className="p-0">
                <SidebarGroupLabel className="text-[11px] uppercase tracking-wider text-muted-foreground px-2 py-1 flex items-center justify-between">
                  <span>{viewMode === 'tree' ? 'Saved Branches & Cuts' : 'All Saves'}</span>
                  <Badge variant="outline" className="text-[9px] font-mono">
                    {filteredCommits.length} saves
                  </Badge>
                </SidebarGroupLabel>
                <SidebarGroupContent>
                  {viewMode === 'tree' && !searchQuery && !starredOnly && !selectedTagFilter ? (
                    <div className="flex flex-col gap-1.5 py-1">
                      {treeNodes.length === 0 ? (
                        <div className="text-center py-8 text-muted-foreground text-xs">
                          No saved versions yet. Save your first edit in the Timeline Editor!
                        </div>
                      ) : (
                        <Tree
                          initialSelectedId={selectedCommitId || undefined}
                          indicator={true}
                          className="w-full"
                        >
                          {treeNodes.map((root) => renderTreeNode(root, null))}
                        </Tree>


                      )}
                    </div>
                  ) : (


                    <SidebarMenu className="gap-1.5">
                      {filteredCommits.length === 0 ? (
                        <div className="text-center py-10 text-muted-foreground text-xs flex flex-col items-center gap-2">
                          <IconFilter className="size-6 text-muted-foreground/40" />
                          <span>No matching versions found</span>
                        </div>
                      ) : (
                        filteredCommits.map((commit, i) => {
                          const isSelected = selectedCommitId === commit.id;
                          const isSelectedForSquash = selectedForSquash.includes(commit.id);
                          const isHead = activeHeadId === commit.id;
                          const hasStarTag =
                            commit.tags?.includes('Picture Lock') ||
                            commit.tags?.includes("Director's Cut") ||
                            commit.tags?.includes('Starred');

                          return (
                            <SidebarMenuItem key={commit.id}>
                              <div
                                onClick={() => handleSelectCommit(commit.id, 'preview')}
                                className={cn(
                                  'group/item flex flex-col p-2.5 rounded-xl border text-xs cursor-pointer transition-all w-full select-none gap-2',
                                  isSelected
                                    ? 'bg-accent border-primary/50 text-accent-foreground shadow-sm'
                                    : 'bg-card/40 border-border text-foreground hover:bg-accent/40',
                                  isSelectedForSquash && 'ring-1 ring-primary/80 border-primary/60 bg-primary/5'
                                )}
                              >
                                <div className="flex items-center justify-between gap-2">
                                  <div className="flex items-center gap-2 min-w-0">
                                    {/* Squash Selection Checkbox */}
                                    <Button
                                      variant="ghost"
                                      size="icon-xs"
                                      onClick={(e) => handleToggleSelectForSquash(commit.id, e)}
                                      className={cn(
                                        'size-5 shrink-0 rounded transition-all',
                                        isSelectedForSquash
                                          ? 'text-primary bg-primary/15'
                                          : 'text-muted-foreground/40 hover:text-muted-foreground'
                                      )}
                                      title={isSelectedForSquash ? 'Deselect from squash' : 'Select to squash'}
                                    >
                                      {isSelectedForSquash ? (
                                        <IconSquareCheckFilled className="size-3.5 text-primary" />
                                      ) : (
                                        <IconSquare className="size-3.5" />
                                      )}
                                    </Button>

                                    <div className="relative size-10 rounded-lg overflow-hidden shrink-0 bg-black border border-border">
                                      <img
                                        src={`${API_URL}/commits/${commit.id}/thumbnail`}
                                        alt={commit.message}
                                        className="size-full object-cover"
                                        onError={(e) => {
                                          e.currentTarget.style.display = 'none';
                                        }}
                                      />
                                      <div className="absolute inset-0 flex items-center justify-center bg-black/40 text-[9px] font-mono text-muted-foreground">
                                        #{filteredCommits.length - i}
                                      </div>
                                    </div>

                                    <div className="flex flex-col min-w-0">
                                      <div className="flex items-center gap-1.5">
                                        <span className="font-semibold text-foreground truncate max-w-[130px]">
                                          {commit.message}
                                        </span>
                                        {isHead && (
                                          <Badge
                                            variant="default"
                                            className="text-[9px] px-1 py-0 font-mono h-4 shrink-0"
                                          >
                                            HEAD
                                          </Badge>
                                        )}
                                      </div>
                                      <div className="text-[10px] text-muted-foreground font-mono flex items-center gap-1.5 mt-0.5">
                                        <span>{commit.id.slice(0, 7)}</span>
                                        <span>•</span>
                                        <span>{formatDate(commit.timestamp)}</span>
                                      </div>
                                    </div>
                                  </div>

                                  <div className="flex items-center gap-1">
                                    <Button
                                      variant="ghost"
                                      size="icon-xs"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleToggleStar(commit);
                                      }}
                                      title={hasStarTag ? 'Remove Star Tag' : 'Star & Proxy Render'}
                                      className="size-5 hover:text-amber-400"
                                    >
                                      {hasStarTag ? (
                                        <IconStarFilled className="size-3.5 text-amber-400" />
                                      ) : (
                                        <IconStar className="size-3.5 text-muted-foreground" />
                                      )}
                                    </Button>

                                    <Button
                                      variant="ghost"
                                      size="icon-xs"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleOpenDiffWithCommit(commit.id);
                                      }}
                                      title="Compare vs Active"
                                    >
                                      <IconGitCompare className="size-3.5" />
                                    </Button>
                                  </div>
                                </div>

                                {commit.tags && commit.tags.length > 0 && (
                                  <div className="flex flex-wrap gap-1">
                                    {commit.tags.map((t) => (
                                      <Badge
                                        key={t}
                                        variant="secondary"
                                        className="font-mono text-[8px] px-1.5 py-0 h-3.5 gap-0.5 bg-amber-500/20 text-amber-300 border-amber-500/40"
                                      >
                                        <IconTag className="size-2" />
                                        {t}
                                      </Badge>
                                    ))}
                                  </div>
                                )}

                                {/* Inline Video Player Preview on Starred Cards */}
                                {hasStarTag && (
                                  <div
                                    onClick={(e) => e.stopPropagation()}
                                    className="mt-1 rounded-lg overflow-hidden border border-amber-500/30 bg-black aspect-video relative group shadow-sm"
                                  >
                                    <VideoPlayer className="w-full h-full rounded-lg overflow-hidden">
                                      <video
                                        slot="media"
                                        src={`${API_URL}/commits/${commit.id}/preview.mp4`}
                                        className="w-full h-full object-contain"
                                        playsInline
                                        preload="metadata"
                                      />
                                      <VideoPlayerControlBar>
                                        <VideoPlayerPlayButton />
                                        <VideoPlayerTimeRange />
                                        <VideoPlayerTimeDisplay showDuration />
                                        <VideoPlayerMuteButton />
                                        <VideoPlayerVolumeRange />
                                      </VideoPlayerControlBar>
                                    </VideoPlayer>
                                    <div className="absolute top-1.5 right-1.5 pointer-events-none z-10 flex items-center gap-1 bg-amber-500/90 text-black font-mono text-[8px] font-bold px-1.5 py-0.5 rounded shadow">
                                      <IconStarFilled className="size-2.5" />
                                      <span>INSTANT PROXY</span>
                                    </div>
                                  </div>
                                )}
                              </div>
                            </SidebarMenuItem>
                          );
                        })
                      )}
                    </SidebarMenu>
                  )}
                </SidebarGroupContent>
              </SidebarGroup>
            </ScrollArea>
          </SidebarContent>


          <SidebarFooter className="p-3 border-t border-border flex flex-col gap-2">
            <Button variant="outline" size="sm" onClick={() => refreshAll()} className="w-full">
              <IconRefresh data-icon="inline-start" />
              Refresh Versions
            </Button>
          </SidebarFooter>
          <SidebarRail />
        </Sidebar>

        {/* Main View: Interactive Video Player Monitor & Version Actions */}
        <SidebarInset className="flex-1 flex flex-col bg-background min-w-0 overflow-hidden">
          <header className="h-12 border-b border-border bg-card/40 px-4 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <SidebarTrigger className="-ml-1 mr-1" />
              <Separator orientation="vertical" className="h-4" />
              {isDiffMode ? (
                <>
                  <IconGitCompare className="size-4 text-primary" />
                  <span className="font-semibold text-foreground">Dual Version Comparison</span>
                </>
              ) : (
                <>
                  <IconMovie className="size-4 text-primary" />
                  <span className="font-semibold text-foreground">Version Player & Inspector</span>
                </>
              )}

              {statusMessage && (
                <>
                  <Separator orientation="vertical" className="h-3" />
                  <span className="text-primary font-medium">{statusMessage}</span>
                </>
              )}
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant={isDiffMode ? 'default' : 'outline'}
                size="sm"
                onClick={() => setIsDiffMode(!isDiffMode)}
              >
                <IconGitCompare data-icon="inline-start" />
                {isDiffMode ? 'Back to Single View' : 'Compare 2 Versions'}
              </Button>
            </div>
          </header>

          <ScrollArea className="flex-1 h-full w-full">
            <main className="p-6">
              {isDiffMode ? (
                <div className="max-w-4xl mx-auto">
                  <DiffInspector
                    commits={commits}
                    baseCommitId={diffBaseId}
                    targetCommitId={diffTargetId}
                    onSelectBase={setDiffBaseId}
                    onSelectTarget={setDiffTargetId}
                    onClose={() => setIsDiffMode(false)}
                  />
                </div>
              ) : loadingTimeline ? (
                <div className="h-full flex items-center justify-center py-20">
                  <div className="flex items-center gap-3 text-muted-foreground text-sm font-mono">
                    <Spinner className="size-5 text-primary" />
                    Loading version media...
                  </div>
                </div>
              ) : timeline ? (

              <div className="max-w-4xl mx-auto flex flex-col gap-6">
                {/* Main Video Monitor Player Card */}
                <Card className="p-6 bg-card/50 border border-border flex flex-col gap-4 shadow-md">
                  <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge
                          variant={timeline.is_head ? 'default' : 'secondary'}
                          className="font-bold text-xs"
                        >
                          {timeline.is_head ? 'ACTIVE PROJECT VERSION' : 'HISTORICAL VERSION PREVIEW'}
                        </Badge>
                        <Badge variant="outline" className="font-mono text-xs">
                          <IconClock className="size-3 text-muted-foreground mr-1" />
                          {timeline.total_duration.toFixed(1)}s
                        </Badge>
                      </div>
                      <h2 className="text-2xl font-bold text-foreground tracking-tight mt-1">
                        {timeline.message}
                      </h2>
                      <div className="text-xs text-muted-foreground flex items-center gap-3 mt-1">
                        <span>Created by: <strong className="text-foreground">{timeline.author}</strong></span>
                        <span>•</span>
                        <span>Date: <strong className="text-foreground">{timeline.timestamp}</strong></span>
                      </div>
                    </div>

                    {/* Prominent Video Action Buttons */}
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <Button
                        variant="default"
                        size="sm"
                        onClick={handleOpenInEditor}
                        className="font-semibold shadow-sm"
                      >
                        <IconMovie data-icon="inline-start" />
                        Open & Edit This Version
                      </Button>

                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setExportTarget({ id: timeline.commit_id, message: timeline.message })}
                        className="font-mono text-xs font-semibold gap-1.5 border-primary/40 text-foreground hover:bg-primary/10 shadow-sm"
                        title="Export full-res ProRes / H.264 video of this version"
                      >
                        <IconDownload className="size-3.5 text-primary" />
                        Export Full-Res Video
                      </Button>



                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => setShowSaveAsModal(!showSaveAsModal)}
                      >
                        <IconGitBranch data-icon="inline-start" />
                        Duplicate / Branch
                      </Button>

                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleOpenDiffWithCommit(timeline.commit_id)}
                      >
                        <IconGitCompare data-icon="inline-start" />
                        Compare vs Active
                      </Button>
                    </div>

                  </div>

                  {/* Branch / Duplicate Version Inline Panel */}
                  {showSaveAsModal && (
                    <div className="p-4 bg-background/90 border border-primary/40 rounded-xl flex flex-col gap-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-xs font-bold text-foreground">
                          <IconGitBranch className="size-4 text-primary" />
                          <span>Duplicate into a New Alternative Cut (Branch)</span>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          onClick={() => setShowSaveAsModal(false)}
                        >
                          ✕
                        </Button>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Create a parallel version starting from this exact checkpoint (e.g. Social Media Cut, Director&apos;s Cut) without overwriting your current active edit.
                      </p>
                      <div className="flex items-center gap-2">
                        <Input
                          value={saveAsMessage}
                          onChange={(e) => setSaveAsMessage(e.target.value)}
                          placeholder="Name for this new version cut..."
                          className="text-xs"
                        />
                        <Button
                          onClick={handleSaveAsNewVersion}
                          size="sm"
                          variant="default"
                          className="shrink-0"
                        >
                          <IconDeviceFloppy data-icon="inline-start" />
                          Create Version
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* LIVE INTERACTIVE VIDEO PLAYER MONITOR */}
                  <div className="relative aspect-video bg-black rounded-xl overflow-hidden border border-border flex items-center justify-center shadow-lg my-1">
                    {activeHistoryClip?.clip.media_hash || activeMediaHash ? (
                      <VideoPlayer className="w-full h-full rounded-xl overflow-hidden border border-border">
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
                            const currentVidTime = vid.currentTime;
                            if (activeHistoryClip) {
                              const clipEnd = activeHistoryClip.clip.duration;
                              if (currentVidTime >= clipEnd - 0.05) {
                                const currentIndex = clips.findIndex(
                                  (c) => c.id === activeHistoryClip.clip.id
                                );
                                if (currentIndex >= 0 && currentIndex < clips.length - 1) {
                                  const nextClip = clips[currentIndex + 1];
                                  setVideoTime(nextClip.start_time);
                                  if (nextClip.media_hash === activeHistoryClip.clip.media_hash) {
                                    vid.currentTime = 0;
                                    vid.play().catch(console.warn);
                                  }
                                } else {
                                  setIsPlaying(false);
                                  setVideoTime(timeline.total_duration);
                                  vid.pause();
                                }
                              } else {
                                setVideoTime(activeHistoryClip.clip.start_time + currentVidTime);
                              }
                            } else {
                              setVideoTime(vid.currentTime);
                            }
                          }}
                          onLoadedMetadata={(e) => {
                            const dur = (e.target as HTMLVideoElement).duration || 10;
                            setVideoDuration(dur);
                            if (videoRef.current && activeHistoryClip) {
                              videoRef.current.currentTime = activeHistoryClip.videoTime;
                              if (isPlaying) {
                                videoRef.current.play().catch(console.warn);
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
                      <div className="text-muted-foreground text-xs flex flex-col items-center gap-2 p-8">
                        <IconVideo className="size-8 text-muted-foreground/50" />
                        <span>No media linked to this version</span>
                      </div>
                    )}

                    {/* Version Badge Overlay */}
                    <div className="absolute top-3 left-3 bg-background/80 border border-border backdrop-blur rounded-lg px-2.5 py-1 text-xs font-semibold pointer-events-none z-10">
                      Preview: {timeline.message}
                    </div>
                  </div>



                  {/* Video Playback Transport Controls */}
                  <div className="flex flex-col gap-2 pt-1">
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex items-center gap-1.5">
                        <Button
                          variant="outline"
                          size="icon-sm"
                          onClick={() => handleSeek(0)}
                          title="Jump to Start"
                        >
                          <IconPlayerSkipBack />
                        </Button>
                        <Button
                          size="sm"
                          onClick={togglePlay}
                          className="font-bold"
                        >
                          {isPlaying ? (
                            <>
                              <IconPlayerPause data-icon="inline-start" /> Pause
                            </>
                          ) : (
                            <>
                              <IconPlayerPlay data-icon="inline-start" /> Play Video
                            </>
                          )}
                        </Button>
                        <Button
                          variant="outline"
                          size="icon-sm"
                          onClick={() => handleSeek(timeline?.total_duration || videoDuration)}
                          title="Jump to End"
                        >
                          <IconPlayerSkipForward />
                        </Button>
                      </div>

                      <div className="flex items-center gap-3">
                        <div className="flex items-center gap-1.5">
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => setIsMuted(!isMuted)}
                          >
                            {isMuted ? (
                              <IconVolumeOff className="size-4 text-destructive" />
                            ) : (
                              <IconVolume className="size-4 text-primary" />
                            )}
                          </Button>
                          <input
                            type="range"
                            min="0"
                            max="1"
                            step="0.05"
                            value={isMuted ? 0 : volume}
                            onChange={(e) => {
                              const newVol = parseFloat(e.target.value);
                              setVolume(newVol);
                              if (isMuted && newVol > 0) setIsMuted(false);
                            }}
                            className="w-20 accent-primary cursor-pointer"
                          />
                        </div>

                        <Badge variant="outline" className="font-mono text-primary font-bold">
                          {videoTime.toFixed(2)}s / {(timeline?.total_duration || videoDuration).toFixed(1)}s
                        </Badge>
                      </div>
                    </div>

                    {/* Timeline Playhead Scrubber */}
                    <input
                      type="range"
                      min="0"
                      max={timeline?.total_duration || videoDuration}
                      step="0.05"
                      value={videoTime}
                      onChange={(e) => handleSeek(parseFloat(e.target.value))}
                      className="w-full accent-primary cursor-pointer"
                    />
                  </div>


                  {/* Version Tags Strip */}
                  <div className="pt-3 border-t border-border flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs text-muted-foreground flex items-center gap-1 font-medium">
                        <IconTag className="size-3.5" /> Version Tags:
                      </span>
                      {selectedCommit?.tags && selectedCommit.tags.length > 0 ? (
                        selectedCommit.tags.map((tag) => (
                          <Badge
                            key={tag}
                            variant="secondary"
                            className="text-xs gap-1 bg-amber-500/20 text-amber-300 border-amber-500/40 font-medium"
                          >
                            {tag}
                            <button
                              onClick={() => handleRemoveTag(timeline.commit_id, tag)}
                              className="text-amber-400 hover:text-red-400 font-bold ml-1"
                              title="Remove Tag"
                            >
                              ✕
                            </button>
                          </Badge>
                        ))
                      ) : (
                        <span className="text-xs text-muted-foreground italic">
                          No tags assigned (e.g. Picture Lock)
                        </span>
                      )}
                    </div>

                    {/* Quick Tagging Buttons */}
                    <div className="flex items-center gap-1.5">
                      <Button
                        variant="outline"
                        size="xs"
                        onClick={() => handleAddTag(timeline.commit_id, 'Picture Lock')}
                        className="text-[11px]"
                      >
                        + Picture Lock
                      </Button>
                      <Button
                        variant="outline"
                        size="xs"
                        onClick={() => handleAddTag(timeline.commit_id, "Director's Cut")}
                        className="text-[11px]"
                      >
                        + Director&apos;s Cut
                      </Button>

                      {showAddTagForId === timeline.commit_id ? (
                        <div className="flex items-center gap-1">
                          <Input
                            placeholder="Custom tag..."
                            value={newTagInput}
                            onChange={(e) => setNewTagInput(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                handleAddTag(timeline.commit_id, newTagInput);
                              }
                            }}
                            className="h-6 w-28 text-xs px-2"
                          />
                          <Button
                            variant="default"
                            size="xs"
                            onClick={() => handleAddTag(timeline.commit_id, newTagInput)}
                          >
                            Save
                          </Button>
                          <Button
                            variant="ghost"
                            size="xs"
                            onClick={() => setShowAddTagForId(null)}
                          >
                            ✕
                          </Button>
                        </div>
                      ) : (
                        <Button
                          variant="ghost"
                          size="xs"
                          onClick={() => setShowAddTagForId(timeline.commit_id)}
                          className="text-[11px]"
                        >
                          <IconPlus className="size-3" /> Custom Tag
                        </Button>
                      )}
                    </div>
                  </div>
                </Card>

                {/* Track Clips Layout Strip */}
                <Card className="p-5 bg-card/40 border border-border flex flex-col gap-4">
                  <div className="flex items-center justify-between text-xs font-semibold text-foreground">
                    <span className="flex items-center gap-1.5">
                      <IconMovie className="size-4 text-primary" /> Track Segments in This Version
                    </span>
                    <span className="text-muted-foreground font-normal">
                      {timeline.tracks.length} track(s)
                    </span>
                  </div>

                  <div className="flex flex-col gap-3">
                    {timeline.tracks.map((track) => (
                      <div key={track.id} className="flex flex-col gap-1.5">
                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                          <span className="font-medium text-foreground">{track.name}</span>
                          <Badge variant="outline" className="text-[10px] uppercase">
                            {track.track_type}
                          </Badge>
                        </div>
                        <ScrollArea className="w-full pb-1" orientation="horizontal">
                          <div className="h-14 bg-background border border-border rounded-xl p-2 relative flex gap-2 min-w-full items-center">
                            {track.clips.map((clip) => {
                              const isVideo = track.track_type === 'video';
                              return (
                                <div
                                  key={clip.id}
                                  className={cn(
                                    'h-full flex-1 min-w-[120px] rounded-lg p-2 flex flex-col justify-between text-[11px] border',
                                    isVideo
                                      ? 'bg-primary/20 border-primary text-foreground'
                                      : 'bg-secondary/40 border-border text-foreground'
                                  )}
                                >
                                  <div className="font-semibold truncate">{clip.name}</div>
                                  <div className="text-[9px] text-muted-foreground font-mono">
                                    {clip.duration.toFixed(1)}s
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </ScrollArea>
                      </div>
                    ))}
                  </div>
                </Card>

                {/* Collapsible Technical Details for Non-Developers */}
                <div className="border border-border/60 rounded-xl bg-card/20 p-3">
                  <button
                    onClick={() => setShowTechDetails(!showTechDetails)}
                    className="flex items-center justify-between w-full text-xs text-muted-foreground hover:text-foreground font-medium"
                  >
                    <span>Developer & Technical Details</span>
                    {showTechDetails ? <IconChevronDown className="size-4" /> : <IconChevronRight className="size-4" />}
                  </button>

                  {showTechDetails && (
                    <div className="pt-3 mt-2 border-t border-border grid grid-cols-1 md:grid-cols-3 gap-2 font-mono text-[11px]">
                      <div className="bg-background/60 p-2 rounded-lg border border-border">
                        <div className="text-muted-foreground text-[9px] uppercase">Commit UUID</div>
                        <div className="text-foreground truncate">{timeline.commit_id}</div>
                      </div>
                      <div className="bg-background/60 p-2 rounded-lg border border-border">
                        <div className="text-muted-foreground text-[9px] uppercase">Timeline SHA-256</div>
                        <div className="text-primary truncate">{timeline.timeline_hash}</div>
                      </div>
                      <div className="bg-background/60 p-2 rounded-lg border border-border">
                        <div className="text-muted-foreground text-[9px] uppercase">Parent Checkpoint</div>
                        <div className="text-foreground truncate">{timeline.parent_id || 'Root (None)'}</div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
                Select a version from the left panel to watch its video preview and inspect its clips.
              </div>
            )}
            </main>
          </ScrollArea>
        </SidebarInset>

        {/* Squash Selected Commits Modal Dialog */}
        {showSquashModal && (
          <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-card border border-border rounded-2xl p-6 max-w-lg w-full shadow-2xl flex flex-col gap-4 animate-in fade-in zoom-in-95">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="p-2.5 rounded-xl bg-primary/10 text-primary">
                    <IconGitMerge className="size-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-foreground">Squash Selected Versions</h3>
                    <p className="text-xs text-muted-foreground">
                      Collapse {selectedForSquash.length} historical checkpoints into one clean version.
                    </p>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  onClick={() => setShowSquashModal(false)}
                >
                  ✕
                </Button>
              </div>

              {/* List of commits being squashed */}
              <div className="bg-background/80 border border-border rounded-xl p-3 flex flex-col gap-1.5 max-h-40 overflow-y-auto">
                <div className="text-[10px] font-mono text-muted-foreground uppercase font-bold">
                  Versions to be collapsed ({selectedForSquash.length}):
                </div>
                {commits
                  .filter((c) => selectedForSquash.includes(c.id))
                  .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
                  .map((c, idx) => (
                    <div key={c.id} className="text-xs font-mono flex items-center gap-2 text-foreground">
                      <span className="text-primary font-bold">{idx + 1}.</span>
                      <span className="truncate flex-1">{c.message}</span>
                      <span className="text-[10px] text-muted-foreground shrink-0">{c.id.slice(0, 7)}</span>
                    </div>
                  ))}
              </div>

              {/* Editable Summary Message */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-foreground">
                  Squashed Version Message / Summary:
                </label>
                <textarea
                  rows={4}
                  value={squashMessage}
                  onChange={(e) => setSquashMessage(e.target.value)}
                  placeholder="Describe the combined changes in this squashed version..."
                  className="w-full bg-background border border-border rounded-xl p-3 text-xs font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-primary resize-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowSquashModal(false)}
                  disabled={isSquashing}
                >
                  Cancel
                </Button>
                <Button
                  variant="default"
                  size="sm"
                  onClick={handleConfirmSquash}
                  disabled={isSquashing || !squashMessage.trim()}
                  className="font-bold gap-1.5 shadow"
                >
                  {isSquashing ? <Spinner className="size-3.5" /> : <IconGitMerge className="size-4" />}
                  {isSquashing ? 'Squashing...' : 'Confirm Squash'}
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Full-Res Export Dialog */}
      <ExportDialog
        isOpen={!!exportTarget}
        commitId={exportTarget?.id ?? ''}
        commitMessage={exportTarget?.message ?? ''}
        onClose={() => setExportTarget(null)}
      />
    </SidebarProvider>
  );
}


