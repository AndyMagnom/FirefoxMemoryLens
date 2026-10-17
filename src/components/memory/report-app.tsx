'use client';

import * as React from 'react';
import { useTheme } from 'next-themes';
import { AnimatePresence, motion } from 'framer-motion';
import { FileJson, Flame, Moon, RotateCcw, Sun } from 'lucide-react';
import { toast } from 'sonner';
import type { ProcessedReport } from '@/lib/memory-report';
import { processMemoryReport } from '@/lib/memory-report';
import { readReportFile } from '@/lib/read-report-file';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { UploadZone } from './upload-zone';
import { Dashboard } from './dashboard';
import { ProcessDetail } from './process-detail';
import { Glossary } from './glossary';

type Status = 'idle' | 'uploading' | 'ready';

export function MemoryLensApp() {
  const [status, setStatus] = React.useState<Status>('idle');
  const [report, setReport] = React.useState<ProcessedReport | null>(null);
  const [selectedProcess, setSelectedProcess] = React.useState(0);

  const uploadFile = React.useCallback(async (file: File) => {
    setStatus('uploading');
    try {
      // let the loading state paint before the heavy synchronous parse
      await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
      const text = await readReportFile(file);
      const processed = processMemoryReport(text, file.name || 'memory-report.json.gz');
      setReport(processed);
      setSelectedProcess(0);
      setStatus('ready');
      toast.success('Report loaded', {
        description: `${processed.processes.length} processes · ${(processed.totalResident / 1048576).toFixed(0)} MB in total.`,
      });
    } catch (err) {
      setStatus('idle');
      const message = err instanceof Error ? err.message : 'Could not read that file.';
      toast.error('Could not read the report', { description: message });
    }
  }, []);

  const reset = React.useCallback(() => {
    setReport(null);
    setSelectedProcess(0);
    setStatus('idle');
  }, []);

  const selected = report?.processes[selectedProcess] ?? null;

  return (
    <div className="flex min-h-screen flex-col">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-3 px-4">
          <button
            type="button"
            onClick={reset}
            className="flex items-center gap-2 rounded-lg px-1.5 py-1 transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="Firefox Memory Lens — back to upload"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-orange-500 to-amber-500 shadow-sm">
              <Flame className="h-4.5 w-4.5 text-white" aria-hidden />
            </span>
            <span className="text-sm font-bold tracking-tight">Firefox Memory Lens</span>
          </button>
          <div className="flex items-center gap-2">
            {report && (
              <Badge variant="outline" className="hidden max-w-56 items-center gap-1 sm:inline-flex">
                <FileJson className="h-3 w-3 shrink-0" aria-hidden />
                <span className="truncate font-mono text-[11px]">{report.fileName}</span>
              </Badge>
            )}
            <ThemeToggle />
            {report && (
              <Button variant="outline" size="sm" onClick={reset} className="gap-1.5">
                <RotateCcw className="h-3.5 w-3.5" />
                New report
              </Button>
            )}
          </div>
        </div>
      </header>

      {/* Main */}
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-16">
        <AnimatePresence mode="wait">
          {status !== 'ready' ? (
            <motion.div
              key="landing"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2 }}
            >
              <UploadZone onFile={uploadFile} loading={status === 'uploading'} />
            </motion.div>
          ) : report ? (
            <motion.div
              key="dashboard"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2 }}
              className="space-y-8 py-8"
            >
              <Dashboard report={report} selected={selectedProcess} onSelect={setSelectedProcess} />
              {selected && (
                <section aria-label="Selected process details">
                  <ProcessDetail process={selected} />
                </section>
              )}
              <Glossary />
            </motion.div>
          ) : null}
        </AnimatePresence>
      </main>

      {/* Sticky footer */}
      <footer className="mt-auto border-t py-5">
        <div className="mx-auto max-w-6xl px-4 text-center text-xs text-muted-foreground">
          <p>Files are parsed in memory and never stored.</p>
          {process.env.NODE_ENV === 'development' && (
            <p className="mt-2">
              Project bundles:{' '}
              <a
                href="/firefox-memory-lens-github.zip"
                download
                className="font-medium text-orange-600 underline underline-offset-2 hover:text-orange-500 dark:text-orange-400"
              >
                source for GitHub (.zip)
              </a>{' '}
              ·{' '}
              <a
                href="/firefox-memory-lens-static-site.zip"
                download
                className="font-medium text-orange-600 underline underline-offset-2 hover:text-orange-500 dark:text-orange-400"
              >
                pre-built static site (.zip)
              </a>
            </p>
          )}
        </div>
      </footer>
    </div>
  );
}

function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);

  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label="Toggle dark mode"
      onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
    >
      {mounted && resolvedTheme === 'dark' ? (
        <Sun className="h-4.5 w-4.5" aria-hidden />
      ) : (
        <Moon className="h-4.5 w-4.5" aria-hidden />
      )}
    </Button>
  );
}
