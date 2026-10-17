'use client';

import * as React from 'react';
import { motion } from 'framer-motion';
import { ChevronRight, ZoomIn } from 'lucide-react';
import { formatBytes, percentOf, CATEGORY_META, categoryForSegment, type MemTreeNode } from '@/lib/memory-report';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Button } from '@/components/ui/button';

/* ---------------- squarified treemap layout ---------------- */

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Item {
  index: number;
  area: number;
}

function worstRatio(row: Item[], rowArea: number, sideLength: number): number {
  if (rowArea <= 0 || sideLength <= 0) return Infinity;
  const thickness = rowArea / sideLength;
  let worst = 0;
  for (const item of row) {
    if (item.area <= 0) continue;
    const other = item.area / thickness;
    const ratio = Math.max(thickness / other, other / thickness);
    if (ratio > worst) worst = ratio;
  }
  return worst;
}

function squarify(areas: number[], rect: Rect): Rect[] {
  const out: Rect[] = new Array(areas.length);
  const total = areas.reduce((s, a) => s + a, 0);
  if (total <= 0 || rect.w <= 0 || rect.h <= 0) {
    for (let i = 0; i < areas.length; i++) out[i] = { x: rect.x, y: rect.y, w: 0, h: 0 };
    return out;
  }
  const scale = (rect.w * rect.h) / total;
  const items: Item[] = areas
    .map((a, i) => ({ index: i, area: Math.max(a * scale, 0) }))
    .sort((a, b) => b.area - a.area);

  let rest = items;
  let current: Rect = { ...rect };
  while (rest.length > 0) {
    const side = Math.min(current.w, current.h);
    const row: Item[] = [];
    let rowArea = 0;
    let i = 0;
    while (i < rest.length) {
      const candidate = rowArea + rest[i].area;
      if (row.length === 0 || worstRatio([...row, rest[i]], candidate, side) <= worstRatio(row, rowArea, side)) {
        row.push(rest[i]);
        rowArea = candidate;
        i++;
      } else break;
    }
    const thickness = side > 0 ? rowArea / side : 0;
    let offset = 0;
    for (const item of row) {
      const extent = thickness > 0 ? item.area / thickness : 0;
      if (current.w >= current.h) {
        out[item.index] = { x: current.x, y: current.y + offset, w: thickness, h: extent };
      } else {
        out[item.index] = { x: current.x + offset, y: current.y, w: extent, h: thickness };
      }
      offset += extent;
    }
    if (current.w >= current.h) {
      current = { x: current.x + thickness, y: current.y, w: current.w - thickness, h: current.h };
    } else {
      current = { x: current.x, y: current.y + thickness, w: current.w, h: current.h - thickness };
    }
    rest = rest.slice(i);
  }
  return out;
}

/* ---------------- colour helpers ---------------- */

function lighten(hex: string, amount: number): string {
  const n = hex.replace('#', '');
  const r = parseInt(n.slice(0, 2), 16);
  const g = parseInt(n.slice(2, 4), 16);
  const b = parseInt(n.slice(4, 6), 16);
  const mix = (c: number) => Math.round(c + (255 - c) * amount);
  return `rgb(${mix(r)}, ${mix(g)}, ${mix(b)})`;
}

function colorForNode(node: MemTreeNode, parentColor: string | null, siblingIndex: number): string {
  if (parentColor === null) {
    const meta = CATEGORY_META[categoryForSegment(node.name)];
    return meta ? meta.color : '#a1a1aa';
  }
  return siblingIndex % 2 === 1 ? lighten(parentColor, 0.18) : parentColor;
}

