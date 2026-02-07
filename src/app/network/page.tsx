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
}

interface GraphLink extends d3.SimulationLinkDatum<GraphNode> {
  source: string | GraphNode;
  target: string | GraphNode;
  amount: number;
  count: number;
}

export default function NetworkPage() {
  const svgRef = useRef<SVGSVGElement>(null);
  const [loading, setLoading] = useState(true);
  const [nodeCount, setNodeCount] = useState(0);
  const [edgeCount, setEdgeCount] = useState(0);
  const [totalMoney, setTotalMoney] = useState(0);
  const [selected, setSelected] = useState<GraphNode | null>(null);

  useEffect(() => {
    if (!isSupabaseConfigured()) { setLoading(false); return; }

    getMoneyNetwork().then((data) => {
      const { disbursements, entities } = data;

      // Build entity name map
      const entityNames = new Map(entities.map((e) => [e.id, e.canonical_name]));

      // Build graph from disbursements: committee → vendor, grouped
      const nodes = new Map<string, GraphNode>();
      const linkMap = new Map<string, { source: string; target: string; amount: number; count: number }>();

      let totalFlow = 0;

      for (const d of disbursements) {
        if (!d.committee_name || !d.recipient_name || !d.disbursement_amount) continue;

        const committeeId = `c:${d.committee_id || d.committee_name}`;
        const vendorId = `v:${d.recipient_name}`;
        const entityName = d.entity_id ? entityNames.get(d.entity_id) : null;

        // Committee node
        if (!nodes.has(committeeId)) {
          nodes.set(committeeId, {
            id: committeeId,
            label: entityName || d.committee_name,
            type: 'committee',
            totalMoney: 0,
            entityId: d.entity_id,
          });
        }
        nodes.get(committeeId)!.totalMoney += d.disbursement_amount;

        // Vendor node
        if (!nodes.has(vendorId)) {
          nodes.set(vendorId, {
            id: vendorId,
            label: d.recipient_name,
            type: 'vendor',
            totalMoney: 0,
          });
        }
        nodes.get(vendorId)!.totalMoney += d.disbursement_amount;

        // Link
        const linkKey = `${committeeId}→${vendorId}`;
        if (!linkMap.has(linkKey)) {
          linkMap.set(linkKey, { source: committeeId, target: vendorId, amount: 0, count: 0 });
        }
        linkMap.get(linkKey)!.amount += d.disbursement_amount;
        linkMap.get(linkKey)!.count += 1;
        totalFlow += d.disbursement_amount;
      }

      // Filter to keep it readable: only vendors connected to 2+ committees, or top by money
      const vendorCommitteeCount = new Map<string, Set<string>>();
      for (const [, link] of linkMap) {
        const vid = link.target;
        if (!vendorCommitteeCount.has(vid)) vendorCommitteeCount.set(vid, new Set());
        vendorCommitteeCount.set(vid, vendorCommitteeCount.get(vid)!.add(link.source));
      }

      // Keep vendors paid by 2+ committees (the interesting ones) + top 20 by amount
      const sharedVendors = new Set<string>();
      for (const [vid, committees] of vendorCommitteeCount) {
        if (committees.size >= 2) sharedVendors.add(vid);
      }

      // Also keep top vendors by total money
      const vendorsByMoney = [...nodes.entries()]
        .filter(([id]) => id.startsWith('v:'))
        .sort((a, b) => b[1].totalMoney - a[1].totalMoney)
        .slice(0, 30);
      for (const [vid] of vendorsByMoney) {
        sharedVendors.add(vid);
      }

      // Filter links and nodes
      const filteredLinks: GraphLink[] = [];
      const usedNodes = new Set<string>();

      for (const [, link] of linkMap) {
        if (sharedVendors.has(link.target) || link.amount > 50000) {
          filteredLinks.push(link as GraphLink);
          usedNodes.add(link.source);
          usedNodes.add(link.target);
        }
      }

      const filteredNodes = [...nodes.values()].filter((n) => usedNodes.has(n.id));

      setNodeCount(filteredNodes.length);
      setEdgeCount(filteredLinks.length);
      setTotalMoney(totalFlow);
      setLoading(false);

      if (!svgRef.current || filteredNodes.length === 0) return;

      // Render with D3
      const width = svgRef.current.clientWidth || 1200;
      const height = 700;

      const svg = d3.select(svgRef.current);
      svg.selectAll('*').remove();

      const g = svg.append('g');

      // Zoom
      svg.call(
        d3.zoom<SVGSVGElement, unknown>()
          .scaleExtent([0.2, 5])
          .on('zoom', (event) => g.attr('transform', event.transform))
      );

      const maxMoney = Math.max(...filteredNodes.map((n) => n.totalMoney), 1);

      const simulation = d3.forceSimulation<GraphNode>(filteredNodes)
        .force('link', d3.forceLink<GraphNode, GraphLink>(filteredLinks).id((d) => d.id).distance(80))
        .force('charge', d3.forceManyBody().strength(-200))
        .force('center', d3.forceCenter(width / 2, height / 2))
        .force('collision', d3.forceCollide().radius(20));

      // Links
      const link = g.append('g')
        .selectAll('line')
        .data(filteredLinks)
        .join('line')
        .attr('stroke', (d) => d.amount > 100000 ? '#ef444480' : '#22c55e30')
        .attr('stroke-width', (d) => Math.max(0.5, Math.min(4, d.amount / 50000)));

      // Nodes
      const node = g.append('g')
        .selectAll<SVGCircleElement, GraphNode>('circle')
        .data(filteredNodes)
        .join('circle')
        .attr('r', (d) => Math.max(4, Math.min(20, (d.totalMoney / maxMoney) * 20 + 4)))
        .attr('fill', (d) => d.type === 'committee' ? '#22c55e' : d.type === 'vendor' ? '#eab308' : '#6366f1')
        .attr('stroke', (d) => d.type === 'committee' ? '#16a34a' : '#a16207')
        .attr('stroke-width', 1)
        .attr('opacity', 0.8)
        .style('cursor', 'pointer')
        .on('click', (_, d) => setSelected(d))
        .call(
          d3.drag<SVGCircleElement, GraphNode>()
            .on('start', (event, d) => {
              if (!event.active) simulation.alphaTarget(0.3).restart();
              d.fx = d.x;
              d.fy = d.y;
            })
            .on('drag', (event, d) => {
              d.fx = event.x;
              d.fy = event.y;
            })
            .on('end', (event, d) => {
              if (!event.active) simulation.alphaTarget(0);
              d.fx = null;
              d.fy = null;
            })
        );

      // Labels for larger nodes
      const label = g.append('g')
        .selectAll('text')
        .data(filteredNodes.filter((d) => d.totalMoney > maxMoney * 0.1))
        .join('text')
        .text((d) => d.label.length > 20 ? d.label.slice(0, 20) + '...' : d.label)
        .attr('font-size', 9)
        .attr('fill', '#a1a1aa')
        .attr('text-anchor', 'middle')
        .attr('dy', -12);

      // Tooltips
      node.append('title').text((d) => `${d.label}\n$${d.totalMoney.toLocaleString()}`);

      simulation.on('tick', () => {
        link
          .attr('x1', (d) => (d.source as GraphNode).x!)
          .attr('y1', (d) => (d.source as GraphNode).y!)
          .attr('x2', (d) => (d.target as GraphNode).x!)
          .attr('y2', (d) => (d.target as GraphNode).y!);
        node.attr('cx', (d) => d.x!).attr('cy', (d) => d.y!);
        label.attr('x', (d) => d.x!).attr('y', (d) => d.y!);
      });
    });
  }, []);

  return (
    <div className="mx-auto max-w-full px-4 py-8">
      <div className="border-b border-green-500/20 pb-4 mb-6 max-w-6xl mx-auto">
        <h1 className="text-2xl font-bold text-white">
          <span className="text-green-500">$</span> MONEY NETWORK
        </h1>
        <p className="mt-1 text-sm text-zinc-600">
          How campaign money flows between politicians and vendors.
          Shared vendors — paid by multiple campaigns — are highlighted in yellow.
          Red edges indicate payments over $100k.
        </p>
        <div className="mt-3 flex gap-6 text-xs">
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-green-500" /> Politicians / Committees
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-yellow-500" /> Vendors / Recipients
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-3 w-6 bg-red-500/30" /> &gt;$100k payment
          </span>
        </div>
      </div>

      {loading ? (
        <div className="text-green-400/50 animate-pulse text-center py-20">Building network graph...</div>
      ) : (
        <>
          {/* Stats bar */}
          <div className="max-w-6xl mx-auto grid grid-cols-3 gap-4 mb-4">
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
          </div>

          {/* Selected node detail */}
          {selected && (
            <div className="max-w-6xl mx-auto mb-4 border border-green-500/30 bg-green-950/20 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <span className={`text-xs px-2 py-0.5 mr-2 ${
                    selected.type === 'committee' ? 'bg-green-950/40 text-green-400 border border-green-500/30'
                    : 'bg-yellow-950/40 text-yellow-400 border border-yellow-500/30'
                  }`}>
                    {selected.type.toUpperCase()}
                  </span>
                  <span className="text-green-400 font-semibold">{selected.label}</span>
                </div>
                <span className="text-green-400">${selected.totalMoney.toLocaleString()}</span>
              </div>
              {selected.entityId && (
                <Link href={`/entity/${selected.entityId}`} className="mt-2 inline-block text-xs text-green-500/70 hover:text-green-400">
                  View full dossier →
                </Link>
              )}
            </div>
          )}

          {/* Graph */}
          <div className="border border-green-500/20 bg-black overflow-hidden">
            <svg
              ref={svgRef}
              width="100%"
              height={700}
              className="w-full"
            />
          </div>

          <p className="max-w-6xl mx-auto mt-3 text-xs text-zinc-700">
            Drag nodes to rearrange. Scroll to zoom. Click a node to see details.
            Larger nodes = more money flowing through them.
          </p>
        </>
      )}
    </div>
  );
}
