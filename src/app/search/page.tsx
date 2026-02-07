'use client';

import { useState } from 'react';
import Link from 'next/link';
import { isSupabaseConfigured } from '@/lib/supabase/client';
import { searchEntities, searchPoliticians, type Entity, type Politician } from '@/lib/supabase/queries';

export default function SearchPage() {
  const [query, setQuery] = useState('');
  const [entities, setEntities] = useState<Entity[]>([]);
  const [politicians, setPoliticians] = useState<Politician[]>([]);
  const [searched, setSearched] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim() || !isSupabaseConfigured()) return;
    setLoading(true);
    const [ents, pols] = await Promise.all([
      searchEntities(query.trim()),
      searchPoliticians(query.trim()),
    ]);
    setEntities(ents);
    setPoliticians(pols);
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
        </div>
      )}
    </div>
  );
}
