'use client';

import * as React from 'react';
import { motion } from 'framer-motion';
import {
  Boxes,
  Braces,
  Clapperboard,
  Cpu,
  Database,
  Fingerprint,
  Globe,
  HelpCircle,
  Image as ImageIcon,
  LayoutTemplate,
  Boxes as BoxIcon,
  MemoryStick,
  Network,
  Puzzle,
  Rocket,
  ScanSearch,
  Sparkles,
  Trophy,
  Workflow,
} from 'lucide-react';
import {
  formatBytes,
  percentOf,
  CATEGORY_META,
  categoryForSegment,
  type Category,
  type MemTreeNode,
  type ProcessInfo,
} from '@/lib/memory-report';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { MemTreemap } from './mem-treemap';
import { TreeBrowser } from './tree-browser';
import { ExtensionList } from './extension-list';

const CATEGORY_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  globe: Globe,
  braces: Braces,
  image: ImageIcon,
  database: Database,
  layout: LayoutTemplate,
  network: Network,
  gpu: Cpu,
  workers: Workflow,
  media: Clapperboard,
  rocket: Rocket,
  puzzle: Puzzle,
  cpu: Cpu,
  question: HelpCircle,
  box: BoxIcon,
};

const PROCESS_KIND_LABEL: Record<string, string> = {
  main: 'Main process',
  web: 'Content process',
  gpu: 'GPU process',
  extension: 'Extensions process',
  socket: 'Socket process',
  rdd: 'Media process',
  utility: 'Utility process',
  prealloc: 'Preallocated',
  privilegedabout: 'Privileged pages',
  forkserver: 'Fork server',
  other: 'Process',
};

