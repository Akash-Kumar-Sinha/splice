'use client';

import React from 'react';
import {
  IconGitBranch,
  IconFolder,
  IconTarget,
  IconChevronDown,
  IconCheck,
  IconClock,
  IconUser,
} from '@tabler/icons-react';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { Commit } from '@/lib/types';
import { cn } from '@/lib/utils';

interface TreeGroup {
  root: Commit;
  members: Commit[];
}

interface VersionSelectorProps {
  label: string;
  badge: string;
  badgeVariant?: 'default' | 'outline';
  commit: Commit | undefined;
  commitId: string | null;
  selectedId: string | null;
  treeGroups: Map<string, TreeGroup>;
  activeTreeGroup: TreeGroup | null;
  isBase: boolean;
  otherCommitId: string | null;
  onSelect: (id: string) => void;
}

function formatRelativeDate(timestamp: string): string {
  try {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    if (diffMins < 1) return 'now';
    if (diffMins < 60) return `${diffMins}m`;
    if (diffHours < 24) return `${diffHours}h`;
    if (diffDays < 7) return `${diffDays}d`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  } catch {
    return '';
  }
}

export default function VersionSelector({
  label,
  badge: _badge,
  badgeVariant = 'outline',
  commit,
  commitId,
  selectedId,
  treeGroups,
  activeTreeGroup,
  isBase,
  otherCommitId,
  onSelect,
}: VersionSelectorProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-1.5">
        <span
          className={cn(
            "text-[10px] uppercase tracking-wider font-semibold",
            isBase ? 'text-muted-foreground' : 'text-primary'
          )}
        >
          {label}
        </span>
        <Badge variant={badgeVariant} className="text-[9px] h-3.5 px-1 flex items-center">
          {commitId ? commitId.slice(0, 7) : '—'}
        </Badge>
      </div>

      <DropdownMenu>
        <DropdownMenuTrigger className="w-full bg-muted/30 hover:bg-muted/40 border border-border/60 rounded-lg text-[11px] p-2.5 text-foreground flex items-center justify-between transition-colors outline-none cursor-pointer group">
          <span className="truncate flex items-center gap-2 min-w-0">
            {isBase ? (
              <IconGitBranch className="size-3.5 text-muted-foreground shrink-0" />
            ) : (
              <IconTarget className="size-3.5 text-primary shrink-0" />
            )}
            <span className="truncate font-medium">
              {commit ? commit.message : `Select version...`}
            </span>
          </span>
          <IconChevronDown className="size-3.5 text-muted-foreground shrink-0 ml-2 group-data-[state=open]:rotate-180 transition-transform" />
        </DropdownMenuTrigger>

        <DropdownMenuContent
          sideOffset={4}
          className="w-[380px] max-h-80 overflow-y-auto rounded-xl bg-popover border border-border/60 shadow-2xl z-50 p-1.5"
          style={{
            scrollbarWidth: 'thin',
            scrollbarColor: 'rgba(255,255,255,0.1) transparent',
          }}
        >
          {/* Same-tree group for target */}
          {!isBase && activeTreeGroup && (
            <DropdownMenuGroup>
              <DropdownMenuLabel className="px-2.5 py-1.5 text-[9px] font-bold text-primary uppercase tracking-widest flex items-center gap-1.5">
                <IconTarget className="size-2.5" />
                Same Project
              </DropdownMenuLabel>
              {activeTreeGroup.members.map((c) => (
                <CommitItem
                  key={`target-same-${c.id}`}
                  commit={c}
                  isSelected={c.id === selectedId}
                  isOtherSide={c.id === otherCommitId}
                  otherLabel={isBase ? 'Target' : 'Base'}
                  onClick={() => onSelect(c.id)}
                />
              ))}
            </DropdownMenuGroup>
          )}

          {Array.from(treeGroups.entries())
            .filter(([rootId]) => isBase || rootId !== activeTreeGroup?.root.id)
            .map(([rootId, group], gIdx) => (
              <React.Fragment key={`grp-${rootId}`}>
                {(!isBase || gIdx > 0 || activeTreeGroup) && (
                  <DropdownMenuSeparator className="my-1.5 bg-border/40" />
                )}
                <DropdownMenuGroup>
                  <DropdownMenuLabel className="px-2.5 py-1.5 text-[9px] font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-1.5">
                    <IconFolder className={cn("size-2.5", isBase ? 'text-primary' : 'text-muted-foreground')} />
                    {isBase ? 'Project' : 'Other'}: {group.root.message}
                    <span className="ml-auto text-[8px] font-normal opacity-50">{group.members.length}</span>
                  </DropdownMenuLabel>
                  {group.members.map((c) => (
                    <CommitItem
                      key={`${isBase ? 'base' : 'target'}-${c.id}`}
                      commit={c}
                      isSelected={c.id === selectedId}
                      isOtherSide={c.id === otherCommitId}
                      otherLabel={isBase ? 'Target' : 'Base'}
                      onClick={() => onSelect(c.id)}
                    />
                  ))}
                </DropdownMenuGroup>
              </React.Fragment>
            ))}
        </DropdownMenuContent>
      </DropdownMenu>

      {commit && (
        <div className="flex items-center gap-2 text-[9px] text-muted-foreground truncate">
          <span className="flex items-center gap-0.5">
            <IconUser className="size-2.5" />
            {commit.author}
          </span>
          <span>·</span>
          <span>{commit.media_refs.length} segment{commit.media_refs.length !== 1 ? 's' : ''}</span>
          <span>·</span>
          <span className="flex items-center gap-0.5">
            <IconClock className="size-2.5" />
            {formatRelativeDate(commit.timestamp)}
          </span>
        </div>
      )}
    </div>
  );
}

function CommitItem({
  commit,
  isSelected,
  isOtherSide,
  otherLabel,
  onClick,
}: {
  commit: Commit;
  isSelected: boolean;
  isOtherSide: boolean;
  otherLabel: string;
  onClick: () => void;
}) {
  return (
    <DropdownMenuItem
      onClick={onClick}
      className={cn(
        "flex items-start gap-2.5 px-2.5 py-2 rounded-lg text-[11px] cursor-pointer transition-colors group/item",
        isSelected
          ? "bg-primary/15 text-primary"
          : "hover:bg-accent/50 text-foreground"
      )}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="truncate font-medium leading-tight">{commit.message}</span>
          {isOtherSide && (
            <Badge variant="outline" className="text-[8px] h-3.5 px-1 shrink-0 text-muted-foreground border-border/60">
              {otherLabel}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-1.5 mt-0.5 text-[9px] text-muted-foreground">
          <span className="font-mono opacity-70">{commit.id.slice(0, 7)}</span>
          <span className="opacity-40">·</span>
          <span>{commit.author}</span>
          <span className="opacity-40">·</span>
          <span>{formatRelativeDate(commit.timestamp)}</span>
        </div>
      </div>
      {isSelected && <IconCheck className="size-3.5 text-primary shrink-0 mt-0.5" />}
    </DropdownMenuItem>
  );
}
