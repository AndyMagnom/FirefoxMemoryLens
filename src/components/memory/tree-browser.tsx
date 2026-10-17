'use client';

import * as React from 'react';
import { ChevronDown, ChevronRight, Info, Search } from 'lucide-react';
import { formatBytes, percentOf, type MemTreeNode } from '@/lib/memory-report';
import { Input } from '@/components/ui/input';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface TreeBrowserProps {
  tree: MemTreeNode[];
  /** total used as 100% baseline (usually the process' explicit total) */
  baseline: number;
}

interface FilteredNode {
  node: MemTreeNode;
  key: string;
  children: FilteredNode[] | null; // null = collapsed (unfiltered mode)
}

/** Filter tree by query; keeps ancestors of matches, prunes non-matching branches. */
function filterTree(nodes: MemTreeNode[], parentKey: string, q: string): FilteredNode[] {
  const out: FilteredNode[] = [];
  for (const node of nodes) {
    const key = parentKey ? `${parentKey}/${node.name}` : node.name;
    const children = filterTree(node.children, key, q);
    const selfMatch =
      node.label.toLowerCase().includes(q) ||
      node.name.toLowerCase().includes(q) ||
      key.toLowerCase().includes(q);
    if (selfMatch || children.length > 0) {
      out.push({ node, key, children });
    }
  }
  return out;
}

function toFiltered(nodes: MemTreeNode[], parentKey: string, expanded: Set<string>): FilteredNode[] {
  return nodes.map((node) => {
    const key = parentKey ? `${parentKey}/${node.name}` : node.name;
    return {
      node,
      key,
      children: expanded.has(key) ? toFiltered(node.children, key, expanded) : null,
    };
  });
}

export function TreeBrowser({ tree, baseline }: TreeBrowserProps) {
  const [query, setQuery] = React.useState('');
  const [expanded, setExpanded] = React.useState<Set<string>>(() => buildDefaultExpanded(tree));

  // Rebuild default expansion when a new tree arrives
  React.useEffect(() => {
    setExpanded(buildDefaultExpanded(tree));
    setQuery('');
  }, [tree]);

  const searching = query.trim().length > 0;
  const q = query.trim().toLowerCase();

  const visible = React.useMemo(() => {
    if (searching) return filterTree(tree, '', q);
    return toFiltered(tree, '', expanded);
  }, [tree, searching, q, expanded]);

  const toggle = (key: string, hasChildren: boolean) => {
    if (!hasChildren) return;
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search details — e.g. “images”, “sqlite”, a site name…"
          className="pl-8"
          aria-label="Search memory details"
        />
      </div>
      <p className="text-xs text-muted-foreground">
        {searching
          ? 'Showing matches (parents included). Clear the search to browse manually.'
          : 'Click a row to expand it. Sizes include everything beneath them.'}
      </p>
      <div className="nice-scrollbar max-h-[560px] overflow-y-auto rounded-lg border" role="tree" aria-label="Detailed memory tree">
        {visible.length === 0 ? (
          <p className="p-6 text-center text-sm text-muted-foreground">No matches for “{query}”.</p>
        ) : (
          <ul className="divide-y">
            {visible.map((f) => (
              <TreeRow
                key={f.key}
                item={f}
                depth={0}
                baseline={baseline}
                searching={searching}
                expanded={expanded}
                onToggle={toggle}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function buildDefaultExpanded(tree: MemTreeNode[]): Set<string> {
  const set = new Set<string>();
  for (const top of tree) {
    set.add(top.name);
    if (top.name === 'explicit') {
      for (const child of top.children) set.add(`explicit/${child.name}`);
    }
  }
  return set;
}

interface TreeRowProps {
  item: FilteredNode;
  depth: number;
  baseline: number;
  searching: boolean;
  expanded: Set<string>;
  onToggle: (key: string, hasChildren: boolean) => void;
}

function TreeRow({ item, depth, baseline, searching, expanded, onToggle }: TreeRowProps) {
  const { node, key } = item;
  const hasChildren = node.children.length > 0;
  const isOpen = searching ? item.children !== null && item.children.length > 0 : expanded.has(key);
  const pct = percentOf(node.total, baseline);

  return (
    <li role="treeitem" aria-selected={isOpen} aria-expanded={hasChildren ? isOpen : undefined}>
      <div
        className={`group flex items-center gap-1.5 py-1.5 pr-3 hover:bg-muted/60 ${hasChildren ? 'cursor-pointer' : ''}`}
        style={{ paddingLeft: `${depth * 14 + 8}px` }}
        onClick={() => onToggle(key, hasChildren)}
      >
        <span className="flex h-5 w-5 shrink-0 items-center justify-center">
          {hasChildren &&
            (isOpen ? (
              <ChevronDown className="h-4 w-4 text-muted-foreground" aria-hidden />
            ) : (
              <ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden />
            ))}
        </span>
        <span className={`min-w-0 flex-1 truncate text-[13px] ${hasChildren ? 'font-medium' : 'text-foreground/90'}`}>
          {node.label}
        </span>
        {node.note && (
          <TooltipProvider delayDuration={100}>
            <Tooltip>
              <TooltipTrigger asChild>
                <span
                  className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400"
                  aria-label="Note"
                >
                  <Info className="h-3 w-3" aria-hidden />
                </span>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-72 text-xs">
                {node.note}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
        {node.desc && (
          <TooltipProvider delayDuration={100}>
            <Tooltip>
              <TooltipTrigger asChild>
                <span
                  className="hidden h-4 w-4 shrink-0 items-center justify-center text-muted-foreground sm:flex"
                  aria-label="Description"
                >
                  <Info className="h-3.5 w-3.5" aria-hidden />
                </span>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-80 text-xs">
                {node.desc}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
        <span className="w-14 shrink-0 sm:w-20" aria-hidden>
          <span className="block h-1.5 overflow-hidden rounded-full bg-muted">
            <span
              className="block h-full rounded-full bg-orange-500/70"
              style={{ width: `${Math.min(pct, 100).toFixed(1)}%` }}
            />
          </span>
        </span>
        <span className="w-20 shrink-0 text-right font-mono text-xs tabular-nums text-foreground sm:w-24">
          {formatBytes(node.total, true)}
        </span>
        <span className="hidden w-10 shrink-0 text-right text-[11px] tabular-nums text-muted-foreground sm:inline">
          {pct >= 0.05 ? `${pct.toFixed(0)}%` : ''}
        </span>
      </div>
      {hasChildren && isOpen && item.children && item.children.length > 0 && (
        <ul className="divide-y">
          {item.children.map((child) => (
            <TreeRow
              key={child.key}
              item={child}
              depth={depth + 1}
              baseline={baseline}
              searching={searching}
              expanded={expanded}
              onToggle={onToggle}
            />
          ))}
        </ul>
      )}
    </li>
  );
}
