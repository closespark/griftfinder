/**
 * Story Classifier — synthesizes Ralph's raw investigation data into
 * narrative stories about suspicious networks and patterns.
 *
 * Pattern typologies (inspired by AMLSim, OpenSanctions, Hack23/cia):
 *   1. VENDOR_SIPHONING — one vendor paid by multiple campaigns (fan-out)
 *   2. CROSS_CAMPAIGN_NETWORK — group of politicians sharing the same vendors
 *   3. REVOLVING_DOOR — former government staffers now lobbying
 *   4. FAMILY_PAYMENTS — campaign funds flowing to spouse/family
 *   5. SANCTIONS_FLAG — entity matched on watchlists
 *   6. HIGH_VOLUME_PASS_THROUGH — entity processing unusually large volumes
 *   7. DARK_MONEY_CLUSTER — entities connected by relationships + high bridge scores
 *   8. INVESTIGATION_FINDINGS — MMIX investigation with significant findings
 */

import type { Signal, MmixEntry, Entity, Relationship, FecDisbursement, ScreeningResult } from './supabase/queries';

export interface ClassifiedStory {
  id: string;
  pattern: string;
  severity: 'critical' | 'high' | 'medium' | 'info';
  headline: string;
  narrative: string;
  entities: Array<{ id: string; name: string; role: string }>;
  evidence: Array<{ type: string; description: string }>;
  totalMoney: number;
  date: string;
  networkSize: number;
  sourceCount: number;
}

interface ClassificationInput {
  signals: Signal[];
  investigations: MmixEntry[];
  relationships: Relationship[];
  entities: Entity[];
  disbursements: FecDisbursement[];
  screenings: ScreeningResult[];
  kbNodes: Record<string, unknown>[];
}

