'use client';

import React, { useState } from 'react';
import { IconTimeline, IconHistory, IconSparkles } from '@tabler/icons-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import HistoryPanel, { Commit } from './HistoryPanel';
import TimelineEditor from './TimelineEditor';

interface AppWorkspaceProps {
  initialCommits: Commit[];
}

export default function AppWorkspace({ initialCommits }: AppWorkspaceProps) {
  const [commits, setCommits] = useState<Commit[]>(initialCommits);
  const [activeTab, setActiveTab] = useState<'editor' | 'history'>('editor');

  const headCommitId = commits.length > 0 ? commits[0].id : null;

  const refreshCommits = async () => {
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
      const res = await fetch(`${apiUrl}/commits`, { cache: 'no-store' });
      if (res.ok) {
        const data: Commit[] = await res.json();
        setCommits(data);
      }
    } catch (err) {
      console.error('Error refreshing commits:', err);
    }
  };

  return (
    <div className="flex flex-col h-screen bg-background text-foreground font-sans overflow-hidden">
      {/* Top Workspace Bar */}
      <header className="h-14 bg-card/80 border-b border-border px-6 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="size-3 rounded-full bg-primary animate-pulse" />
          <span className="font-bold text-sm tracking-tight text-foreground flex items-center gap-1.5">
            <IconSparkles className="size-4 text-primary" /> Splice Studio
          </span>
          <Separator orientation="vertical" className="h-4" />
          <Badge variant="outline" className="text-[10px] font-mono">
            v0.1.0
          </Badge>
        </div>

        {/* Mode Switcher */}
        <div className="flex bg-muted/40 p-1 rounded-xl border border-border gap-1 text-xs font-mono">
          <Button
            variant={activeTab === 'editor' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setActiveTab('editor')}
          >
            <IconTimeline data-icon="inline-start" />
            Timeline Editor
          </Button>
          <Button
            variant={activeTab === 'history' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => {
              setActiveTab('history');
              refreshCommits();
            }}
          >
            <IconHistory data-icon="inline-start" />
            Commit History ({commits.length})
          </Button>
        </div>

        <div className="text-xs font-mono text-muted-foreground flex items-center gap-1.5">
          <span>HEAD:</span>
          <Badge variant="outline" className="font-mono text-primary font-bold">
            {headCommitId ? `${headCommitId.slice(0, 8)}...` : 'None'}
          </Badge>
        </div>
      </header>

      {/* Main Content View */}
      <div className="flex-1 overflow-hidden">
        {activeTab === 'editor' ? (
          <TimelineEditor
            headCommitId={headCommitId}
            onCommitSaved={() => {
              refreshCommits();
            }}
          />
        ) : (
          <HistoryPanel initialCommits={commits} />
        )}
      </div>
    </div>
  );
}
