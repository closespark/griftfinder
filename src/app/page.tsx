'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { isSupabaseConfigured } from '@/lib/supabase/client';
import { getDashboardStats, getActiveInvestigations, getRecentSignals, getUniverseStats, getTopEntities, getRecentLegislativeActions, type MmixEntry, type Signal, type Entity, type LegislativeAction } from '@/lib/supabase/queries';

function formatSignal(sig: Signal): string {
  const d = sig.details as Record<string, unknown>;
  if (d?.description) return String(d.description);
  const type = sig.signal_type || '';
  if (type === 'FEC_LARGE_PAYMENT') return `Large payment: $${Number(d?.amount || 0).toLocaleString()} to ${d?.recipient || 'unknown'}`;
  if (type === 'FEC_SPOUSE_PAYMENT') return `Spouse-connected payment: $${Number(d?.amount || 0).toLocaleString()} to ${d?.recipient || 'unknown'}`;
  if (type === 'FEC_HIGH_VOLUME') return `High-volume vendor: $${Number(d?.total_amount || 0).toLocaleString()} across ${d?.payment_count || '?'} payments`;
  if (type === 'CROSS_CAMPAIGN') return `Cross-campaign: ${d?.vendor || 'vendor'} paid by multiple committees`;
  if (type === 'CONNECTION') return `Network connection detected`;
  return type.replace(/_/g, ' ').toLowerCase();
}

function signalColor(sig: Signal): string {
  if (sig.strength >= 0.8) return 'border-red-500/30 bg-red-950/10';
  if (sig.strength >= 0.5) return 'border-yellow-500/20 bg-yellow-950/10';
  return 'border-green-500/20 bg-green-950/10';
}

function signalDot(sig: Signal): string {
  if (sig.strength >= 0.8) return 'bg-red-500';
  if (sig.strength >= 0.5) return 'bg-yellow-500';
  return 'bg-green-500';
}

