'use client';

import React from 'react';
import { IconTrash } from '@tabler/icons-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Clip } from '@/lib/editor-state';

interface EditorClipListProps {
  clips: Clip[];
  onRemoveClip: (clipId: string) => void;
}

export default function EditorClipList({ clips, onRemoveClip }: EditorClipListProps) {
  return (
    <Card className="flex-1 flex flex-col bg-card/40 border border-border rounded-2xl overflow-hidden">
      <div className="px-4 py-3 border-b border-border flex items-center justify-between">
        <span className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">
          Clips
        </span>
        <Badge variant="secondary" className="text-[10px] h-5 min-w-5 px-1.5">
          {clips.length}
        </Badge>
      </div>
      <ScrollArea className="max-h-48 w-full">
        <div className="p-2 flex flex-col gap-1">
          {clips.length === 0 ? (
            <div className="text-[11px] text-muted-foreground text-center py-6">
              No clips yet
            </div>
          ) : (
            clips.map((clip, i) => (
              <div
                key={clip.id}
                className="group flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-muted/50 transition-colors text-xs"
              >
                <span className="size-5 rounded-md bg-muted flex items-center justify-center text-[10px] text-muted-foreground shrink-0">
                  {i + 1}
                </span>
                <span className="text-foreground truncate flex-1 text-[11px]">
                  {clip.name}
                </span>
                <span className="text-muted-foreground text-[10px] shrink-0">
                  {(clip.out_point - clip.in_point).toFixed(1)}s
                </span>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  onClick={() => onRemoveClip(clip.id)}
                  className="size-5 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity"
                  title="Remove"
                >
                  <IconTrash className="size-3" />
                </Button>
              </div>
            ))
          )}
        </div>
      </ScrollArea>
    </Card>
  );
}
