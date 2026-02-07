'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { isSupabaseConfigured } from '@/lib/supabase/client';
import {
  getEntity, getEntitySignals, getEntityInvestigations, getEntityRelationships,
  getEntityDisbursements, getEntityScreenings, getEntityFilings, getEntityCourtCases, getEntityAwards,
  getEntityLegislativeActions, getEntityRegulatoryActions, getEntityRegulatoryComments,
  getEntityDogeContracts, getEntityDogeGrants, getEntityPoliticianIds,
  getEntityCorruptionLoops, getEntityEnrichmentLog,
  type Entity, type Signal, type MmixEntry, type Relationship, type FecDisbursement, type ScreeningResult,
  type LegislativeAction, type RegulatoryAction, type RegulatoryComment,
  type DogeContract, type DogeGrant, type PoliticianId, type CorruptionLoopLink, type EnrichmentLogEntry,
} from '@/lib/supabase/queries';

function formatMoney(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}k`;
  return `$${n.toLocaleString()}`;
}

function signalDescription(sig: Signal): string {
  const d = sig.details as Record<string, unknown>;
  if (d?.description) return String(d.description);
  return sig.signal_type.replace(/_/g, ' ').toLowerCase();
}

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
  const [legislativeActions, setLegislativeActions] = useState<LegislativeAction[]>([]);
  const [regulatoryActions, setRegulatoryActions] = useState<RegulatoryAction[]>([]);
  const [regulatoryComments, setRegulatoryComments] = useState<RegulatoryComment[]>([]);
  const [dogeContracts, setDogeContracts] = useState<DogeContract[]>([]);
  const [dogeGrants, setDogeGrants] = useState<DogeGrant[]>([]);
  const [politicianIds, setPoliticianIds] = useState<PoliticianId[]>([]);
  const [corruptionLoops, setCorruptionLoops] = useState<CorruptionLoopLink[]>([]);
  const [enrichmentLog, setEnrichmentLog] = useState<EnrichmentLogEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isSupabaseConfigured() || !id) { setLoading(false); return; }
    getEntity(id).then(async (ent) => {
      setEntity(ent);
      if (!ent) { setLoading(false); return; }
      const name = ent.canonical_name;
      const [sig, inv, rel, disb, scr, fil, court, awd, legAct, regAct, regCom, dogeCon, dogeGr, polIds, corrLoops, enrLog] = await Promise.all([
        getEntitySignals(id),
        getEntityInvestigations(id),
        getEntityRelationships(id),
        getEntityDisbursements(id),
        getEntityScreenings(name),
        getEntityFilings(name),
        getEntityCourtCases(name),
        getEntityAwards(name),
        getEntityLegislativeActions(id),
        getEntityRegulatoryActions(id),
        getEntityRegulatoryComments(id),
        getEntityDogeContracts(id),
        getEntityDogeGrants(id),
        getEntityPoliticianIds(id),
        getEntityCorruptionLoops(id),
        getEntityEnrichmentLog(id),
      ]);
      setSignals(sig);
      setInvestigations(inv);
      setRelationships(rel);
      setDisbursements(disb);
      setScreenings(scr);
      setFilings(fil);
      setCourtCases(court);
      setAwards(awd);
      setLegislativeActions(legAct);
      setRegulatoryActions(regAct);
      setRegulatoryComments(regCom);
      setDogeContracts(dogeCon);
      setDogeGrants(dogeGr);
      setPoliticianIds(polIds);
      setCorruptionLoops(corrLoops);
      setEnrichmentLog(enrLog);
      setLoading(false);
    });
  }, [id]);

  if (loading) return <div className="mx-auto max-w-6xl px-4 py-8 text-green-400/50 animate-pulse">Loading dossier...</div>;
  if (!entity) return <div className="mx-auto max-w-6xl px-4 py-8 text-zinc-600">Entity not found. <Link href="/entities" className="text-green-400 underline">Back to entities</Link></div>;

  const totalSpending = disbursements.reduce((sum, d) => sum + (d.disbursement_amount || 0), 0);
  const totalAwards = awards.reduce((sum, a) => sum + Number((a as Record<string, unknown>).total_obligation || 0), 0);
  const allFindings = investigations.flatMap((inv) => inv.findings || []);
  const highStrengthSignals = signals.filter((s) => s.strength >= 0.7);

  // Group disbursements by recipient for the money flow view
  const vendorTotals = disbursements.reduce<Record<string, { total: number; count: number; committees: Set<string> }>>((acc, d) => {
    const v = d.recipient_name || 'Unknown';
    if (!acc[v]) acc[v] = { total: 0, count: 0, committees: new Set() };
    acc[v].total += d.disbursement_amount || 0;
    acc[v].count += 1;
    if (d.committee_name) acc[v].committees.add(d.committee_name);
    return acc;
  }, {});
  const topVendors = Object.entries(vendorTotals)
    .sort((a, b) => b[1].total - a[1].total)
    .slice(0, 15);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      {/* Header */}
      <div className="border-b border-green-500/20 pb-6 mb-6">
        <div className="flex items-center gap-2 text-xs text-zinc-600 mb-2">
          <Link href="/entities" className="hover:text-green-400">ENTITIES</Link>
          <span>/</span>
          <span className="text-green-500/50">{entity.entity_type}</span>
        </div>
        <h1 className="text-3xl font-bold text-white">{entity.canonical_name}</h1>
        {entity.aliases && entity.aliases.length > 0 && (
          <p className="mt-1 text-sm text-zinc-500">
            Also known as: {entity.aliases.join(', ')}
          </p>
        )}
        {politicianIds.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2">
            {politicianIds.map((pid) => (
              <span key={pid.id} className="text-xs px-2 py-0.5 bg-zinc-900 border border-zinc-700 text-zinc-400 font-mono">
                {pid.id_type}: {pid.id_value}
              </span>
            ))}
          </div>
        )}

        {/* Quick summary line */}
        <div className="mt-4 flex flex-wrap gap-3 text-xs">
          {highStrengthSignals.length > 0 && (
            <span className="px-2 py-1 bg-red-950/20 border border-red-500/30 text-red-400">
              {highStrengthSignals.length} high-priority anomalies
            </span>
          )}
          {totalSpending > 0 && (
            <span className="px-2 py-1 bg-green-950/20 border border-green-500/20 text-green-400">
              {formatMoney(totalSpending)} in FEC disbursements
            </span>
          )}
          {totalAwards > 0 && (
            <span className="px-2 py-1 bg-green-950/20 border border-green-500/20 text-green-400">
              {formatMoney(totalAwards)} in federal contracts
            </span>
          )}
          {courtCases.length > 0 && (
            <span className="px-2 py-1 bg-yellow-950/20 border border-yellow-500/20 text-yellow-400">
              {courtCases.length} court records
            </span>
          )}
          {screenings.length > 0 && (
            <span className="px-2 py-1 bg-red-950/20 border border-red-500/20 text-red-400">
              {screenings.length} screening matches
            </span>
          )}
          {legislativeActions.length > 0 && (
            <span className="px-2 py-1 bg-blue-950/20 border border-blue-500/20 text-blue-400">
              {legislativeActions.length} legislative actions
            </span>
          )}
          {(regulatoryActions.length > 0 || regulatoryComments.length > 0) && (
            <span className="px-2 py-1 bg-purple-950/20 border border-purple-500/20 text-purple-400">
              {regulatoryActions.length + regulatoryComments.length} regulatory records
            </span>
          )}
          {(dogeContracts.length > 0 || dogeGrants.length > 0) && (
            <span className="px-2 py-1 bg-orange-950/20 border border-orange-500/20 text-orange-400">
              {dogeContracts.length + dogeGrants.length} DOGE records
            </span>
          )}
        </div>
      </div>

      {/* Investigation findings — the headline content */}
      {allFindings.length > 0 && (
        <Section title="WHAT WE FOUND" count={allFindings.length}>
          <div className="divide-y divide-green-500/10">
            {allFindings.map((f, i) => (
              <div key={i} className="px-5 py-4">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs px-2 py-0.5 bg-green-950/30 text-green-500/80 border border-green-500/20 uppercase">
                    {formatSource(f.source)}
                  </span>
                </div>
                <p className="text-sm text-zinc-300">{f.summary}</p>
                {f.detail && renderFindingDetail(f.source, f.detail)}
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Anomalies / Signals — readable */}
      {signals.length > 0 && (
        <Section title="DETECTED ANOMALIES" count={signals.length}>
          <div className="divide-y divide-green-500/10">
            {signals.slice(0, 25).map((sig) => (
              <div key={sig.id} className={`px-5 py-3 border-l-2 ${
                sig.strength >= 0.8 ? 'border-l-red-500/50' : sig.strength >= 0.5 ? 'border-l-yellow-500/40' : 'border-l-green-500/30'
              }`}>
                <p className="text-sm text-zinc-300">{signalDescription(sig)}</p>
                <div className="mt-1 flex items-center gap-3 text-xs text-zinc-600">
                  <span>Strength: {(sig.strength * 100).toFixed(0)}%</span>
                  <span>{new Date(sig.detected_at).toLocaleDateString()}</span>
                  <span className="text-zinc-700">{sig.source_api}</span>
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Money flow — where the money goes */}
      {topVendors.length > 0 && (
        <Section title="WHERE THE MONEY GOES" count={disbursements.length + ' payments'}>
          <div className="p-4 space-y-2">
            {topVendors.map(([vendor, info]) => {
              const pct = Math.round((info.total / topVendors[0][1].total) * 100);
              return (
                <div key={vendor} className="flex items-center gap-3">
                  <span className="text-xs text-green-400 w-48 truncate" title={vendor}>{vendor}</span>
                  <div className="flex-1 h-3 bg-zinc-900 overflow-hidden">
                    <div className="h-full bg-green-500/30" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="text-xs text-zinc-400 w-20 text-right">{formatMoney(info.total)}</span>
                  <span className="text-xs text-zinc-600 w-16 text-right">{info.count} pmt{info.count > 1 ? 's' : ''}</span>
                </div>
              );
            })}
          </div>
          {disbursements.length > 15 && (
            <div className="px-4 pb-3 text-xs text-zinc-600">
              Showing top 15 of {disbursements.length} disbursement recipients
            </div>
          )}
        </Section>
      )}

      {/* Screenings — OFAC, LDA, etc. */}
      {screenings.length > 0 && (
        <Section title="SCREENING ALERTS" count={screenings.length}>
          <div className="divide-y divide-green-500/10">
            {screenings.map((s, i) => (
              <div key={i} className="px-5 py-3">
                <div className="flex items-center gap-2">
                  <span className="text-xs px-2 py-0.5 bg-red-950/30 text-red-400 border border-red-500/20">
                    {s.list_name || s.source}
                  </span>
                  <span className="text-xs text-zinc-500">{s.match_type}</span>
                </div>
                <p className="mt-1 text-xs text-zinc-500">{s.entity_name}</p>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Legislative Record */}
      {legislativeActions.length > 0 && (
        <Section title="LEGISLATIVE RECORD" count={legislativeActions.length}>
          <div className="divide-y divide-green-500/10">
            {legislativeActions.map((la) => (
              <div key={la.id} className="px-5 py-3">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs px-2 py-0.5 bg-blue-950/30 text-blue-400 border border-blue-500/20">
                    {la.sponsor_role}
                  </span>
                  <span className="text-xs px-2 py-0.5 bg-zinc-900 text-zinc-400 border border-zinc-700">
                    {la.bill_type} {la.bill_number}
                  </span>
                  {la.policy_area && (
                    <span className="text-xs text-zinc-600">{la.policy_area}</span>
                  )}
                </div>
                <p className="text-sm text-zinc-300">{la.title}</p>
                <div className="mt-1 flex items-center gap-3 text-xs text-zinc-600">
                  {la.introduced_date && <span>Introduced: {la.introduced_date}</span>}
                  {la.latest_action_date && <span>Latest: {la.latest_action_date}</span>}
                  <span>Congress #{la.congress}</span>
                  {la.url && (
                    <a href={la.url} target="_blank" rel="noopener noreferrer" className="text-green-500/60 hover:text-green-400">
                      Source &rarr;
                    </a>
                  )}
                </div>
                {la.latest_action_text && (
                  <p className="mt-1 text-xs text-zinc-500 italic">{la.latest_action_text}</p>
                )}
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Regulatory Involvement */}
      {(regulatoryActions.length > 0 || regulatoryComments.length > 0) && (
        <Section title="REGULATORY INVOLVEMENT" count={regulatoryActions.length + regulatoryComments.length}>
          <div className="divide-y divide-green-500/10">
            {regulatoryActions.map((ra) => (
              <div key={ra.id} className="px-5 py-3">
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
                  {ra.html_url && (
                    <a href={ra.html_url} target="_blank" rel="noopener noreferrer" className="text-green-500/60 hover:text-green-400">
                      Federal Register &rarr;
                    </a>
                  )}
                </div>
              </div>
            ))}
            {regulatoryComments.map((rc) => (
              <div key={rc.id} className="px-5 py-3">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs px-2 py-0.5 bg-purple-950/20 text-purple-300 border border-purple-500/15">
                    COMMENT
                  </span>
                  {rc.agency && <span className="text-xs text-zinc-600">{rc.agency}</span>}
                </div>
                {rc.comment_on_title && <p className="text-sm text-zinc-300">{rc.comment_on_title}</p>}
                {rc.comment_text && <p className="mt-1 text-xs text-zinc-500 line-clamp-2">{rc.comment_text}</p>}
                <div className="mt-1 text-xs text-zinc-600">
                  {rc.docket_id && <span>Docket: {rc.docket_id}</span>}
                  {rc.posted_date && <span className="ml-3">{rc.posted_date}</span>}
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* DOGE Data */}
      {(dogeContracts.length > 0 || dogeGrants.length > 0) && (
        <Section title="DOGE DATA" count={dogeContracts.length + dogeGrants.length}>
          <div className="divide-y divide-green-500/10">
            {dogeContracts.map((dc) => (
              <div key={dc.id} className="px-5 py-3">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs px-2 py-0.5 bg-orange-950/30 text-orange-400 border border-orange-500/20">
                        CONTRACT
                      </span>
                      <span className="text-xs text-zinc-600">{dc.agency}</span>
                      {dc.status && <span className="text-xs text-zinc-700">{dc.status}</span>}
                    </div>
                    <p className="text-sm text-zinc-300">{dc.vendor}</p>
                    {dc.description && <p className="mt-1 text-xs text-zinc-500 line-clamp-1">{dc.description}</p>}
                  </div>
                  <div className="text-right shrink-0">
                    {dc.contract_value != null && dc.contract_value > 0 && (
                      <div className="text-sm font-semibold text-green-400">{formatMoney(dc.contract_value)}</div>
                    )}
                    {dc.savings_claimed != null && dc.savings_claimed > 0 && (
                      <div className="text-xs text-orange-400">Savings: {formatMoney(dc.savings_claimed)}</div>
                    )}
                  </div>
                </div>
              </div>
            ))}
            {dogeGrants.map((dg) => (
              <div key={dg.id} className="px-5 py-3">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs px-2 py-0.5 bg-orange-950/20 text-orange-300 border border-orange-500/15">
                        GRANT
                      </span>
                      <span className="text-xs text-zinc-600">{dg.agency}</span>
                      {dg.status && <span className="text-xs text-zinc-700">{dg.status}</span>}
                    </div>
                    <p className="text-sm text-zinc-300">{dg.recipient}</p>
                    {dg.description && <p className="mt-1 text-xs text-zinc-500 line-clamp-1">{dg.description}</p>}
                  </div>
                  <div className="text-right shrink-0">
                    {dg.grant_value != null && dg.grant_value > 0 && (
                      <div className="text-sm font-semibold text-green-400">{formatMoney(dg.grant_value)}</div>
                    )}
                    {dg.savings_claimed != null && dg.savings_claimed > 0 && (
                      <div className="text-xs text-orange-400">Savings: {formatMoney(dg.savings_claimed)}</div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Corruption Loop Analysis */}
      {corruptionLoops.length > 0 && (
        <Section title="CORRUPTION LOOP ANALYSIS" count={corruptionLoops.length}>
          <div className="divide-y divide-green-500/10">
            {corruptionLoops.map((cl) => (
              <div key={cl.id} className="px-5 py-3">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs px-2 py-0.5 bg-red-950/30 text-red-400 border border-red-500/20">
                    {cl.loop_type.replace(/_/g, ' ')}
                  </span>
                  <span className={`text-xs ${cl.confidence >= 0.7 ? 'text-red-400' : cl.confidence >= 0.4 ? 'text-yellow-400' : 'text-zinc-500'}`}>
                    {(cl.confidence * 100).toFixed(0)}% confidence
                  </span>
                </div>
                <p className="text-sm text-zinc-300">{cl.description}</p>
                {cl.linked_entity_name && (
                  <p className="mt-1 text-xs text-zinc-500">
                    Linked to: {cl.linked_entity_id ? (
                      <Link href={`/entity/${cl.linked_entity_id}`} className="text-green-400 hover:underline">{cl.linked_entity_name}</Link>
                    ) : cl.linked_entity_name}
                  </p>
                )}
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Corporate / Regulatory Filings */}
      {filings.length > 0 && (
        <Section title="CORPORATE & REGULATORY FILINGS" count={filings.length}>
          <div className="divide-y divide-green-500/10">
            {filings.map((f, i) => {
              const r = f as Record<string, string>;
              return (
                <div key={i} className="px-5 py-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xs px-2 py-0.5 bg-green-950/30 text-green-500/70 border border-green-500/20">
                      {r.filing_type || 'Filing'}
                    </span>
                    {r.jurisdiction && <span className="text-xs text-zinc-600">{r.jurisdiction}</span>}
                  </div>
                  <p className="mt-1 text-sm text-zinc-400">{r.entity_name}</p>
                </div>
              );
            })}
          </div>
        </Section>
      )}

      {/* Court Cases */}
      {courtCases.length > 0 && (
        <Section title="COURT RECORDS" count={courtCases.length}>
          <div className="divide-y divide-green-500/10">
            {courtCases.map((c, i) => {
              const r = c as Record<string, string>;
              return (
                <div key={i} className="px-5 py-3">
                  <p className="text-sm text-zinc-300">{r.case_name || r.entity_name || 'Case record'}</p>
                  {r.court_name && <p className="text-xs text-zinc-600 mt-1">{r.court_name}</p>}
                </div>
              );
            })}
          </div>
        </Section>
      )}

      {/* Federal Awards */}
      {awards.length > 0 && (
        <Section title="FEDERAL CONTRACTS & AWARDS" count={awards.length}>
          <div className="divide-y divide-green-500/10">
            {awards.map((a, i) => {
              const r = a as Record<string, unknown>;
              return (
                <div key={i} className="px-5 py-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-zinc-300">{String(r.award_description || r.recipient_name || r.entity_name || 'Award')}</p>
                    {Number(r.total_obligation) > 0 && (
                      <span className="text-sm font-semibold text-green-400">{formatMoney(Number(r.total_obligation))}</span>
                    )}
                  </div>
                  {r.awarding_agency ? <p className="text-xs text-zinc-600 mt-1">Agency: {String(r.awarding_agency)}</p> : null}
                </div>
              );
            })}
          </div>
        </Section>
      )}

      {/* Relationships */}
      {relationships.length > 0 && (
        <Section title="CONNECTIONS" count={relationships.length}>
          <div className="divide-y divide-green-500/10">
            {relationships.map((r) => (
              <div key={r.id} className="px-5 py-3 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-xs text-green-500/60 uppercase">{r.relationship_type.replace(/_/g, ' ')}</span>
                  <Link
                    href={`/entity/${r.source_entity_id === id ? r.target_entity_id : r.source_entity_id}`}
                    className="text-sm text-green-400 hover:underline"
                  >
                    {r.source_entity_id === id ? r.target_entity_id.slice(0, 12) : r.source_entity_id.slice(0, 12)}...
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}
      {/* Data Sources Queried */}
      {enrichmentLog.length > 0 && (
        <Section title="DATA SOURCES QUERIED" count={enrichmentLog.length}>
          <div className="divide-y divide-green-500/10">
            {enrichmentLog.map((el) => (
              <div key={el.id} className="px-5 py-2 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className={`h-2 w-2 rounded-full ${
                    el.status === 'success' ? 'bg-green-500' : el.status === 'error' ? 'bg-red-500' : 'bg-zinc-600'
                  }`} />
                  <span className="text-xs text-green-400 font-mono">{el.source_api}</span>
                </div>
                <div className="flex items-center gap-4 text-xs text-zinc-600">
                  <span>{el.records_found} records</span>
                  <span className={el.status === 'error' ? 'text-red-400' : ''}>{el.status}</span>
                  <span>{new Date(el.queried_at).toLocaleString()}</span>
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}
    </div>
  );
}

function Section({ title, count, children }: { title: string; count: number | string; children: React.ReactNode }) {
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

function formatSource(source: string): string {
  const map: Record<string, string> = {
    'fec': 'FEC Campaign Finance',
    'courtlistener': 'Court Records',
    'usaspending': 'Federal Contracts',
    'usaspending_grants': 'Federal Grants',
    'propublica_990': 'Nonprofit Tax Returns',
    'sec_edgar': 'SEC Filings',
    'opencorporates': 'Corporate Registry',
    'sam_gov': 'SAM.gov Registrations',
    'house_disclosures': 'Financial Disclosures',
    'irs_exempt_orgs': 'IRS Exempt Orgs',
    'wikidata_family': 'Family Connections',
    'Senate LDA': 'Senate Lobbying',
    'OFAC SDN': 'OFAC Sanctions',
    'Federal Register': 'Federal Register',
    'senate_lda': 'Senate Lobbying',
    'opensanctions': 'OFAC Sanctions',
    'federal_register': 'Federal Register',
    'LDA': 'Senate Lobbying',
    'web_search': 'Web / OSINT',
    'congress_gov': 'Congress.gov',
    'open_states': 'Open States',
    'regulations_gov': 'Regulations.gov',
    'doge_api': 'DOGE',
  };
  return map[source] || source.replace(/_/g, ' ');
}

function renderFindingDetail(source: string, detail: Record<string, unknown>): React.ReactNode {
  // LDA lobbying — show revolving door lobbyists
  if ((source === 'Senate LDA' || source === 'senate_lda') && detail?.revolving_door_lobbyists) {
    const lobbyists = detail.revolving_door_lobbyists as Array<{ name: string; covered_position: string }>;
    if (lobbyists.length > 0) {
      return (
        <div className="mt-2 space-y-1">
          <p className="text-xs text-yellow-400/80">Revolving door lobbyists:</p>
          {lobbyists.slice(0, 5).map((l, i) => (
            <p key={i} className="text-xs text-zinc-500 pl-3">
              {l.name} — <span className="text-yellow-400/60">formerly: {l.covered_position}</span>
            </p>
          ))}
        </div>
      );
    }
  }

  // Federal Register — show document titles
  if (source === 'Federal Register' || source === 'federal_register') {
    const docs = detail.documents as Array<{ title: string; type: string; agencies: string[]; html_url: string }>;
    if (docs?.length > 0) {
      return (
        <div className="mt-2 space-y-1">
          {docs.slice(0, 3).map((d, i) => (
            <p key={i} className="text-xs text-zinc-500 pl-3">
              [{d.type}] {d.title}
              {d.agencies?.length > 0 && <span className="text-zinc-600"> — {d.agencies.join(', ')}</span>}
            </p>
          ))}
        </div>
      );
    }
  }

  // Web search — show linked results
  if (source === 'web_search') {
    const results = detail.results as Array<{ title: string; url: string; snippet: string }>;
    if (results?.length > 0) {
      return (
        <div className="mt-2 space-y-2">
          {results.slice(0, 5).map((r, i) => (
            <div key={i} className="text-xs pl-3">
              <a href={r.url} target="_blank" rel="noopener noreferrer" className="text-green-400 hover:underline">
                {r.title}
              </a>
              <p className="text-zinc-600 mt-0.5">{r.snippet}</p>
            </div>
          ))}
        </div>
      );
    }
    // Single result with url
    if (detail.url) {
      return (
        <div className="mt-2 text-xs pl-3">
          <a href={String(detail.url)} target="_blank" rel="noopener noreferrer" className="text-green-400 hover:underline">
            {String(detail.snippet || 'View source')}
          </a>
        </div>
      );
    }
  }

  // SEC filings
  if (source === 'sec_edgar' && detail?.filings) {
    const filings = detail.filings as Array<{ form_type: string; company_name: string; date_filed: string }>;
    if (filings?.length > 0) {
      return (
        <div className="mt-2 space-y-1">
          {filings.slice(0, 5).map((f, i) => (
            <p key={i} className="text-xs text-zinc-500 pl-3">
              [{f.form_type}] {f.company_name} — filed {f.date_filed}
            </p>
          ))}
        </div>
      );
    }
  }

  return null;
}