export default function Home() {
  const [stats, setStats] = useState({ entityCount: 0, signalCount: 0, activeInvestigations: 0, publishedStories: 0, legislativeActionCount: 0, regulatoryActionCount: 0, dogeContractCount: 0, dogeGrantCount: 0 });
  const [universe, setUniverse] = useState({ total: 0 });
  const [investigations, setInvestigations] = useState<MmixEntry[]>([]);
  const [signals, setSignals] = useState<Signal[]>([]);
  const [entities, setEntities] = useState<Entity[]>([]);
  const [recentLeg, setRecentLeg] = useState<LegislativeAction[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isSupabaseConfigured()) { setLoading(false); return; }
    Promise.all([
      getDashboardStats(),
      getUniverseStats(),
      getActiveInvestigations(),
      getRecentSignals(15),
      getTopEntities(200),
      getRecentLegislativeActions(10),
    ]).then(([s, u, inv, sig, ent, leg]) => {
      setStats(s);
      setUniverse(u);
      setInvestigations(inv);
      setSignals(sig);
      setEntities(ent);
      setRecentLeg(leg);
    }).finally(() => setLoading(false));
  }, []);

  const entityNames = new Map(entities.map((e) => [e.id, e.canonical_name]));
  function resolveName(inv: MmixEntry): string {
    return inv.entity_name || entityNames.get(inv.entity_id) || inv.entity_id?.slice(0, 12) || 'Unknown';
  }

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
          across 19 federal databases — FEC filings, lobbying disclosures, OFAC sanctions, SEC filings,
          court records, federal contracts, and more. Ralph never sleeps.
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
              { label: 'POLITICIANS SCANNED', value: universe.total },
              { label: 'ANOMALIES DETECTED', value: stats.signalCount },
              { label: 'UNDER INVESTIGATION', value: stats.activeInvestigations },
              { label: 'STORIES PUBLISHED', value: stats.publishedStories },
            ].map((s) => (
              <div key={s.label} className="border border-green-500/20 bg-green-950/10 p-4">
                <div className="text-xs text-green-500/60">{s.label}</div>
                <div className="mt-1 text-3xl font-bold text-green-400">{s.value.toLocaleString()}</div>
              </div>
            ))}
          </div>

          {/* Enrichment stats row */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 mb-8">
            {[
              { label: 'LEGISLATIVE ACTIONS', value: stats.legislativeActionCount },
              { label: 'REGULATORY ACTIONS', value: stats.regulatoryActionCount },
              { label: 'DOGE CONTRACTS', value: stats.dogeContractCount },
              { label: 'DOGE GRANTS', value: stats.dogeGrantCount },
            ].map((s) => (
              <div key={s.label} className="border border-green-500/20 bg-green-950/10 p-4">
                <div className="text-xs text-green-500/60">{s.label}</div>
                <div className="mt-1 text-3xl font-bold text-green-400">{s.value.toLocaleString()}</div>
              </div>
            ))}
          </div>

          {/* Two columns */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {/* Currently Investigating */}
            <div className="border border-green-500/20">
              <div className="border-b border-green-500/20 bg-green-950/20 px-4 py-2 flex items-center justify-between">
                <span className="text-xs text-green-500/70">CURRENTLY INVESTIGATING</span>
                <Link href="/investigations" className="text-xs text-green-500/50 hover:text-green-400">View all</Link>
              </div>
              <div className="divide-y divide-green-500/10">
                {investigations.slice(0, 5).map((inv) => {
                  const findings = inv.findings || [];
                  const topFinding = findings[findings.length - 1];
                  return (
                    <Link key={inv.id} href={`/entity/${inv.entity_id}`} className="block px-4 py-3 hover:bg-green-950/20 transition-colors">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-green-400 font-semibold">{resolveName(inv)}</span>
                        <span className="text-xs text-zinc-600">{findings.length} findings</span>
                      </div>
                      {inv.thesis && (
                        <p className="mt-1 text-xs text-zinc-500 line-clamp-1">{inv.thesis}</p>
                      )}
                      {topFinding && (
                        <p className="mt-1 text-xs text-zinc-600 italic line-clamp-1">
                          Latest: {topFinding.summary}
                        </p>
                      )}
                    </Link>
                  );
                })}
                {investigations.length === 0 && (
                  <div className="px-4 py-6 text-center text-zinc-600 text-sm">No active investigations</div>
                )}
              </div>
            </div>

            {/* Recent anomalies detected */}
            <div className="border border-green-500/20">
              <div className="border-b border-green-500/20 bg-green-950/20 px-4 py-2 flex items-center justify-between">
                <span className="text-xs text-green-500/70">RECENT ANOMALIES</span>
                <Link href="/analysis" className="text-xs text-green-500/50 hover:text-green-400">Full analysis</Link>
              </div>
              <div className="divide-y divide-green-500/10">
                {signals.map((sig) => (
                  <div key={sig.id} className={`px-4 py-2.5 border-l-2 ${signalColor(sig)}`}>
                    <div className="flex items-start gap-2">
                      <span className={`mt-1.5 h-1.5 w-1.5 rounded-full shrink-0 ${signalDot(sig)}`} />
                      <div className="min-w-0">
                        <p className="text-xs text-zinc-300 line-clamp-2">{formatSignal(sig)}</p>
                        <p className="mt-0.5 text-xs text-zinc-600">
                          {new Date(sig.detected_at).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
                {signals.length === 0 && (
                  <div className="px-4 py-6 text-center text-zinc-600 text-sm">No anomalies yet</div>
                )}
              </div>
            </div>
          </div>

          {/* Recent Legislative Actions */}
          {recentLeg.length > 0 && (
            <div className="mt-6 border border-green-500/20">
              <div className="border-b border-green-500/20 bg-green-950/20 px-4 py-2 flex items-center justify-between">
                <span className="text-xs text-green-500/70">RECENT LEGISLATIVE ACTIONS</span>
                <Link href="/search" className="text-xs text-green-500/50 hover:text-green-400">Search all</Link>
              </div>
              <div className="divide-y divide-green-500/10">
                {recentLeg.map((la) => (
                  <div key={la.id} className="px-4 py-3">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs px-2 py-0.5 bg-blue-950/30 text-blue-400 border border-blue-500/20">
                        {la.bill_type} {la.bill_number}
                      </span>
                      <span className="text-xs px-1.5 py-0.5 bg-zinc-900 text-zinc-500 border border-zinc-800">
                        {la.action_type}
                      </span>
                      {la.policy_area && <span className="text-xs text-zinc-600">{la.policy_area}</span>}
                    </div>
                    <p className="text-sm text-zinc-300 line-clamp-1">{la.bill_title}</p>
                    <div className="mt-1 flex items-center gap-3 text-xs text-zinc-600">
                      {la.latest_action_date && <span>{la.latest_action_date}</span>}
                      {la.entity_id && (
                        <Link href={`/entity/${la.entity_id}`} className="text-green-500/60 hover:text-green-400">
                          View entity &rarr;
                        </Link>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

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
