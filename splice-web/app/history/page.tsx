import HistoryPage from '@/components/HistoryPage';

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

export default async function Page() {
  const commits = await getCommits();
  return <HistoryPage initialCommits={commits} />;
}
