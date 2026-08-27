'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  IconHistory,
  IconSearch,
  IconRefresh,
  IconGitCompare,
  IconGitBranch,
  IconList,
  IconGitMerge,
  IconFilter,
} from '@tabler/icons-react';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
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
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
} from '@/components/ui/sidebar';
import { Spinner } from '@/components/ui/spinner';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tree } from '@/components/ui/tree';
import { cn } from '@/lib/utils';
import { Commit, CommitTreeNode, Timeline } from '@/lib/types';
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
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [timeline, setTimeline] = useState<Timeline | null>(null);
  const [loadingTimeline, setLoadingTimeline] = useState(false);
  const [activeHeadId, setActiveHeadId] = useState<string | null>(
    initialCommits.length > 0 ? initialCommits[0].id : null
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [starredOnly, setStarredOnly] = useState(false);
  const [selectedTagFilter, setSelectedTagFilter] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'timeline' | 'json'>('timeline');

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
    [timeline]
  );

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
    let baseId: string | null = null;
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

  const handleToggleDiff = () => {
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

  const allUniqueTags = Array.from(new Set(commits.flatMap((c) => c.tags || [])));
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

  const handleCollapseAll = () => {
    const allParentIds = new Set<string>();
    const collect = (node: CommitTreeNode) => {
      if (node.children?.length) {
        allParentIds.add(node.commit.id);
        node.children.forEach(collect);
      }
    };
    treeNodes.forEach(collect);
    setCollapsedNodeIds(allParentIds);
  };

  const handleExpandAll = () => setCollapsedNodeIds(new Set());

  return (
    <SidebarProvider
      className="h-full min-h-0 w-full overflow-hidden"
      style={{ "--sidebar-width": "22rem", "--sidebar-width-mobile": "18rem" } as React.CSSProperties}
    >
      <div className="flex flex-1 w-full h-full overflow-hidden bg-background text-foreground font-sans relative">
        <Sidebar className="border-r border-border bg-card/40" collapsible="offcanvas">
          <SidebarHeader className="p-3 border-b border-border flex flex-col gap-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <SidebarTrigger className="size-7 text-muted-foreground hover:text-foreground hover:bg-muted shrink-0" />
                <div className="flex items-center gap-1.5 font-semibold text-xs text-foreground">
                  <IconHistory className="size-4 text-primary" />
                  <span>Project Version History</span>
                </div>
              </div>

              <div className="flex items-center gap-1">
                <div className="bg-muted/40 p-0.5 rounded-lg border border-border flex items-center gap-0.5">
                  <Button variant={viewMode === 'tree' ? 'secondary' : 'ghost'} size="icon-xs" onClick={() => setViewMode('tree')} title="Branch Tree View">
                    <IconGitBranch className="size-3" />
                  </Button>
                  <Button variant={viewMode === 'flat' ? 'secondary' : 'ghost'} size="icon-xs" onClick={() => setViewMode('flat')} title="Chronological List">
                    <IconList className="size-3" />
                  </Button>
                  {viewMode === 'tree' && (
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      onClick={collapsedNodeIds.size > 0 ? handleExpandAll : handleCollapseAll}
                      title={collapsedNodeIds.size > 0 ? 'Expand All' : 'Collapse All'}
                      className="text-muted-foreground hover:text-foreground border-l border-border/50 rounded-none pl-1"
                    >
                      {collapsedNodeIds.size > 0 ? (
                        <IconGitBranch className="size-3 text-primary" />
                      ) : (
                        <IconGitBranch className="size-3" />
                      )}
                    </Button>
                  )}
                </div>

                <Button
                  variant={isDiffMode ? 'default' : 'outline'}
                  size="xs"
                  onClick={handleToggleDiff}
                  className="text-[10px] gap-1 font-mono"
                >
                  <IconGitCompare className="size-3" />
                  {isDiffMode ? 'Exit Diff' : 'Compare'}
                </Button>

              </div>
            </div>

            <div className="relative">
              <IconSearch className="size-3.5 absolute left-2.5 top-2.5 text-muted-foreground" />
              <Input
                placeholder="Search versions, tags, notes..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 h-8 text-xs"
              />
            </div>

            <div className="flex flex-wrap items-center gap-1.5 pt-1">
              <Button
                variant={starredOnly ? 'default' : 'outline'}
                size="xs"
                onClick={() => { setStarredOnly(!starredOnly); setSelectedTagFilter(null); }}
                className="text-[10px]"
              >
                {starredOnly ? 'Tagged Only' : 'Show All'}
              </Button>
              {allUniqueTags.map((tag) => (
                <Button
                  key={tag}
                  variant={selectedTagFilter === tag ? 'secondary' : 'ghost'}
                  size="xs"
                  onClick={() => setSelectedTagFilter(selectedTagFilter === tag ? null : tag)}
                  className={cn('text-[10px] h-6 px-2', selectedTagFilter === tag && 'border border-primary')}
                >
                  {tag}
                </Button>
              ))}
            </div>
          </SidebarHeader>

          <SidebarContent className="p-0 flex flex-col">
            {selectedForSquash.length >= 2 && (
              <div className="p-2.5 bg-primary/15 border-b border-primary/30 flex items-center justify-between gap-2 shrink-0 animate-in fade-in slide-in-from-top-2">
                <div className="flex items-center gap-1.5 text-xs font-mono">
                  <IconGitMerge className="size-4 text-primary" />
                  <span className="font-bold text-foreground">{selectedForSquash.length} selected</span>
                </div>
                <div className="flex items-center gap-1">
                  <Button variant="default" size="xs" onClick={handleOpenSquashModal} className="font-bold text-[11px] h-6 px-2 shadow bg-primary hover:bg-primary/90 text-primary-foreground">
                    Squash Selected
                  </Button>
                  <Button variant="ghost" size="xs" onClick={() => setSelectedForSquash([])} className="text-[10px] h-6 px-1.5 text-muted-foreground hover:text-foreground">
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
                          No saved versions yet.
                        </div>
                      ) : (
                        <Tree initialSelectedId={selectedCommitId || undefined} indicator className="w-full">
                          {treeNodes.map((root) => (
                            <CommitTreeNodeItem
                              key={root.commit.id}
                              node={root}
                              parentId={null}
                              selectedCommitId={selectedCommitId}
                              activeHeadId={activeHeadId}
                              selectedForSquash={selectedForSquash}
                              hoveredNodeId={hoveredNodeId}
                              collapsedNodeIds={collapsedNodeIds}
                              isDiffMode={isDiffMode}
                              diffBaseId={diffBaseId}
                              diffTargetId={diffTargetId}
                              onHover={setHoveredNodeId}
                              onSelect={(id) => handleSelectCommit(id, 'preview')}
                              onToggleCollapse={toggleCollapseNode}
                              onToggleSelectForSquash={handleToggleSelectForSquash}
                              onToggleStar={handleToggleStar}
                              onSetDiffBaseId={setDiffBaseId}
                            />
                          ))}
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
                        filteredCommits.map((commit, i) => (
                          <CommitListItem
                            key={commit.id}
                            commit={commit}
                            index={i}
                            totalCount={filteredCommits.length}
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
                            onOpenDiff={handleOpenDiffWithCommit}
                          />
                        ))
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
                  <IconHistory className="size-4 text-primary" />
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
            <Button
              variant={isDiffMode ? 'default' : 'outline'}
              size="sm"
              onClick={handleToggleDiff}
            >
              <IconGitCompare data-icon="inline-start" />
              {isDiffMode ? 'Back to Single View' : 'Compare 2 Versions'}
            </Button>

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
