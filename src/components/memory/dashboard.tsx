'use client';

import * as React from 'react';
import { motion } from 'framer-motion';
import { MemoryStick, MousePointerClick, Puzzle } from 'lucide-react';
import { formatBytes, percentOf, type ProcessInfo, type ProcessedReport } from '@/lib/memory-report';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { ExtensionList, AddonCountBadge, type ExtensionRow } from './extension-list';

const PROCESS_COLORS = [
  '#f97316', // orange
  '#14b8a6', // teal
  '#8b5cf6', // violet
  '#84cc16', // lime
  '#ec4899', // pink
  '#06b6d4', // cyan
  '#f59e0b', // amber
  '#ef4444', // red
  '#22c55e', // green
  '#e879f9', // fuchsia
  '#64748b', // slate
  '#d946ef', // magenta
];

export function processColor(index: number): string {
  return PROCESS_COLORS[index % PROCESS_COLORS.length];
}

export function Dashboard({
  report,
  selected,
  onSelect,
}: {
  report: ProcessedReport;
  selected: number;
  onSelect: (index: number) => void;
}) {
  const processes = report.processes;
  const biggest = processes[0];

  /** Add-on memory aggregated across every process (extension process + content scripts + icons). */
  const addons = React.useMemo<ExtensionRow[]>(() => {
    const map = new Map<string, ExtensionRow & { procMap: Map<string, number> }>();
    for (const p of processes) {
      for (const e of p.extensions) {
        if (e.bytes <= 0) continue;
        let row = map.get(e.id);
        if (!row) {
          row = { ...e, pages: [], bytes: 0, procMap: new Map() };
          map.set(e.id, row);
        }
        row.bytes += e.bytes;
        for (const page of e.pages) {
          if (row.pages.length < 12 && !row.pages.includes(page)) row.pages.push(page);
        }
        row.procMap.set(p.label, (row.procMap.get(p.label) ?? 0) + e.bytes);
      }
    }
    return Array.from(map.values())
      .map(({ procMap, ...row }) => ({
        ...row,
        processes: Array.from(procMap.entries())
          .map(([label, bytes]) => ({ label, bytes }))
          .sort((a, b) => b.bytes - a.bytes),
      }))
      .sort((a, b) => b.bytes - a.bytes);
  }, [processes]);

  return (
    <div className="space-y-6">
      {/* Hero summary */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Card className="border-orange-500/30 bg-gradient-to-br from-orange-500/[0.07] to-transparent">
          <CardContent className="flex items-center gap-4 p-5">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-orange-500/15 text-orange-600 dark:text-orange-400">
              <MemoryStick className="h-5 w-5" aria-hidden />
            </span>
            <div className="min-w-0">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Total RAM in use</p>
              <p className="truncate text-2xl font-bold tabular-nums">{formatBytes(report.totalResident)}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 p-5">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-muted text-foreground">
              <span className="text-lg font-bold tabular-nums">{processes.length}</span>
            </span>
            <div className="min-w-0">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Processes</p>
              <p className="text-sm text-muted-foreground">
                Firefox splits work into many small programs for stability &amp; security.
              </p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 p-5">
            <span
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-white"
              style={{ backgroundColor: processColor(0) }}
              aria-hidden
            >
              <MousePointerClick className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Biggest user</p>
              <p className="truncate font-semibold">
                {biggest ? biggest.label : '—'}
                {biggest ? <span className="ml-1.5 font-mono text-sm font-normal tabular-nums text-muted-foreground">{formatBytes(biggest.resident)}</span> : null}
              </p>
              <p className="truncate text-xs text-muted-foreground">Click a card below to investigate</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Share bar */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Who is using the RAM?</CardTitle>
          <CardDescription>
            Each slice is one Firefox process. Click a slice or a card to dig into it.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <TooltipProvider delayDuration={100}>
            <div className="flex h-9 w-full gap-px overflow-hidden rounded-lg" role="listbox" aria-label="Memory share by process">
              {processes.map((p, i) => {
                const pct = percentOf(p.resident, report.totalResident);
                if (pct <= 0) return null;
                return (
                  <Tooltip key={p.id}>
                    <TooltipTrigger asChild>
                      <motion.button
                        type="button"
                        role="option"
                        aria-selected={selected === i}
                        initial={{ opacity: 0, scaleY: 0.6 }}
                        animate={{ opacity: 1, scaleY: 1 }}
                        transition={{ delay: Math.min(i * 0.03, 0.3) }}
                        onClick={() => onSelect(i)}
                        style={{ width: `${pct}%`, backgroundColor: processColor(i) }}
                        className={`h-full min-w-[6px] transition-all ${
                          selected === i ? 'ring-2 ring-foreground/70 ring-offset-1 ring-offset-background' : 'hover:brightness-110'
                        }`}
                        aria-label={`${p.label}: ${formatBytes(p.resident)}`}
                      />
                    </TooltipTrigger>
                    <TooltipContent>
                      <p className="font-semibold">{p.label}</p>
                      <p>
                        {formatBytes(p.resident)} · {pct.toFixed(1)}% of total
                      </p>
                    </TooltipContent>
                  </Tooltip>
                );
              })}
            </div>
          </TooltipProvider>
        </CardContent>
      </Card>

      {/* Add-ons across all processes */}
      {addons.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Puzzle className="h-4 w-4 text-violet-500" aria-hidden />
              Add-ons by memory
            </CardTitle>
            <CardDescription>
              {addons.length} add-on{addons.length === 1 ? '' : 's'} detected across the whole browser, including
              the memory their content scripts use inside web pages. Firefox reports add-ons by an internal ID, not
              their name — match an ID in{' '}
              <code className="rounded bg-muted px-1 py-0.5 text-[0.9em]">about:debugging</code> → This Firefox and
              use the pencil to name it. Names are kept only in your browser.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="nice-scrollbar max-h-96 overflow-y-auto">
              <ExtensionList items={addons} baseline={report.totalResident} percentLabel="of total RAM" />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Process cards */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {processes.map((p, i) => (
          <ProcessCard
            key={p.id}
            process={p}
            index={i}
            maxResident={processes[0]?.resident ?? 1}
            selected={selected === i}
            onSelect={() => onSelect(i)}
          />
        ))}
      </div>
    </div>
  );
}

function ProcessCard({
  process,
  index,
  maxResident,
  selected,
  onSelect,
}: {
  process: ProcessInfo;
  index: number;
  maxResident: number;
  selected: boolean;
  onSelect: () => void;
}) {
  const color = processColor(index);
  const pct = percentOf(process.resident, maxResident);
  return (
    <motion.button
      type="button"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.03, 0.25) }}
      onClick={onSelect}
      aria-pressed={selected}
      className={`rounded-xl border bg-card p-4 text-left transition-all hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
        selected ? 'border-transparent ring-2 shadow-md' : 'hover:border-foreground/20'
      }`}
      style={selected ? { boxShadow: `0 0 0 2px ${color}` } : undefined}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2.5">
          <span
            className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[13px] font-bold text-white"
            style={{ backgroundColor: color }}
            aria-hidden
          >
            {index + 1}
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{process.label}</p>
            <p className="truncate text-xs text-muted-foreground">{process.subtitle}</p>
          </div>
        </div>
        {(process.sites.length > 0 || process.extensions.length > 0) && (
          <div className="flex shrink-0 flex-col items-end gap-1">
            <AddonCountBadge count={process.extensions.length} />
            {process.sites.length > 0 && (
              <Badge variant="secondary" className="text-[10px]">
                site
              </Badge>
            )}
          </div>
        )}
      </div>
      <div className="mt-3 flex items-baseline justify-between gap-2">
        <span className="font-mono text-lg font-bold tabular-nums">{formatBytes(process.resident)}</span>
        <span className="text-[11px] text-muted-foreground tabular-nums">
          {percentOf(process.resident, maxResident).toFixed(0)}% of biggest
        </span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${Math.max(pct, 2).toFixed(1)}%` }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
          className="h-full rounded-full"
          style={{ backgroundColor: color }}
        />
      </div>
      <div className="mt-2.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground tabular-nums">
        <span title="Memory not shared with other processes">unique {formatBytes(process.residentUnique, true)}</span>
        <span title="Memory the allocator handed out">heap {formatBytes(process.heapAllocated, true)}</span>
        <span title="Detailed, attributed memory">detailed {formatBytes(process.explicitTotal, true)}</span>
      </div>
    </motion.button>
  );
}
