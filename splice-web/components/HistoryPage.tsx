'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import AppHeader from '@/components/AppHeader';
import HistoryPanel from '@/components/HistoryPanel';
import StorageCleanupModal from '@/components/StorageCleanupModal';
import { Commit, Timeline } from '@/lib/types';

interface HistoryPageProps {
  initialCommits: Commit[];
}

export default function HistoryPage({ initialCommits }: HistoryPageProps) {
  const [commits, setCommits] = useState<Commit[]>(initialCommits);
  const [showStorageModal, setShowStorageModal] = useState(false);
  const router = useRouter();

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

  const handleOpenInEditor = (timeline: Timeline) => {
    router.push(`/editor?commitId=${timeline.commit_id}`);
  };


  return (
    <div className="flex flex-col h-screen bg-background text-foreground font-sans overflow-hidden">
      <AppHeader
        headCommitId={headCommitId}
        commitCount={commits.length}
        onOpenStorageModal={() => setShowStorageModal(true)}
      />

      <StorageCleanupModal
        isOpen={showStorageModal}
        onClose={() => setShowStorageModal(false)}
        onCleanupCompleted={refreshCommits}
      />

      <div className="flex-1 min-h-0 overflow-hidden">
        <HistoryPanel
          initialCommits={commits}
          onOpenInEditor={handleOpenInEditor}
        />
      </div>
    </div>
  );
}
