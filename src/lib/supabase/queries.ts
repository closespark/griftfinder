import { supabase } from './client';

export interface Investigation {
  id: string;
  title: string;
  status: 'active' | 'closed' | 'pending';
  priority: 'low' | 'medium' | 'high' | 'critical';
  created_at: string;
  findings_count: number;
}

export interface Entity {
  id: string;
  type: 'person' | 'organization' | 'location' | 'asset';
  name: string;
  risk_score: number;
  last_updated: string;
}

export interface Signal {
  id: string;
  type: 'network' | 'financial' | 'behavioral' | 'communication';
  severity: 'low' | 'medium' | 'high' | 'critical';
  detected_at: string;
  entity_id: string;
}

export interface EntityCount {
  type: string;
  count: number;
}

export interface SignalStats {
  type: string;
  count: number;
  critical_count: number;
}

/**
 * Fetch all investigations (table: investigations or investigation_queue)
 */
export async function getInvestigations() {
  const { data, error } = await supabase
    .from('investigations')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(10);

  if (error) {
    const { data: queue } = await supabase
      .from('investigation_queue')
      .select('*')
      .limit(10);
    if (queue && Array.isArray(queue)) {
      return (queue as Record<string, unknown>[]).map((row) => ({
        id: String(row.id ?? ''),
        title: String(row.title ?? row.name ?? row.id ?? '—'),
        status: (row.status as Investigation['status']) ?? 'pending',
        priority: (row.priority as Investigation['priority']) ?? 'medium',
        created_at: String(row.created_at ?? ''),
        findings_count: Number(row.findings_count ?? row.count ?? 0),
      })) as Investigation[];
    }
    return [];
  }

  return (data || []) as Investigation[];
}

/**
 * Fetch entity counts grouped by type (supports entity_type or type column)
 */
export async function getEntityCounts() {
  const { data, error } = await supabase
    .from('entities')
    .select('*')
    .limit(5000);

  if (error) {
    console.error('Error fetching entity counts:', error);
    return [];
  }

  const rows = (data || []) as Record<string, unknown>[];
  const typeKey = rows[0] && ('entity_type' in rows[0] ? 'entity_type' : 'type');
  const counts = rows.reduce((acc: Record<string, number>, row) => {
    const t = String(row[typeKey] ?? row.type ?? row.entity_type ?? 'unknown');
    acc[t] = (acc[t] || 0) + 1;
    return acc;
  }, {});

  return Object.entries(counts).map(([type, count]) => ({
    type,
    count,
  })) as EntityCount[];
}

/**
 * Fetch signal statistics grouped by type (supports different column names)
 */
export async function getSignalStats() {
  const { data, error } = await supabase.from('signals').select('*').limit(2000);

  if (error) {
    console.error('Error fetching signal stats:', error);
    return [];
  }

  const rows = (data || []) as Record<string, unknown>[];
  const typeKey = rows[0] && ('signal_type' in rows[0] ? 'signal_type' : 'type');
  const sevKey = rows[0] && ('severity_level' in rows[0] ? 'severity_level' : 'severity');
  const stats: Record<string, { count: number; critical_count: number }> = {};
  for (const row of rows) {
    const t = String(row[typeKey] ?? row.type ?? 'unknown');
    if (!stats[t]) stats[t] = { count: 0, critical_count: 0 };
    stats[t].count += 1;
    const sev = String(row[sevKey] ?? row.severity ?? '').toLowerCase();
    if (sev === 'critical') stats[t].critical_count += 1;
  }
  return Object.entries(stats).map(([type, { count, critical_count }]) => ({
    type,
    count,
    critical_count,
  })) as SignalStats[];
}

/**
 * Fetch high-risk entities (risk_score >= 70), or recent entities if no risk_score column
 */
export async function getHighRiskEntities() {
  const { data: sample } = await supabase.from('entities').select('*').limit(1).single();
  const hasRisk = sample && typeof (sample as Record<string, unknown>).risk_score === 'number';

  if (hasRisk) {
    const { data, error } = await supabase
      .from('entities')
      .select('*')
      .gte('risk_score', 70)
      .order('risk_score', { ascending: false })
      .limit(10);
    if (error) {
      console.error('Error fetching high-risk entities:', error);
      return [];
    }
    return ((data || []) as Record<string, unknown>[]).map(normalizeEntity) as Entity[];
  }

  const { data, error } = await supabase
    .from('entities')
    .select('*')
    .limit(10);
  if (error) {
    return [];
  }
  const rows = (data || []) as Record<string, unknown>[];
  rows.sort((a, b) => {
    const aT = a.updated_at ?? a.last_updated ?? '';
    const bT = b.updated_at ?? b.last_updated ?? '';
    return String(bT).localeCompare(String(aT));
  });
  return rows.slice(0, 10).map(normalizeEntity) as Entity[];
}

function normalizeEntity(row: Record<string, unknown>): Entity {
  const name = String(row.canonical_name ?? row.name ?? row.id ?? '—');
  const type = (row.entity_type ?? row.type ?? 'person') as Entity['type'];
  const risk_score = typeof row.risk_score === 'number' ? row.risk_score : 0;
  const last_updated = String(row.updated_at ?? row.last_updated ?? row.last_updated_at ?? new Date().toISOString());
  return {
    id: String(row.id ?? ''),
    type: ['person', 'organization', 'location', 'asset'].includes(type) ? type : 'person',
    name,
    risk_score,
    last_updated,
  };
}

/**
 * Fetch recent signals (supports detected_at, created_at, or first column for ordering)
 */
export async function getRecentSignals() {
  const { data, error } = await supabase.from('signals').select('*').limit(100);

  if (error) {
    console.error('Error fetching recent signals:', error);
    return [];
  }

  const rows = (data || []) as Record<string, unknown>[];
  const orderKey = rows[0] && ('detected_at' in rows[0] ? 'detected_at' : 'created_at');
  rows.sort((a, b) => String(b[orderKey] ?? '').localeCompare(String(a[orderKey] ?? '')));
  const typeKey = rows[0] && ('signal_type' in rows[0] ? 'signal_type' : 'type');
  const sevKey = rows[0] && ('severity_level' in rows[0] ? 'severity_level' : 'severity');
  return rows.slice(0, 20).map((row) => ({
    id: String(row.id ?? ''),
    type: (row[typeKey] ?? row.type ?? 'network') as Signal['type'],
    severity: (row[sevKey] ?? row.severity ?? 'low') as Signal['severity'],
    detected_at: String(row.detected_at ?? row.created_at ?? row[orderKey] ?? new Date().toISOString()),
    entity_id: String(row.entity_id ?? ''),
  })) as Signal[];
}
