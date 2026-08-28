'use client';

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
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
  const branchChildren = node.branch_children || [];
  const hasBranchChildren = branchChildren.length > 0;
  const isCollapsed = collapsedNodeIds.has(node.commit.id);
  const hasStarTag =
    node.tags?.includes('Picture Lock') ||
    node.tags?.includes("Director's Cut") ||
    node.tags?.includes('Starred');

  return (
    <motion.div
      className="flex flex-col"
      initial={{ opacity: 0, x: -5 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.15, ease: 'easeOut' }}
    >
      <motion.div
        className={cn(
          "flex items-center gap-0 py-[4px] px-1 rounded-lg cursor-pointer group/node min-w-0",
          isSelected && !isDiffMode
            ? "bg-primary/8 ring-1 ring-primary/10"
            : "hover:bg-muted/25",
          isDiffMode && diffBaseId === commit.id && "bg-amber-500/10 ring-1 ring-amber-500/20",
          isDiffMode && diffTargetId === commit.id && "bg-primary/8 ring-1 ring-primary/10",
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
        whileHover={{ x: 2 }}
        transition={{ duration: 0.1 }}
      >
        {/* Indentation with tree lines */}
        <div className="flex shrink-0" style={{ width: depth * INDENT }}>
          {Array.from({ length: depth }).map((_, i) => {
            const showLine = parentLines[i];
            return (
              <div key={i} className="relative" style={{ width: INDENT }}>
                {showLine && (
                  <div className="absolute left-[10px] top-0 bottom-0 w-px bg-border/80" />
                )}
              </div>
            );
          })}
        </div>

        {/* This node's connector: horizontal line + vertical stub */}
        {depth > 0 && (
          <div className="relative shrink-0" style={{ width: 14 }}>
            {/* Horizontal line from vertical trunk to node */}
            <div className="absolute top-[11px] left-0 w-2.5 h-px bg-border/80" />
            {/* Vertical line extending down (for non-last children) */}
            {!isLast && (
              <div className="absolute left-[10px] top-0 bottom-0 w-px bg-border/80" />
            )}
            {/* Vertical line from parent (top half, connecting to parent's horizontal) */}
            <div className="absolute left-[10px] top-0 h-[11px] w-px bg-border/80" />
          </div>
        )}

        {/* Collapse toggle or dot */}
        {hasBranchChildren ? (
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
              <IconChevronRight className="size-2.5" />
            ) : (
              <IconChevronDown className="size-2.5" />
            )}
          </button>
        ) : (
          <div className="w-4 flex items-center justify-center shrink-0 ml-0.5">
            <div className={cn(
              "size-1.5 rounded-full transition-colors",
              isSelected ? "bg-primary" : "bg-border/60 group-hover/node:bg-border/90"
            )} />
          </div>
        )}

        {/* Tiny thumbnail */}
        <div className="relative size-7 rounded-lg shrink-0 overflow-hidden bg-black/30 ml-1 border border-border/40">
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
        <div className="flex-1 min-w-0 flex items-center gap-1.5 ml-2">
          <span className={cn(
            "text-[11px] truncate leading-tight",
            isSelected ? "text-foreground font-semibold" : "text-foreground/80 font-medium",
            isHead && "font-semibold"
          )}>
            {commit.message}
          </span>

          {isHead && (
            <Badge variant="default" className="text-[8px] px-1.5 py-0 h-3.5 shrink-0 leading-none font-bold">
              HEAD
            </Badge>
          )}
          {node.is_branch_root && node.depth > 0 && (
            <Badge
              variant="secondary"
              className="text-[8px] px-1.5 py-0 h-3.5 shrink-0 leading-none bg-primary/15 text-primary border border-primary/25 flex items-center gap-0.5"
            >
              <IconGitBranch className="size-2" />
              b{node.depth}
            </Badge>
          )}
        </div>

        {/* Star */}
        <motion.button
          onClick={(e) => {
            e.stopPropagation();
            onToggleStar({ ...commit, tags: node.tags || commit.tags });
          }}
          className={cn(
            "size-5 shrink-0 flex items-center justify-center rounded-md opacity-0 group-hover/node:opacity-100 hover:bg-muted/50",
            hasStarTag ? "opacity-100 text-amber-400" : "text-muted-foreground/30 hover:text-amber-400"
          )}
          whileHover={{ scale: 1.2 }}
          whileTap={{ scale: 0.9 }}
        >
          {hasStarTag ? (
            <IconStarFilled className="size-3" />
          ) : (
            <IconStar className="size-3" />
          )}
        </motion.button>

        {/* Squash checkbox */}
        <motion.button
          onClick={(e) => onToggleSelectForSquash(commit.id, e)}
          className={cn(
            "size-5 shrink-0 flex items-center justify-center rounded-md opacity-0 group-hover/node:opacity-100 hover:bg-muted/50",
            isSelectedForSquash ? "opacity-100 text-primary" : "text-muted-foreground/30 hover:text-muted-foreground"
          )}
          whileHover={{ scale: 1.2 }}
          whileTap={{ scale: 0.9 }}
        >
          {isSelectedForSquash ? (
            <IconSquareCheckFilled className="size-3" />
          ) : (
            <IconSquare className="size-3" />
          )}
        </motion.button>
      </motion.div>

      {/* Tags */}
      {node.tags && node.tags.filter((t) => t !== 'Branch').length > 0 && (
        <div className="flex items-center gap-1" style={{ paddingLeft: depth * INDENT + 14 + 16 + 12 }}>
          {node.tags
            .filter((t) => t !== 'Branch')
            .map((tag) => (
              <span
                key={tag}
                className="text-[7px] px-1 py-px rounded bg-amber-500/15 text-amber-300/70 leading-none"
              >
                {tag}
              </span>
            ))}
        </div>
      )}

      {/* 1. Branch Children (Indented directly under this commit) */}
      <AnimatePresence>
        {hasBranchChildren && !isCollapsed && (
          <motion.div
            className="flex flex-col"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
          >
            {branchChildren.map((child, idx) => (
              <CommitTreeNodeItem
                key={child.commit.id}
                node={child}
                depth={depth + 1}
                isLast={idx === branchChildren.length - 1 && !node.linear_next}
                parentLines={[...parentLines, !!node.linear_next || idx < branchChildren.length - 1]}
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
          </motion.div>
        )}
      </AnimatePresence>

      {/* Collapsed indicator */}
      <AnimatePresence>
        {hasBranchChildren && isCollapsed && (
          <motion.div
            className="flex items-center gap-1.5 py-1 text-[9px] text-muted-foreground/50 font-medium"
            style={{ paddingLeft: depth * INDENT + 14 + 16 + 12 }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <IconGitBranch className="size-2.5 text-primary/50" />
            <span>+{branchChildren.length} branch{branchChildren.length > 1 ? 'es' : ''}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 2. Linear Progression Next (Continues on the exact same linear track) */}
      {node.linear_next && (
        <CommitTreeNodeItem
          key={node.linear_next.commit.id}
          node={node.linear_next}
          depth={depth}
          isLast={isLast}
          parentLines={parentLines}
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
      )}
    </motion.div>
  );
}

