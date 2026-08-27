'use client';

import React from 'react';
import {
  IconTag,
  IconStar,
  IconStarFilled,
  IconSquare,
  IconSquareCheckFilled,
} from '@tabler/icons-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { SidebarMenuItem } from '@/components/ui/sidebar';
import { Commit } from '@/lib/types';
import { API_URL, formatDate } from '@/lib/api';
import { cn } from '@/lib/utils';

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
  return (
    <SidebarMenuItem>
      <div
        onClick={() => onSelect(commit.id)}
        className={cn(
          'flex items-center gap-1.5 py-1 px-1 rounded-md cursor-pointer transition-colors group/item min-w-0 select-none',
          isSelected
            ? 'bg-primary/10'
            : 'hover:bg-muted/30',
        )}
      >
        {/* Number */}
        <span className="text-[9px] text-muted-foreground/40 w-4 text-center shrink-0 tabular-nums">
          {totalCount - index}
        </span>

        {/* Tiny thumbnail */}
        <div className="relative size-6 rounded shrink-0 overflow-hidden bg-black/40">
          <img
            src={`${API_URL}/commits/${commit.id}/thumbnail`}
            alt=""
            className="w-full h-full object-cover"
            onError={(e) => {
              e.currentTarget.style.display = 'none';
            }}
          />
        </div>

        {/* Name + badges */}
        <div className="flex-1 min-w-0 flex items-center gap-1">
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
        </div>

        {/* Tags inline */}
        {commit.tags && commit.tags.length > 0 && (
          <div className="flex items-center gap-0.5 shrink-0">
            {commit.tags.slice(0, 2).map((t) => (
              <span
                key={t}
                className="text-[7px] px-1 py-px rounded bg-amber-500/15 text-amber-300/70 leading-none"
              >
                {t}
              </span>
            ))}
          </div>
        )}

        {/* Star */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggleStar(commit);
          }}
          className={cn(
            "size-4 shrink-0 flex items-center justify-center rounded transition-colors opacity-0 group-hover/item:opacity-100",
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
            "size-4 shrink-0 flex items-center justify-center rounded transition-colors opacity-0 group-hover/item:opacity-100",
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
    </SidebarMenuItem>
  );
}
