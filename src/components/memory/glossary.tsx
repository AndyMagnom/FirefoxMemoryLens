'use client';

import { BookOpen } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

const TERMS: { term: string; text: string }[] = [
  {
    term: 'RAM used (resident)',
    text: 'How much physical memory the operating system has given the process right now. This is what counts against your computer’s memory.',
  },
  {
    term: 'Uniquely used',
    text: 'The part of that RAM no other process shares. Closing the process frees roughly this much.',
  },
  {
    term: 'Heap allocated',
    text: 'Memory handed out by the program’s allocator. It includes small bookkeeping costs, so it can be slightly higher than the detailed breakdown.',
  },
  {
    term: 'Detailed (explicit)',
    text: 'Memory Firefox managed to attribute to specific features. Everything in the charts is built from this — a gap vs. the heap number is normal.',
  },
  {
    term: 'JavaScript engine',
    text: 'Code and data managed by the JS engine: scripts from websites, plus Firefox’s own internal scripts.',
  },
  {
    term: 'GC heap / nursery',
    text: 'The garbage collector’s space where short-lived JS objects live. Large numbers here mean a page creates (and throws away) a lot of objects.',
  },
  {
    term: 'DOM',
    text: 'The page’s structure: every element, text snippet and style rule of the web pages you have open.',
  },
  {
    term: 'vsize / address space',
    text: 'Virtual memory — huge address ranges the OS reserves but never actually fills. Ignore it; it is NOT real RAM usage.',
  },
];

export function Glossary() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <BookOpen className="h-4 w-4 text-orange-500" aria-hidden />
          Plain-English glossary
        </CardTitle>
        <CardDescription>The few words this tool uses, without the jargon.</CardDescription>
      </CardHeader>
      <CardContent>
        <dl className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {TERMS.map((t) => (
            <div key={t.term} className="rounded-lg bg-muted/50 p-3">
              <dt className="text-sm font-semibold">{t.term}</dt>
              <dd className="mt-0.5 text-sm text-muted-foreground">{t.text}</dd>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  );
}
