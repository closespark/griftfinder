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
  sub_id: string;
  committee_name: string;
  committee_id: string;
  recipient_name: string;
  disbursement_amount: number;
  disbursement_date: string;
  disbursement_description: string;
  candidate_name: string;
  entity_id: string;
  created_at: string;
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

/** Get court cases for an entity */
export async function getEntityCourtCases(entityName: string) {
  const { data, error } = await supabase
    .from('court_cases')
    .select('*')
    .ilike('entity_name', `%${entityName}%`)
    .limit(50);
  if (error) return [];
  return data || [];
}

/** Get federal awards for an entity */
export async function getEntityAwards(entityName: string) {
  const { data, error } = await supabase
    .from('federal_awards')
    .select('*')
    .ilike('entity_name', `%${entityName}%`)
    .limit(50);
  if (error) return [];
  return data || [];
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
  const [entities, signals, mmix, stories] = await Promise.all([
    supabase.from('entities').select('id', { count: 'exact', head: true }),
    supabase.from('signals').select('id', { count: 'exact', head: true }),
    supabase.from('mmix_entries').select('id', { count: 'exact', head: true }).in('status', ['active', 'investigating']),
    supabase.from('story_coverage').select('id', { count: 'exact', head: true }).eq('record_type', 'publication'),
  ]);
  return {
    entityCount: entities.count || 0,
    signalCount: signals.count || 0,
    activeInvestigations: mmix.count || 0,
    publishedStories: stories.count || 0,
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
      .select('entity_id, recipient_name, disbursement_amount, committee_name, committee_id')
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

/** Get politician universe stats */
export async function getUniverseStats() {
  const { count } = await supabase
    .from('politician_universe')
    .select('id', { count: 'exact', head: true });
  return { total: count || 0 };
}
