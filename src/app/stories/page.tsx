'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { isSupabaseConfigured } from '@/lib/supabase/client';
import { getStoryClassificationData, getStories, type StoryPublication } from '@/lib/supabase/queries';
import { classifyStories, type ClassifiedStory } from '@/lib/story-classifier';

const PATTERN_META: Record<string, { label: string; icon: string; color: string; bg: string; border: string }> = {
  VENDOR_SIPHONING: { label: 'Vendor Siphoning', icon: '$$', color: 'text-red-400', bg: 'bg-red-950/20', border: 'border-red-500/30' },
  CROSS_CAMPAIGN_NETWORK: { label: 'Cross-Campaign', icon: '<>', color: 'text-orange-400', bg: 'bg-orange-950/20', border: 'border-orange-500/30' },
  REVOLVING_DOOR: { label: 'Revolving Door', icon: '>>', color: 'text-yellow-400', bg: 'bg-yellow-950/20', border: 'border-yellow-500/30' },
  FAMILY_PAYMENTS: { label: 'Family Payments', icon: '~~', color: 'text-pink-400', bg: 'bg-pink-950/20', border: 'border-pink-500/30' },
  SANCTIONS_FLAG: { label: 'Sanctions Alert', icon: '!!', color: 'text-red-500', bg: 'bg-red-950/30', border: 'border-red-600/40' },
  HIGH_VOLUME_PASS_THROUGH: { label: 'High Volume', icon: '##', color: 'text-amber-400', bg: 'bg-amber-950/20', border: 'border-amber-500/30' },
  DARK_MONEY_CLUSTER: { label: 'Network Cluster', icon: '{}', color: 'text-cyan-400', bg: 'bg-cyan-950/20', border: 'border-cyan-500/30' },
  INVESTIGATION_FINDINGS: { label: 'Investigation', icon: '=>', color: 'text-green-400', bg: 'bg-green-950/20', border: 'border-green-500/30' },
  DATA_LOADED: { label: 'Data Status', icon: '…', color: 'text-zinc-400', bg: 'bg-zinc-900/50', border: 'border-zinc-600' },
};

const SEVERITY_META: Record<string, { label: string; color: string; border: string }> = {
  critical: { label: 'CRITICAL', color: 'text-red-400', border: 'border-l-red-500' },
  high: { label: 'HIGH', color: 'text-orange-400', border: 'border-l-orange-500' },
  medium: { label: 'MEDIUM', color: 'text-yellow-400', border: 'border-l-yellow-500' },
  info: { label: 'INFO', color: 'text-zinc-400', border: 'border-l-zinc-500' },
};

