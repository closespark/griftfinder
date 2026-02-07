'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { isSupabaseConfigured } from '@/lib/supabase/client';
import {
  getEntity, getEntitySignals, getEntityInvestigations, getEntityRelationships,
  getEntityDisbursements, getEntityScreenings, getEntityFilings, getEntityCourtCases, getEntityAwards,
  type Entity, type Signal, type MmixEntry, type Relationship, type FecDisbursement, type ScreeningResult,
} from '@/lib/supabase/queries';

export default function EntityDossierPage() {
  const { id } = useParams<{ id: string }>();
  const [entity, setEntity] = useState<Entity | null>(null);
  const [signals, setSignals] = useState<Signal[]>([]);
  const [investigations, setInvestigations] = useState<MmixEntry[]>([]);
  const [relationships, setRelationships] = useState<Relationship[]>([]);
  const [disbursements, setDisbursements] = useState<FecDisbursement[]>([]);
  const [screenings, setScreenings] = useState<ScreeningResult[]>([]);
  const [filings, setFilings] = useState<Record<string, unknown>[]>([]);
  const [courtCases, setCourtCases] = useState<Record<string, unknown>[]>([]);
  const [awards, setAwards] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isSupabaseConfigured() || !id) { setLoading(false); return; }
    getEntity(id).then(async (ent) => {
      setEntity(ent);
      if (!ent) { setLoading(false); return; }
      const name = ent.canonical_name;
      const [sig, inv, rel, disb, scr, fil, court, awd] = await Promise.all([
        getEntitySignals(id),
        getEntityInvestigations(id),
        getEntityRelationships(id),
        getEntityDisbursements(id),
        getEntityScreenings(name),
        getEntityFilings(name),
        getEntityCourtCases(name),
        getEntityAwards(name),
      ]);
      setSignals(sig);
      setInvestigations(inv);
      setRelationships(rel);
      setDisbursements(disb);
      setScreenings(scr);
      setFilings(fil);
      setCourtCases(court);
      setAwards(awd);
      setLoading(false);
    });
  }, [id]);

  if (loading) return <div className="mx-auto max-w-6xl px-4 py-8 text-green-400/50 animate-pulse">Loading dossier...</div>;
  if (!entity) return <div className="mx-auto max-w-6xl px-4 py-8 text-zinc-600">Entity not found. <Link href="/entities" className="text-green-400 underline">Back to entities</Link></div>;

  const totalMoney = disbursements.reduce((sum, d) => sum + (d.disbursement_amount || 0), 0);

  // Get findings from all investigations for this entity
  const allFindings = investigations.flatMap((inv) => inv.findings || []);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      {/* Header */}
      <div className="border-b border-green-500/20 pb-4 mb-6">
        <div className="flex items-center gap-2 text-xs text-zinc-600 mb-2">
          <Link href="/entities" className="hover:text-green-400">ENTITIES</Link>
          <span>/</span>
          <span className="text-green-500/70">{entity.entity_type}</span>
        </div>
        <h1 className="text-3xl font-bold text-white">{entity.canonical_name}</h1>
        {entity.aliases && entity.aliases.length > 0 && (
          <p className="mt-1 text-sm text-zinc-600">
            Also known as: {entity.aliases.join(', ')}
          </p>
        )}
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5 mb-6">
        {[
          { label: 'SIGNALS', value: signals.length },
          { label: 'INVESTIGATIONS', value: investigations.length },
          { label: 'FEC RECORDS', value: disbursements.length },
          { label: 'RELATIONSHIPS', value: relationships.length },
          { label: 'FEC TOTAL', value: `$${(totalMoney / 1000).toFixed(0)}k` },
        ].map((s) => (
          <div key={s.label} className="border border-green-500/20 bg-green-950/10 p-3">
            <div className="text-xs text-green-500/60">{s.label}</div>
            <div className="mt-0.5 text-xl font-bold text-green-400">{s.value}</div>
          </div>
        ))}
      </div>

      {/* Investigation findings */}
      {allFindings.length > 0 && (
        <Section title="INVESTIGATION FINDINGS" count={allFindings.length}>
          {allFindings.map((f, i) => (
            <div key={i} className="px-4 py-3 border-b border-green-500/10 last:border-0">
              <div className="flex items-center gap-2">
                <span className="text-xs px-2 py-0.5 bg-green-950/40 text-green-500/70 border border-green-500/20">
                  {f.source}
                </span>
              </div>
              <p className="mt-1 text-sm text-zinc-400">{f.summary}</p>
            </div>
          ))}
        </Section>
      )}

      {/* Signals */}
      {signals.length > 0 && (
        <Section title="SIGNALS" count={signals.length}>
          {signals.slice(0, 20).map((sig) => (
            <div key={sig.id} className="px-4 py-2 border-b border-green-500/10 last:border-0 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className={`h-2 w-2 rounded-full ${
                  sig.strength >= 0.8 ? 'bg-red-500' : sig.strength >= 0.5 ? 'bg-yellow-500' : 'bg-green-500'
                }`} />
                <span className="text-xs text-green-400">{sig.signal_type}</span>
                <span className="text-xs text-zinc-600">{(sig.details as Record<string, string>)?.description?.slice(0, 80)}</span>
              </div>
              <div className="text-xs text-zinc-600">{sig.strength.toFixed(1)}</div>
            </div>
          ))}
        </Section>
      )}

      {/* FEC Disbursements */}
      {disbursements.length > 0 && (
        <Section title="FEC DISBURSEMENTS" count={disbursements.length}>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-green-500/60 text-left border-b border-green-500/20">
                  <th className="px-4 py-2">RECIPIENT</th>
                  <th className="px-4 py-2">AMOUNT</th>
                  <th className="px-4 py-2">COMMITTEE</th>
                  <th className="px-4 py-2">DATE</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-green-500/10">
                {disbursements.slice(0, 30).map((d) => (
                  <tr key={d.id} className="text-zinc-400">
                    <td className="px-4 py-2 text-green-400">{d.recipient_name}</td>
                    <td className="px-4 py-2">${d.disbursement_amount?.toLocaleString()}</td>
                    <td className="px-4 py-2 text-zinc-600">{d.committee_name}</td>
                    <td className="px-4 py-2 text-zinc-600">{d.disbursement_date}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      )}

      {/* Screenings (OFAC, LDA) */}
      {screenings.length > 0 && (
        <Section title="SCREENING RESULTS" count={screenings.length}>
          {screenings.map((s, i) => (
            <div key={i} className="px-4 py-3 border-b border-green-500/10 last:border-0">
              <div className="flex items-center gap-2">
                <span className="text-xs px-2 py-0.5 bg-red-950/30 text-red-400 border border-red-500/20">
                  {s.source || s.list_name}
                </span>
                <span className="text-xs text-zinc-500">{s.match_type}</span>
              </div>
            </div>
          ))}
        </Section>
      )}

      {/* Corporate Filings */}
      {filings.length > 0 && (
        <Section title="CORPORATE & REGULATORY FILINGS" count={filings.length}>
          {filings.map((f, i) => (
            <div key={i} className="px-4 py-2 border-b border-green-500/10 last:border-0 text-xs text-zinc-400">
              <span className="text-green-500/70">[{(f as Record<string, string>).filing_type || 'Filing'}]</span>{' '}
              {(f as Record<string, string>).entity_name}
            </div>
          ))}
        </Section>
      )}

      {/* Court Cases */}
      {courtCases.length > 0 && (
        <Section title="COURT CASES" count={courtCases.length}>
          {courtCases.map((c, i) => (
            <div key={i} className="px-4 py-2 border-b border-green-500/10 last:border-0 text-xs text-zinc-400">
              {(c as Record<string, string>).case_name || (c as Record<string, string>).entity_name || 'Case'}
            </div>
          ))}
        </Section>
      )}

      {/* Federal Awards */}
      {awards.length > 0 && (
        <Section title="FEDERAL AWARDS & CONTRACTS" count={awards.length}>
          {awards.map((a, i) => (
            <div key={i} className="px-4 py-2 border-b border-green-500/10 last:border-0 text-xs text-zinc-400">
              {(a as Record<string, string>).award_description || (a as Record<string, string>).entity_name || 'Award'}
            </div>
          ))}
        </Section>
      )}

      {/* Relationships */}
      {relationships.length > 0 && (
        <Section title="RELATIONSHIPS" count={relationships.length}>
          {relationships.map((r) => (
            <div key={r.id} className="px-4 py-2 border-b border-green-500/10 last:border-0 flex items-center gap-2 text-xs">
              <span className="text-green-500/50">{r.relationship_type}</span>
              <span className="text-zinc-500">→</span>
              <Link
                href={`/entity/${r.source_entity_id === id ? r.target_entity_id : r.source_entity_id}`}
                className="text-green-400 hover:underline"
              >
                {r.source_entity_id === id ? r.target_entity_id.slice(0, 12) : r.source_entity_id.slice(0, 12)}...
              </Link>
            </div>
          ))}
        </Section>
      )}
    </div>
  );
}

function Section({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return (
    <div className="mb-6 border border-green-500/20">
      <div className="border-b border-green-500/20 bg-green-950/20 px-4 py-2 flex items-center justify-between">
        <span className="text-xs text-green-500/70">{title}</span>
        <span className="text-xs text-zinc-600">{count}</span>
      </div>
      {children}
    </div>
  );
}
