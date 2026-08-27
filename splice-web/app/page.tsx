interface Commit {
  id: string;
  parent: string | null;
  timestamp: string;
  author: string;
  message: string;
  timeline_hash: string;
  media_refs: string[];
}

async function getCommits(): Promise<Commit[]> {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
  try {
    const res = await fetch(`${apiUrl}/commits`, { cache: "no-store" });
    if (!res.ok) {
      console.error(`Failed to fetch commits: ${res.status} ${res.statusText}`);
      return [];
    }
    return res.json();
  } catch (error) {
    console.error("Error connecting to splice-api:", error);
    return [];
  }
}

export default async function Page() {
  const commits = await getCommits();

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 font-sans p-8 md:p-16">
      <div className="max-w-4xl mx-auto">
        <header className="mb-10 border-b border-zinc-800 pb-6 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-white flex items-center gap-3">
              <span className="h-4 w-4 rounded-full bg-emerald-500 inline-block animate-pulse"></span>
              Splice Commit Log
            </h1>
            <p className="text-zinc-400 mt-1 text-sm">
              Event-sourced immutable timeline snapshots & content-addressed media
            </p>
          </div>
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-2 text-right">
            <div className="text-xs text-zinc-500 uppercase tracking-wider font-semibold">Total Commits</div>
            <div className="text-2xl font-mono font-bold text-emerald-400">{commits.length}</div>
          </div>
        </header>

        {commits.length === 0 ? (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 text-center">
            <p className="text-zinc-400">No commits found or API server offline.</p>
            <p className="text-zinc-500 text-xs mt-2 font-mono">Ensure splice-api is running on port 8000</p>
          </div>
        ) : (
          <div className="space-y-4">
            <ul className="space-y-3 font-mono text-sm">
              {commits.map((c: Commit, index: number) => (
                <li
                  key={c.id}
                  className="bg-zinc-900/80 border border-zinc-800/80 hover:border-zinc-700 rounded-lg p-4 transition-all duration-150 flex flex-col md:flex-row md:items-center justify-between gap-3"
                >
                  <div className="flex items-start md:items-center gap-3">
                    <span className="text-xs font-semibold text-zinc-500 bg-zinc-800/80 rounded px-2 py-0.5 min-w-9 text-center">
                      #{commits.length - 1 - index}
                    </span>
                    <div>
                      <div className="text-zinc-200 font-sans font-medium text-base">
                        {c.message}
                      </div>
                      <div className="text-xs text-zinc-400 mt-0.5">
                        <span>{c.author}</span>
                        <span className="mx-2 text-zinc-600">•</span>
                        <span>{c.timestamp}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 text-xs text-zinc-400 self-end md:self-center">
                    <span className="bg-zinc-950 border border-zinc-800 rounded px-2 py-1 font-mono text-[11px] text-zinc-400" title={`Commit ID: ${c.id}`}>
                      id: {c.id.slice(0, 8)}...
                    </span>
                    <span className="bg-zinc-950 border border-zinc-800 rounded px-2 py-1 font-mono text-[11px] text-cyan-400" title={`Timeline Hash: ${c.timeline_hash}`}>
                      hash: {c.timeline_hash.slice(0, 8)}...
                    </span>
                    {c.media_refs.length > 0 && (
                      <span className="bg-zinc-950 border border-zinc-800 rounded px-2 py-1 font-mono text-[11px] text-amber-400">
                        {c.media_refs.length} media
                      </span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
