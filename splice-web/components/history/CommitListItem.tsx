'use client';

import React from 'react';
import { motion } from 'framer-motion';
import {
  IconStar,
  IconStarFilled,
  IconSquare,
  IconSquareCheckFilled,
} from '@tabler/icons-react';
import { Badge } from '@/components/ui/badge';
import { SidebarMenuItem } from '@/components/ui/sidebar';
import { Commit } from '@/lib/types';
import { cn } from '@/lib/utils';

function formatRelativeDate(timestamp: any): string {
  try {
    let date: Date;
    if (Array.isArray(timestamp)) {
      date = new Date(Date.UTC(timestamp[0], timestamp[1] - 1, timestamp[2], timestamp[3], timestamp[4], timestamp[5]));
    } else {
      date = new Date(timestamp);
    }
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  } catch {
    return '';
  }
}

interface CommitListItemProps {
  commit: Commit;
  index: number;
  totalCount: number;
  isSelected: boolean;
  isHead: boolean;
  isSelectedForSquash: boolean;
  hasStarTag: boolean;
  onSelect: (commitId: string) => void;
  onToggleSelectForSquash: (commitId: string, e?: React.MouseEvent) => void;
  onToggleStar: (commit: Commit) => void;
}

export default function CommitListItem({
  commit,
  index,
  totalCount,
  isSelected,
  isHead,
  isSelectedForSquash,
  hasStarTag,
  onSelect,
  onToggleSelectForSquash,
  onToggleStar,
}: CommitListItemProps) {
  const versionNum = totalCount - index;
  const isFirst = index === 0;
  const isLast = index === totalCount - 1;

  return (
    <SidebarMenuItem className="relative my-0.5">
      {/* Vertical Progress Connecting Line */}
      {totalCount > 1 && (
        <div
          className={cn(
            'absolute left-[18px] w-px bg-border/50 z-0 pointer-events-none',
            isFirst ? 'top-5 bottom-0' : isLast ? 'top-0 h-5' : 'top-0 bottom-0'
          )}
        />
      )}

      <motion.div
        onClick={() => onSelect(commit.id)}
        className={cn(
          'relative z-10 flex items-start gap-3 p-2.5 rounded-xl cursor-pointer group/item min-w-0 select-none border',
          isSelected
            ? 'bg-primary/8 border-primary/30 shadow-sm ring-1 ring-primary/10'
            : 'bg-transparent border-transparent hover:bg-muted/30 hover:border-border/40'
        )}
        whileHover={{ scale: 1.01 }}
        whileTap={{ scale: 0.99 }}
        transition={{ duration: 0.1 }}
      >
        {/* Progress Step Dot / Milestone Node */}
        <div className="flex flex-col items-center shrink-0 mt-0.5">
          <div
            className={cn(
              'size-4 rounded-full border-2 transition-all flex items-center justify-center',
              isHead
                ? 'border-primary bg-primary shadow-sm ring-2 ring-primary/20'
                : isSelected
                  ? 'border-primary bg-background ring-2 ring-primary/15'
                  : 'border-muted-foreground/30 bg-background group-hover/item:border-muted-foreground/60'
            )}
          >
            {isHead && <div className="size-1.5 rounded-full bg-primary-foreground" />}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0 flex flex-col gap-1.5">
          {/* Header line: version badge + title + time */}
          <div className="flex items-center justify-between gap-2 min-w-0">
            <div className="flex items-center gap-2 min-w-0">
              <span
                className={cn(
                  'text-[9px] font-bold px-1.5 py-0.5 rounded-md leading-none tabular-nums shrink-0',
                  isHead
                    ? 'bg-primary text-primary-foreground'
                    : isSelected
                      ? 'bg-primary/15 text-primary font-semibold'
                      : 'bg-muted/50 text-muted-foreground/70'
                )}
              >
                v{versionNum}
              </span>
              <span
                className={cn(
                  'text-[11px] truncate leading-tight',
                  isSelected ? 'text-foreground font-semibold' : 'text-foreground/80 font-medium'
                )}
              >
                {commit.message}
              </span>
            </div>

            <span className="text-[9px] text-muted-foreground/50 shrink-0 tabular-nums">
              {formatRelativeDate(commit.timestamp)}
            </span>
          </div>

          {/* Sub line: tags + actions */}
          <div className="flex items-center justify-between gap-2">
            {/* Tags */}
            <div className="flex items-center gap-1 flex-wrap min-w-0">
              {commit.tags && commit.tags.length > 0 ? (
                commit.tags.map((t) => (
                  <Badge
                    key={t}
                    variant="secondary"
                    className="text-[8px] px-1.5 py-0 h-3.5 bg-amber-500/10 text-amber-400/80 border-amber-500/20"
                  >
                    {t}
                  </Badge>
                ))
              ) : (
                <span className="text-[9px] text-muted-foreground/30">No tags</span>
              )}
            </div>

            {/* Actions */}
            <div className="flex items-center gap-0.5 shrink-0">
              {/* Star */}
              <motion.button
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleStar(commit);
                }}
                className={cn(
                  'size-5 flex items-center justify-center rounded-md opacity-0 group-hover/item:opacity-100 hover:bg-muted/50',
                  hasStarTag
                    ? 'opacity-100 text-amber-400'
                    : 'text-muted-foreground/30 hover:text-amber-400'
                )}
                whileHover={{ scale: 1.2 }}
                whileTap={{ scale: 0.9 }}
                title="Star this version"
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
                  'size-5 flex items-center justify-center rounded-md opacity-0 group-hover/item:opacity-100 hover:bg-muted/50',
                  isSelectedForSquash
                    ? 'opacity-100 text-primary'
                    : 'text-muted-foreground/30 hover:text-foreground'
                )}
                whileHover={{ scale: 1.2 }}
                whileTap={{ scale: 0.9 }}
                title="Select for squash"
              >
                {isSelectedForSquash ? (
                  <IconSquareCheckFilled className="size-3" />
                ) : (
                  <IconSquare className="size-3" />
                )}
              </motion.button>
            </div>
          </div>
        </div>
      </motion.div>
    </SidebarMenuItem>
  );
}
