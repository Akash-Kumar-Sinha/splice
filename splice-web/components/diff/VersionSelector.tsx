'use client';

import React from 'react';
import {
  IconGitBranch,
  IconFolder,
  IconTarget,
  IconChevronDown,
  IconCheck,
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

export default function VersionSelector({
  label,
  badge,
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
    <div className="bg-background/60 border border-border rounded-xl p-3 flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className={cn(
          "text-[11px] font-mono uppercase font-semibold",
          isBase ? 'text-muted-foreground' : 'text-primary'
        )}>
          {label}
        </span>
        <Badge variant={badgeVariant} className="font-mono text-[10px]">
          {commitId ? `${commitId.slice(0, 8)}...` : 'None'}
        </Badge>
      </div>

      <DropdownMenu>
        <DropdownMenuTrigger className="w-full bg-card hover:bg-muted/50 border border-border rounded-lg text-xs font-mono p-2 text-foreground flex items-center justify-between transition-colors outline-none focus:ring-1 focus:ring-primary cursor-pointer">
          <span className="truncate flex items-center gap-2">
            {isBase ? (
              <IconGitBranch className="size-3.5 text-primary shrink-0" />
            ) : (
              <IconTarget className="size-3.5 text-primary shrink-0" />
            )}
            <span className="font-semibold text-foreground truncate">
              {commit ? `${commit.message} (${commit.id.slice(0, 7)})` : `Select ${isBase ? 'base' : 'target'} version...`}
            </span>
          </span>
          <IconChevronDown className="size-4 text-muted-foreground shrink-0 ml-2" />
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-[360px] max-h-72 overflow-y-auto p-1.5 rounded-2xl bg-popover/95 border border-border backdrop-blur-md shadow-2xl z-50">
          {/* For target selector, show same-tree group first */}
          {!isBase && activeTreeGroup && (
            <DropdownMenuGroup>
              <DropdownMenuLabel className="px-2.5 py-1 text-[11px] font-mono font-bold text-primary uppercase flex items-center gap-1.5">
                <IconTarget className="size-3 text-primary" />
                🎯 Same Project: {activeTreeGroup.root.message}
              </DropdownMenuLabel>
              {activeTreeGroup.members.map((c) => (
                <DropdownMenuItem
                  key={`target-same-${c.id}`}
                  onClick={() => onSelect(c.id)}
                  className={cn(
                    "flex items-center justify-between px-2.5 py-2 rounded-xl text-xs font-mono cursor-pointer transition-colors",
                    c.id === selectedId ? "bg-primary/15 text-primary font-bold" : "hover:bg-accent hover:text-accent-foreground"
                  )}
                >
                  <div className="flex flex-col truncate pr-2">
                    <span className="truncate text-foreground font-medium flex items-center gap-1.5">
                      {c.message}
                      {c.id === otherCommitId && (
                        <Badge variant="outline" className="text-[9px] py-0 px-1 font-mono text-muted-foreground">
                          {isBase ? 'Target (B)' : 'Base (A)'}
                        </Badge>
                      )}
                    </span>
                    <span className="text-[10px] text-muted-foreground opacity-80">{c.id.slice(0, 7)} • {c.author}</span>
                  </div>
                  {c.id === selectedId && <IconCheck className="size-4 text-primary shrink-0 ml-1" />}
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
          )}

          {Array.from(treeGroups.entries())
            .filter(([rootId]) => isBase || rootId !== activeTreeGroup?.root.id)
            .map(([rootId, group], gIdx) => (
              <React.Fragment key={`grp-${rootId}`}>
                {(!isBase || gIdx > 0 || activeTreeGroup) && <DropdownMenuSeparator className="my-1.5 opacity-60" />}
                <DropdownMenuGroup>
                  <DropdownMenuLabel className="px-2.5 py-1 text-[11px] font-mono font-bold text-muted-foreground uppercase flex items-center gap-1.5">
                    <IconFolder className={cn("size-3", isBase ? 'text-primary' : 'text-muted-foreground')} />
                    {isBase ? 'Project' : 'Other Project'}: {group.root.message} ({group.members.length})
                  </DropdownMenuLabel>
                  {group.members.map((c) => (
                    <DropdownMenuItem
                      key={`${isBase ? 'base' : 'target'}-${c.id}`}
                      onClick={() => onSelect(c.id)}
                      className={cn(
                        "flex items-center justify-between px-2.5 py-2 rounded-xl text-xs font-mono cursor-pointer transition-colors",
                        c.id === selectedId ? "bg-primary/15 text-primary font-bold" : "hover:bg-accent hover:text-accent-foreground"
                      )}
                    >
                      <div className="flex flex-col truncate pr-2">
                        <span className="truncate text-foreground font-medium">{c.message}</span>
                        <span className="text-[10px] text-muted-foreground opacity-80">{c.id.slice(0, 7)} • {c.author}</span>
                      </div>
                      {c.id === selectedId && <IconCheck className="size-4 text-primary shrink-0 ml-1" />}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuGroup>
              </React.Fragment>
            ))}
        </DropdownMenuContent>
      </DropdownMenu>

      {commit && (
        <div className="text-[11px] font-mono text-muted-foreground truncate">
          {commit.author} • {commit.media_refs.length} media segment(s)
        </div>
      )}
    </div>
  );
}