function formatMoney(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${Math.round(n / 1_000)}k`;
  return `$${n.toLocaleString()}`;
}

export function classifyStories(data: ClassificationInput): ClassifiedStory[] {
  const stories: ClassifiedStory[] = [];
  const entityMap = new Map(data.entities.map((e) => [e.id, e]));

  function entityName(id: string | null | undefined): string {
    return entityMap.get(id ?? '')?.canonical_name ?? (id != null ? String(id).slice(0, 12) : 'Unknown');
  }

  // ─── 1. VENDOR SIPHONING — vendors paid by multiple campaigns ───
  detectVendorSiphoning(data, entityName, stories);

  // ─── 2. CROSS-CAMPAIGN NETWORKS — politicians sharing vendors ───
  detectCrossCampaignNetworks(data, entityName, stories);

  // ─── 3. REVOLVING DOOR — former staffers now lobbying ───
  detectRevolvingDoor(data, entityName, stories);

  // ─── 4. FAMILY / SPOUSE PAYMENTS ───
  detectFamilyPayments(data, entityName, stories);

  // ─── 5. SANCTIONS / SCREENING FLAGS ───
  detectSanctionsFlags(data, entityName, stories);

  // ─── 6. HIGH-VOLUME PASS-THROUGH ───
  detectHighVolumePassThrough(data, entityName, stories);

  // ─── 7. DARK MONEY CLUSTERS — relationship-connected entities with high bridge scores ───
  detectDarkMoneyClusters(data, entityName, entityMap, stories);

  // ─── 8. INVESTIGATION FINDINGS — MMIX investigations with significant findings across sources ───
  detectInvestigationStories(data, entityName, stories);

  // Fallback: when we have data but no pattern matched, show one INFO story so the page isn't empty
  if (stories.length === 0 && (data.disbursements.length > 0 || data.entities.length > 0 || data.signals.length > 0)) {
    const totalDisb = data.disbursements.reduce((s, d) => s + (d.disbursement_amount || 0), 0);
    stories.push({
      id: 'data-loaded',
      pattern: 'DATA_LOADED',
      severity: 'info',
      headline: 'Data loaded; no patterns above threshold yet',
      narrative: `Ralph has loaded ${data.entities.length} entities, ${data.disbursements.length} disbursements (${formatMoney(totalDisb)}), and ${data.signals.length} signals. No high-confidence patterns matched yet. Link more entity_id to committees or add signals to surface vendor siphoning and cross-campaign networks.`,
      entities: [],
      evidence: [
        { type: 'Entities', description: `${data.entities.length} entities` },
        { type: 'Disbursements', description: `${data.disbursements.length} payments, ${formatMoney(totalDisb)} total` },
        { type: 'Signals', description: `${data.signals.length} signals` },
      ],
      totalMoney: totalDisb,
      date: '',
      networkSize: 0,
      sourceCount: 1,
    });
  }

  // Sort by severity then money
  const severityOrder = { critical: 0, high: 1, medium: 2, info: 3 };
  stories.sort((a, b) => {
    const sd = severityOrder[a.severity] - severityOrder[b.severity];
    if (sd !== 0) return sd;
    return b.totalMoney - a.totalMoney;
  });

  return stories;
}

// ─── Pattern detectors ──────────────────────────────────────────────

function detectVendorSiphoning(
  data: ClassificationInput,
  entityName: (id: string) => string,
  stories: ClassifiedStory[],
) {
  // Group disbursements by normalized vendor name; track both entity_id and committee_id so we can detect patterns even when entity_id is null
  const vendorMap = new Map<string, {
    total: number;
    entities: Map<string, { name: string; amount: number; committee: string }>;
    committees: Map<string, { name: string; amount: number }>;
    disbursements: FecDisbursement[];
  }>();

  const genericVendorNames = new Set(['AGENCY', 'UNKNOWN', 'N/A', 'NONE', 'UNKNOWN RECIPIENT', 'MISC', 'OTHER', '']);
  for (const d of data.disbursements) {
    const vendor = (d.recipient_name || '').toUpperCase().trim();
    if (!vendor || vendor.length < 3 || genericVendorNames.has(vendor)) continue;
    if (!vendorMap.has(vendor)) vendorMap.set(vendor, { total: 0, entities: new Map(), committees: new Map(), disbursements: [] });
    const v = vendorMap.get(vendor)!;
    v.total += d.disbursement_amount || 0;
    v.disbursements.push(d);
    const committeeKey = (d.committee_id || d.committee_name || '').trim() || 'unknown';
    if (!v.committees.has(committeeKey)) v.committees.set(committeeKey, { name: d.committee_name || committeeKey, amount: 0 });
    v.committees.get(committeeKey)!.amount += d.disbursement_amount || 0;
    if (d.entity_id && !v.entities.has(d.entity_id)) {
      v.entities.set(d.entity_id, {
        name: entityName(d.entity_id),
        amount: 0,
        committee: d.committee_name || '',
      });
    }
    if (d.entity_id) {
      const ent = v.entities.get(d.entity_id)!;
      ent.amount += d.disbursement_amount || 0;
    }
  }

  const minTotal = 20_000;
  const minPayers = 3;

  for (const [vendor, info] of vendorMap) {
    const entityList = Array.from(info.entities.entries()).sort((a, b) => b[1].amount - a[1].amount);
    const committeeList = Array.from(info.committees.entries()).sort((a, b) => b[1].amount - a[1].amount);
    const useEntities = info.entities.size >= minPayers && info.total >= 50_000;
    const useCommittees = !useEntities && info.committees.size >= minPayers && info.total >= minTotal;

    if (useEntities) {
      const topPayers = entityList.slice(0, 5);
      stories.push({
        id: `siphon-${vendor.slice(0, 20)}`,
        pattern: 'VENDOR_SIPHONING',
        severity: info.entities.size >= 5 ? 'critical' : info.total >= 200_000 ? 'high' : 'medium',
        headline: `${vendor} received campaign funds from ${info.entities.size} different politicians`,
        narrative: `The vendor "${vendor}" collected ${formatMoney(info.total)} in campaign disbursements from ${info.entities.size} separate political campaigns. The largest payers include ${topPayers.map(([, e]) => `${e.name} (${formatMoney(e.amount)} via ${e.committee})`).join(', ')}. When a single vendor is paid by this many campaigns, it can indicate a coordinated network funneling money to a common recipient.`,
        entities: entityList.map(([id, e]) => ({
          id,
          name: e.name,
          role: `Paid ${formatMoney(e.amount)} via ${e.committee}`,
        })),
        evidence: [
          { type: 'FEC Disbursements', description: `${info.disbursements.length} payments totaling ${formatMoney(info.total)}` },
          { type: 'Network Size', description: `${info.entities.size} distinct political campaigns involved` },
        ],
        totalMoney: info.total,
        date: info.disbursements.sort((a, b) => b.disbursement_date?.localeCompare(a.disbursement_date || '') || 0)[0]?.disbursement_date || '',
        networkSize: info.entities.size,
        sourceCount: 1,
      });
    } else if (useCommittees) {
      const topPayers = committeeList.slice(0, 5);
      stories.push({
        id: `siphon-${vendor.slice(0, 20)}`,
        pattern: 'VENDOR_SIPHONING',
        severity: info.committees.size >= 5 ? 'critical' : info.total >= 200_000 ? 'high' : 'medium',
        headline: `${vendor} received campaign funds from ${info.committees.size} different committees`,
        narrative: `The vendor "${vendor}" collected ${formatMoney(info.total)} in campaign disbursements from ${info.committees.size} separate committees. Top payers: ${topPayers.map(([, c]) => `${c.name} (${formatMoney(c.amount)})`).join(', ')}. When a single vendor is paid by this many committees, it can indicate a coordinated network funneling money to a common recipient.`,
        entities: committeeList.map(([id, c]) => ({
          id,
          name: c.name,
          role: `Paid ${formatMoney(c.amount)}`,
        })),
        evidence: [
          { type: 'FEC Disbursements', description: `${info.disbursements.length} payments totaling ${formatMoney(info.total)}` },
          { type: 'Network Size', description: `${info.committees.size} distinct committees involved` },
        ],
        totalMoney: info.total,
        date: info.disbursements.sort((a, b) => b.disbursement_date?.localeCompare(a.disbursement_date || '') || 0)[0]?.disbursement_date || '',
        networkSize: info.committees.size,
        sourceCount: 1,
      });
    }
  }
}

function detectCrossCampaignNetworks(
  data: ClassificationInput,
  entityName: (id: string) => string,
  stories: ClassifiedStory[],
) {
  const crossSignals = data.signals.filter((s) => s.signal_type === 'CROSS_CAMPAIGN');
  if (crossSignals.length === 0) return;

  // Group by vendor to find networks
  const vendorNetworks = new Map<string, {
    vendor: string;
    signals: Signal[];
    entityIds: Set<string>;
    totalAmount: number;
  }>();

  for (const sig of crossSignals) {
    const d = sig.details as Record<string, unknown>;
    const vendor = String(d?.vendor || d?.recipient || 'unknown');
    if (!vendorNetworks.has(vendor)) {
      vendorNetworks.set(vendor, { vendor, signals: [], entityIds: new Set(), totalAmount: 0 });
    }
    const net = vendorNetworks.get(vendor)!;
    net.signals.push(sig);
    if (sig.entity_id) net.entityIds.add(sig.entity_id);
    net.totalAmount += Number(d?.total_amount || d?.amount || 0);
  }

  for (const [vendor, net] of vendorNetworks) {
    if (net.entityIds.size < 2) continue;
    const entityList = Array.from(net.entityIds);

    stories.push({
      id: `crosscampaign-${vendor.slice(0, 20)}`,
      pattern: 'CROSS_CAMPAIGN_NETWORK',
      severity: net.entityIds.size >= 4 ? 'high' : 'medium',
      headline: `${net.entityIds.size} campaigns share vendor "${vendor}" — cross-campaign coordination detected`,
      narrative: `Ralph detected that ${entityList.map(entityName).join(', ')} all made payments to the same vendor "${vendor}". Cross-campaign vendor sharing can be innocent (common consultants) but at this scale (${formatMoney(net.totalAmount)}) warrants scrutiny for coordinated spending or bundled payments circumventing contribution limits.`,
      entities: entityList.map((id) => ({
        id,
        name: entityName(id),
        role: 'Campaign paying shared vendor',
      })),
      evidence: net.signals.map((s) => ({
        type: 'Cross-Campaign Signal',
        description: String((s.details as Record<string, unknown>)?.description || `${entityName(s.entity_id)} → ${vendor}`),
      })),
      totalMoney: net.totalAmount,
      date: net.signals[0]?.detected_at || '',
      networkSize: net.entityIds.size,
      sourceCount: 1,
    });
  }
}

function detectRevolvingDoor(
  data: ClassificationInput,
  entityName: (id: string) => string,
  stories: ClassifiedStory[],
) {
  // Look for LDA findings with revolving_door_lobbyists
  for (const inv of data.investigations) {
    const findings = inv.findings || [];
    const ldaFindings = findings.filter((f) =>
      (f.source === 'Senate LDA' || f.source === 'senate_lda' || f.source === 'LDA') &&
      f.detail?.revolving_door_lobbyists
    );

    for (const finding of ldaFindings) {
      const lobbyists = (finding.detail?.revolving_door_lobbyists as Array<{ name: string; covered_position: string }>) || [];
      if (lobbyists.length === 0) continue;

      const name = inv.entity_name || entityName(inv.entity_id);
      stories.push({
        id: `revolving-${inv.entity_id}-${lobbyists[0]?.name?.slice(0, 10)}`,
        pattern: 'REVOLVING_DOOR',
        severity: lobbyists.length >= 3 ? 'high' : 'medium',
        headline: `${lobbyists.length} former government officials now lobby for ${name}`,
        narrative: `Senate lobbying disclosures reveal that ${lobbyists.length} lobbyist(s) registered to ${name} previously held government positions. ${lobbyists.slice(0, 3).map((l) => `${l.name} formerly served as "${l.covered_position}"`).join('. ')}. The revolving door between government service and lobbying raises questions about regulatory capture and undue influence.`,
        entities: [
          { id: inv.entity_id, name, role: 'Lobbying registrant/client' },
          ...lobbyists.slice(0, 5).map((l) => ({
            id: '',
            name: l.name,
            role: `Former: ${l.covered_position}`,
          })),
        ],
        evidence: [
          { type: 'Senate LDA Filing', description: finding.summary },
          ...lobbyists.slice(0, 3).map((l) => ({
            type: 'Revolving Door',
            description: `${l.name} — previously "${l.covered_position}"`,
          })),
        ],
        totalMoney: 0,
        date: inv.entered_at,
        networkSize: lobbyists.length + 1,
        sourceCount: 1,
      });
    }
  }
}

function detectFamilyPayments(
  data: ClassificationInput,
  entityName: (id: string) => string,
  stories: ClassifiedStory[],
) {
  const spousal = data.signals.filter((s) => s.signal_type === 'FEC_SPOUSE_PAYMENT');
  if (spousal.length === 0) return;

  // Group by entity
  const byEntity = new Map<string, Signal[]>();
  for (const sig of spousal) {
    if (!byEntity.has(sig.entity_id)) byEntity.set(sig.entity_id, []);
    byEntity.get(sig.entity_id)!.push(sig);
  }

  for (const [eid, sigs] of byEntity) {
    const totalAmount = sigs.reduce((s, sig) => s + Number((sig.details as Record<string, unknown>)?.amount || 0), 0);
    const name = entityName(eid);
    const recipients = sigs.map((s) => String((s.details as Record<string, unknown>)?.recipient || 'unknown'));
    const uniqueRecipients = [...new Set(recipients)];

    stories.push({
      id: `family-${eid}`,
      pattern: 'FAMILY_PAYMENTS',
      severity: totalAmount >= 100_000 ? 'high' : 'medium',
      headline: `${name}'s campaign paid ${formatMoney(totalAmount)} to family-connected entities`,
      narrative: `FEC records show ${sigs.length} payment(s) from ${name}'s campaign committee to spouse or family-connected recipients: ${uniqueRecipients.join(', ')}. Total: ${formatMoney(totalAmount)}. Using campaign funds to pay family members is legal if for legitimate services, but can constitute self-dealing when payments are disproportionate to services rendered.`,
      entities: [
        { id: eid, name, role: 'Politician making payments' },
        ...uniqueRecipients.map((r) => ({ id: '', name: r, role: 'Family-connected recipient' })),
      ],
      evidence: sigs.map((s) => ({
        type: 'FEC Spouse Payment',
        description: String((s.details as Record<string, unknown>)?.description || `Payment to ${(s.details as Record<string, unknown>)?.recipient}`),
      })),
      totalMoney: totalAmount,
      date: sigs[0]?.detected_at || '',
      networkSize: uniqueRecipients.length + 1,
      sourceCount: 1,
    });
  }
}

