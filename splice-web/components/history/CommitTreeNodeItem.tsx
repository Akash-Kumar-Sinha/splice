'use client';

import React from 'react';
import {
  IconGitBranch,
  IconStar,
  IconStarFilled,
  IconChevronDown,
  IconChevronRight,
  IconSquare,
  IconSquareCheckFilled,
} from '@tabler/icons-react';
import { Badge } from '@/components/ui/badge';
import { CommitTreeNode } from '@/lib/types';
import { API_URL } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Commit } from '@/lib/types';

const INDENT = 22;

interface CommitTreeNodeItemProps {
  node: CommitTreeNode;
  depth: number;
  isLast: boolean;
  parentLines: boolean[];
  selectedCommitId: string | null;
  activeHeadId: string | null;
  selectedForSquash: string[];
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
  depth,
  isLast,
  parentLines,
  selectedCommitId,
  activeHeadId,
  selectedForSquash,
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

  return (
    <div className="flex flex-col">
      <div
        className={cn(
          "flex items-center gap-0 py-[3px] pr-1 rounded cursor-pointer transition-colors group/node min-w-0",
          isSelected && !isDiffMode
            ? "bg-primary/10"
            : "hover:bg-muted/30",
          isDiffMode && diffBaseId === commit.id && "bg-amber-500/10",
          isDiffMode && diffTargetId === commit.id && "bg-primary/10",
        )}
        onClick={() => {
          if (isDiffMode) {
            onSetDiffBaseId(commit.id);
          } else {
            onSelect(commit.id);
          }
        }}
        onMouseEnter={() => onHover(node.commit.id)}
        onMouseLeave={() => onHover(null)}
      >
        {/* Indentation with tree lines */}
        <div className="flex shrink-0" style={{ width: depth * INDENT }}>
          {Array.from({ length: depth }).map((_, i) => {
            const showLine = parentLines[i];
            return (
              <div key={i} className="relative" style={{ width: INDENT }}>
                {showLine && (
                  <div className="absolute left-[10px] top-0 bottom-0 w-px bg-border/90" />
                )}
              </div>
            );
          })}
        </div>

        {/* This node's connector: horizontal line + vertical stub */}
        {depth > 0 && (
          <div className="relative shrink-0" style={{ width: 14 }}>
            {/* Horizontal line from vertical trunk to node */}
            <div className="absolute top-[11px] left-0 w-2.5 h-px bg-border/90" />
            {/* Vertical line extending down (for non-last children) */}
            {!isLast && (
              <div className="absolute left-[10px] top-0 bottom-0 w-px bg-border/90" />
            )}
            {/* Vertical line from parent (top half, connecting to parent's horizontal) */}
            <div className="absolute left-[10px] top-0 h-[11px] w-px bg-border/90" />
          </div>
        )}

        {/* Collapse toggle or dot */}
        {hasChildren ? (
          <button
            onClick={(e) => onToggleCollapse(node.commit.id, e)}
            className={cn(
              "size-4 shrink-0 rounded flex items-center justify-center transition-colors ml-0.5",
              isCollapsed
                ? "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                : "text-primary/60 hover:bg-primary/10"
            )}
          >
            {isCollapsed ? (
              <IconChevronDown className="size-2.5" />
            ) : (
              <IconChevronRight className="size-2.5" />
            )}
          </button>
        ) : (
          <div className="w-4 flex items-center justify-center shrink-0 ml-0.5">
            <div className={cn(
              "size-1.5 rounded-full transition-colors",
              isSelected ? "bg-primary" : "bg-border/40 group-hover/node:bg-border/60"
            )} />
          </div>
        )}

        {/* Tiny thumbnail */}
        <div className="relative size-6 rounded shrink-0 overflow-hidden bg-black/40 ml-1">
          <img
            src={`${API_URL}/commits/${commit.id}/thumbnail`}
            alt=""
            className="w-full h-full object-cover"
            onError={(e) => {
              (e.target as HTMLElement).style.display = 'none';
            }}
          />
        </div>

        {/* Name + badges */}
        <div className="flex-1 min-w-0 flex items-center gap-1 ml-1.5">
          <span className={cn(
            "text-[11px] truncate leading-tight",
            isSelected ? "text-foreground font-medium" : "text-foreground/80",
            isHead && "font-semibold"
          )}>
            {commit.message}
          </span>

          {isHead && (
            <Badge variant="default" className="text-[7px] px-1 py-0 h-3 shrink-0 leading-none">
              HEAD
            </Badge>
          )}
          {node.depth > 0 && (
            <Badge variant="secondary" className="text-[7px] px-1 py-0 h-3 shrink-0 leading-none bg-primary/10 text-primary/70 border-0">
              b{node.depth}
            </Badge>
          )}
        </div>

        {/* Star */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggleStar({ ...commit, tags: node.tags || commit.tags });
          }}
          className={cn(
            "size-4 shrink-0 flex items-center justify-center rounded transition-colors opacity-0 group-hover/node:opacity-100",
            hasStarTag ? "opacity-100 text-amber-400" : "text-muted-foreground/40 hover:text-amber-400"
          )}
        >
          {hasStarTag ? (
            <IconStarFilled className="size-2.5" />
          ) : (
            <IconStar className="size-2.5" />
          )}
        </button>

        {/* Squash checkbox */}
        <button
          onClick={(e) => onToggleSelectForSquash(commit.id, e)}
          className={cn(
            "size-4 shrink-0 flex items-center justify-center rounded transition-colors opacity-0 group-hover/node:opacity-100",
            isSelectedForSquash ? "opacity-100 text-primary" : "text-muted-foreground/30 hover:text-muted-foreground"
          )}
        >
          {isSelectedForSquash ? (
            <IconSquareCheckFilled className="size-2.5" />
          ) : (
            <IconSquare className="size-2.5" />
          )}
        </button>
      </div>

      {/* Tags */}
      {node.tags && node.tags.length > 0 && (
        <div className="flex items-center gap-1" style={{ paddingLeft: depth * INDENT + 14 + 16 + 12 }}>
          {node.tags.map((tag) => (
            <span
              key={tag}
              className="text-[7px] px-1 py-px rounded bg-amber-500/15 text-amber-300/70 leading-none"
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      {/* Children */}
      {hasChildren && !isCollapsed && (
        <div className="flex flex-col">
          {node.children.map((child, idx) => (
            <CommitTreeNodeItem
              key={child.commit.id}
              node={child}
              depth={depth + 1}
              isLast={idx === node.children.length - 1}
              parentLines={[...parentLines, !isLast]}
              selectedCommitId={selectedCommitId}
              activeHeadId={activeHeadId}
              selectedForSquash={selectedForSquash}
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

      {/* Collapsed indicator */}
      {hasChildren && isCollapsed && (
        <div
          className="flex items-center gap-1 py-0 text-[8px] text-muted-foreground/40"
          style={{ paddingLeft: depth * INDENT + 14 + 16 + 12 }}
        >
          <IconGitBranch className="size-2.5 text-primary/40" />
          <span>+{node.children.length}</span>
        </div>
      )}
    </div>
  );
}
