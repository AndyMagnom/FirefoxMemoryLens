'use client';

import * as React from 'react';
import { motion } from 'framer-motion';
import { FileUp, Flame, FolderOpen, Loader2, Lock, Sparkles } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface UploadZoneProps {
  onFile: (file: File) => void;
  loading: boolean;
}

export function UploadZone({ onFile, loading }: UploadZoneProps) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = React.useState(false);

  const busy = loading;

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (busy) return;
    const file = e.dataTransfer.files?.[0];
    if (file) onFile(file);
  };

  return (
    <div className="flex flex-col items-center gap-10 py-10 sm:py-16">
      {/* Hero */}
      <div className="flex flex-col items-center gap-4 text-center max-w-2xl">
        <motion.div
          initial={{ opacity: 0, scale: 0.8, rotate: -8 }}
          animate={{ opacity: 1, scale: 1, rotate: 0 }}
          transition={{ type: 'spring', stiffness: 200, damping: 15 }}
          className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-orange-500 via-orange-500 to-amber-500 shadow-lg shadow-orange-500/25"
        >
          <Flame className="h-8 w-8 text-white" aria-hidden />
        </motion.div>
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Firefox Memory Lens</h1>
        <p className="text-base text-muted-foreground sm:text-lg">
          Drop the memory report you saved from <code className="rounded bg-muted px-1.5 py-0.5 text-[0.9em]">about:memory</code>{' '}
          and see <span className="font-medium text-foreground">exactly what is eating your RAM</span> — tabs,
          JavaScript, images, storage — explained in plain English.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
          <Badge variant="secondary" className="gap-1">
            <Lock className="h-3 w-3" /> Nothing is stored
          </Badge>
          <Badge variant="secondary" className="gap-1">
            <FileUp className="h-3 w-3" /> .json.gz or .json
          </Badge>
          <Badge variant="secondary" className="gap-1">
            <Sparkles className="h-3 w-3" /> Plain-English breakdown
          </Badge>
        </div>
      </div>

      {/* Dropzone */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="w-full max-w-xl"
      >
        <div
          role="button"
          tabIndex={busy ? -1 : 0}
          aria-label="Upload Firefox memory report"
          onClick={() => !busy && inputRef.current?.click()}
          onKeyDown={(e) => {
            if (!busy && (e.key === 'Enter' || e.key === ' ')) {
              e.preventDefault();
              inputRef.current?.click();
            }
          }}
          onDragOver={(e) => {
            e.preventDefault();
            if (!busy) setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          className={`group flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed px-6 py-12 text-center transition-all outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
            dragOver
              ? 'border-orange-500 bg-orange-500/5 shadow-lg shadow-orange-500/10'
              : 'border-border bg-card hover:border-orange-400/60 hover:bg-orange-500/[0.03]'
          } ${busy ? 'pointer-events-none opacity-70' : ''}`}
        >
          <input
            ref={inputRef}
            type="file"
            accept=".gz,.gzip,.json,application/gzip,application/json"
            className="sr-only"
            aria-label="Choose memory report file"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onFile(f);
              e.currentTarget.value = '';
            }}
          />
          {busy ? (
            <>
              <Loader2 className="h-10 w-10 animate-spin text-orange-500" aria-hidden />
              <p className="text-sm font-medium">Reading the report…</p>
              <p className="text-xs text-muted-foreground">Large reports can take a few seconds.</p>
            </>
          ) : (
            <>
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-orange-500/10 transition-colors group-hover:bg-orange-500/15">
                <FolderOpen className="h-6 w-6 text-orange-500" aria-hidden />
              </div>
              <p className="text-sm font-medium">
                Drop <span className="font-mono">memory-report.json.gz</span> here
              </p>
              <p className="text-xs text-muted-foreground">or click to browse your files</p>
            </>
          )}
        </div>
      </motion.div>

      {/* How-to */}
      <Card className="w-full max-w-xl">
        <CardContent className="p-5">
          <h2 className="text-sm font-semibold">How to get a memory report from Firefox</h2>
          <ol className="mt-3 space-y-2.5 text-sm text-muted-foreground">
            <li className="flex gap-3">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-orange-500/15 text-[11px] font-semibold text-orange-600 dark:text-orange-400">
                1
              </span>
              <span>
                Type <code className="rounded bg-muted px-1.5 py-0.5 text-[0.9em] text-foreground">about:memory</code> in
                the address bar and press Enter.
              </span>
            </li>
            <li className="flex gap-3">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-orange-500/15 text-[11px] font-semibold text-orange-600 dark:text-orange-400">
                2
              </span>
              <span>
                Under <em>“Save memory reports”</em>, click{' '}
                <strong className="text-foreground">Measure and save…</strong> — Firefox measures every process and
                downloads{' '}
                <code className="rounded bg-muted px-1.5 py-0.5 text-[0.9em] text-foreground">memory-report.json.gz</code>
              </span>
            </li>
            <li className="flex gap-3">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-orange-500/15 text-[11px] font-semibold text-orange-600 dark:text-orange-400">
                3
              </span>
              <span>Drop that file above. Done!</span>
            </li>
          </ol>
        </CardContent>
      </Card>
    </div>
  );
}