function detectSanctionsFlags(
  data: ClassificationInput,
  entityName: (id: string) => string,
  stories: ClassifiedStory[],
) {
  if (data.screenings.length === 0) return;

  // Group screenings by entity_name
  const byEntity = new Map<string, ScreeningResult[]>();
  for (const s of data.screenings) {
    const key = s.entity_name || 'unknown';
    if (!byEntity.has(key)) byEntity.set(key, []);
    byEntity.get(key)!.push(s);
  }

  for (const [name, results] of byEntity) {
    const lists = [...new Set(results.map((r) => r.list_name || r.source))];
    stories.push({
      id: `sanctions-${name.slice(0, 20)}`,
      pattern: 'SANCTIONS_FLAG',
      severity: lists.some((l) => l.includes('SDN') || l.includes('OFAC') || l.includes('Sanctions')) ? 'critical' : 'high',
      headline: `${name} flagged on ${lists.length} watchlist(s)`,
      narrative: `Screening of "${name}" returned ${results.length} match(es) across watchlists: ${lists.join(', ')}. Matches include: ${results.slice(0, 3).map((r) => `"${r.screened_name}" (${r.match_type} on ${r.list_name || r.source})`).join('; ')}. Sanctions and PEP list matches require verification but indicate potential regulatory risk or connection to sanctioned parties.`,
      entities: [{ id: '', name, role: 'Screened entity' }],
      evidence: results.map((r) => ({
        type: r.list_name || r.source,
        description: `Matched "${r.screened_name}" (${r.match_type})`,
      })),
      totalMoney: 0,
      date: results[0]?.created_at || '',
      networkSize: 1,
      sourceCount: lists.length,
    });
  }
}

