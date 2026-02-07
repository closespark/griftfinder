'use client';

import { useEffect, useState } from 'react';

// Disable static optimization for this page since it requires runtime data
export const dynamic = 'force-dynamic';
import { DataPanel } from '@/components/DataPanel';
import { StatCard } from '@/components/StatCard';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import {
  getInvestigations,
  getEntityCounts,
  getSignalStats,
  getHighRiskEntities,
  getRecentSignals,
  type Investigation,
  type EntityCount,
  type SignalStats,
  type Entity,
  type Signal,
} from '@/lib/supabase/queries';
import { isSupabaseConfigured } from '@/lib/supabase/client';

export default function AnalysisPage() {
  const [investigations, setInvestigations] = useState<Investigation[]>([]);
  const [entityCounts, setEntityCounts] = useState<EntityCount[]>([]);
  const [signalStats, setSignalStats] = useState<SignalStats[]>([]);
  const [highRiskEntities, setHighRiskEntities] = useState<Entity[]>([]);
  const [recentSignals, setRecentSignals] = useState<Signal[]>([]);
  const [loading, setLoading] = useState(true);
  const [mountedAt, setMountedAt] = useState<string | null>(null);

  useEffect(() => {
    setMountedAt(new Date().toISOString());
  }, []);

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      try {
        // Only fetch if Supabase is configured
        if (isSupabaseConfigured()) {
          const [invData, entityData, signalData, riskData, recentData] = await Promise.all([
            getInvestigations(),
            getEntityCounts(),
            getSignalStats(),
            getHighRiskEntities(),
            getRecentSignals(),
          ]);

          setInvestigations(invData);
          setEntityCounts(entityData);
          setSignalStats(signalData);
          setHighRiskEntities(riskData);
          setRecentSignals(recentData);
        }
      } catch (error) {
        console.error('Error fetching analysis data:', error);
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, []);

  const totalEntities = entityCounts.reduce((sum, item) => sum + item.count, 0);
  const totalSignals = signalStats.reduce((sum, item) => sum + item.count, 0);
  const criticalSignals = signalStats.reduce((sum, item) => sum + item.critical_count, 0);
  const activeInvestigations = investigations.filter(inv => inv.status === 'active').length;

  return (
    <div className="min-h-screen bg-black p-6">
      {/* Terminal-style header */}
      <div className="mb-6 border-b border-green-500/30 pb-4">
        <h1 className="font-mono text-2xl font-bold text-green-400">
          <span className="text-green-500">$</span> ENTITY_SCAN / ANALYSIS
        </h1>
        <p className="mt-2 font-mono text-sm text-green-400/60">
          Real-time intelligence dashboard{mountedAt ? ` • ${mountedAt}` : ''}
        </p>
      </div>

      {loading ? (
        <LoadingSpinner />
      ) : !isSupabaseConfigured() ? (
        <DataPanel title="Configuration Required">
          <div className="space-y-4 text-center">
            <div className="text-yellow-400">⚠ SUPABASE NOT CONFIGURED</div>
            <p className="text-green-400/70">
              To view live data, set the following environment variables:
            </p>
            <div className="mt-4 space-y-2 text-left text-xs">
              <div className="border border-green-500/20 bg-green-950/10 p-3">
                <div className="text-green-500">NEXT_PUBLIC_SUPABASE_URL</div>
                <div className="text-green-400/50">Your Supabase project URL</div>
              </div>
              <div className="border border-green-500/20 bg-green-950/10 p-3">
                <div className="text-green-500">NEXT_PUBLIC_SUPABASE_ANON_KEY</div>
                <div className="text-green-400/50">Your Supabase anonymous key</div>
              </div>
            </div>
            <p className="text-xs text-green-400/50">
              See .env.example for reference
            </p>
          </div>
        </DataPanel>
      ) : (
        <div className="space-y-6">
          {/* Overview Stats */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label="Total Entities"
              value={totalEntities}
              sublabel={`${entityCounts.length} types tracked`}
            />
            <StatCard
              label="Active Investigations"
              value={activeInvestigations}
              sublabel={`${investigations.length} total`}
            />
            <StatCard
              label="Signal Detections"
              value={totalSignals}
              sublabel="Last 24h"
            />
            <StatCard
              label="Critical Signals"
              value={criticalSignals}
              sublabel="Requires attention"
              highlight={criticalSignals > 0}
            />
          </div>

          {/* Entity Breakdown */}
          <DataPanel title="Entity Distribution">
            <div className="space-y-3">
              <div className="text-xs text-green-400/70">TYPE ANALYSIS</div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {entityCounts.map((item) => (
                  <div key={item.type} className="border border-green-500/20 bg-green-950/10 p-3">
                    <div className="text-xs uppercase text-green-500/70">{item.type}</div>
                    <div className="mt-1 text-2xl font-bold text-green-400">{item.count}</div>
                  </div>
                ))}
              </div>
              {entityCounts.length === 0 && (
                <div className="text-center text-green-400/50">No entity data available</div>
              )}
            </div>
          </DataPanel>

          {/* Signal Statistics */}
          <DataPanel title="Signal Intelligence">
            <div className="space-y-3">
              <div className="text-xs text-green-400/70">SIGNAL TYPE BREAKDOWN</div>
              <div className="space-y-2">
                {signalStats.map((stat) => (
                  <div
                    key={stat.type}
                    className="flex items-center justify-between border-b border-green-500/10 pb-2"
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-green-400">▸</span>
                      <span className="uppercase">{stat.type}</span>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="text-green-400">{stat.count} total</span>
                      {stat.critical_count > 0 && (
                        <span className="rounded bg-red-950/30 px-2 py-1 text-xs text-red-400">
                          {stat.critical_count} CRITICAL
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              {signalStats.length === 0 && (
                <div className="text-center text-green-400/50">No signal data available</div>
              )}
            </div>
          </DataPanel>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {/* High-Risk Entities */}
            <DataPanel title="High-Risk Entities">
              <div className="space-y-2">
                <div className="text-xs text-green-400/70">RISK SCORE ≥ 70</div>
                {highRiskEntities.length > 0 ? (
                  <div className="max-h-96 space-y-2 overflow-y-auto">
                    {highRiskEntities.map((entity) => (
                      <div
                        key={entity.id}
                        className="border border-red-500/20 bg-red-950/10 p-3"
                      >
                        <div className="flex items-start justify-between">
                          <div>
                            <div className="text-sm font-semibold text-green-400">
                              {entity.name}
                            </div>
                            <div className="mt-1 text-xs uppercase text-green-400/60">
                              {entity.type}
                            </div>
                          </div>
                          <div className="rounded bg-red-950/40 px-2 py-1 text-xs font-bold text-red-400">
                            RISK: {entity.risk_score}
                          </div>
                        </div>
                        <div className="mt-2 text-xs text-green-400/50">
                          Updated: {new Date(entity.last_updated).toLocaleDateString()}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="py-8 text-center text-green-400/50">
                    No high-risk entities detected
                  </div>
                )}
              </div>
            </DataPanel>

            {/* Active Investigations */}
            <DataPanel title="Active Investigations">
              <div className="space-y-2">
                <div className="text-xs text-green-400/70">RECENT ACTIVITY</div>
                {investigations.length > 0 ? (
                  <div className="max-h-96 space-y-2 overflow-y-auto">
                    {investigations.map((inv) => (
                      <div
                        key={inv.id}
                        className="border border-green-500/20 bg-green-950/10 p-3"
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="text-sm font-semibold text-green-400">
                              {inv.title}
                            </div>
                            <div className="mt-1 flex gap-2 text-xs">
                              <span
                                className={`uppercase ${
                                  inv.status === 'active'
                                    ? 'text-green-400'
                                    : inv.status === 'closed'
                                    ? 'text-green-400/50'
                                    : 'text-yellow-400'
                                }`}
                              >
                                {inv.status}
                              </span>
                              <span className="text-green-400/30">•</span>
                              <span
                                className={`uppercase ${
                                  inv.priority === 'critical' || inv.priority === 'high'
                                    ? 'text-red-400'
                                    : inv.priority === 'medium'
                                    ? 'text-yellow-400'
                                    : 'text-green-400/60'
                                }`}
                              >
                                {inv.priority}
                              </span>
                            </div>
                          </div>
                          {inv.findings_count > 0 && (
                            <div className="ml-2 rounded bg-green-950/40 px-2 py-1 text-xs text-green-400">
                              {inv.findings_count} findings
                            </div>
                          )}
                        </div>
                        <div className="mt-2 text-xs text-green-400/50">
                          Created: {new Date(inv.created_at).toLocaleDateString()}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="py-8 text-center text-green-400/50">
                    No investigations found
                  </div>
                )}
              </div>
            </DataPanel>
          </div>

          {/* Recent Signals Stream */}
          <DataPanel title="Signal Stream - Recent Activity">
            <div className="space-y-2">
              <div className="text-xs text-green-400/70">LAST 20 DETECTIONS</div>
              {recentSignals.length > 0 ? (
                <div className="max-h-96 space-y-1 overflow-y-auto font-mono text-xs">
                  {recentSignals.map((signal) => (
                    <div
                      key={signal.id}
                      className="flex items-center justify-between border-b border-green-500/10 py-1.5"
                    >
                      <div className="flex items-center gap-3">
                        <span
                          className={`h-2 w-2 rounded-full ${
                            signal.severity === 'critical'
                              ? 'bg-red-500 animate-pulse'
                              : signal.severity === 'high'
                              ? 'bg-orange-500'
                              : signal.severity === 'medium'
                              ? 'bg-yellow-500'
                              : 'bg-green-500'
                          }`}
                        ></span>
                        <span className="uppercase text-green-400">{signal.type}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span
                          className={`text-xs uppercase ${
                            signal.severity === 'critical' || signal.severity === 'high'
                              ? 'text-red-400'
                              : signal.severity === 'medium'
                              ? 'text-yellow-400'
                              : 'text-green-400/60'
                          }`}
                        >
                          {signal.severity}
                        </span>
                        <span className="text-green-400/50">
                          {new Date(signal.detected_at).toLocaleTimeString()}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="py-8 text-center text-green-400/50">
                  No recent signals detected
                </div>
              )}
            </div>
          </DataPanel>
        </div>
      )}
    </div>
  );
}
