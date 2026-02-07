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
 * Fetch all investigations with their findings count
 */
export async function getInvestigations() {
  const { data, error } = await supabase
    .from('investigations')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(10);

  if (error) {
    console.error('Error fetching investigations:', error);
    return [];
  }

  return data as Investigation[];
}

/**
 * Fetch entity counts grouped by type
 */
export async function getEntityCounts() {
  const { data, error } = await supabase
    .from('entities')
    .select('type');

  if (error) {
    console.error('Error fetching entity counts:', error);
    return [];
  }

  // Group by type and count
  const counts = data.reduce((acc: Record<string, number>, entity) => {
    acc[entity.type] = (acc[entity.type] || 0) + 1;
    return acc;
  }, {});

  return Object.entries(counts).map(([type, count]) => ({
    type,
    count,
  })) as EntityCount[];
}

/**
 * Fetch signal statistics grouped by type
 */
export async function getSignalStats() {
  const { data, error } = await supabase
    .from('signals')
    .select('type, severity');

  if (error) {
    console.error('Error fetching signal stats:', error);
    return [];
  }

  // Group by type and count critical signals
  const stats = data.reduce((acc: Record<string, { count: number; critical_count: number }>, signal) => {
    if (!acc[signal.type]) {
      acc[signal.type] = { count: 0, critical_count: 0 };
    }
    acc[signal.type].count += 1;
    if (signal.severity === 'critical') {
      acc[signal.type].critical_count += 1;
    }
    return acc;
  }, {});

  return Object.entries(stats).map(([type, { count, critical_count }]) => ({
    type,
    count,
    critical_count,
  })) as SignalStats[];
}

/**
 * Fetch high-risk entities
 */
export async function getHighRiskEntities() {
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

  return data as Entity[];
}

/**
 * Fetch recent signals
 */
export async function getRecentSignals() {
  const { data, error } = await supabase
    .from('signals')
    .select('*')
    .order('detected_at', { ascending: false })
    .limit(20);

  if (error) {
    console.error('Error fetching recent signals:', error);
    return [];
  }

  return data as Signal[];
}
