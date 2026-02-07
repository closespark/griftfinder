'use client';

import { useState } from 'react';
import Link from 'next/link';
import { isSupabaseConfigured } from '@/lib/supabase/client';
import { searchEntities, searchPoliticians, searchLegislativeActions, searchRegulatoryActions, type Entity, type Politician, type LegislativeAction, type RegulatoryAction } from '@/lib/supabase/queries';

export default function SearchPage() {
  const [query, setQuery] = useState('');
  const [entities, setEntities] = useState<Entity[]>([]);
  const [politicians, setPoliticians] = useState<Politician[]>([]);
  const [legActions, setLegActions] = useState<LegislativeAction[]>([]);
  const [regActions, setRegActions] = useState<RegulatoryAction[]>([]);
  const [searched, setSearched] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim() || !isSupabaseConfigured()) return;
    setLoading(true);
    const [ents, pols, leg, reg] = await Promise.all([
      searchEntities(query.trim()),
      searchPoliticians(query.trim()),
      searchLegislativeActions(query.trim()),
      searchRegulatoryActions(query.trim()),
    ]);
    setEntities(ents);
    setPoliticians(pols);
    setLegActions(leg);
    setRegActions(reg);
    setSearched(true);
    setLoading(false);
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="border-b border-green-500/20 pb-4 mb-6">
        <h1 className="text-2xl font-bold text-white">
          <span className="text-green-500">$</span> SEARCH
        </h1>
        <p className="mt-1 text-sm text-zinc-600">
          Search across entities and the politician universe
        </p>
      </div>

      {/* Search bar */}
      <form onSubmit={handleSearch} className="mb-8">
        <div className="flex gap-2">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Enter a name..."
            className="flex-1 border border-green-500/30 bg-green-950/10 px-4 py-3 text-green-400 placeholder:text-zinc-700 focus:outline-none focus:border-green-500/60"
          />
          <button
            type="submit"
            disabled={loading}
            className="border border-green-500/40 bg-green-950/20 px-6 py-3 text-sm text-green-400 hover:bg-green-950/40 transition-colors disabled:opacity-50"
          >
            {loading ? 'Searching...' : 'SEARCH'}
          </button>
        </div>
      </form>

      {!isSupabaseConfigured() && (
        <div className="border border-yellow-500/30 bg-yellow-950/10 p-4 text-yellow-400/80 text-sm">
          Configure Supabase to enable search.
        </div>
      )}

      {searched && (
        <div className="space-y-6">
          {/* Entities */}
          <div>
            <h2 className="text-xs text-green-500/70 mb-2">
              ENTITIES ({entities.length} match{entities.length !== 1 ? 'es' : ''})
            </h2>
            {entities.length > 0 ? (
              <div className="border border-green-500/20 divide-y divide-green-500/10">
                {entities.map((e) => (
                  <Link key={e.id} href={`/entity/${e.id}`} className="block px-4 py-3 hover:bg-green-950/20 transition-colors">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="text-sm text-green-400">{e.canonical_name}</span>
                        <span className="ml-2 text-xs text-zinc-600">{e.entity_type}</span>
                      </div>
                      <span className="text-xs text-zinc-700">View dossier →</span>
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="text-sm text-zinc-600 py-4">No matching entities.</div>
            )}
          </div>

          {/* Politicians */}
          <div>
            <h2 className="text-xs text-green-500/70 mb-2">
              POLITICIAN UNIVERSE ({politicians.length} match{politicians.length !== 1 ? 'es' : ''})
            </h2>
            {politicians.length > 0 ? (
              <div className="border border-green-500/20 divide-y divide-green-500/10">
                {politicians.map((p) => (
                  <div key={p.id} className="px-4 py-3 flex items-center justify-between">
                    <div>
                      <span className="text-sm text-green-400">{p.name}</span>
                      <span className="ml-2 text-xs text-zinc-600">{p.state} | {p.level}</span>
                      {p.fec_candidate_id && (
                        <span className="ml-2 text-xs text-zinc-700">FEC: {p.fec_candidate_id}</span>
                      )}
                    </div>
                    {p.entity_id ? (
                      <Link href={`/entity/${p.entity_id}`} className="text-xs text-green-500/70 hover:text-green-400">
                        View dossier →
                      </Link>
                    ) : (
                      <span className="text-xs text-zinc-700">Not yet investigated</span>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-sm text-zinc-600 py-4">No matching politicians.</div>
            )}
          </div>

          {/* Legislative Actions */}
          <div>
            <h2 className="text-xs text-green-500/70 mb-2">
              LEGISLATIVE ACTIONS ({legActions.length} match{legActions.length !== 1 ? 'es' : ''})
            </h2>
            {legActions.length > 0 ? (
              <div className="border border-green-500/20 divide-y divide-green-500/10">
                {legActions.map((la) => (
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
                    <p className="text-sm text-zinc-300">{la.bill_title}</p>
                    <div className="mt-1 flex items-center gap-3 text-xs text-zinc-600">
                      {la.latest_action_date && <span>{la.latest_action_date}</span>}
                      {la.entity_id && (
                        <Link href={`/entity/${la.entity_id}`} className="text-green-500/60 hover:text-green-400">
                          View entity &rarr;
                        </Link>
                      )}
                      {la.bill_url && (
                        <a href={la.bill_url} target="_blank" rel="noopener noreferrer" className="text-green-500/60 hover:text-green-400">
                          Source &rarr;
                        </a>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-sm text-zinc-600 py-4">No matching legislative actions.</div>
            )}
          </div>

          {/* Regulatory Actions */}
          <div>
            <h2 className="text-xs text-green-500/70 mb-2">
              REGULATORY ACTIONS ({regActions.length} match{regActions.length !== 1 ? 'es' : ''})
            </h2>
            {regActions.length > 0 ? (
              <div className="border border-green-500/20 divide-y divide-green-500/10">
                {regActions.map((ra) => (
                  <div key={ra.id} className="px-4 py-3">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs px-2 py-0.5 bg-purple-950/30 text-purple-400 border border-purple-500/20">
                        {ra.doc_type}
                      </span>
                      <span className="text-xs text-zinc-600">{ra.document_number}</span>
                    </div>
                    <p className="text-sm text-zinc-300">{ra.title}</p>
                    <div className="mt-1 flex items-center gap-3 text-xs text-zinc-600">
                      {ra.agencies?.length > 0 && <span>{ra.agencies.join(', ')}</span>}
                      {ra.publication_date && <span>{ra.publication_date}</span>}
                      {ra.entity_id && (
                        <Link href={`/entity/${ra.entity_id}`} className="text-green-500/60 hover:text-green-400">
                          View entity &rarr;
                        </Link>
                      )}
                      {ra.html_url && (
                        <a href={ra.html_url} target="_blank" rel="noopener noreferrer" className="text-green-500/60 hover:text-green-400">
                          Federal Register &rarr;
                        </a>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-sm text-zinc-600 py-4">No matching regulatory actions.</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