function detectHighVolumePassThrough(
  data: ClassificationInput,
  entityName: (id: string) => string,
  stories: ClassifiedStory[],
) {
  const hvSignals = data.signals.filter((s) => s.signal_type === 'FEC_HIGH_VOLUME');

  // Group by entity
  const byEntity = new Map<string, Signal[]>();
  for (const sig of hvSignals) {
    if (!byEntity.has(sig.entity_id)) byEntity.set(sig.entity_id, []);
    byEntity.get(sig.entity_id)!.push(sig);
  }

  for (const [eid, sigs] of byEntity) {
    const name = entityName(eid);
    const details = sigs.map((s) => s.details as Record<string, unknown>);
    const totalAmount = details.reduce((sum, d) => sum + Number(d?.total_amount || 0), 0);
    const paymentCount = details.reduce((sum, d) => sum + Number(d?.payment_count || 0), 0);
    const vendors = [...new Set(details.map((d) => String(d?.vendor || d?.recipient || 'unknown')))];

    if (totalAmount < 50_000) continue;

    stories.push({
      id: `highvol-${eid}`,
      pattern: 'HIGH_VOLUME_PASS_THROUGH',
      severity: totalAmount >= 500_000 ? 'high' : 'medium',
      headline: `${name} made ${paymentCount} high-volume payments totaling ${formatMoney(totalAmount)}`,
      narrative: `Ralph flagged ${name} for unusually high-volume disbursement patterns. ${paymentCount} payments totaling ${formatMoney(totalAmount)} went to vendors including: ${vendors.slice(0, 5).join(', ')}. High-volume pass-through patterns can indicate bulk payments to intermediaries who then redistribute funds — a common layering technique.`,
      entities: [
        { id: eid, name, role: 'High-volume disburser' },
        ...vendors.slice(0, 5).map((v) => ({ id: '', name: v, role: 'Payment recipient' })),
      ],
      evidence: sigs.map((s) => ({
        type: 'High Volume Signal',
        description: String((s.details as Record<string, unknown>)?.description || `${Number((s.details as Record<string, unknown>)?.payment_count || 0)} payments`),
      })),
      totalMoney: totalAmount,
      date: sigs[0]?.detected_at || '',
      networkSize: vendors.length + 1,
      sourceCount: 1,
    });
  }
}