export function ProcessDetail({ process }: { process: ProcessInfo }) {
  const explicitRoot = React.useMemo(
    () => process.tree.find((n) => n.name === 'explicit') ?? null,
    [process]
  );

  const [trail, setTrail] = React.useState<MemTreeNode[]>([]);

  // Reset treemap & scroll target when the selected process changes
  React.useEffect(() => {
    setTrail(explicitRoot ? [explicitRoot] : []);
  }, [explicitRoot]);

  const baseline = explicitRoot ? explicitRoot.total : process.explicitTotal;
  const extensionShare =
    baseline > 0
      ? (process.extensions.reduce((s, e) => s + e.bytes, 0) / baseline) * 100
      : 0;

  const descend = (node: MemTreeNode) => setTrail((prev) => [...prev, node]);
  const jumpTo = (index: number) => setTrail((prev) => prev.slice(0, index + 1));

  const exploreCategory = (cat: Category) => {
    if (!explicitRoot) return;
    // Drill the treemap into the largest explicit child that maps to this category
    const match = explicitRoot.children
      .filter((c) => categoryForSegment(c.name) === cat.id)
      .sort((a, b) => b.total - a.total)[0];
    if (match) {
      setTrail([explicitRoot, match]);
      document.getElementById('memory-map')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold tracking-tight sm:text-2xl">{process.label}</h2>
          <p className="text-sm text-muted-foreground">
            {process.subtitle}
            {process.pid ? ` · pid ${process.pid}` : ''}
          </p>
        </div>
        <Badge variant="outline" className="shrink-0">
          {PROCESS_KIND_LABEL[process.kind] ?? 'Process'} · {process.reportCount.toLocaleString()} measurements
        </Badge>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          icon={<MemoryStick className="h-4 w-4" />}
          label="RAM used"
          value={formatBytes(process.resident)}
          hint="Total RAM this process occupies right now, as measured by the operating system."
        />
        <StatCard
          icon={<Fingerprint className="h-4 w-4" />}
          label="Uniquely used"
          value={process.residentUnique > 0 ? formatBytes(process.residentUnique) : '—'}
          hint="Memory this process does not share with others — roughly what you would save by closing it."
        />
        <StatCard
          icon={<Boxes className="h-4 w-4" />}
          label="Heap allocated"
          value={formatBytes(process.heapAllocated)}
          hint="Memory handed out by the allocator. Includes bookkeeping overhead and some not-yet-tracked data."
        />
        <StatCard
          icon={<ScanSearch className="h-4 w-4" />}
          label="Detailed below"
          value={formatBytes(process.explicitTotal)}
          hint="The portion Firefox can attribute to specific features. All charts below are based on this number."
        />
      </div>

      {/* Category bars */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">What is using the memory</CardTitle>
          <CardDescription>
            The “Detailed below” amount, grouped into everyday language. Click a row to zoom into it on the map
            below.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-1">
          {process.categories.length === 0 ? (
            <p className="py-4 text-sm text-muted-foreground">
              No detailed breakdown available for this process.
            </p>
          ) : (
            process.categories.map((cat, i) => {
              const Icon = CATEGORY_ICONS[cat.icon] ?? BoxIcon;
              const pct = percentOf(cat.bytes, baseline);
              return (
                <motion.button
                  key={cat.id}
                  type="button"
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: Math.min(i * 0.04, 0.3) }}
                  onClick={() => exploreCategory(cat)}
                  className="group flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  aria-label={`${cat.label}: ${formatBytes(cat.bytes)} — zoom in on map`}
                >
                  <span
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-white"
                    style={{ backgroundColor: cat.color }}
                    aria-hidden
                  >
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline justify-between gap-2">
                      <span className="truncate text-sm font-medium">{cat.label}</span>
                      <span className="shrink-0 font-mono text-xs tabular-nums text-foreground">
                        {formatBytes(cat.bytes)}
                      </span>
                    </span>
                    <span className="mt-1 flex items-center gap-2">
                      <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted" aria-hidden>
                        <motion.span
                          initial={{ width: 0 }}
                          animate={{ width: `${Math.min(pct, 100).toFixed(1)}%` }}
                          transition={{ duration: 0.5, delay: 0.1 + Math.min(i * 0.04, 0.3), ease: 'easeOut' }}
                          className="block h-full rounded-full"
                          style={{ backgroundColor: cat.color }}
                        />
                      </span>
                      <span className="w-9 shrink-0 text-right text-[11px] tabular-nums text-muted-foreground">
                        {pct.toFixed(0)}%
                      </span>
                    </span>
                    <span className="mt-0.5 hidden truncate text-xs text-muted-foreground md:block">
                      {cat.plain}
                    </span>
                  </span>
                </motion.button>
              );
            })
          )}
        </CardContent>
      </Card>

      {/* Extensions breakdown */}
      {process.extensions.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Puzzle className="h-4 w-4 text-violet-500" aria-hidden />
              Extensions in this process
            </CardTitle>
            <CardDescription>
              Firefox identifies add-ons by an internal ID, not their name. Match an ID to an extension in{' '}
              <code className="rounded bg-muted px-1 py-0.5 text-[0.9em]">about:debugging</code> → This Firefox.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ExtensionList
              items={process.extensions}
              baseline={baseline}
              percentLabel="of detailed"
            />
            {baseline > 0 && extensionShare < 100 && (
              <p className="mt-3 border-t pt-3 text-xs text-muted-foreground">
                These add-on pages account for {extensionShare.toFixed(0)}% of this process’s detailed memory. The
                rest is engine overhead (garbage collector, allocator, threads) shared by everything running here.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Treemap */}
      {trail.length > 0 && (
        <Card id="memory-map" className="scroll-mt-4">
          <CardHeader>
            <CardTitle className="text-base">Memory map</CardTitle>
            <CardDescription>
              A picture of the same numbers — each block is one group, bigger means more memory. Click blocks to
              zoom in.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <MemTreemap trail={trail} onDescend={descend} onJumpTo={jumpTo} />
          </CardContent>
        </Card>
      )}

      {/* Top consumers */}
      {process.topConsumers.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Trophy className="h-4 w-4 text-amber-500" aria-hidden />
              Top memory users
            </CardTitle>
            <CardDescription>The single biggest individual allocations in this process.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-1">
            {process.topConsumers.map((consumer, i) => {
              const meta = CATEGORY_META[consumer.categoryId] ?? CATEGORY_META.other;
              const pct = percentOf(consumer.bytes, baseline);
              return (
                <TooltipProvider key={`${consumer.path}-${i}`} delayDuration={150}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="flex items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-muted/60">
                        <span className="w-5 shrink-0 text-right font-mono text-xs tabular-nums text-muted-foreground">
                          {i + 1}
                        </span>
                        <span
                          className="h-2 w-2 shrink-0 rounded-full"
                          style={{ backgroundColor: meta.color }}
                          aria-hidden
                        />
                        <span className="min-w-0 flex-1 truncate text-sm">{consumer.label}</span>
                        <span className="hidden w-24 shrink-0 sm:block" aria-hidden>
                          <span className="block h-1.5 overflow-hidden rounded-full bg-muted">
                            <span
                              className="block h-full rounded-full"
                              style={{ backgroundColor: meta.color, width: `${Math.min(pct, 100).toFixed(1)}%` }}
                            />
                          </span>
                        </span>
                        <span className="w-20 shrink-0 text-right font-mono text-xs tabular-nums">
                          {formatBytes(consumer.bytes, true)}
                        </span>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-96">
                      <p className="break-all font-mono text-[11px] leading-relaxed">{consumer.path}</p>
                      {consumer.desc && <p className="mt-1 text-xs opacity-80">{consumer.desc}</p>}
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              );
            })}
          </CardContent>
        </Card>
      )}

      {/* Full detail tree */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Sparkles className="h-4 w-4 text-orange-500" aria-hidden />
            Browse every measurement
          </CardTitle>
          <CardDescription>
            The full report for this process, exactly as Firefox measured it — for the curious.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <TreeBrowser tree={process.tree} baseline={baseline} />
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  hint,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Card className="cursor-help">
            <CardContent className="flex items-center gap-3 p-4">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-orange-500/10 text-orange-600 dark:text-orange-400">
                {icon}
              </span>
              <span className="min-w-0">
                <span className="block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  {label}
                </span>
                <span className="block truncate text-lg font-bold tabular-nums">{value}</span>
              </span>
            </CardContent>
          </Card>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-64 text-xs">
          <p className="font-semibold">{label}</p>
          <p className="opacity-90">{hint}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
