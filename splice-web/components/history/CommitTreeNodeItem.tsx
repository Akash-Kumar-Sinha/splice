'use client';

import React from 'react';
import {
  IconGitBranch,
  IconTag,
  IconStar,
  IconStarFilled,
  IconChevronDown,
  IconChevronRight,
  IconSquare,
  IconSquareCheckFilled,
} from '@tabler/icons-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  VideoPlayer,
  VideoPlayerControlBar,
  VideoPlayerPlayButton,
  VideoPlayerTimeRange,
  VideoPlayerTimeDisplay,
  VideoPlayerMuteButton,
  VideoPlayerVolumeRange,
} from '@/components/ui/video_player';
import { CommitTreeNode } from '@/lib/types';
import { API_URL } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Commit } from '@/lib/types';

interface CommitTreeNodeItemProps {
  node: CommitTreeNode;
  parentId: string | null;
  selectedCommitId: string | null;
  activeHeadId: string | null;
  selectedForSquash: string[];
  hoveredNodeId: string | null;
  collapsedNodeIds: Set<string>;
  isDiffMode: boolean;
  diffBaseId: string | null;
  diffTargetId: string | null;
  onHover: (id: string | null) => void;
  onSelect: (commitId: string) => void;
  onToggleCollapse: (nodeId: string, e: React.MouseEvent) => void;
  onToggleSelectForSquash: (commitId: string, e?: React.MouseEvent) => void;
  onToggleStar: (commit: Commit) => void;
  onSetDiffBaseId: (id: string | null) => void;
}

export default function CommitTreeNodeItem({
  node,
  parentId,
  selectedCommitId,
  activeHeadId,
  selectedForSquash,
  hoveredNodeId,
  collapsedNodeIds,
  isDiffMode,
  diffBaseId,
  diffTargetId,
  onHover,
  onSelect,
  onToggleCollapse,
  onToggleSelectForSquash,
  onToggleStar,
  onSetDiffBaseId,
}: CommitTreeNodeItemProps) {
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
      <div
        onMouseEnter={() => onHover(node.commit.id)}
        onMouseLeave={() => onHover(null)}
        className="flex items-center gap-1.5 w-full py-0.5 relative z-10"
      >
        {parentId !== null && (
          <div className="absolute -left-3.5 -top-1 bottom-0 w-3.5 pointer-events-none z-0">
            <div
              className={cn(
                'absolute left-0 top-0 h-[calc(50%+4px)] w-px transition-colors duration-150',
                isLineHighlighted
                  ? 'bg-primary shadow-[0_0_8px_rgba(var(--primary),0.8)]'
                  : 'bg-border/30'
              )}
            />
            <div
              className={cn(
                'absolute left-0 top-[calc(50%+3px)] w-3 h-px transition-colors duration-150',
                isLineHighlighted
                  ? 'bg-primary shadow-[0_0_8px_rgba(var(--primary),0.8)]'
                  : 'bg-border/30'
              )}
            />
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

        {hasChildren ? (
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={(e) => onToggleCollapse(node.commit.id, e)}
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

        <div
          onClick={() => {
            if (isDiffMode) {
              onSetDiffBaseId(commit.id);
            } else {
              onSelect(commit.id);
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
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={(e) => onToggleSelectForSquash(commit.id, e)}
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
                    onToggleStar(commit);
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

          {hasChildren && isCollapsed && (
            <div className="text-[10px] text-muted-foreground flex items-center gap-1 font-mono pt-0.5">
              <IconGitBranch className="size-3 text-primary" />
              <span>+{node.children.length} branch(es) hidden (click arrow to expand)</span>
            </div>
          )}
        </div>
      </div>

      {hasChildren && !isCollapsed && (
        <div className="relative ml-2.5 pl-3.5 flex flex-col gap-1.5 pt-1">
          {node.children.map((child) => (
            <CommitTreeNodeItem
              key={child.commit.id}
              node={child}
              parentId={node.commit.id}
              selectedCommitId={selectedCommitId}
              activeHeadId={activeHeadId}
              selectedForSquash={selectedForSquash}
              hoveredNodeId={hoveredNodeId}
              collapsedNodeIds={collapsedNodeIds}
              isDiffMode={isDiffMode}
              diffBaseId={diffBaseId}
              diffTargetId={diffTargetId}
              onHover={onHover}
              onSelect={onSelect}
              onToggleCollapse={onToggleCollapse}
              onToggleSelectForSquash={onToggleSelectForSquash}
              onToggleStar={onToggleStar}
              onSetDiffBaseId={onSetDiffBaseId}
            />
          ))}
        </div>
      )}
    </div>
  );
}
