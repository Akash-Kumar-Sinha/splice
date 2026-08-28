'use client';

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  IconSearch,
  IconRefresh,
  IconGitBranch,
  IconList,
  IconGitMerge,
  IconFilter,
  IconChevronDown,
} from '@tabler/icons-react';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
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
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
} from '@/components/ui/sidebar';
import { Spinner } from '@/components/ui/spinner';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Commit, CommitTreeNode, Timeline } from '@/lib/types';
import { safePlay, safePause, cn } from '@/lib/utils';


import { API_URL } from '@/lib/api';

import { useRevert } from '@/hooks/use-revert';

import DiffInspector from './DiffInspector';
import ExportDialog from './ExportDialog';
import CommitTreeNodeItem from './history/CommitTreeNodeItem';
import CommitListItem from './history/CommitListItem';
import SquashModal from './history/SquashModal';
import VersionDetailsCard from './history/VersionDetailsCard';

export type { Commit, CommitTreeNode, Timeline } from '@/lib/types';

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
  const [timeline, setTimeline] = useState<Timeline | null>(null);
  const [loadingTimeline, setLoadingTimeline] = useState(false);
  const [activeHeadId, setActiveHeadId] = useState<string | null>(
    initialCommits.length > 0 ? initialCommits[0].id : null
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [starredOnly, _setStarredOnly] = useState(false);
  const [selectedTagFilter, _setSelectedTagFilter] = useState<string | null>(null);
  const [_activeTab, _setActiveTab] = useState<'timeline' | 'json'>('timeline');

  const [isPlaying, setIsPlaying] = useState(false);
  const [videoTime, setVideoTime] = useState(0);
  const [videoDuration, setVideoDuration] = useState(10);
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const [isDiffMode, setIsDiffMode] = useState(false);
  const [diffBaseId, setDiffBaseId] = useState<string | null>(
    initialCommits.length > 1 ? initialCommits[1].id : initialCommits[0]?.id || null
  );
  const [diffTargetId, setDiffTargetId] = useState<string | null>(
    initialCommits.length > 0 ? initialCommits[0].id : null
  );

  const [selectedForSquash, setSelectedForSquash] = useState<string[]>([]);
  const [showSquashModal, setShowSquashModal] = useState(false);
  const [squashMessage, setSquashMessage] = useState('');
  const [isSquashing, setIsSquashing] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [exportTarget, setExportTarget] = useState<{ id: string; message: string } | null>(null);
  const [collapsedNodeIds, setCollapsedNodeIds] = useState<Set<string>>(new Set());
  const [collapsedProjectIds, setCollapsedProjectIds] = useState<Set<string>>(new Set());

  const toggleCollapseProject = (rootId: string) => {
    setCollapsedProjectIds((prev) => {
      const next = new Set(prev);
      if (next.has(rootId)) next.delete(rootId);
      else next.add(rootId);
      return next;
    });
  };


  // Collect all node IDs that have children (for collapse-all)
  const collectAllParentIds = useCallback((nodes: CommitTreeNode[]): Set<string> => {
    const ids = new Set<string>();
    const walk = (node: CommitTreeNode) => {
      if (node.children && node.children.length > 0) {
        ids.add(node.commit.id);
        node.children.forEach(walk);
      }
    };
    nodes.forEach(walk);
    return ids;
  }, []);

  // Find all ancestor IDs along the path to a target commit
  const findAncestorIds = useCallback((nodes: CommitTreeNode[], targetId: string): Set<string> => {
    const ancestors = new Set<string>();
    const walk = (node: CommitTreeNode): boolean => {
      if (node.commit.id === targetId) return true;
      for (const child of node.children || []) {
        if (walk(child)) {
          ancestors.add(node.commit.id);
          return true;
        }
      }
      return false;
    };
    nodes.forEach(walk);
    return ancestors;
  }, []);

  const fetchCommits = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/commits`, { cache: 'no-store' });
      if (res.ok) {
        const data: Commit[] = await res.json();
        setCommits(data);
        if (data.length > 0) setActiveHeadId(data[0].id);
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

  useEffect(() => { setCommits(initialCommits); }, [initialCommits]);
  useEffect(() => { refreshAll(); }, [refreshAll]);

  // When tree first loads, collapse everything and expand only the selected node's path
  useEffect(() => {
    if (treeNodes.length > 0) {
      const allParents = collectAllParentIds(treeNodes);
      setCollapsedNodeIds(allParents);
      if (selectedCommitId) {
        const ancestors = findAncestorIds(treeNodes, selectedCommitId);
        setCollapsedNodeIds((prev) => {
          const next = new Set(prev);
          ancestors.forEach((id) => next.delete(id));
          return next;
        });
      }
    }
  }, [treeNodes, collectAllParentIds, findAncestorIds]);

  // When selection changes, expand the path to the selected node
  useEffect(() => {
    if (selectedCommitId && treeNodes.length > 0) {
      const ancestors = findAncestorIds(treeNodes, selectedCommitId);
      setCollapsedNodeIds((prev) => {
        const next = new Set(prev);
        ancestors.forEach((id) => next.delete(id));
        return next;
      });
    }
  }, [selectedCommitId, treeNodes, findAncestorIds]);

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
      setStatusMessage('Error loading version');
    } finally {
      setLoadingTimeline(false);
    }
  };

  const getActiveHistoryClipInfo = useCallback(
    (time: number) => {
      const clips = timeline?.tracks[0]?.clips || [];
      for (const clip of clips) {
        if (time >= clip.start_time && time < clip.start_time + clip.duration) {
          const offset = time - clip.start_time;
          const inPoint = clip.in_point ?? 0;
          return { clip, offset, videoTime: inPoint + offset };
        }
      }
      if (clips.length > 0) {
        const last = clips[clips.length - 1];
        if (time >= last.start_time + last.duration) {
          const inPoint = last.in_point ?? 0;
          return { clip: last, offset: last.duration, videoTime: inPoint + last.duration };
        }
        const first = clips[0];
        const inPoint = first.in_point ?? 0;
        return { clip: first, offset: 0, videoTime: inPoint };
      }
      return null;
    },
    [timeline]
  );


  const togglePlay = () => {
    if (!videoRef.current) return;
    if (isPlaying) {
      safePause(videoRef.current);
      setIsPlaying(false);
    } else {
      if (videoTime >= (timeline?.total_duration || videoDuration) - 0.1) {
        handleSeek(0);
      }
      safePlay(videoRef.current);
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

  const handleAddTag = async (commitId: string, label: string) => {
    if (!label.trim()) return;
    try {
      const res = await fetch(`${API_URL}/commits/${commitId}/tags`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label: label.trim() }),
      });
      if (res.ok) {
        setStatusMessage(`Tagged as "${label}"`);
        await refreshAll();
      }
    } catch (err) {
      console.error('Error adding tag:', err);
    }
  };

  const handleRemoveTag = async (commitId: string, label: string) => {
    try {
      const res = await fetch(`${API_URL}/commits/${commitId}/tags/${encodeURIComponent(label)}`, {
        method: 'DELETE',
      });
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
      if (commit.tags?.includes('Picture Lock')) await handleRemoveTag(commit.id, 'Picture Lock');
      if (commit.tags?.includes('Starred')) await handleRemoveTag(commit.id, 'Starred');
    } else {
      await handleAddTag(commit.id, 'Picture Lock');
    }
  };

  const handleToggleSelectForSquash = (commitId: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setSelectedForSquash((prev) =>
      prev.includes(commitId) ? prev.filter((id) => id !== commitId) : [...prev, commitId]
    );
  };

  const handleOpenSquashModal = () => {
    if (selectedForSquash.length < 2) return;
    const selectedCommits = commits
      .filter((c) => selectedForSquash.includes(c.id))
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
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
        body: JSON.stringify({ commit_ids: selectedForSquash, message: squashMessage.trim() }),
      });
      if (!res.ok) throw new Error(`Squash failed with HTTP ${res.status}`);
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

  const handleOpenDiffWithCommit = (commitId: string) => {
    const commitMap = new Map<string, Commit>(commits.map((c) => [c.id, c]));
    const targetCommit = commitMap.get(commitId);

    // Selected video is the Target (B)
    const targetId = commitId;

    // Parent of selected video is the Base (A)
    let baseId: string | null;
    if (targetCommit?.parent && commitMap.has(targetCommit.parent)) {
      baseId = targetCommit.parent;
    } else {
      // Root commit (no parent): check if there is a child or other commit in the same tree
      const child = commits.find((c) => c.parent === commitId);
      if (child) {
        baseId = child.id;
      } else {
        const other = commits.find((c) => c.id !== commitId);
        baseId = other ? other.id : commitId;
      }
    }

    setDiffTargetId(targetId);
    setDiffBaseId(baseId);
    setIsDiffMode(true);
  };

  const _handleToggleDiff = () => {
    if (!isDiffMode) {
      const targetId = selectedCommitId || (commits.length > 0 ? commits[0].id : null);
      if (targetId) {
        handleOpenDiffWithCommit(targetId);
        return;
      }
    }
    setIsDiffMode(!isDiffMode);
  };



  useEffect(() => {
    if (selectedCommitId) handleSelectCommit(selectedCommitId, 'preview');
  }, []);

  const _allUniqueTags = Array.from(new Set(commits.flatMap((c) => c.tags || [])));
  const filteredCommits = commits.filter((c) => {
    const matchesSearch =
      c.message.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.author.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.tags?.some((t) => t.toLowerCase().includes(searchQuery.toLowerCase()));
    const isStarred =
      c.tags?.includes('Picture Lock') || c.tags?.includes("Director's Cut") || c.tags?.includes('Starred');
    const matchesStarred = starredOnly ? isStarred : true;
    const matchesTagFilter = selectedTagFilter ? c.tags?.includes(selectedTagFilter) : true;
    return matchesSearch && matchesStarred && matchesTagFilter;
  });

  const projectSequences = useMemo(() => {
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

    const map = new Map<string, { root: Commit; head: Commit; members: Commit[] }>();
    for (const c of filteredCommits) {
      const rootId = getRootId(c.id);
      const rootCommit = commitMap.get(rootId) || c;
      if (!map.has(rootId)) {
        map.set(rootId, { root: rootCommit, head: c, members: [] });
      }
      const group = map.get(rootId)!;
      group.members.push(c);
    }

    return Array.from(map.values());
  }, [commits, filteredCommits]);


  const selectedCommit = commits.find((c) => c.id === selectedCommitId);
  const clips = timeline?.tracks[0]?.clips || [];
  const activeHistoryClip = getActiveHistoryClipInfo(videoTime);

  const toggleCollapseNode = (nodeId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setCollapsedNodeIds((prev) => {
      const next = new Set(prev);
      if (next.has(nodeId)) next.delete(nodeId);
      else next.add(nodeId);
      return next;
    });
  };

  const _handleCollapseAll = () => setCollapsedNodeIds(collectAllParentIds(treeNodes));

  const _handleExpandAll = () => setCollapsedNodeIds(new Set());

  return (
    <SidebarProvider
      className="h-full min-h-0 w-full overflow-hidden"
      style={{ "--sidebar-width": "20rem", "--sidebar-width-mobile": "16rem" } as React.CSSProperties}
    >
      <div className="flex flex-1 w-full h-full overflow-hidden bg-background text-foreground font-sans relative">
        <Sidebar className="border-r border-border bg-card/30" collapsible="offcanvas">
          <SidebarHeader className="p-4 border-b border-border/40 flex flex-col gap-3">
            {/* Title + View Toggle */}
            <div className="flex items-center justify-between">
              <div className="flex flex-col">
                <span className="text-sm font-semibold text-foreground tracking-tight">
                  Version History
                </span>
                <span className="text-[10px] text-muted-foreground/60">
                  Browse and manage saved versions
                </span>
              </div>

              <div className="flex items-center gap-0.5 bg-muted/40 p-0.5 rounded-lg border border-border/30">
                <Button
                  variant={viewMode === 'tree' ? 'secondary' : 'ghost'}
                  size="icon-xs"
                  onClick={() => setViewMode('tree')}
                  className="size-6 rounded-md"
                  title="Branch Tree"
                >
                  <IconGitBranch className="size-3" />
                </Button>
                <Button
                  variant={viewMode === 'flat' ? 'secondary' : 'ghost'}
                  size="icon-xs"
                  onClick={() => setViewMode('flat')}
                  className="size-6 rounded-md"
                  title="List"
                >
                  <IconList className="size-3" />
                </Button>
              </div>
            </div>

            {/* Search */}
            <div className="relative">
              <IconSearch className="size-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground/40" />
              <Input
                placeholder="Search versions..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 h-8 text-xs bg-muted/30 border-border/40 rounded-lg placeholder:text-muted-foreground/40"
              />
            </div>
          </SidebarHeader>

          <SidebarContent className="p-0 flex flex-col">
            <AnimatePresence>
              {selectedForSquash.length >= 2 && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2, ease: 'easeOut' }}
                  className="overflow-hidden"
                >
                  <div className="px-4 py-3 bg-primary/10 border-b border-primary/20 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <motion.div
                        className="size-6 rounded-md bg-primary/20 flex items-center justify-center"
                        animate={{ scale: [1, 1.1, 1] }}
                        transition={{ duration: 0.3, repeat: Infinity, repeatDelay: 2 }}
                      >
                        <IconGitMerge className="size-3.5 text-primary" data-icon="inline-start" />
                      </motion.div>
                      <div className="flex flex-col">
                        <span className="text-xs font-semibold text-foreground">{selectedForSquash.length} versions selected</span>
                        <span className="text-[10px] text-muted-foreground/60">Ready to squash</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Button variant="default" size="xs" onClick={handleOpenSquashModal} className="font-semibold text-[11px] h-7 px-3 shadow-sm bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg">
                        Squash
                      </Button>
                      <Button variant="ghost" size="xs" onClick={() => setSelectedForSquash([])} className="text-[11px] h-7 px-2 text-muted-foreground hover:text-foreground">
                        Cancel
                      </Button>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <ScrollArea className="h-full w-full px-3 py-2 overflow-x-hidden">
              <SidebarGroup className="p-0">
                <SidebarGroupLabel className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/50 px-1 py-1.5">
                  {viewMode === 'tree' ? 'Version Tree' : 'All Saves'}
                </SidebarGroupLabel>

                <SidebarGroupContent>
                  {viewMode === 'tree' && !searchQuery && !starredOnly && !selectedTagFilter ? (

                    <div className="flex flex-col gap-1.5 py-1">
                      {treeNodes.length === 0 ? (
                        <div className="text-center py-12 text-muted-foreground text-xs flex flex-col items-center gap-3">
                          <div className="size-12 rounded-xl bg-muted/30 flex items-center justify-center">
                            <IconGitBranch className="size-5 text-muted-foreground/30" />
                          </div>
                          <div className="flex flex-col gap-1">
                            <span className="font-medium text-muted-foreground/70">No versions yet</span>
                            <span className="text-[10px] text-muted-foreground/40">Save your first version to get started</span>
                          </div>
                        </div>
                      ) : (
                        <div className="flex flex-col py-1">
                          {treeNodes.map((root, idx) => (
                            <CommitTreeNodeItem
                              key={root.commit.id}
                              node={root}
                              depth={0}
                              isLast={idx === treeNodes.length - 1}
                              parentLines={[]}
                              selectedCommitId={selectedCommitId}
                              activeHeadId={activeHeadId}
                              selectedForSquash={selectedForSquash}
                              collapsedNodeIds={collapsedNodeIds}
                              isDiffMode={isDiffMode}
                              diffBaseId={diffBaseId}
                              diffTargetId={diffTargetId}
                              onHover={() => {}}
                              onSelect={(id) => handleSelectCommit(id, 'preview')}
                              onToggleCollapse={toggleCollapseNode}
                              onToggleSelectForSquash={handleToggleSelectForSquash}
                              onToggleStar={handleToggleStar}
                              onSetDiffBaseId={setDiffBaseId}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  ) : projectSequences.length === 0 ? (

                      <div className="text-center py-12 text-muted-foreground text-xs flex flex-col items-center gap-3">
                        <div className="size-12 rounded-xl bg-muted/30 flex items-center justify-center">
                          <IconFilter className="size-5 text-muted-foreground/30" />
                        </div>
                        <div className="flex flex-col gap-1">
                          <span className="font-medium text-muted-foreground/70">No matching versions</span>
                          <span className="text-[10px] text-muted-foreground/40">Try adjusting your search or filters</span>
                        </div>
                      </div>
                    ) : (
                      <motion.div
                        className="flex flex-col gap-3 py-1"
                        initial="hidden"
                        animate="visible"
                        variants={{
                          hidden: { opacity: 0 },
                          visible: {
                            opacity: 1,
                            transition: { staggerChildren: 0.08 }
                          }
                        }}
                      >
                        {projectSequences.map((group) => {
                          const isCollapsed = collapsedProjectIds.has(group.root.id);

                          return (
                            <motion.div
                              key={group.root.id}
                              variants={{
                                hidden: { opacity: 0, y: 10 },
                                visible: { opacity: 1, y: 0 }
                              }}
                              transition={{ duration: 0.2, ease: 'easeOut' }}
                              className="flex flex-col rounded-xl border border-border/50 bg-card/40 overflow-hidden shadow-sm"
                            >
                              {/* Progress Sequence Header (Collapsible) */}
                              <div
                                onClick={() => toggleCollapseProject(group.root.id)}
                                className="flex items-center justify-between p-3 bg-muted/15 hover:bg-muted/30 transition-colors cursor-pointer select-none border-b border-border/30"
                              >
                                <div className="flex items-center gap-2.5 min-w-0">
                                  <motion.div
                                    className="size-7 rounded-lg bg-primary/10 flex items-center justify-center shrink-0"
                                    whileHover={{ scale: 1.05 }}
                                    whileTap={{ scale: 0.95 }}
                                  >
                                    <IconChevronDown
                                      className={cn(
                                        'size-3.5 text-primary/70 transition-transform',
                                        isCollapsed && '-rotate-90'
                                      )}
                                    />
                                  </motion.div>
                                  <div className="flex flex-col min-w-0 gap-0.5">
                                    <div className="flex items-center gap-1.5 min-w-0">
                                      <span className="text-[11px] font-semibold text-foreground truncate">
                                        {group.head.message}
                                      </span>
                                      {group.head.id === activeHeadId && (
                                        <Badge
                                          variant="default"
                                          className="text-[8px] font-bold px-1.5 py-0 h-4 leading-none shrink-0 uppercase"
                                        >
                                          Active
                                        </Badge>
                                      )}
                                    </div>
                                    <span className="text-[10px] text-muted-foreground/60 truncate">
                                      Started from &ldquo;{group.root.message}&rdquo; · {group.members.length} {group.members.length === 1 ? 'version' : 'versions'}
                                    </span>
                                  </div>
                                </div>

                                <span className="text-[9px] text-muted-foreground/40 shrink-0 font-medium tabular-nums ml-2">
                                  {isCollapsed ? `+${group.members.length}` : ''}
                                </span>
                              </div>

                              {/* Collapsible Steps list */}
                              <AnimatePresence>
                                {!isCollapsed && (
                                  <motion.div
                                    initial={{ height: 0, opacity: 0 }}
                                    animate={{ height: 'auto', opacity: 1 }}
                                    exit={{ height: 0, opacity: 0 }}
                                    transition={{ duration: 0.2, ease: 'easeOut' }}
                                    className="overflow-hidden"
                                  >
                                    <SidebarMenu className="p-2 gap-1.5">
                                      {group.members.map((commit, i) => (
                                        <CommitListItem
                                          key={commit.id}
                                          commit={commit}
                                          index={i}
                                          totalCount={group.members.length}
                                          isSelected={selectedCommitId === commit.id}
                                          isHead={activeHeadId === commit.id}
                                          isSelectedForSquash={selectedForSquash.includes(commit.id)}
                                          hasStarTag={
                                            commit.tags?.includes('Picture Lock') ||
                                            commit.tags?.includes("Director's Cut") ||
                                            commit.tags?.includes('Starred')
                                          }
                                          onSelect={(id) => handleSelectCommit(id, 'preview')}
                                          onToggleSelectForSquash={handleToggleSelectForSquash}
                                          onToggleStar={handleToggleStar}
                                        />
                                      ))}
                                    </SidebarMenu>
                                  </motion.div>
                                )}
                              </AnimatePresence>
                            </motion.div>
                          );
                        })}
                      </motion.div>
                    )}
                  </SidebarGroupContent>

              </SidebarGroup>
            </ScrollArea>
          </SidebarContent>

          <SidebarFooter className="p-4 border-t border-border/40">
            <Button variant="outline" size="sm" onClick={() => refreshAll()} className="w-full h-9 text-xs font-medium gap-2 rounded-lg border-border/50 hover:bg-muted/40">
              <IconRefresh className="size-3.5" />
              Refresh Versions
            </Button>
          </SidebarFooter>
          <SidebarRail />
        </Sidebar>

        <SidebarInset className="flex-1 flex flex-col bg-background min-w-0 min-h-0">
          <header className="h-10 border-b border-border bg-card/40 px-4 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
              <SidebarTrigger className="-ml-1" />
              <span>{isDiffMode ? 'Comparison' : 'Preview'}</span>
              {statusMessage && (
                <span className="text-primary font-medium">· {statusMessage}</span>
              )}
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
                  <div className="flex items-center gap-3 text-muted-foreground text-sm">
                    <Spinner className="size-5 text-primary" />
                    Loading version media...
                  </div>
                </div>
              ) : timeline ? (
                <VersionDetailsCard
                  timeline={timeline}
                  selectedCommit={selectedCommit}
                  clips={clips}
                  activeHistoryClip={activeHistoryClip}
                  videoTime={videoTime}
                  isPlaying={isPlaying}
                  isMuted={isMuted}
                  volume={volume}
                  videoRef={videoRef}
                  onTogglePlay={togglePlay}
                  onSeek={handleSeek}
                  onSetVideoTime={setVideoTime}
                  onSetVideoDuration={setVideoDuration}
                  onSetIsMuted={setIsMuted}
                  onSetVolume={setVolume}
                  onSetIsPlaying={setIsPlaying}
                  onOpenInEditor={handleOpenInEditor}
                  onOpenDiff={handleOpenDiffWithCommit}
                  onSetExportTarget={setExportTarget}
                  onAddTag={handleAddTag}
                  onRemoveTag={handleRemoveTag}
                  onBranchCreated={async (newId) => {
                    await refreshAll();
                    await handleSelectCommit(newId, 'preview');
                  }}
                />
              ) : (
                <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
                  Select a version from the left panel to watch its video preview.
                </div>
              )}
            </main>
          </ScrollArea>
        </SidebarInset>

        {showSquashModal && (
          <SquashModal
            commits={commits}
            selectedIds={selectedForSquash}
            squashMessage={squashMessage}
            isSquashing={isSquashing}
            onMessageChange={setSquashMessage}
            onConfirm={handleConfirmSquash}
            onClose={() => setShowSquashModal(false)}
          />
        )}
      </div>

      <ExportDialog
        isOpen={!!exportTarget}
        commitId={exportTarget?.id ?? ''}
        commitMessage={exportTarget?.message ?? ''}
        onClose={() => setExportTarget(null)}
      />
    </SidebarProvider>
  );
}