function detectDarkMoneyClusters(
  data: ClassificationInput,
  entityName: (id: string) => string,
  entityMap: Map<string, Entity>,
  stories: ClassifiedStory[],
) {
  if (data.relationships.length < 2) return;

  // Build adjacency from relationships
  const adj = new Map<string, Set<string>>();
  for (const r of data.relationships) {
    if (!adj.has(r.source_entity_id)) adj.set(r.source_entity_id, new Set());
    if (!adj.has(r.target_entity_id)) adj.set(r.target_entity_id, new Set());
    adj.get(r.source_entity_id)!.add(r.target_entity_id);
    adj.get(r.target_entity_id)!.add(r.source_entity_id);
  }

  // Build bridge score map from kb_nodes
  const bridgeScores = new Map<string, number>();
  for (const node of data.kbNodes) {
    const eid = String(node.entity_id || '');
    const score = Number(node.bridge_score || 0);
    if (eid && score > 0) bridgeScores.set(eid, score);
  }

  // Find connected components (clusters)
  const visited = new Set<string>();
  const clusters: string[][] = [];
  for (const [eid] of adj) {
    if (visited.has(eid)) continue;
    const cluster: string[] = [];
    const queue = [eid];
    while (queue.length > 0) {
      const cur = queue.pop()!;
      if (visited.has(cur)) continue;
      visited.add(cur);
      cluster.push(cur);
      for (const neighbor of adj.get(cur) || []) {
        if (!visited.has(neighbor)) queue.push(neighbor);
      }
    }
    if (cluster.length >= 3) clusters.push(cluster);
  }

  // Calculate total money per cluster from disbursements
  const entityDisbursements = new Map<string, number>();
  for (const d of data.disbursements) {
    if (!d.entity_id) continue;
    entityDisbursements.set(d.entity_id, (entityDisbursements.get(d.entity_id) || 0) + (d.disbursement_amount || 0));
  }

  for (const cluster of clusters) {
    const clusterMoney = cluster.reduce((sum, id) => sum + (entityDisbursements.get(id) || 0), 0);
    const maxBridge = Math.max(...cluster.map((id) => bridgeScores.get(id) || 0));
    const hubEntity = cluster.reduce((best, id) => {
      const score = bridgeScores.get(id) || 0;
      return score > (bridgeScores.get(best) || 0) ? id : best;
    }, cluster[0]);

    // Get relationship types in this cluster
    const clusterRels = data.relationships.filter((r) =>
      cluster.includes(r.source_entity_id) && cluster.includes(r.target_entity_id)
    );
    const relTypes = [...new Set(clusterRels.map((r) => r.relationship_type.replace(/_/g, ' ')))];

    stories.push({
      id: `cluster-${hubEntity}`,
      pattern: 'DARK_MONEY_CLUSTER',
      severity: cluster.length >= 5 && clusterMoney >= 200_000 ? 'high' :
               cluster.length >= 3 ? 'medium' : 'info',
      headline: `Network of ${cluster.length} connected entities centered on ${entityName(hubEntity)}`,
      narrative: `Ralph's graph analysis identified a cluster of ${cluster.length} interconnected entities linked by ${clusterRels.length} relationships (${relTypes.join(', ')}). The hub entity "${entityName(hubEntity)}" has a bridge score of ${maxBridge.toFixed(2)}, indicating it connects otherwise separate parts of the network. Combined campaign spending across this cluster totals ${formatMoney(clusterMoney)}. Connected entities: ${cluster.map(entityName).join(', ')}.`,
      entities: cluster.map((id) => ({
        id,
        name: entityName(id),
        role: id === hubEntity ? `Hub (bridge score: ${(bridgeScores.get(id) || 0).toFixed(2)})` : 'Connected entity',
      })),
      evidence: [
        { type: 'Graph Analysis', description: `${cluster.length} entities in connected component` },
        { type: 'Relationships', description: `${clusterRels.length} active relationships: ${relTypes.join(', ')}` },
        ...(maxBridge > 0 ? [{ type: 'Bridge Score', description: `Hub bridge score: ${maxBridge.toFixed(2)} — connects disparate network segments` }] : []),
      ],
      totalMoney: clusterMoney,
      date: '',
      networkSize: cluster.length,
      sourceCount: relTypes.length,
    });
  }
}

