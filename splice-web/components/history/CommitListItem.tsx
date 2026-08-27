'use client';

import React from 'react';
import {
  IconTag,
  IconStar,
  IconStarFilled,
  IconGitCompare,
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
  onOpenDiff: (commitId: string) => void;
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
  onOpenDiff,
}: CommitListItemProps) {
  return (
    <SidebarMenuItem>
      <div
        onClick={() => onSelect(commit.id)}
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
                #{totalCount - index}
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
                onToggleStar(commit);
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
                onOpenDiff(commit.id);
              }}
              title="Compare Diff (vs Parent)"
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
}
