import AppWorkspace from '@/components/AppWorkspace';
import { Commit } from '@/components/HistoryPanel';

export const dynamic = 'force-dynamic';


async function getCommits(): Promise<Commit[]> {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
  try {
    const res = await fetch(`${apiUrl}/commits`, { cache: 'no-store' });
    if (!res.ok) {
      console.error(`Failed to fetch commits: ${res.status} ${res.statusText}`);
      return [];
    }
    return res.json();
  } catch (error) {
    console.error('Error connecting to splice-api:', error);
    return [];
  }
}

export default async function Page() {
  const commits = await getCommits();

  return <AppWorkspace initialCommits={commits} />;
}
