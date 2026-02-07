'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import * as d3 from 'd3';
import { isSupabaseConfigured } from '@/lib/supabase/client';
import { getMoneyNetwork } from '@/lib/supabase/queries';

interface GraphNode extends d3.SimulationNodeDatum {
  id: string;
  label: string;
  type: 'politician' | 'vendor' | 'committee' | 'entity';
  totalMoney: number;
  entityId?: string;
  connections: number;
}

interface GraphLink extends d3.SimulationLinkDatum<GraphNode> {
  source: string | GraphNode;
  target: string | GraphNode;
  amount: number;
  count: number;
  linkType: 'payment' | 'relationship' | 'cross_campaign';
}

export default function NetworkPage() {
  const svgRef = useRef<SVGSVGElement>(null);
  const graphDataRef = useRef<{
    nodes: GraphNode[];
    links: GraphLink[];
    vendorEntityCount: Map<string, Set<string>>;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [nodeCount, setNodeCount] = useState(0);
  const [edgeCount, setEdgeCount] = useState(0);
  const [totalMoney, setTotalMoney] = useState(0);
  const [totalDisbursements, setTotalDisbursements] = useState(0);
  const [selected, setSelected] = useState<GraphNode | null>(null);
  const [selectedLinks, setSelectedLinks] = useState<GraphLink[]>([]);

  useEffect(() => {
    if (!isSupabaseConfigured()) { setLoading(false); return; }

    getMoneyNetwork().then((data) => {
      const { disbursements, entities, relationships, crossSignals, kbNodes } = data;

      setTotalDisbursements(disbursements.length);

      // Build entity name map
      const entityNames = new Map(entities.map((e) => [e.id, e.canonical_name]));
      const entityTypes = new Map(entities.map((e) => [e.id, e.entity_type]));
      const genericVendorNames = new Set(['AGENCY', 'UNKNOWN', 'N/A', 'NONE', 'MISC', 'OTHER']);
      const vendorDisplayLabel = (name: string) =>
        genericVendorNames.has((name || '').toUpperCase().trim()) ? 'Unnamed recipient' : (name || 'Unnamed recipient');

      // Build kb_node bridge scores
      const bridgeScores = new Map<string, number>();
      for (const kbn of kbNodes) {
        const eid = kbn.entity_id as string;
        const score = kbn.bridge_score as number || kbn.signal_density as number || 0;
        if (eid) bridgeScores.set(eid, score);
      }

      const nodes = new Map<string, GraphNode>();
      const linkMap = new Map<string, GraphLink>();
      let totalFlow = 0;

      // 1. Add ALL entities as nodes
      for (const e of entities) {
        const nodeId = `e:${e.id}`;
        nodes.set(nodeId, {
          id: nodeId,
          label: e.canonical_name,
          type: (e.entity_type === 'vendor' || e.entity_type === 'organization') ? 'vendor'
            : e.entity_type === 'committee' ? 'committee'
            : 'politician',
          totalMoney: 0,
          entityId: e.id,
          connections: 0,
        });
      }

      // 2. Add relationships as links
      for (const r of relationships) {
        const srcId = `e:${r.source_entity_id}`;
        const tgtId = `e:${r.target_entity_id}`;
        // Ensure both nodes exist
        if (!nodes.has(srcId)) {
          const srcLabel =
            r.source_entity_id == null
              ? 'Unnamed entity'
              : (entityNames.get(r.source_entity_id) ?? String(r.source_entity_id).slice(0, 12));
          nodes.set(srcId, {
            id: srcId,
            label: srcLabel,
            type: 'entity',
            totalMoney: 0,
            entityId: r.source_entity_id,
            connections: 0,
          });
        }
        if (!nodes.has(tgtId)) {
          const tgtLabel =
            r.target_entity_id == null
              ? 'Unnamed entity'
              : (entityNames.get(r.target_entity_id) ?? String(r.target_entity_id).slice(0, 12));
          nodes.set(tgtId, {
            id: tgtId,
            label: tgtLabel,
            type: 'entity',
            totalMoney: 0,
            entityId: r.target_entity_id,
            connections: 0,
          });
        }
        const linkKey = `rel:${r.id}`;
        linkMap.set(linkKey, {
          source: srcId,
          target: tgtId,
          amount: 0,
          count: 1,
          linkType: 'relationship',
        });
        nodes.get(srcId)!.connections += 1;
        nodes.get(tgtId)!.connections += 1;
      }

      // 3. Add disbursements as money flows
      // Use entity_id when available, fall back to committee_id so no payments are orphaned.
      // The source node is the politician/committee; the target is the vendor.
      interface FlowInfo { sourceId: string; sourceType: 'entity' | 'committee'; sourceLabel: string; vendor: string; total: number; count: number; committees: Set<string> }
      const flowMap = new Map<string, FlowInfo>();

      for (const d of disbursements) {
        if (!d.recipient_name || !d.disbursement_amount) continue;

        const vendorKey = d.recipient_name.toUpperCase().trim();
        let sourceId: string;
        let sourceType: 'entity' | 'committee';
        let sourceLabel: string;

        if (d.entity_id) {
          sourceId = d.entity_id;
          sourceType = 'entity';
          sourceLabel = entityNames.get(d.entity_id) || d.candidate_name || d.committee_name || d.entity_id.slice(0, 12);
        } else if (d.committee_id) {
          sourceId = d.committee_id;
          sourceType = 'committee';
          sourceLabel = d.candidate_name || d.committee_name || d.committee_id;
        } else if (d.committee_name) {
          sourceId = d.committee_name.toUpperCase().trim();
          sourceType = 'committee';
          sourceLabel = d.candidate_name || d.committee_name;
        } else {
          continue; // truly unlinked — skip
        }

        const flowKey = `${sourceId}→${vendorKey}`;
        if (!flowMap.has(flowKey)) {
          flowMap.set(flowKey, {
            sourceId,
            sourceType,
            sourceLabel,
            vendor: d.recipient_name,
            total: 0,
            count: 0,
            committees: new Set(),
          });
        }
        const f = flowMap.get(flowKey)!;
        f.total += d.disbursement_amount;
        f.count += 1;
        if (d.committee_name) f.committees.add(d.committee_name);
        totalFlow += d.disbursement_amount;
      }

      // Count how many different sources pay each vendor
      const vendorEntityCount = new Map<string, Set<string>>();
      for (const [, f] of flowMap) {
        const vk = f.vendor.toUpperCase().trim();
        if (!vendorEntityCount.has(vk)) vendorEntityCount.set(vk, new Set());
        vendorEntityCount.get(vk)!.add(f.sourceId);
      }

      // Add all flows to graph
      for (const [, f] of flowMap) {
        const vendorKey = f.vendor.toUpperCase().trim();
        // Source node: use entity prefix if entity, committee prefix if committee
        const sourceNodeId = f.sourceType === 'entity' ? `e:${f.sourceId}` : `c:${f.sourceId}`;
        const vendorNodeId = `v:${vendorKey}`;

        // Ensure source node exists
        if (!nodes.has(sourceNodeId)) {
          nodes.set(sourceNodeId, {
            id: sourceNodeId,
            label: f.sourceLabel,
            type: f.sourceType === 'committee' ? 'committee' : 'politician',
            totalMoney: 0,
            entityId: f.sourceType === 'entity' ? f.sourceId : undefined,
            connections: 0,
          });
        }

        // Vendor node
        if (!nodes.has(vendorNodeId)) {
          const entityCount = vendorEntityCount.get(vendorKey)?.size || 1;
          nodes.set(vendorNodeId, {
            id: vendorNodeId,
            label: vendorDisplayLabel(f.vendor),
            type: 'vendor',
            totalMoney: 0,
            connections: entityCount,
          });
        }

        nodes.get(sourceNodeId)!.totalMoney += f.total;
        nodes.get(sourceNodeId)!.connections += 1;
        nodes.get(vendorNodeId)!.totalMoney += f.total;

        const linkKey = `flow:${sourceNodeId}→${vendorNodeId}`;
        if (linkMap.has(linkKey)) {
          linkMap.get(linkKey)!.amount += f.total;
          linkMap.get(linkKey)!.count += f.count;
        } else {
          linkMap.set(linkKey, {
            source: sourceNodeId,
            target: vendorNodeId,
            amount: f.total,
            count: f.count,
            linkType: 'payment',
          });
        }
      }

      // 4. Add cross-campaign signals as highlighted links
      for (const sig of crossSignals) {
        const d = sig.details as Record<string, unknown>;
        const vendor = d?.vendor as string || d?.recipient as string;
        if (!vendor || !sig.entity_id) continue;
        const entityNodeId = `e:${sig.entity_id}`;
        const vendorNodeId = `v:${vendor.toUpperCase().trim()}`;
        if (nodes.has(entityNodeId) && nodes.has(vendorNodeId)) {
          const linkKey = `cross:${entityNodeId}→${vendorNodeId}`;
          if (!linkMap.has(linkKey)) {
            linkMap.set(linkKey, {
              source: entityNodeId,
              target: vendorNodeId,
              amount: Number(d?.amount || 0),
              count: 1,
              linkType: 'cross_campaign',
            });
          }
        }
      }

      // Apply bridge scores to node sizes
      for (const [nodeId, node] of nodes) {
        if (node.entityId) {
          const score = bridgeScores.get(node.entityId);
          if (score) node.totalMoney = Math.max(node.totalMoney, score * 100000);
        }
      }

      // Filter: remove vendor nodes with only 1 small connection (< $5k) to reduce clutter
      const finalNodes: GraphNode[] = [];
      const finalLinks: GraphLink[] = [];
      const keepNodes = new Set<string>();

      // Always keep entity and committee nodes
      for (const [id] of nodes) {
        if (id.startsWith('e:') || id.startsWith('c:')) keepNodes.add(id);
      }

      // Keep vendors with either: multiple connections, or significant money, or shared across entities
      for (const [id, node] of nodes) {
        if (id.startsWith('v:')) {
          const vendorKey = id.slice(2);
          const entityCount = vendorEntityCount.get(vendorKey)?.size || 0;
          if (entityCount >= 2 || node.totalMoney >= 10000 || node.connections >= 2) {
            keepNodes.add(id);
          }
        }
      }

      for (const [, link] of linkMap) {
        const srcId = typeof link.source === 'string' ? link.source : link.source.id;
        const tgtId = typeof link.target === 'string' ? link.target : link.target.id;
        if (keepNodes.has(srcId) && keepNodes.has(tgtId)) {
          finalLinks.push(link);
        }
      }

      // Only include nodes that have at least one connection
      const connectedNodes = new Set<string>();
      for (const link of finalLinks) {
        const srcId = typeof link.source === 'string' ? link.source : link.source.id;
        const tgtId = typeof link.target === 'string' ? link.target : link.target.id;
        connectedNodes.add(srcId);
        connectedNodes.add(tgtId);
      }

      for (const [id, node] of nodes) {
        if (connectedNodes.has(id)) finalNodes.push(node);
      }

      setNodeCount(finalNodes.length);
      setEdgeCount(finalLinks.length);
      setTotalMoney(totalFlow);
      graphDataRef.current =
        finalNodes.length > 0
          ? { nodes: finalNodes, links: finalLinks, vendorEntityCount }
          : null;
      setLoading(false);
    });
  }, []);

  // Render D3 graph after SVG is in the DOM (only mounts when loading is false)
  useEffect(() => {
    if (loading || !graphDataRef.current || !svgRef.current) return;
    const { nodes, links, vendorEntityCount } = graphDataRef.current;
    renderGraph(svgRef.current!, nodes, links, vendorEntityCount, setSelected, setSelectedLinks);
  }, [loading]);

  return (
    <div className="mx-auto max-w-full px-4 py-8">
      <div className="border-b border-green-500/20 pb-4 mb-6 max-w-6xl mx-auto">
        <h1 className="text-2xl font-bold text-white">
          <span className="text-green-500">$</span> MONEY NETWORK
        </h1>
        <p className="mt-1 text-sm text-zinc-600">
          How campaign money flows between politicians and vendors.
          Yellow nodes paid by multiple campaigns are the siphoning pattern.
        </p>
        <div className="mt-3 flex flex-wrap gap-4 text-xs">
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-green-500" /> Politicians / Entities
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-purple-400" /> Committees
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-yellow-500" /> Vendors (shared)
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-zinc-500" /> Vendors (single)
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-4 w-6 bg-red-500/40" /> &gt;$100k payment
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-4 w-6 border border-cyan-500/50" /> Relationship
          </span>
        </div>
      </div>

      {loading ? (
        <div className="text-green-400/50 animate-pulse text-center py-20">
          Building network from {totalDisbursements > 0 ? `${totalDisbursements.toLocaleString()} disbursements` : 'database'}...
        </div>
      ) : (
        <>
          {/* Stats bar */}
          <div className="max-w-6xl mx-auto grid grid-cols-4 gap-4 mb-4">
            <div className="border border-green-500/20 bg-green-950/10 p-3 text-center">
              <div className="text-xs text-green-500/60">NODES</div>
              <div className="text-xl font-bold text-green-400">{nodeCount}</div>
            </div>
            <div className="border border-green-500/20 bg-green-950/10 p-3 text-center">
              <div className="text-xs text-green-500/60">CONNECTIONS</div>
              <div className="text-xl font-bold text-green-400">{edgeCount}</div>
            </div>
            <div className="border border-green-500/20 bg-green-950/10 p-3 text-center">
              <div className="text-xs text-green-500/60">TOTAL FLOW</div>
              <div className="text-xl font-bold text-green-400">
                ${(totalMoney / 1_000_000).toFixed(1)}M
              </div>
            </div>
            <div className="border border-green-500/20 bg-green-950/10 p-3 text-center">
              <div className="text-xs text-green-500/60">FEC RECORDS</div>
              <div className="text-xl font-bold text-green-400">{totalDisbursements.toLocaleString()}</div>
            </div>
          </div>

          {/* Selected node detail */}
          {selected && (
            <div className="max-w-6xl mx-auto mb-4 border border-green-500/30 bg-green-950/20 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <span className={`text-xs px-2 py-0.5 mr-2 ${
                    selected.type === 'vendor'
                      ? 'bg-yellow-950/40 text-yellow-400 border border-yellow-500/30'
                      : 'bg-green-950/40 text-green-400 border border-green-500/30'
                  }`}>
                    {selected.type.toUpperCase()}
                  </span>
                  <span className="text-green-400 font-semibold">{selected.label}</span>
                </div>
                <div className="text-right">
                  <span className="text-green-400 font-semibold">${selected.totalMoney.toLocaleString()}</span>
                  <span className="text-xs text-zinc-600 ml-2">{selected.connections} connections</span>
                </div>
              </div>
              {/* Show what this node connects to */}
              {selectedLinks.length > 0 && (
                <div className="mt-3 border-t border-green-500/10 pt-2 space-y-1 max-h-32 overflow-y-auto">
                  {selectedLinks.slice(0, 10).map((l, i) => {
                    const other = (typeof l.source === 'object' ? l.source.id : l.source) === selected.id
                      ? (typeof l.target === 'object' ? l.target as GraphNode : null)
                      : (typeof l.source === 'object' ? l.source as GraphNode : null);
                    return (
                      <div key={i} className="text-xs text-zinc-500 flex items-center justify-between">
                        <span>{l.linkType === 'relationship' ? 'Relationship' : 'Payment'} → {other?.label || '?'}</span>
                        {l.amount > 0 && <span className="text-green-400">${l.amount.toLocaleString()}</span>}
                      </div>
                    );
                  })}
                </div>
              )}
              {selected.entityId && (
                <Link href={`/entity/${selected.entityId}`} className="mt-2 inline-block text-xs text-green-500/70 hover:text-green-400">
                  View full dossier →
                </Link>
              )}
            </div>
          )}

          {/* Graph */}
          <div className="border border-green-500/20 bg-black overflow-hidden">
            <svg ref={svgRef} width="100%" height={750} className="w-full" />
          </div>

          <p className="max-w-6xl mx-auto mt-3 text-xs text-zinc-700">
            Drag nodes to rearrange. Scroll to zoom. Click a node to see details and connections.
            Larger nodes = more money. Yellow = paid by multiple campaigns.
          </p>
        </>
      )}
    </div>
  );
}

function renderGraph(
  svgEl: SVGSVGElement,
  nodes: GraphNode[],
  links: GraphLink[],
  vendorEntityCount: Map<string, Set<string>>,
  setSelected: (n: GraphNode | null) => void,
  setSelectedLinks: (l: GraphLink[]) => void,
) {
  const width = svgEl.clientWidth || 1200;
  const height = 750;

  const svg = d3.select(svgEl);
  svg.selectAll('*').remove();
  const g = svg.append('g');

  svg.call(
    d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 8])
      .on('zoom', (event) => g.attr('transform', event.transform))
  );

  const maxMoney = Math.max(...nodes.map((n) => n.totalMoney), 1);

  function nodeRadius(d: GraphNode): number {
    if (d.totalMoney <= 0) return 3;
    return Math.max(3, Math.min(25, Math.sqrt(d.totalMoney / maxMoney) * 25 + 3));
  }

  function nodeColor(d: GraphNode): string {
    if (d.type === 'vendor') {
      const vendorKey = d.id.slice(2);
      const entityCount = vendorEntityCount.get(vendorKey)?.size || 0;
      if (entityCount >= 2) return '#eab308'; // yellow — shared vendor
      return '#71717a'; // zinc — single vendor
    }
    if (d.type === 'committee') return '#a78bfa'; // purple — committee
    return '#22c55e'; // green — politician/entity
  }

  function linkColor(d: GraphLink): string {
    if (d.linkType === 'relationship') return '#06b6d4'; // cyan
    if (d.linkType === 'cross_campaign') return '#f97316'; // orange
    if (d.amount > 100000) return '#ef4444aa'; // red
    if (d.amount > 10000) return '#22c55e40'; // green
    return '#22c55e20'; // faint green
  }

  function linkWidth(d: GraphLink): number {
    if (d.linkType === 'relationship') return 1;
    return Math.max(0.3, Math.min(5, Math.sqrt(d.amount / 10000)));
  }

  const simulation = d3.forceSimulation<GraphNode>(nodes)
    .force('link', d3.forceLink<GraphNode, GraphLink>(links).id((d) => d.id).distance(60).strength(0.3))
    .force('charge', d3.forceManyBody().strength(-120))
    .force('center', d3.forceCenter(width / 2, height / 2))
    .force('collision', d3.forceCollide<GraphNode>().radius((d) => nodeRadius(d) + 2))
    .force('x', d3.forceX(width / 2).strength(0.03))
    .force('y', d3.forceY(height / 2).strength(0.03));

  // Links
  const link = g.append('g')
    .selectAll('line')
    .data(links)
    .join('line')
    .attr('stroke', linkColor)
    .attr('stroke-width', linkWidth)
    .attr('stroke-dasharray', (d) => d.linkType === 'relationship' ? '4,3' : 'none');

  // Nodes
  const node = g.append('g')
    .selectAll<SVGCircleElement, GraphNode>('circle')
    .data(nodes)
    .join('circle')
    .attr('r', nodeRadius)
    .attr('fill', nodeColor)
    .attr('stroke', (d) => d.type === 'vendor' ? '#00000040' : '#16a34a40')
    .attr('stroke-width', 0.5)
    .attr('opacity', 0.85)
    .style('cursor', 'pointer')
    .on('click', (_, d) => {
      setSelected(d);
      // Find all links connected to this node
      const connected = links.filter((l) => {
        const srcId = typeof l.source === 'string' ? l.source : l.source.id;
        const tgtId = typeof l.target === 'string' ? l.target : l.target.id;
        return srcId === d.id || tgtId === d.id;
      });
      setSelectedLinks(connected);
    })
    .call(
      d3.drag<SVGCircleElement, GraphNode>()
        .on('start', (event, d) => {
          if (!event.active) simulation.alphaTarget(0.3).restart();
          d.fx = d.x; d.fy = d.y;
        })
        .on('drag', (event, d) => { d.fx = event.x; d.fy = event.y; })
        .on('end', (event, d) => {
          if (!event.active) simulation.alphaTarget(0);
          d.fx = null; d.fy = null;
        })
    );

  // Labels — show for entities and high-money vendors
  const labelNodes = nodes.filter((d) =>
    d.id.startsWith('e:') || d.totalMoney > maxMoney * 0.05 || d.connections >= 3
  );

  g.append('g')
    .selectAll('text')
    .data(labelNodes)
    .join('text')
    .text((d) => d.label.length > 25 ? d.label.slice(0, 25) + '...' : d.label)
    .attr('font-size', 8)
    .attr('font-family', 'monospace')
    .attr('fill', (d) => d.type === 'vendor' ? '#a1a1aa' : d.type === 'committee' ? '#c4b5fd' : '#86efac')
    .attr('text-anchor', 'middle')
    .attr('dy', (d) => -nodeRadius(d) - 4);

  const labels = g.selectAll<SVGTextElement, GraphNode>('text');

  node.append('title').text((d) => `${d.label}\n$${d.totalMoney.toLocaleString()}\n${d.connections} connections`);

  simulation.on('tick', () => {
    link
      .attr('x1', (d) => (d.source as GraphNode).x!)
      .attr('y1', (d) => (d.source as GraphNode).y!)
      .attr('x2', (d) => (d.target as GraphNode).x!)
      .attr('y2', (d) => (d.target as GraphNode).y!);
    node.attr('cx', (d) => d.x!).attr('cy', (d) => d.y!);
    labels.attr('x', (d) => d.x!).attr('y', (d) => d.y!);
  });
}
