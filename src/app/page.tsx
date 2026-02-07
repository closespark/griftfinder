'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { isSupabaseConfigured } from '@/lib/supabase/client';
import { getDashboardStats, getActiveInvestigations, getRecentSignals, getUniverseStats, type MmixEntry, type Signal } from '@/lib/supabase/queries';

export default function Home() {
  const [stats, setStats] = useState({ entityCount: 0, signalCount: 0, activeInvestigations: 0, publishedStories: 0 });
  const [universe, setUniverse] = useState({ total: 0 });
  const [investigations, setInvestigations] = useState<MmixEntry[]>([]);
  const [signals, setSignals] = useState<Signal[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isSupabaseConfigured()) { setLoading(false); return; }
    Promise.all([
      getDashboardStats(),
      getUniverseStats(),
      getActiveInvestigations(),
      getRecentSignals(10),
    ]).then(([s, u, inv, sig]) => {
      setStats(s);
      setUniverse(u);
      setInvestigations(inv);
      setSignals(sig);
    }).finally(() => setLoading(false));
  }, []);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      {/* Hero */}
      <div className="border-b border-green-500/20 pb-8 mb-8">
        <h1 className="text-5xl font-bold tracking-tight text-white">
          GRIFT<span className="text-green-400">FINDER</span>
        </h1>
        <p className="mt-3 text-lg text-zinc-500">
          Follow the money. It&apos;s all public record.
        </p>
        <p className="mt-4 max-w-2xl text-sm leading-relaxed text-zinc-600">
          An autonomous investigation system scanning {universe.total.toLocaleString()} politicians
          across 19 federal databases. Ralph never sleeps.
        </p>
      </div>

      {loading ? (
        <div className="text-green-400/50 animate-pulse">Loading live data...</div>
      ) : !isSupabaseConfigured() ? (
        <div className="border border-yellow-500/30 bg-yellow-950/10 p-6 text-yellow-400/80 text-sm">
          Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to connect to live data.
        </div>
      ) : (
        <>
          {/* Stats row */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 mb-8">
            {[
              { label: 'ENTITIES TRACKED', value: stats.entityCount },
              { label: 'SIGNALS DETECTED', value: stats.signalCount },
              { label: 'ACTIVE INVESTIGATIONS', value: stats.activeInvestigations },
              { label: 'STORIES PUBLISHED', value: stats.publishedStories },
            ].map((s) => (
              <div key={s.label} className="border border-green-500/20 bg-green-950/10 p-4">
                <div className="text-xs text-green-500/60">{s.label}</div>
                <div className="mt-1 text-3xl font-bold text-green-400">{s.value.toLocaleString()}</div>
              </div>
            ))}
          </div>

          {/* Two columns: Investigations + Signal feed */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {/* Active Investigations */}
            <div className="border border-green-500/20">
              <div className="border-b border-green-500/20 bg-green-950/20 px-4 py-2 flex items-center justify-between">
                <span className="text-xs text-green-500/70">ACTIVE INVESTIGATIONS</span>
                <Link href="/investigations" className="text-xs text-green-500/50 hover:text-green-400">View all</Link>
              </div>
              <div className="divide-y divide-green-500/10">
                {investigations.slice(0, 5).map((inv) => (
                  <Link key={inv.id} href={`/entity/${inv.entity_id}`} className="block px-4 py-3 hover:bg-green-950/20 transition-colors">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-green-400">{inv.entity_name || inv.entity_id.slice(0, 12)}</span>
                      <span className="text-xs text-green-500/50">P{inv.priority}</span>
                    </div>
                    <div className="mt-1 text-xs text-zinc-600">
                      {(inv.findings || []).length} findings | {(inv.sources_remaining || []).length} sources left
                    </div>
                  </Link>
                ))}
                {investigations.length === 0 && (
                  <div className="px-4 py-6 text-center text-zinc-600 text-sm">No active investigations</div>
                )}
              </div>
            </div>

            {/* Signal feed */}
            <div className="border border-green-500/20">
              <div className="border-b border-green-500/20 bg-green-950/20 px-4 py-2 flex items-center justify-between">
                <span className="text-xs text-green-500/70">LATEST SIGNALS</span>
                <Link href="/analysis" className="text-xs text-green-500/50 hover:text-green-400">Analysis</Link>
              </div>
              <div className="divide-y divide-green-500/10">
                {signals.map((sig) => (
                  <div key={sig.id} className="px-4 py-2 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className={`h-1.5 w-1.5 rounded-full ${
                        sig.strength >= 0.8 ? 'bg-red-500' : sig.strength >= 0.5 ? 'bg-yellow-500' : 'bg-green-500'
                      }`} />
                      <span className="text-xs text-green-400">{sig.signal_type}</span>
                    </div>
                    <span className="text-xs text-zinc-600">
                      {new Date(sig.detected_at).toLocaleDateString()}
                    </span>
                  </div>
                ))}
                {signals.length === 0 && (
                  <div className="px-4 py-6 text-center text-zinc-600 text-sm">No signals yet</div>
                )}
              </div>
            </div>
          </div>

          {/* CTA */}
          <div className="mt-8 flex gap-4">
            <Link href="/search" className="border border-green-500/40 bg-green-950/20 px-6 py-3 text-sm text-green-400 hover:bg-green-950/40 transition-colors">
              Search the database
            </Link>
            <Link href="/stories" className="border border-zinc-700 px-6 py-3 text-sm text-zinc-400 hover:border-zinc-600 hover:text-zinc-300 transition-colors">
              Read investigations
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