/** Friendly display label: category names at the top level, prettified segments deeper. */
function displayLabel(node: MemTreeNode, topLevel: boolean): string {
  if (topLevel) {
    const catId = categoryForSegment(node.name);
    if (catId !== 'other' && CATEGORY_META[catId]) return CATEGORY_META[catId].label;
  }
  // replace dashes/underscores with spaces, but only outside parentheses
  return node.label.replace(/^[^(]*/, (m) => m.replace(/[-_]+/g, ' '));
}

/* ---------------- component ---------------- */

interface MemTreemapProps {
  /** trail of nodes from the treemap root; last = currently shown node */
  trail: MemTreeNode[];
  onDescend: (node: MemTreeNode) => void;
  onJumpTo: (index: number) => void;
}

export function MemTreemap({ trail, onDescend, onJumpTo }: MemTreemapProps) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const [size, setSize] = React.useState({ w: 0, h: 0 });
  const [hovered, setHovered] = React.useState<number | null>(null);

  React.useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      setSize({ w: entry.contentRect.width, h: entry.contentRect.height });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const current = trail[trail.length - 1] ?? null;
  const children = React.useMemo(
    () => (current ? current.children.filter((c) => c.total > 0).slice(0, 40) : []),
    [current]
  );

  const rects = React.useMemo(() => {
    if (size.w < 10 || size.h < 10 || children.length === 0) return [];
    const areas = children.map((c) => c.total);
    const layout = squarify(areas, { x: 0, y: 0, w: size.w, h: size.h });
    // Deeper levels inherit the category colour of the trail's first real node
    const ancestorColor = trail.length > 1 && trail[1] ? colorForNode(trail[1], null, 0) : null;
    return children.map((child, i) => ({
      node: child,
      rect: layout[i],
      color: colorForNode(child, ancestorColor, i),
    }));
  }, [children, size, trail]);

  if (!current) return null;

  const totalShown = children.reduce((s, c) => s + c.total, 0);

  return (
    <div className="space-y-3">
      {/* Breadcrumb */}
      <div className="flex flex-wrap items-center gap-1 text-sm">
        {trail.map((node, i) => (
          <React.Fragment key={`${node.name}-${i}`}>
            {i > 0 && <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />}
            <Button
              variant={i === trail.length - 1 ? 'secondary' : 'ghost'}
              size="sm"
              className="h-7 px-2.5 text-xs font-medium"
              onClick={() => onJumpTo(i)}
              disabled={i === trail.length - 1}
            >
              {i === 0 ? 'All memory' : node.label}
            </Button>
          </React.Fragment>
        ))}
      </div>

      <div
        ref={containerRef}
        className="relative h-72 w-full overflow-hidden rounded-lg border bg-muted/40 sm:h-96"
        role="application"
        aria-label="Treemap memory map"
      >
        {rects.length === 0 && (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            {size.w < 10 ? 'Measuring…' : 'Nothing to show here'}
          </div>
        )}
        <TooltipProvider delayDuration={120}>
          {rects.map(({ node, rect, color }, index) => {
            const showText = rect.w > 64 && rect.h > 30;
            const showSub = rect.w > 110 && rect.h > 52;
            const canDescend = node.children.length > 0;
            const isHovered = hovered === index;
            return (
              <Tooltip key={node.name}>
                <TooltipTrigger asChild>
                  <motion.div
                    initial={{ opacity: 0, scale: 0.98 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.18 }}
                    onMouseEnter={() => setHovered(index)}
                    onMouseLeave={() => setHovered(null)}
                    onClick={() => canDescend && onDescend(node)}
                    role={canDescend ? 'button' : undefined}
                    tabIndex={canDescend ? 0 : undefined}
                    onKeyDown={(e) => {
                      if (canDescend && (e.key === 'Enter' || e.key === ' ')) {
                        e.preventDefault();
                        onDescend(node);
                      }
                    }}
                    style={{
                      position: 'absolute',
                      left: rect.x + 1,
                      top: rect.y + 1,
                      width: Math.max(rect.w - 2, 0),
                      height: Math.max(rect.h - 2, 0),
                      backgroundColor: isHovered ? lighten(hexToRgbStr(color), 0.12) : color,
                    }}
                    className={`flex flex-col justify-between overflow-hidden rounded-[4px] p-1.5 transition-shadow ${
                      canDescend ? 'cursor-pointer hover:z-10 hover:shadow-md' : 'cursor-default'
                    }`}
                  >
                    {showText && (
                      <span
                        className="line-clamp-2 text-[11px] font-medium leading-tight text-white [text-shadow:0_1px_2px_rgb(0_0_0/35%)]"
                        title={node.label}
                      >
                        {displayLabel(node, trail.length === 1)}
                      </span>
                    )}
                    {showSub && (
                      <span className="text-[10px] font-medium text-white/90 [text-shadow:0_1px_2px_rgb(0_0_0/35%)]">
                        {formatBytes(node.total, true)}
                        <span className="ml-1 opacity-75">
                          ({percentOf(node.total, totalShown).toFixed(0)}%)
                        </span>
                      </span>
                    )}
                    {canDescend && showSub && isHovered && (
                      <ZoomIn className="absolute bottom-1.5 right-1.5 h-3.5 w-3.5 text-white/90" aria-hidden />
                    )}
                  </motion.div>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-64">
                  <p className="font-semibold">{node.label}</p>
                  <p>
                    {formatBytes(node.total)} · {percentOf(node.total, totalShown).toFixed(1)}% of this view
                  </p>
                  {canDescend && <p className="mt-1 text-xs opacity-75">Click to zoom in</p>}
                </TooltipContent>
              </Tooltip>
            );
          })}
        </TooltipProvider>
      </div>
      <p className="text-xs text-muted-foreground">
        Each block is one group of memory users. Bigger block = more memory.{' '}
        {trail.length === 1 && 'Click a block to zoom in.'}
      </p>
    </div>
  );
}

function hexToRgbStr(hex: string): string {
  if (hex.startsWith('rgb')) return hex;
  const n = hex.replace('#', '');
  const r = parseInt(n.slice(0, 2), 16);
  const g = parseInt(n.slice(2, 4), 16);
  const b = parseInt(n.slice(4, 6), 16);
  return `rgb(${r}, ${g}, ${b})`;
}
