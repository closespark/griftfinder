'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { isSupabaseConfigured } from '@/lib/supabase/client';
import { getTopEntities, type Entity } from '@/lib/supabase/queries';

export default function EntitiesPage() {
  const [entities, setEntities] = useState<Entity[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isSupabaseConfigured()) { setLoading(false); return; }
    getTopEntities(100).then(setEntities).finally(() => setLoading(false));
  }, []);

  const grouped = entities.reduce<Record<string, Entity[]>>((acc, e) => {
    const t = e.entity_type || 'unknown';
    if (!acc[t]) acc[t] = [];
    acc[t].push(e);
    return acc;
  }, {});

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="border-b border-green-500/20 pb-4 mb-6">
        <h1 className="text-2xl font-bold text-white">
          <span className="text-green-500">$</span> ENTITIES
        </h1>
        <p className="mt-1 text-sm text-zinc-600">
          {entities.length} entities tracked by Ralph
        </p>
      </div>

      {loading ? (
        <div className="text-green-400/50 animate-pulse">Loading...</div>
      ) : entities.length === 0 ? (
        <div className="text-center py-12 text-zinc-600">No entities yet.</div>
      ) : (
        <div className="space-y-6">
          {Object.entries(grouped).map(([type, ents]) => (
            <div key={type}>
              <h2 className="text-xs text-green-500/70 mb-2 uppercase">{type} ({ents.length})</h2>
              <div className="border border-green-500/20 divide-y divide-green-500/10">
                {ents.map((e) => (
                  <Link
                    key={e.id}
                    href={`/entity/${e.id}`}
                    className="block px-4 py-3 hover:bg-green-950/20 transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="text-sm text-green-400">{e.canonical_name}</span>
                        {e.aliases && e.aliases.length > 0 && (
                          <span className="ml-2 text-xs text-zinc-600">
                            aka {e.aliases.slice(0, 2).join(', ')}
                          </span>
                        )}
                      </div>
                      <span className="text-xs text-zinc-600">
                        {new Date(e.updated_at).toLocaleDateString()}
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
