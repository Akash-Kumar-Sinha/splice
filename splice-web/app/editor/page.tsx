import { Suspense } from 'react';
import EditorPage from '@/components/EditorPage';

export const dynamic = 'force-dynamic';

async function getCommits() {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
  try {
    const res = await fetch(`${apiUrl}/commits`, { cache: 'no-store' });
    if (!res.ok) return [];
    return res.json();
  } catch {
    return [];
  }
}

async function getCommitTimeline(commitId?: string) {
  if (!commitId) return null;
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
  try {
    const res = await fetch(`${apiUrl}/commits/${commitId}/revert?mode=preview`, {
      cache: 'no-store',
    });

    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export default async function Page({
  searchParams,
}: {
  searchParams?: Promise<{ commitId?: string }>;
}) {
  const resolvedParams = searchParams ? await searchParams : undefined;
  const commitId = resolvedParams?.commitId;

  const [commits, timeline] = await Promise.all([
    getCommits(),
    getCommitTimeline(commitId),
  ]);

  return (
    <Suspense
      fallback={
        <div className="h-screen bg-background flex items-center justify-center text-muted-foreground text-sm">
          Loading editor...
        </div>
      }
    >
      <EditorPage
        initialCommits={commits}
        initialLoadedTimeline={timeline}
      />
    </Suspense>
  );
}
