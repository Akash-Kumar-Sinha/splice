'use client';

import React from 'react';
import { IconTrash } from '@tabler/icons-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Clip } from '@/lib/editor-state';

interface EditorClipListProps {
  clips: Clip[];
  onRemoveClip: (clipId: string) => void;
}

export default function EditorClipList({ clips, onRemoveClip }: EditorClipListProps) {
  return (
    <Card className="flex-1 flex flex-col p-4 bg-card/40 border border-border rounded-2xl">
      <CardHeader className="p-0 pb-3 border-b border-border">
        <CardTitle className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
          Track Clips Overview ({clips.length})
        </CardTitle>
      </CardHeader>
      <ScrollArea className="max-h-52 w-full pr-1">
        <CardContent className="p-0 pt-3 flex flex-col gap-2">
          {clips.length === 0 ? (
            <div className="text-xs font-mono text-muted-foreground text-center py-6">
              No clips on track yet.
            </div>
          ) : (
            clips.map((clip, i) => (
              <div
                key={clip.id}
                className="bg-background border border-border rounded-xl p-2.5 flex items-center justify-between text-xs font-mono"
              >
                <div className="flex items-center gap-2 truncate max-w-[240px]">
                  <Badge variant="outline" className="font-mono text-[10px]">
                    #{i + 1}
                  </Badge>
                  <span className="text-foreground truncate">{clip.name}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-muted-foreground">
                    {clip.in_point.toFixed(1)}s - {clip.out_point.toFixed(1)}s
                  </span>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    onClick={() => onRemoveClip(clip.id)}
                    className="text-destructive hover:text-destructive"
                    title="Remove Clip"
                  >
                    <IconTrash className="size-3.5" />
                  </Button>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </ScrollArea>
    </Card>
  );
}
