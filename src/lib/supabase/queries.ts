import { supabase } from './client';

// ── Real Supabase table schemas (matching Ralph's database) ──

export interface Entity {
  id: string;
  canonical_name: string;
  normalized_name: string;
  entity_type: string;
  aliases: string[];
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface Signal {
  id: string;
  signal_type: string;
  entity_id: string;
  source_api: string;
  strength: number;
  promoted: boolean;
  idempotency_key: string;
  detected_at: string;
  details: Record<string, unknown>;
}

export interface MmixEntry {
  id: string;
  entity_id: string;
  entity_name: string;
  priority: number;
  status: string; // active | investigating | expired
  thesis: string;
  signal_ids: string[];
  sources_remaining: string[];
  sources_queried: string[];
  findings: Array<{
    source: string;
    summary: string;
    detail?: Record<string, unknown>;
  }>;
  entered_at: string;
  expires_at: string;
  updated_at: string;
}

export interface StoryPublication {
  id: string;
  record_type: string;
  topic: string;
  angle: string;
  entity_id: string | null;
  fact_hashes: string[];
  details: {
    subject?: string;
    headline?: string;
    score?: number;
    story_type?: string;
    tweet_ids?: string[];
    thread_url?: string;
    fact_count?: number;
  };
  published_at: string;
}

export interface FecDisbursement {
  id: string;
  sub_id?: string;
  committee_name?: string | null;
  committee_id?: string | null;
  recipient_name: string;
  disbursement_amount: number;
  disbursement_date?: string | null;
  disbursement_description?: string | null;
  candidate_name?: string | null;
  entity_id?: string | null;
  created_at?: string;
}

export interface ScreeningResult {
  id: string;
  idempotency_key: string;
  entity_name: string;
  screened_name: string;
  list_name: string;
  source: string;
  match_type: string;
  raw_payload: Record<string, unknown>;
  created_at: string;
}

export interface Relationship {
  id: string;
  source_entity_id: string;
  target_entity_id: string;
  relationship_type: string;
  is_current: boolean;
  evidence: Record<string, unknown>;
  created_at: string;
}

export interface Politician {
  id: string;
  name: string;
  normalized_name: string;
  state: string;
  level: string;
  fec_candidate_id: string;
  entity_id: string;
  headshot_url: string | null;
  headshot_status: string;
  updated_at: string;
}

export interface LegislativeAction {
  id: string;
  entity_id: string;
  bioguide_id: string | null;
  action_type: string; // bill_sponsored | bill_cosponsored
  source: string;
  congress_number: number | null;
  bill_type: string | null;
  bill_number: string;
  bill_title: string | null;
  bill_url: string | null;
  policy_area: string | null;
  action_date: string | null;
  latest_action_date: string | null;
  latest_action_text: string | null;
  created_at: string;
}

export interface DogeContract {
  id: string;
  entity_id: string | null;
  piid: string;
  agency: string;
  vendor_name: string | null;
  vendor_name_normalized: string | null;
  description: string | null;
  total_value: number | null;
  obligated_amount: number | null;
  claimed_savings: number | null;
  fpds_status: string | null;
  deletion_date: string | null;
  created_at: string;
}

export interface DogeGrant {
  id: string;
  entity_id: string | null;
  agency: string;
  recipient_name: string | null;
  recipient_name_normalized: string | null;
  description: string | null;
  grant_value: number | null;
  claimed_savings: number | null;
  grant_date: string | null;
  created_at: string;
}

export interface RegulatoryAction {
  id: string;
  entity_id: string;
  document_number: string;
  title: string;
  doc_type: string;
  agencies: string[];
  publication_date: string | null;
  abstract: string | null;
  html_url: string | null;
  source: string;
  created_at: string;
}

export interface RegulatoryComment {
  id: string;
  entity_id: string;
  document_id: string;
  docket_id: string | null;
  title: string | null;
  agency_id: string | null;
  posted_date: string | null;
  document_type: string | null;
  created_at: string;
}

export interface PoliticianId {
  id: string;
  entity_id: string;
  id_type: string; // BIOGUIDE | OPEN_STATES | FEC | etc.
  id_value: string;
  source: string;
  created_at: string;
}

export interface EnrichmentLogEntry {
  id: string;
  entity_id: string;
  source: string;
  endpoint: string;
  records_found: number;
  status: string; // success | error | empty
  error_message: string | null;
  queried_at: string;
}

export interface CorruptionLoopLink {
  id: string;
  entity_id: string;
  loop_type: string;
  confidence: number;
  evidence: Record<string, unknown>;
  linked_entity_id: string | null;
  linked_entity_name: string | null;
  description: string;
  created_at: string;
}

// ── Queries ──

/** Get active + investigating MMIX entries (Ralph's investigation queue) */
export async function getActiveInvestigations(): Promise<MmixEntry[]> {
  const { data, error } = await supabase
    .from('mmix_entries')
    .select('*')
    .in('status', ['active', 'investigating'])
    .order('priority', { ascending: true });
  if (error) { console.error('mmix_entries error:', error); return []; }
  return (data || []) as MmixEntry[];
}

/** Get all MMIX entries including archived */
export async function getAllInvestigations(limit = 50): Promise<MmixEntry[]> {
  const { data, error } = await supabase
    .from('mmix_entries')
    .select('*')
    .order('entered_at', { ascending: false })
    .limit(limit);
  if (error) { console.error('mmix_entries error:', error); return []; }
  return (data || []) as MmixEntry[];
}

/** Get entities with most signals (top investigation targets) */
export async function getTopEntities(limit = 20): Promise<Entity[]> {
  const { data, error } = await supabase
    .from('entities')
    .select('*')
    .order('updated_at', { ascending: false })
    .limit(limit);
  if (error) { console.error('entities error:', error); return []; }
  return (data || []) as Entity[];
}

/** Get entity by ID */
export async function getEntity(id: string): Promise<Entity | null> {
  const { data, error } = await supabase
    .from('entities')
    .select('*')
    .eq('id', id)
    .single();
  if (error) return null;
  return data as Entity;
}

/** Get recent signals */
export async function getRecentSignals(limit = 50): Promise<Signal[]> {
  const { data, error } = await supabase
    .from('signals')
    .select('*')
    .order('detected_at', { ascending: false })
    .limit(limit);
  if (error) { console.error('signals error:', error); return []; }
  return (data || []) as Signal[];
}

/** Get signals for a specific entity */
export async function getEntitySignals(entityId: string): Promise<Signal[]> {
  const { data, error } = await supabase
    .from('signals')
    .select('*')
    .eq('entity_id', entityId)
    .order('detected_at', { ascending: false });
  if (error) return [];
  return (data || []) as Signal[];
}

/** Get signal counts by type */
export async function getSignalCounts(): Promise<{ type: string; count: number }[]> {
  const { data, error } = await supabase
    .from('signals')
    .select('signal_type')
    .limit(5000);
  if (error) return [];
  const counts: Record<string, number> = {};
  for (const row of (data || [])) {
    const t = (row as Record<string, unknown>).signal_type as string || 'unknown';
    counts[t] = (counts[t] || 0) + 1;
  }
  return Object.entries(counts).map(([type, count]) => ({ type, count }));
}

/** Get story publications */
export async function getStories(limit = 50): Promise<StoryPublication[]> {
  const { data, error } = await supabase
    .from('story_coverage')
    .select('*')
    .eq('record_type', 'publication')
    .order('published_at', { ascending: false })
    .limit(limit);
  if (error) { console.error('story_coverage error:', error); return []; }
  return (data || []) as StoryPublication[];
}

/** Get FEC disbursements for an entity */
export async function getEntityDisbursements(entityId: string, limit = 100): Promise<FecDisbursement[]> {
  const { data, error } = await supabase
    .from('fec_disbursements')
    .select('*')
    .eq('entity_id', entityId)
    .order('disbursement_amount', { ascending: false })
    .limit(limit);
  if (error) return [];
  return (data || []) as FecDisbursement[];
}

/** Get screening results for an entity name */
export async function getEntityScreenings(entityName: string): Promise<ScreeningResult[]> {
  const { data, error } = await supabase
    .from('screening_results')
    .select('*')
    .ilike('entity_name', `%${entityName}%`);
  if (error) return [];
  return (data || []) as ScreeningResult[];
}

/** Get relationships for an entity */
export async function getEntityRelationships(entityId: string): Promise<Relationship[]> {
  const { data: src } = await supabase
    .from('relationships')
    .select('*')
    .eq('source_entity_id', entityId)
    .eq('is_current', true);
  const { data: tgt } = await supabase
    .from('relationships')
    .select('*')
    .eq('target_entity_id', entityId)
    .eq('is_current', true);
  return [...(src || []), ...(tgt || [])] as Relationship[];
}

/** Get MMIX entries for a specific entity */
export async function getEntityInvestigations(entityId: string): Promise<MmixEntry[]> {
  const { data, error } = await supabase
    .from('mmix_entries')
    .select('*')
    .eq('entity_id', entityId)
    .order('entered_at', { ascending: false });
  if (error) return [];
  return (data || []) as MmixEntry[];
}

/** Get corporate filings for an entity */
export async function getEntityFilings(entityName: string) {
  const { data, error } = await supabase
    .from('corporate_filings')
    .select('*')
    .ilike('entity_name', `%${entityName}%`)
    .limit(50);
  if (error) return [];
  return data || [];
}

/** Get court cases for an entity (table not yet created) */
export async function getEntityCourtCases(_entityName: string) {
  return [];
}

/** Get federal awards for an entity (table not yet created) */
export async function getEntityAwards(_entityName: string) {
  return [];
}

/** Get legislative actions for an entity */
export async function getEntityLegislativeActions(entityId: string): Promise<LegislativeAction[]> {
  const { data, error } = await supabase
    .from('legislative_actions')
    .select('*')
    .eq('entity_id', entityId)
    .order('latest_action_date', { ascending: false })
    .limit(100);
  if (error) return [];
  return (data || []) as LegislativeAction[];
}

/** Get regulatory actions for an entity */
export async function getEntityRegulatoryActions(entityId: string): Promise<RegulatoryAction[]> {
  const { data, error } = await supabase
    .from('regulatory_actions')
    .select('*')
    .eq('entity_id', entityId)
    .order('publication_date', { ascending: false })
    .limit(100);
  if (error) return [];
  return (data || []) as RegulatoryAction[];
}

/** Get regulatory comments for an entity */
export async function getEntityRegulatoryComments(entityId: string): Promise<RegulatoryComment[]> {
  const { data, error } = await supabase
    .from('regulatory_comments')
    .select('*')
    .eq('entity_id', entityId)
    .order('posted_date', { ascending: false })
    .limit(100);
  if (error) return [];
  return (data || []) as RegulatoryComment[];
}

/** Get DOGE contracts for an entity */
export async function getEntityDogeContracts(entityId: string): Promise<DogeContract[]> {
  const { data, error } = await supabase
    .from('doge_contracts')
    .select('*')
    .eq('entity_id', entityId)
    .order('total_value', { ascending: false })
    .limit(100);
  if (error) return [];
  return (data || []) as DogeContract[];
}

/** Get DOGE grants for an entity */
export async function getEntityDogeGrants(entityId: string): Promise<DogeGrant[]> {
  const { data, error } = await supabase
    .from('doge_grants')
    .select('*')
    .eq('entity_id', entityId)
    .order('grant_value', { ascending: false })
    .limit(100);
  if (error) return [];
  return (data || []) as DogeGrant[];
}

/** Get politician IDs for an entity */
export async function getEntityPoliticianIds(entityId: string): Promise<PoliticianId[]> {
  const { data, error } = await supabase
    .from('politician_ids')
    .select('*')
    .eq('entity_id', entityId);
  if (error) return [];
  return (data || []) as PoliticianId[];
}

/** Get corruption loop links for an entity */
export async function getEntityCorruptionLoops(entityId: string): Promise<CorruptionLoopLink[]> {
  const { data, error } = await supabase
    .from('corruption_loop_links')
    .select('*')
    .eq('entity_id', entityId)
    .order('confidence', { ascending: false })
    .limit(50);
  if (error) return [];
  return (data || []) as CorruptionLoopLink[];
}

/** Get enrichment log for an entity */
export async function getEntityEnrichmentLog(entityId: string): Promise<EnrichmentLogEntry[]> {
  const { data, error } = await supabase
    .from('enrichment_log')
    .select('*')
    .eq('entity_id', entityId)
    .order('queried_at', { ascending: false })
    .limit(100);
  if (error) return [];
  return (data || []) as EnrichmentLogEntry[];
}

/** Get DOGE contracts with optional agency filter and search */
export async function getDogeContracts(opts?: { agency?: string; search?: string; limit?: number; offset?: number }): Promise<{ data: DogeContract[]; count: number }> {
  let query = supabase.from('doge_contracts').select('*', { count: 'exact' });
  if (opts?.agency) query = query.eq('agency', opts.agency);
  if (opts?.search) query = query.or(`vendor_name.ilike.%${opts.search}%,description.ilike.%${opts.search}%`);
  query = query.order('total_value', { ascending: false });
  const limit = opts?.limit || 50;
  const offset = opts?.offset || 0;
  query = query.range(offset, offset + limit - 1);
  const { data, error, count } = await query;
  if (error) return { data: [], count: 0 };
  return { data: (data || []) as DogeContract[], count: count || 0 };
}

/** Get DOGE grants with optional agency filter and search */
export async function getDogeGrants(opts?: { agency?: string; search?: string; limit?: number; offset?: number }): Promise<{ data: DogeGrant[]; count: number }> {
  let query = supabase.from('doge_grants').select('*', { count: 'exact' });
  if (opts?.agency) query = query.eq('agency', opts.agency);
  if (opts?.search) query = query.or(`recipient_name.ilike.%${opts.search}%,description.ilike.%${opts.search}%`);
  query = query.order('grant_value', { ascending: false });
  const limit = opts?.limit || 50;
  const offset = opts?.offset || 0;
  query = query.range(offset, offset + limit - 1);
  const { data, error, count } = await query;
  if (error) return { data: [], count: 0 };
  return { data: (data || []) as DogeGrant[], count: count || 0 };
}

/** Get unique DOGE agencies */
export async function getDogeAgencies(): Promise<string[]> {
  const [{ data: contracts }, { data: grants }] = await Promise.all([
    supabase.from('doge_contracts').select('agency').limit(5000),
    supabase.from('doge_grants').select('agency').limit(5000),
  ]);
  const agencies = new Set<string>();
  for (const r of (contracts || [])) { const a = (r as Record<string, unknown>).agency as string; if (a) agencies.add(a); }
  for (const r of (grants || [])) { const a = (r as Record<string, unknown>).agency as string; if (a) agencies.add(a); }
  return [...agencies].sort();
}

/** Search legislative actions by title */
export async function searchLegislativeActions(query: string, limit = 20): Promise<LegislativeAction[]> {
  const { data, error } = await supabase
    .from('legislative_actions')
    .select('*')
    .ilike('bill_title', `%${query}%`)
    .order('latest_action_date', { ascending: false })
    .limit(limit);
  if (error) return [];
  return (data || []) as LegislativeAction[];
}

/** Search regulatory actions by title */
export async function searchRegulatoryActions(query: string, limit = 20): Promise<RegulatoryAction[]> {
  const { data, error } = await supabase
    .from('regulatory_actions')
    .select('*')
    .ilike('title', `%${query}%`)
    .order('publication_date', { ascending: false })
    .limit(limit);
  if (error) return [];
  return (data || []) as RegulatoryAction[];
}

/** Get recent legislative actions across all entities */
export async function getRecentLegislativeActions(limit = 10): Promise<LegislativeAction[]> {
  const { data, error } = await supabase
    .from('legislative_actions')
    .select('*')
    .order('latest_action_date', { ascending: false })
    .limit(limit);
  if (error) return [];
  return (data || []) as LegislativeAction[];
}

/** Search entities by name */
export async function searchEntities(query: string, limit = 20): Promise<Entity[]> {
  const { data, error } = await supabase
    .from('entities')
    .select('*')
    .ilike('canonical_name', `%${query}%`)
    .limit(limit);
  if (error) return [];
  return (data || []) as Entity[];
}

/** Search politicians by name */
export async function searchPoliticians(query: string, limit = 20): Promise<Politician[]> {
  const { data, error } = await supabase
    .from('politician_universe')
    .select('*')
    .ilike('name', `%${query}%`)
    .limit(limit);
  if (error) return [];
  return (data || []) as Politician[];
}

/** Get aggregate stats for the dashboard */
export async function getDashboardStats() {
  const [entities, signals, mmix, stories, legActions, regActions, dogeContracts, dogeGrants] = await Promise.all([
    supabase.from('entities').select('id', { count: 'exact', head: true }),
    supabase.from('signals').select('id', { count: 'exact', head: true }),
    supabase.from('mmix_entries').select('id', { count: 'exact', head: true }).in('status', ['active', 'investigating']),
    supabase.from('story_coverage').select('id', { count: 'exact', head: true }).eq('record_type', 'publication'),
    supabase.from('legislative_actions').select('id', { count: 'exact', head: true }),
    supabase.from('regulatory_actions').select('id', { count: 'exact', head: true }),
    supabase.from('doge_contracts').select('id', { count: 'exact', head: true }),
    supabase.from('doge_grants').select('id', { count: 'exact', head: true }),
  ]);
  return {
    entityCount: entities.count || 0,
    signalCount: signals.count || 0,
    activeInvestigations: mmix.count || 0,
    publishedStories: stories.count || 0,
    legislativeActionCount: legActions.count || 0,
    regulatoryActionCount: regActions.count || 0,
    dogeContractCount: dogeContracts.count || 0,
    dogeGrantCount: dogeGrants.count || 0,
  };
}

/** Get money flow network data — entities connected by FEC disbursements */
export async function getMoneyNetwork() {
  // Get cross-campaign signals (vendors paid by multiple committees)
  const { data: crossSignals } = await supabase
    .from('signals')
    .select('*')
    .eq('signal_type', 'CROSS_CAMPAIGN')
    .limit(200);

  // Get relationships
  const { data: rels } = await supabase
    .from('relationships')
    .select('*')
    .eq('is_current', true)
    .limit(500);

  // Get ALL disbursements (paginated)
  const allDisbursements: FecDisbursement[] = [];
  let offset = 0;
  const pageSize = 1000;
  while (true) {
    const { data: page } = await supabase
      .from('fec_disbursements')
      .select('entity_id, recipient_name, disbursement_amount, committee_name, committee_id, candidate_name')
      .range(offset, offset + pageSize - 1);
    if (!page || page.length === 0) break;
    allDisbursements.push(...(page as FecDisbursement[]));
    if (page.length < pageSize) break;
    offset += pageSize;
  }

  // Get entities for name resolution
  const { data: entities } = await supabase
    .from('entities')
    .select('id, canonical_name, entity_type')
    .limit(1000);

  // Get kb_nodes for bridge/density scores
  const { data: kbNodes } = await supabase
    .from('kb_nodes')
    .select('*')
    .limit(1000);

  return {
    crossSignals: (crossSignals || []) as Signal[],
    relationships: (rels || []) as Relationship[],
    disbursements: allDisbursements,
    entities: (entities || []) as Entity[],
    kbNodes: (kbNodes || []) as Record<string, unknown>[],
  };
}

/** Get all data needed for story classification — signals, findings, disbursements, relationships, entities */
export async function getStoryClassificationData() {
  // All signals (for pattern detection)
  const { data: signals } = await supabase
    .from('signals')
    .select('*')
    .order('detected_at', { ascending: false })
    .limit(2000);

  // All MMIX entries with findings
  const { data: mmix } = await supabase
    .from('mmix_entries')
    .select('*')
    .order('entered_at', { ascending: false })
    .limit(200);

  // All relationships
  const { data: rels } = await supabase
    .from('relationships')
    .select('*')
    .eq('is_current', true)
    .limit(1000);

  // All entities
  const { data: entities } = await supabase
    .from('entities')
    .select('*')
    .limit(1000);

  // All disbursements (paginated)
  const allDisbursements: FecDisbursement[] = [];
  let offset = 0;
  const pageSize = 1000;
  while (true) {
    const { data: page } = await supabase
      .from('fec_disbursements')
      .select('*')
      .range(offset, offset + pageSize - 1);
    if (!page || page.length === 0) break;
    allDisbursements.push(...(page as FecDisbursement[]));
    if (page.length < pageSize) break;
    offset += pageSize;
  }

  // Screening results
  const { data: screenings } = await supabase
    .from('screening_results')
    .select('*')
    .limit(500);

  // kb_nodes for bridge scores
  const { data: kbNodes } = await supabase
    .from('kb_nodes')
    .select('*')
    .limit(1000);

  // Enrichment tables for new pattern detectors
  const { data: legActions } = await supabase
    .from('legislative_actions')
    .select('*')
    .order('latest_action_date', { ascending: false })
    .limit(2000);

  const { data: dogeContracts } = await supabase
    .from('doge_contracts')
    .select('*')
    .limit(2000);

  const { data: regActions } = await supabase
    .from('regulatory_actions')
    .select('*')
    .order('publication_date', { ascending: false })
    .limit(2000);

  return {
    signals: (signals || []) as Signal[],
    investigations: (mmix || []) as MmixEntry[],
    relationships: (rels || []) as Relationship[],
    entities: (entities || []) as Entity[],
    disbursements: allDisbursements,
    screenings: (screenings || []) as ScreeningResult[],
    kbNodes: (kbNodes || []) as Record<string, unknown>[],
    legislativeActions: (legActions || []) as LegislativeAction[],
    dogeContracts: (dogeContracts || []) as DogeContract[],
    regulatoryActions: (regActions || []) as RegulatoryAction[],
  };
}

/** Get politician universe stats */
export async function getUniverseStats() {
  const { count } = await supabase
    .from('politician_universe')
    .select('id', { count: 'exact', head: true });
  return { total: count || 0 };
}
