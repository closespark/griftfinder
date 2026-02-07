'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { isSupabaseConfigured } from '@/lib/supabase/client';
import { getDogeContracts, getDogeGrants, getDogeAgencies, type DogeContract, type DogeGrant } from '@/lib/supabase/queries';

function formatMoney(n: number): string {
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}k`;
  return `$${n.toLocaleString()}`;
}

const PAGE_SIZE = 50;

export default function DogePage() {
  const [tab, setTab] = useState<'contracts' | 'grants'>('contracts');
  const [search, setSearch] = useState('');
  const [agency, setAgency] = useState('');
  const [agencies, setAgencies] = useState<string[]>([]);
  const [contracts, setContracts] = useState<DogeContract[]>([]);
  const [grants, setGrants] = useState<DogeGrant[]>([]);
  const [contractCount, setContractCount] = useState(0);
  const [grantCount, setGrantCount] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    if (!isSupabaseConfigured()) { setLoading(false); return; }
    setLoading(true);
    const offset = page * PAGE_SIZE;
    if (tab === 'contracts') {
      const result = await getDogeContracts({ agency: agency || undefined, search: search || undefined, limit: PAGE_SIZE, offset });
      setContracts(result.data);
      setContractCount(result.count);
    } else {
      const result = await getDogeGrants({ agency: agency || undefined, search: search || undefined, limit: PAGE_SIZE, offset });
      setGrants(result.data);
      setGrantCount(result.count);
    }
    setLoading(false);
  }, [tab, search, agency, page]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (!isSupabaseConfigured()) return;
    getDogeAgencies().then(setAgencies);
  }, []);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(0);
    fetchData();
  };

  const totalCount = tab === 'contracts' ? contractCount : grantCount;
  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  // Stats
  const contractTotal = contracts.reduce((s, c) => s + (c.contract_value || 0), 0);
  const grantTotal = grants.reduce((s, g) => s + (g.grant_value || 0), 0);
  const contractSavings = contracts.reduce((s, c) => s + (c.savings_claimed || 0), 0);
  const grantSavings = grants.reduce((s, g) => s + (g.savings_claimed || 0), 0);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      {/* Header */}
      <div className="border-b border-green-500/20 pb-6 mb-6">
        <h1 className="text-2xl font-bold text-white">
          <span className="text-orange-400">DOGE</span> EXPLORER
        </h1>
        <p className="mt-1 text-sm text-zinc-500">
          Browse and search DOGE contracts and grants data
        </p>
      </div>

      {!isSupabaseConfigured() ? (
        <div className="border border-yellow-500/30 bg-yellow-950/10 p-6 text-yellow-400/80 text-sm">
          Configure Supabase to view DOGE data.
        </div>
      ) : (
        <>
          {/* Tab toggle */}
          <div className="flex gap-2 mb-6">
            <button
              onClick={() => { setTab('contracts'); setPage(0); }}
              className={`px-4 py-2 text-sm transition-colors ${
                tab === 'contracts'
                  ? 'text-orange-400 bg-orange-950/30 border border-orange-500/30'
                  : 'text-zinc-500 border border-zinc-800 hover:text-zinc-400'
              }`}
            >
              CONTRACTS ({contractCount.toLocaleString()})
            </button>
            <button
              onClick={() => { setTab('grants'); setPage(0); }}
              className={`px-4 py-2 text-sm transition-colors ${
                tab === 'grants'
                  ? 'text-orange-400 bg-orange-950/30 border border-orange-500/30'
                  : 'text-zinc-500 border border-zinc-800 hover:text-zinc-400'
              }`}
            >
              GRANTS ({grantCount.toLocaleString()})
            </button>
          </div>

          {/* Search + Filter */}
          <form onSubmit={handleSearch} className="flex gap-2 mb-6">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={tab === 'contracts' ? 'Search vendors or descriptions...' : 'Search recipients or descriptions...'}
              className="flex-1 border border-green-500/30 bg-green-950/10 px-4 py-2 text-green-400 placeholder:text-zinc-700 text-sm focus:outline-none focus:border-green-500/60"
            />
            <select
              value={agency}
              onChange={(e) => { setAgency(e.target.value); setPage(0); }}
              className="border border-green-500/30 bg-green-950/10 px-3 py-2 text-green-400 text-sm focus:outline-none focus:border-green-500/60"
            >
              <option value="">All agencies</option>
              {agencies.map((a) => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
            <button
              type="submit"
              className="border border-green-500/40 bg-green-950/20 px-4 py-2 text-sm text-green-400 hover:bg-green-950/40 transition-colors"
            >
              SEARCH
            </button>
          </form>

          {/* Stats row */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 mb-6">
            <div className="border border-orange-500/20 bg-orange-950/10 p-3">
              <div className="text-xs text-orange-400/60">SHOWING</div>
              <div className="mt-1 text-xl font-bold text-orange-400">{totalCount.toLocaleString()}</div>
            </div>
            <div className="border border-green-500/20 bg-green-950/10 p-3">
              <div className="text-xs text-green-500/60">PAGE VALUE</div>
              <div className="mt-1 text-xl font-bold text-green-400">
                {formatMoney(tab === 'contracts' ? contractTotal : grantTotal)}
              </div>
            </div>
            <div className="border border-green-500/20 bg-green-950/10 p-3">
              <div className="text-xs text-green-500/60">PAGE SAVINGS</div>
              <div className="mt-1 text-xl font-bold text-green-400">
                {formatMoney(tab === 'contracts' ? contractSavings : grantSavings)}
              </div>
            </div>
            <div className="border border-zinc-700 bg-zinc-900/50 p-3">
              <div className="text-xs text-zinc-500">PAGE</div>
              <div className="mt-1 text-xl font-bold text-zinc-400">{page + 1} / {Math.max(totalPages, 1)}</div>
            </div>
          </div>

          {/* Results */}
          {loading ? (
            <div className="text-green-400/50 animate-pulse">Loading DOGE data...</div>
          ) : (
            <div className="border border-green-500/20">
              <div className="divide-y divide-green-500/10">
                {tab === 'contracts' && contracts.map((c) => (
                  <div key={c.id} className="px-5 py-3 hover:bg-green-950/10 transition-colors">
                    <div className="flex items-center justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs px-2 py-0.5 bg-orange-950/30 text-orange-400 border border-orange-500/20">
                            CONTRACT
                          </span>
                          <span className="text-xs text-zinc-600">{c.agency}</span>
                          {c.status && <span className="text-xs text-zinc-700">{c.status}</span>}
                        </div>
                        <p className="text-sm text-zinc-300">{c.vendor}</p>
                        {c.description && <p className="mt-1 text-xs text-zinc-500 line-clamp-1">{c.description}</p>}
                        <div className="mt-1 flex items-center gap-3 text-xs text-zinc-600">
                          {c.entity_id && (
                            <Link href={`/entity/${c.entity_id}`} className="text-green-500/60 hover:text-green-400">
                              View entity &rarr;
                            </Link>
                          )}
                          {c.doge_url && (
                            <a href={c.doge_url} target="_blank" rel="noopener noreferrer" className="text-orange-400/60 hover:text-orange-400">
                              DOGE source &rarr;
                            </a>
                          )}
                        </div>
                      </div>
                      <div className="text-right shrink-0 ml-4">
                        {c.contract_value != null && c.contract_value > 0 && (
                          <div className="text-sm font-semibold text-green-400">{formatMoney(c.contract_value)}</div>
                        )}
                        {c.savings_claimed != null && c.savings_claimed > 0 && (
                          <div className="text-xs text-orange-400">Savings: {formatMoney(c.savings_claimed)}</div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
                {tab === 'grants' && grants.map((g) => (
                  <div key={g.id} className="px-5 py-3 hover:bg-green-950/10 transition-colors">
                    <div className="flex items-center justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs px-2 py-0.5 bg-orange-950/20 text-orange-300 border border-orange-500/15">
                            GRANT
                          </span>
                          <span className="text-xs text-zinc-600">{g.agency}</span>
                          {g.status && <span className="text-xs text-zinc-700">{g.status}</span>}
                        </div>
                        <p className="text-sm text-zinc-300">{g.recipient}</p>
                        {g.description && <p className="mt-1 text-xs text-zinc-500 line-clamp-1">{g.description}</p>}
                        <div className="mt-1 flex items-center gap-3 text-xs text-zinc-600">
                          {g.entity_id && (
                            <Link href={`/entity/${g.entity_id}`} className="text-green-500/60 hover:text-green-400">
                              View entity &rarr;
                            </Link>
                          )}
                          {g.doge_url && (
                            <a href={g.doge_url} target="_blank" rel="noopener noreferrer" className="text-orange-400/60 hover:text-orange-400">
                              DOGE source &rarr;
                            </a>
                          )}
                        </div>
                      </div>
                      <div className="text-right shrink-0 ml-4">
                        {g.grant_value != null && g.grant_value > 0 && (
                          <div className="text-sm font-semibold text-green-400">{formatMoney(g.grant_value)}</div>
                        )}
                        {g.savings_claimed != null && g.savings_claimed > 0 && (
                          <div className="text-xs text-orange-400">Savings: {formatMoney(g.savings_claimed)}</div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
                {((tab === 'contracts' && contracts.length === 0) || (tab === 'grants' && grants.length === 0)) && (
                  <div className="px-4 py-8 text-center text-zinc-600 text-sm">
                    No {tab} found{search || agency ? ' matching your filters' : ''}.
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="mt-4 flex items-center justify-between">
              <button
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
                className="border border-green-500/30 px-4 py-2 text-xs text-green-400 hover:bg-green-950/20 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                &larr; Previous
              </button>
              <span className="text-xs text-zinc-600">
                Page {page + 1} of {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
                className="border border-green-500/30 px-4 py-2 text-xs text-green-400 hover:bg-green-950/20 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                Next &rarr;
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
