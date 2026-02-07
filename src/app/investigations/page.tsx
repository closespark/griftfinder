'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { isSupabaseConfigured } from '@/lib/supabase/client';
import { getAllInvestigations, type MmixEntry } from '@/lib/supabase/queries';

export default function InvestigationsPage() {
  const [investigations, setInvestigations] = useState<MmixEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'active' | 'expired'>('all');

  useEffect(() => {
    if (!isSupabaseConfigured()) { setLoading(false); return; }
    getAllInvestigations(100).then(setInvestigations).finally(() => setLoading(false));
  }, []);

  const filtered = filter === 'all'
    ? investigations
    : investigations.filter((inv) => filter === 'active'
      ? ['active', 'investigating'].includes(inv.status)
      : inv.status === 'expired');

  const active = investigations.filter((i) => ['active', 'investigating'].includes(i.status)).length;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="border-b border-green-500/20 pb-4 mb-6">
        <h1 className="text-2xl font-bold text-white">
          <span className="text-green-500">$</span> INVESTIGATION QUEUE
        </h1>
        <p className="mt-1 text-sm text-zinc-600">
          Ralph&apos;s MMIX — {active} active, {investigations.length} total
        </p>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 mb-6">
        {(['all', 'active', 'expired'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-4 py-1.5 text-xs uppercase transition-colors ${
              filter === f
                ? 'text-green-400 bg-green-950/40 border border-green-500/30'
                : 'text-zinc-600 border border-zinc-800 hover:text-zinc-400'
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-green-400/50 animate-pulse">Loading...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-zinc-600">No investigations found.</div>
      ) : (
        <div className="space-y-3">
          {filtered.map((inv) => {
            const findings = inv.findings || [];
            const remaining = inv.sources_remaining || [];
            const queried = inv.sources_queried || [];
            const isActive = ['active', 'investigating'].includes(inv.status);
            const progress = queried.length + remaining.length > 0
              ? Math.round((queried.length / (queried.length + remaining.length)) * 100)
              : 0;

            return (
              <Link
                key={inv.id}
                href={`/entity/${inv.entity_id}`}
                className="block border border-green-500/20 hover:border-green-500/40 transition-colors"
              >
                <div className="px-5 py-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className={`h-2 w-2 rounded-full ${isActive ? 'bg-green-500 animate-pulse' : 'bg-zinc-600'}`} />
                      <span className="text-green-400">{inv.entity_name || inv.entity_id.slice(0, 16)}</span>
                      <span className="text-xs text-zinc-600">P{inv.priority}</span>
                    </div>
                    <span className={`text-xs uppercase ${isActive ? 'text-green-400' : 'text-zinc-600'}`}>
                      {inv.status}
                    </span>
                  </div>

                  {inv.thesis && (
                    <p className="mt-2 text-xs text-zinc-500 line-clamp-1">{inv.thesis}</p>
                  )}

                  {/* Progress bar */}
                  <div className="mt-3 flex items-center gap-3">
                    <div className="flex-1 h-1 bg-zinc-900 overflow-hidden">
                      <div className="h-full bg-green-500/50" style={{ width: `${progress}%` }} />
                    </div>
                    <span className="text-xs text-zinc-600">
                      {queried.length}/{queried.length + remaining.length} sources
                    </span>
                    <span className="text-xs text-zinc-600">
                      {findings.length} findings
                    </span>
                  </div>

                  {/* Latest findings */}
                  {findings.length > 0 && (
                    <div className="mt-2 flex gap-2 flex-wrap">
                      {findings.slice(0, 3).map((f, i) => (
                        <span key={i} className="text-xs px-2 py-0.5 bg-green-950/30 text-green-500/60 border border-green-500/10">
                          {f.source}
                        </span>
                      ))}
                      {findings.length > 3 && (
                        <span className="text-xs text-zinc-700">+{findings.length - 3}</span>
                      )}
                    </div>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
