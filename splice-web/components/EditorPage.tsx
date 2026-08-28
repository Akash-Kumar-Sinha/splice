'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';

import AppHeader from '@/components/AppHeader';
import TimelineEditor from '@/components/TimelineEditor';
import StorageCleanupModal from '@/components/StorageCleanupModal';
import { Commit, Timeline } from '@/lib/types';
import { API_URL } from '@/lib/api';

interface EditorPageProps {
  initialCommits: Commit[];
  initialLoadedTimeline?: Timeline | null;
}

export default function EditorPage({
  initialCommits,
  initialLoadedTimeline = null,
}: EditorPageProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const commitIdParam = searchParams.get('commitId');

  const [commits, setCommits] = useState<Commit[]>(initialCommits);
  const [showStorageModal, setShowStorageModal] = useState(false);
  const [loadedTimeline, setLoadedTimeline] = useState<Timeline | null>(
    commitIdParam ? initialLoadedTimeline : null
  );
  const ignoreCommitParamRef = useRef<string | null>(null);

  const headCommitId = commits.length > 0 ? commits[0].id : null;

  const refreshCommits = async () => {
    try {
      const res = await fetch(`${API_URL}/commits`, { cache: 'no-store' });
      if (res.ok) {
        const data: Commit[] = await res.json();
        setCommits(data);
      }
    } catch (err) {
      console.error('Error refreshing commits:', err);
    }
  };

  useEffect(() => {
    if (!commitIdParam) {
      setLoadedTimeline(null);
      ignoreCommitParamRef.current = null;
      return;
    }

    if (ignoreCommitParamRef.current === commitIdParam) {
      return;
    }

    if (loadedTimeline?.commit_id === commitIdParam) return;
    let isCancelled = false;

    const fetchCommitTimeline = async () => {
      try {
        const res = await fetch(`${API_URL}/commits/${commitIdParam}/revert?mode=preview`, {
          cache: 'no-store',
        });

        if (res.ok && !isCancelled) {
          const data: Timeline = await res.json();
          setLoadedTimeline(data);
        }
      } catch (err) {
        console.error('Error fetching commit timeline for editor:', err);
      }
    };

    fetchCommitTimeline();

    return () => {
      isCancelled = true;
    };
  }, [commitIdParam, loadedTimeline?.commit_id]);

  const handleStartNewProject = useCallback(() => {
    if (commitIdParam) {
      ignoreCommitParamRef.current = commitIdParam;
    }
    setLoadedTimeline(null);
    if (typeof window !== 'undefined') {
      window.history.replaceState(null, '', '/editor');
    }
    router.replace('/editor');
  }, [commitIdParam, router]);

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
        <TimelineEditor
          headCommitId={headCommitId}
          loadedTimeline={loadedTimeline}
          onCommitSaved={refreshCommits}
          onStartNewProject={handleStartNewProject}
        />
      </div>
    </div>
  );
}
