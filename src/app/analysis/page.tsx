'use client';

import { useEffect, useState } from 'react';
import { isSupabaseConfigured } from '@/lib/supabase/client';
import {
  getDashboardStats, getSignalCounts, getRecentSignals, getActiveInvestigations,
  type Signal, type MmixEntry,
} from '@/lib/supabase/queries';

export default function AnalysisPage() {
  const [stats, setStats] = useState({ entityCount: 0, signalCount: 0, activeInvestigations: 0, publishedStories: 0 });
  const [signalCounts, setSignalCounts] = useState<{ type: string; count: number }[]>([]);
  const [signals, setSignals] = useState<Signal[]>([]);
  const [investigations, setInvestigations] = useState<MmixEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isSupabaseConfigured()) { setLoading(false); return; }
    Promise.all([
      getDashboardStats(),
      getSignalCounts(),
      getRecentSignals(30),
      getActiveInvestigations(),
    ]).then(([s, sc, sig, inv]) => {
      setStats(s);
      setSignalCounts(sc.sort((a, b) => b.count - a.count));
      setSignals(sig);
      setInvestigations(inv);
    }).finally(() => setLoading(false));
  }, []);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="border-b border-green-500/20 pb-4 mb-6">
        <h1 className="text-2xl font-bold text-white">
          <span className="text-green-500">$</span> ANALYSIS DASHBOARD
        </h1>
        <p className="mt-1 text-sm text-zinc-600">Signal intelligence and investigation metrics</p>
      </div>

      {loading ? (
        <div className="text-green-400/50 animate-pulse">Loading analytics...</div>
      ) : !isSupabaseConfigured() ? (
        <div className="border border-yellow-500/30 bg-yellow-950/10 p-6 text-yellow-400/80 text-sm">
          Configure Supabase environment variables to view analytics.
        </div>
      ) : (
        <div className="space-y-6">
          {/* Overview */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {[
              { label: 'ENTITIES', value: stats.entityCount },
              { label: 'SIGNALS', value: stats.signalCount },
              { label: 'ACTIVE MMIX', value: stats.activeInvestigations },
              { label: 'PUBLISHED', value: stats.publishedStories },
            ].map((s) => (
              <div key={s.label} className="border border-green-500/20 bg-green-950/10 p-4">
                <div className="text-xs text-green-500/60">{s.label}</div>
                <div className="mt-1 text-3xl font-bold text-green-400">{s.value.toLocaleString()}</div>
              </div>
            ))}
          </div>

          {/* Signal breakdown */}
          <div className="border border-green-500/20">
            <div className="border-b border-green-500/20 bg-green-950/20 px-4 py-2">
              <span className="text-xs text-green-500/70">SIGNAL TYPE BREAKDOWN</span>
            </div>
            <div className="p-4 space-y-2">
              {signalCounts.map((sc) => {
                const maxCount = signalCounts[0]?.count || 1;
                const pct = Math.round((sc.count / maxCount) * 100);
                return (
                  <div key={sc.type} className="flex items-center gap-3">
                    <span className="text-xs text-green-400 w-40 truncate">{sc.type}</span>
                    <div className="flex-1 h-2 bg-zinc-900 overflow-hidden">
                      <div className="h-full bg-green-500/40" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="text-xs text-zinc-500 w-12 text-right">{sc.count}</span>
                  </div>
                );
              })}
              {signalCounts.length === 0 && (
                <div className="text-center text-zinc-600 text-sm py-4">No signals yet</div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {/* Active Investigations detail */}
            <div className="border border-green-500/20">
              <div className="border-b border-green-500/20 bg-green-950/20 px-4 py-2">
                <span className="text-xs text-green-500/70">MMIX QUEUE STATUS</span>
              </div>
              <div className="divide-y divide-green-500/10">
                {investigations.map((inv) => {
                  const queried = inv.sources_queried || [];
                  const remaining = inv.sources_remaining || [];
                  const total = queried.length + remaining.length;
                  const pct = total > 0 ? Math.round((queried.length / total) * 100) : 0;
                  return (
                    <div key={inv.id} className="px-4 py-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-green-400">{inv.entity_name || inv.entity_id.slice(0, 16)}</span>
                        <span className="text-xs text-zinc-600">{(inv.findings || []).length} findings</span>
                      </div>
                      <div className="mt-2 flex items-center gap-2">
                        <div className="flex-1 h-1 bg-zinc-900 overflow-hidden">
                          <div className="h-full bg-green-500/50" style={{ width: `${pct}%` }} />
                        </div>
                        <span className="text-xs text-zinc-600">{pct}%</span>
                      </div>
                    </div>
                  );
                })}
                {investigations.length === 0 && (
                  <div className="px-4 py-6 text-center text-zinc-600 text-sm">No active investigations</div>
                )}
              </div>
            </div>

            {/* Signal stream */}
            <div className="border border-green-500/20">
              <div className="border-b border-green-500/20 bg-green-950/20 px-4 py-2">
                <span className="text-xs text-green-500/70">SIGNAL STREAM</span>
              </div>
              <div className="max-h-96 overflow-y-auto divide-y divide-green-500/10">
                {signals.map((sig) => (
                  <div key={sig.id} className="px-4 py-2 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className={`h-1.5 w-1.5 rounded-full ${
                        sig.strength >= 0.8 ? 'bg-red-500' : sig.strength >= 0.5 ? 'bg-yellow-500' : 'bg-green-500'
                      }`} />
                      <span className="text-xs text-green-400">{sig.signal_type}</span>
                    </div>
                    <span className="text-xs text-zinc-600">
                      {new Date(sig.detected_at).toLocaleTimeString()}
                    </span>
                  </div>
                ))}
                {signals.length === 0 && (
                  <div className="px-4 py-6 text-center text-zinc-600 text-sm">No signals</div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