function detectInvestigationStories(
  data: ClassificationInput,
  entityName: (id: string) => string,
  stories: ClassifiedStory[],
) {
  for (const inv of data.investigations) {
    const findings = inv.findings || [];
    if (findings.length < 2) continue;

    const name = inv.entity_name || entityName(inv.entity_id);
    const sources = [...new Set(findings.map((f) => f.source))];
    const sourceLabels = sources.map(formatSourceLabel);

    // Skip if we already generated a more specific story for this entity
    const alreadyCovered = stories.some((s) =>
      s.entities.some((e) => e.id === inv.entity_id) && s.pattern !== 'INVESTIGATION_FINDINGS'
    );
    if (alreadyCovered) continue;

    // Calculate total money from entity's disbursements
    const entityMoney = data.disbursements
      .filter((d) => d.entity_id === inv.entity_id)
      .reduce((sum, d) => sum + (d.disbursement_amount || 0), 0);

    stories.push({
      id: `inv-${inv.id}`,
      pattern: 'INVESTIGATION_FINDINGS',
      severity: findings.length >= 6 ? 'high' : findings.length >= 3 ? 'medium' : 'info',
      headline: `${name}: ${findings.length} findings across ${sources.length} federal databases`,
      narrative: `Ralph's automated investigation of ${name} queried ${(inv.sources_queried || []).length} federal databases and returned ${findings.length} notable findings from ${sourceLabels.join(', ')}. ${inv.thesis ? `Investigation thesis: "${inv.thesis}". ` : ''}Key findings: ${findings.slice(0, 3).map((f) => f.summary).join('. ')}.`,
      entities: [{ id: inv.entity_id, name, role: inv.status === 'active' ? 'Under active investigation' : inv.status }],
      evidence: findings.map((f) => ({
        type: formatSourceLabel(f.source),
        description: f.summary,
      })),
      totalMoney: entityMoney,
      date: inv.entered_at,
      networkSize: 1,
      sourceCount: sources.length,
    });
  }
}

function formatSourceLabel(source: string): string {
  const map: Record<string, string> = {
    'fec': 'FEC Campaign Finance',
    'courtlistener': 'Court Records',
    'usaspending': 'Federal Contracts',
    'usaspending_grants': 'Federal Grants',
    'propublica_990': 'Nonprofit Tax Returns',
    'sec_edgar': 'SEC Filings',
    'opencorporates': 'Corporate Registry',
    'sam_gov': 'SAM.gov',
    'house_disclosures': 'Financial Disclosures',
    'irs_exempt_orgs': 'IRS Exempt Orgs',
    'wikidata_family': 'Family Connections',
    'Senate LDA': 'Senate Lobbying',
    'OFAC SDN': 'OFAC Sanctions',
    'Federal Register': 'Federal Register',
    'senate_lda': 'Senate Lobbying',
    'opensanctions': 'Sanctions Screening',
    'federal_register': 'Federal Register',
    'LDA': 'Senate Lobbying',
  };
  return map[source] || source.replace(/_/g, ' ');
}