function formatMoney(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${Math.round(n / 1_000)}k`;
  if (n > 0) return `$${n.toLocaleString()}`;
  return '';
}

export default function StoriesPage() {
  const [classifiedStories, setClassifiedStories] = useState<ClassifiedStory[]>([]);
  const [publishedStories, setPublishedStories] = useState<StoryPublication[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState<string>('all');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!isSupabaseConfigured()) { setLoading(false); return; }
    Promise.all([
      getStoryClassificationData(),
      getStories(50),
    ]).then(([data, stories]) => {
      const classified = classifyStories(data);
      setClassifiedStories(classified);
      setPublishedStories(stories);
    }).finally(() => setLoading(false));
  }, []);

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  // Unique pattern types present
  const patternTypes = [...new Set(classifiedStories.map((s) => s.pattern))];
  const filtered = activeFilter === 'all'
    ? classifiedStories
    : classifiedStories.filter((s) => s.pattern === activeFilter);

  // Summary stats
  const criticalCount = classifiedStories.filter((s) => s.severity === 'critical').length;
  const highCount = classifiedStories.filter((s) => s.severity === 'high').length;
  const totalMoney = classifiedStories.reduce((sum, s) => sum + s.totalMoney, 0);
  const totalEntities = new Set(classifiedStories.flatMap((s) => s.entities.filter((e) => e.id).map((e) => e.id))).size;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      {/* Header */}
      <div className="border-b border-green-500/20 pb-6 mb-6">
        <h1 className="text-2xl font-bold text-white">
          <span className="text-green-500">$</span> WHAT WE FOUND
        </h1>
        <p className="mt-1 text-sm text-zinc-500">
          Ralph scanned 19 federal databases and classified {classifiedStories.length} suspicious patterns
          involving {totalEntities} entities and {formatMoney(totalMoney)} in tracked money flows.
        </p>

        {/* Stats bar */}
        {!loading && classifiedStories.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-3">
            {criticalCount > 0 && (
              <span className="text-xs px-3 py-1.5 bg-red-950/30 border border-red-500/30 text-red-400">
                {criticalCount} CRITICAL
              </span>
            )}
            {highCount > 0 && (
              <span className="text-xs px-3 py-1.5 bg-orange-950/20 border border-orange-500/30 text-orange-400">
                {highCount} HIGH PRIORITY
              </span>
            )}
            <span className="text-xs px-3 py-1.5 bg-green-950/20 border border-green-500/20 text-green-400">
              {classifiedStories.length} TOTAL PATTERNS
            </span>
            {publishedStories.length > 0 && (
              <span className="text-xs px-3 py-1.5 bg-green-950/20 border border-green-500/20 text-green-400">
                {publishedStories.length} STORIES PUBLISHED
              </span>
            )}
          </div>
        )}
      </div>

      {/* Filter chips */}
      {!loading && classifiedStories.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-6">
          <button
            onClick={() => setActiveFilter('all')}
            className={`px-3 py-1.5 text-xs transition-colors ${
              activeFilter === 'all'
                ? 'text-green-400 bg-green-950/40 border border-green-500/30'
                : 'text-zinc-600 border border-zinc-800 hover:text-zinc-400'
            }`}
          >
            ALL ({classifiedStories.length})
          </button>
          {patternTypes.map((p) => {
            const meta = PATTERN_META[p] || { label: p, color: 'text-zinc-400', bg: 'bg-zinc-900', border: 'border-zinc-700' };
            const count = classifiedStories.filter((s) => s.pattern === p).length;
            return (
              <button
                key={p}
                onClick={() => setActiveFilter(p)}
                className={`px-3 py-1.5 text-xs transition-colors ${
                  activeFilter === p
                    ? `${meta.color} ${meta.bg} border ${meta.border}`
                    : 'text-zinc-600 border border-zinc-800 hover:text-zinc-400'
                }`}
              >
                {meta.label} ({count})
              </button>
            );
          })}
        </div>
      )}

      {loading ? (
        <div className="text-green-400/50 animate-pulse">
          Classifying patterns across 19 federal databases...
        </div>
      ) : classifiedStories.length === 0 ? (
        <div className="text-center py-12 text-zinc-600">
          No patterns classified yet. Ralph is still gathering data.
        </div>
      ) : (
        <div className="space-y-4">
          {filtered.map((story) => {
            const meta = PATTERN_META[story.pattern] || { label: story.pattern, icon: '--', color: 'text-zinc-400', bg: 'bg-zinc-900', border: 'border-zinc-700' };
            const sev = SEVERITY_META[story.severity] || SEVERITY_META.info;
            const isExpanded = expanded.has(story.id);

            return (
              <div
                key={story.id}
                className={`border border-green-500/20 border-l-4 ${sev.border} transition-colors hover:border-green-500/30`}
              >
                {/* Story header — always visible */}
                <button
                  onClick={() => toggle(story.id)}
                  className="w-full text-left px-5 py-4"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      {/* Tags row */}
                      <div className="flex items-center gap-2 flex-wrap mb-2">
                        <span className={`text-xs px-2 py-0.5 ${meta.bg} ${meta.color} border ${meta.border} font-mono`}>
                          {meta.icon} {meta.label.toUpperCase()}
                        </span>
                        <span className={`text-xs ${sev.color}`}>{sev.label}</span>
                        {story.date && (
                          <span className="text-xs text-zinc-600">
                            {new Date(story.date).toLocaleDateString()}
                          </span>
                        )}
                      </div>

                      {/* Headline */}
                      <h2 className="text-base text-white leading-snug">{story.headline}</h2>

                      {/* Mini narrative preview */}
                      {!isExpanded && (
                        <p className="mt-2 text-sm text-zinc-500 line-clamp-2">{story.narrative}</p>
                      )}
                    </div>

                    {/* Right side stats */}
                    <div className="shrink-0 text-right">
                      {story.totalMoney > 0 && (
                        <div className="text-lg font-bold text-green-400">{formatMoney(story.totalMoney)}</div>
                      )}
                      <div className="text-xs text-zinc-600 mt-1">
                        {story.networkSize > 1 ? `${story.networkSize} entities` : ''}
                      </div>
                      <div className="text-xs text-zinc-700 mt-0.5">
                        {story.sourceCount > 1 ? `${story.sourceCount} sources` : ''}
                      </div>
                    </div>
                  </div>
                </button>

                {/* Expanded detail */}
                {isExpanded && (
                  <div className="px-5 pb-5 border-t border-green-500/10 pt-4">
                    {/* Full narrative */}
                    <p className="text-sm text-zinc-300 leading-relaxed mb-4">{story.narrative}</p>

                    {/* Entities involved */}
                    <div className="mb-4">
                      <h3 className="text-xs text-green-500/70 mb-2 uppercase">Entities Involved</h3>
                      <div className="space-y-1">
                        {story.entities.map((e, i) => (
                          <div key={i} className="flex items-center gap-3 text-sm">
                            <span className="h-1.5 w-1.5 rounded-full bg-green-500/50 shrink-0" />
                            {e.id ? (
                              <Link href={`/entity/${e.id}`} className="text-green-400 hover:underline">
                                {e.name}
                              </Link>
                            ) : (
                              <span className="text-zinc-300">{e.name}</span>
                            )}
                            <span className="text-xs text-zinc-600">{e.role}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Evidence trail */}
                    <div className="mb-4">
                      <h3 className="text-xs text-green-500/70 mb-2 uppercase">Evidence</h3>
                      <div className="space-y-2">
                        {story.evidence.map((e, i) => (
                          <div key={i} className="flex items-start gap-2 text-xs">
                            <span className="text-green-500/50 shrink-0 font-mono">[{e.type}]</span>
                            <span className="text-zinc-400">{e.description}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Link to network view if multi-entity */}
                    {story.networkSize > 1 && (
                      <div className="flex gap-3 pt-2 border-t border-green-500/10">
                        <Link href="/network" className="text-xs text-green-500/60 hover:text-green-400 transition-colors">
                          View in network graph &rarr;
                        </Link>
                        {story.entities[0]?.id && (
                          <Link href={`/entity/${story.entities[0].id}`} className="text-xs text-green-500/60 hover:text-green-400 transition-colors">
                            Open dossier: {story.entities[0].name} &rarr;
                          </Link>
                        )}
                      </div>
                    )}
                    {story.networkSize <= 1 && story.entities[0]?.id && (
                      <div className="pt-2 border-t border-green-500/10">
                        <Link href={`/entity/${story.entities[0].id}`} className="text-xs text-green-500/60 hover:text-green-400 transition-colors">
                          Open full dossier &rarr;
                        </Link>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Published stories from Ralph's story engine (at bottom) */}
      {publishedStories.length > 0 && (
        <div className="mt-12">
          <div className="border-b border-green-500/20 pb-3 mb-4">
            <h2 className="text-lg font-bold text-white">
              <span className="text-green-500">$</span> PUBLISHED STORIES
            </h2>
            <p className="text-xs text-zinc-600 mt-1">
              Stories auto-generated and posted by Ralph&apos;s story engine
            </p>
          </div>
          <div className="space-y-3">
            {publishedStories.map((s) => (
              <div key={s.id} className="border border-green-500/20 px-5 py-4">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs px-2 py-0.5 bg-green-950/40 text-green-400 border border-green-500/30">
                    PUBLISHED
                  </span>
                  <span className="text-xs text-zinc-600">
                    {new Date(s.published_at).toLocaleDateString()}
                  </span>
                </div>
                <h3 className="text-base text-green-400">{s.details?.subject || s.topic}</h3>
                {(s.details?.headline || s.angle) && (
                  <p className="mt-1 text-sm text-zinc-500">{s.details?.headline || s.angle}</p>
                )}
                {s.details?.thread_url && (
                  <a
                    href={s.details.thread_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2 inline-block text-xs text-green-500/60 hover:text-green-400"
                  >
                    Read thread &rarr;
                  </a>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
