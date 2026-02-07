'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { isSupabaseConfigured } from '@/lib/supabase/client';
import { getStories, getAllInvestigations, type StoryPublication, type MmixEntry } from '@/lib/supabase/queries';

export default function StoriesPage() {
  const [stories, setStories] = useState<StoryPublication[]>([]);
  const [investigations, setInvestigations] = useState<MmixEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isSupabaseConfigured()) { setLoading(false); return; }
    Promise.all([
      getStories(50),
      getAllInvestigations(30),
    ]).then(([s, inv]) => {
      setStories(s);
      setInvestigations(inv);
    }).finally(() => setLoading(false));
  }, []);

  // Merge published stories + completed investigations with findings into one feed
  const investigationCards = investigations
    .filter((inv) => (inv.findings || []).length > 0)
    .map((inv) => ({
      id: inv.id,
      type: 'investigation' as const,
      title: inv.entity_name || 'Unknown Entity',
      subtitle: inv.thesis || '',
      date: inv.entered_at,
      status: inv.status,
      findingsCount: (inv.findings || []).length,
      sourcesQueried: (inv.sources_queried || []).length,
      entityId: inv.entity_id,
      findings: inv.findings || [],
    }));

  const storyCards = stories.map((s) => ({
    id: s.id,
    type: 'story' as const,
    title: s.details?.subject || s.topic || 'Story',
    subtitle: s.details?.headline || s.angle || '',
    date: s.published_at,
    status: 'published',
    findingsCount: s.details?.fact_count || 0,
    sourcesQueried: 0,
    entityId: s.entity_id,
    findings: [] as MmixEntry['findings'],
  }));

  const allCards = [...storyCards, ...investigationCards]
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="border-b border-green-500/20 pb-4 mb-6">
        <h1 className="text-2xl font-bold text-white">
          <span className="text-green-500">$</span> INVESTIGATIONS & STORIES
        </h1>
        <p className="mt-1 text-sm text-zinc-600">
          {allCards.length} investigation{allCards.length !== 1 ? 's' : ''} with findings
        </p>
      </div>

      {loading ? (
        <div className="text-green-400/50 animate-pulse">Loading...</div>
      ) : allCards.length === 0 ? (
        <div className="text-center py-12 text-zinc-600">
          No investigations with findings yet. Ralph is still scanning.
        </div>
      ) : (
        <div className="space-y-4">
          {allCards.map((card) => (
            <Link
              key={card.id}
              href={card.entityId ? `/entity/${card.entityId}` : '#'}
              className="block border border-green-500/20 hover:border-green-500/40 transition-colors"
            >
              <div className="px-5 py-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className={`text-xs px-2 py-0.5 ${
                        card.status === 'published'
                          ? 'bg-green-950/40 text-green-400 border border-green-500/30'
                          : card.status === 'active'
                          ? 'bg-yellow-950/40 text-yellow-400 border border-yellow-500/30'
                          : 'bg-zinc-900 text-zinc-500 border border-zinc-700'
                      }`}>
                        {card.status.toUpperCase()}
                      </span>
                      <span className="text-xs text-zinc-600">
                        {new Date(card.date).toLocaleDateString()}
                      </span>
                    </div>
                    <h2 className="mt-2 text-lg text-green-400">{card.title}</h2>
                    {card.subtitle && (
                      <p className="mt-1 text-sm text-zinc-500 line-clamp-2">{card.subtitle}</p>
                    )}
                  </div>
                  <div className="ml-4 text-right">
                    <div className="text-2xl font-bold text-green-400">{card.findingsCount}</div>
                    <div className="text-xs text-zinc-600">findings</div>
                  </div>
                </div>

                {/* Finding summaries */}
                {card.findings.length > 0 && (
                  <div className="mt-3 border-t border-green-500/10 pt-3 space-y-1">
                    {card.findings.slice(0, 3).map((f, i) => (
                      <div key={i} className="flex items-center gap-2 text-xs">
                        <span className="text-green-500/50">[{f.source}]</span>
                        <span className="text-zinc-500 truncate">{f.summary}</span>
                      </div>
                    ))}
                    {card.findings.length > 3 && (
                      <div className="text-xs text-zinc-700">
                        +{card.findings.length - 3} more findings
                      </div>
                    )}
                  </div>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
