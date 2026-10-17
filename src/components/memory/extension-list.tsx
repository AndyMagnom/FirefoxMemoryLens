'use client';

import * as React from 'react';
import { Check, Pencil, Puzzle, X } from 'lucide-react';
import { formatBytes, percentOf, type ExtensionInfo } from '@/lib/memory-report';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';

const LABELS_KEY = 'memory-lens:extension-labels';

type LabelMap = Record<string, string>;

function loadLabels(): LabelMap {
  try {
    const raw = window.localStorage.getItem(LABELS_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return typeof parsed === 'object' && parsed !== null ? (parsed as LabelMap) : {};
  } catch {
    return {};
  }
}

const listeners = new Set<() => void>();

/** Extension labels the user assigned (e.g. from about:debugging). Kept only in the browser. */
export function useExtensionLabels(): [LabelMap, (id: string, name: string) => void] {
  const [labels, setLabels] = React.useState<LabelMap>({});

  React.useEffect(() => {
    const sync = () => setLabels(loadLabels());
    sync();
    listeners.add(sync);
    window.addEventListener('storage', sync);
    return () => {
      listeners.delete(sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  const setLabel = React.useCallback((id: string, name: string) => {
    const next = loadLabels();
    const trimmed = name.trim();
    if (trimmed) next[id] = trimmed;
    else delete next[id];
    try {
      window.localStorage.setItem(LABELS_KEY, JSON.stringify(next));
    } catch {
      // storage unavailable (private mode) — labels just won't persist
    }
    listeners.forEach((l) => l());
  }, []);

  return [labels, setLabel];
}

export interface ExtensionRow extends ExtensionInfo {
  /** per-process contributions (optional, used on the dashboard) */
  processes?: { label: string; bytes: number }[];
}

interface ExtensionListProps {
  items: ExtensionRow[];
  /** value that counts as 100% for the percentage column */
  baseline: number;
  /** caption for the percentage, e.g. "of all RAM" */
  percentLabel: string;
}

/** Per-add-on memory rows with an option to name each add-on (stored locally). */
export function ExtensionList({ items, baseline, percentLabel }: ExtensionListProps) {
  const [labels, setLabel] = useExtensionLabels();
  const [editing, setEditing] = React.useState<string | null>(null);
  const [draft, setDraft] = React.useState('');

  const startEdit = (row: ExtensionRow) => {
    setEditing(row.id);
    setDraft(labels[row.id] ?? '');
  };

  const commit = (row: ExtensionRow) => {
    setLabel(row.id, draft);
    setEditing(null);
  };

  return (
    <div className="space-y-1">
      {items.map((row) => {
        const name = labels[row.id];
        const pct = percentOf(row.bytes, baseline);
        const editingThis = editing === row.id;
        return (
          <div key={row.id} className="flex items-start gap-3 rounded-lg px-2 py-2 hover:bg-muted/60">
            <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-violet-500/15 text-violet-600 dark:text-violet-400">
              <Puzzle className="h-4 w-4" aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              {editingThis ? (
                <div className="flex items-center gap-1.5">
                  <Input
                    autoFocus
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') commit(row);
                      if (e.key === 'Escape') setEditing(null);
                    }}
                    placeholder="e.g. uBlock Origin"
                    aria-label="Name this add-on"
                    className="h-8 max-w-72 text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => commit(row)}
                    aria-label="Save name"
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-green-600 transition-colors hover:bg-green-500/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <Check className="h-4 w-4" aria-hidden />
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditing(null)}
                    aria-label="Cancel"
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <X className="h-4 w-4" aria-hidden />
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-1.5">
                  <p className="truncate text-sm font-medium">
                    {name ?? (
                      <>
                        Extension <span className="font-mono text-[13px]">{row.shortId}…</span>
                      </>
                    )}
                  </p>
                  <button
                    type="button"
                    onClick={() => startEdit(row)}
                    aria-label={name ? 'Rename this add-on' : 'Name this add-on'}
                    title="Name this add-on"
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground/50 transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <Pencil className="h-3.5 w-3.5" aria-hidden />
                  </button>
                </div>
              )}
              {row.pages.length > 0 && (
                <p className="mt-1 flex flex-wrap items-center gap-1">
                  {row.pages.slice(0, 3).map((page) => (
                    <span
                      key={page}
                      className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground"
                    >
                      {page}
                    </span>
                  ))}
                  {row.pages.length > 3 && (
                    <span className="px-1 text-[10px] text-muted-foreground">+{row.pages.length - 3} more</span>
                  )}
                </p>
              )}
              {row.processes && row.processes.length > 1 && (
                <p className="mt-1 truncate text-[11px] text-muted-foreground">
                  Found in:{' '}
                  {row.processes.map((p, i) => (
                    <span key={p.label}>
                      {i > 0 && ', '}
                      <span className="whitespace-nowrap">
                        {p.label} {formatBytes(p.bytes, true)}
                      </span>
                    </span>
                  ))}
                </p>
              )}
            </div>
            <div className="w-24 shrink-0 text-right">
              <p className="font-mono text-sm font-semibold tabular-nums">{formatBytes(row.bytes)}</p>
              <p className="text-[11px] text-muted-foreground tabular-nums">
                {pct.toFixed(0)}% {percentLabel}
              </p>
            </div>
          </div>
        );
      })}
      {items.length === 0 && (
        <p className="py-2 text-sm text-muted-foreground">No add-on memory was identified.</p>
      )}
    </div>
  );
}

export function AddonCountBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <Badge variant="secondary" className="text-[10px]">
      {count} add-on{count === 1 ? '' : 's'}
    </Badge>
  );
}
