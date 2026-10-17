/**
 * Firefox Memory Report parser & processor.
 *
 * Understands the JSON format produced by about:memory ("Save memory reports"):
 * {
 *   "version": 1,
 *   "hasMozMallocUsableSize": true,
 *   "reports": [{ "process", "path", "kind", "units", "amount", "description" }]
 * }
 *
 * Kind:   0 = Other, 1 = Heap, 2 = NonHeap
 * Units:  0 = Bytes, 1 = Count, 2 = CountCumulative, 3 = Percentage
 *
 * Notes on Firefox path quirks handled here:
 *  - Segments are separated by "/" but URLs are wrapped in parentheses where
 *    "/" is escaped as "\" and literal "\" is escaped as "\\". Splitting must
 *    therefore be parenthesis-aware.
 *  - A path may contain multiple alternatives separated by ", " (multi-path
 *    reports). We only count the FIRST alternative to avoid double counting.
 *  - Degenerate paths may carry a "(!!)" marker which we strip.
 */

export const UNITS_BYTES = 0;

export interface RawReport {
  process: string;
  path: string;
  kind: number;
  units: number;
  amount: number;
  description?: string;
}

export interface ParsedFile {
  version: number;
  reports: RawReport[];
}

export interface MemTreeNode {
  /** raw path segment */
  name: string;
  /** human friendly label */
  label: string;
  /** bytes reported directly at this node (leaf value) */
  own: number;
  /** own + all descendants */
  total: number;
  /** short annotation (e.g. overlap warnings for top-level groups) */
  note?: string;
  /** reporter description (leaves only, truncated) */
  desc?: string;
  children: MemTreeNode[];
  depth: number;
}

export interface Category {
  id: string;
  label: string;
  /** lucide icon key resolved in the UI layer */
  icon: string;
  color: string;
  bytes: number;
  /** plain-english explanation */
  plain: string;
}

export interface Consumer {
  label: string;
  path: string;
  bytes: number;
  categoryId: string;
  desc?: string;
}

export interface ExtensionInfo {
  /** internal UUID from the moz-extension://<uuid> URL */
  id: string;
  /** first 8 characters of the UUID, for display */
  shortId: string;
  /** page files seen for this add-on (popup.html, idle.html, …) */
  pages: string[];
  /** bytes attributed to this add-on's pages */
  bytes: number;
}

export type ProcessKind =
  | 'main'
  | 'web'
  | 'gpu'
  | 'extension'
  | 'socket'
  | 'rdd'
  | 'utility'
  | 'prealloc'
  | 'privilegedabout'
  | 'forkserver'
  | 'other';

export interface ProcessInfo {
  id: string;
  rawName: string;
  label: string;
  kind: ProcessKind;
  pid?: number;
  subtitle: string;
  sites: string[];
  resident: number;
  residentUnique: number;
  privateBytes: number;
  heapAllocated: number;
  explicitTotal: number;
  unclassifiedBytes: number;
  categories: Category[];
  extensions: ExtensionInfo[];
  tree: MemTreeNode[];
  topConsumers: Consumer[];
  reportCount: number;
}

export interface ProcessedReport {
  fileName: string;
  version: number;
  generatedAt: string;
  totalResident: number;
  processes: ProcessInfo[];
}

/* ------------------------------------------------------------------ */
/* Low-level parsing                                                   */
/* ------------------------------------------------------------------ */

export function parseMemoryReportJson(text: string): ParsedFile {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(
      'This file is not valid JSON. Make sure you saved the report from about:memory (a .json or .json.gz file).'
    );
  }
  const obj = data as Record<string, unknown>;
  if (!obj || !Array.isArray(obj.reports)) {
    throw new Error(
      'This JSON does not look like a Firefox memory report (missing "reports"). Open about:memory, click "Measure and save…" and upload the downloaded file.'
    );
  }
  const reports: RawReport[] = [];
  for (const r of obj.reports as Record<string, unknown>[]) {
    if (typeof r.path !== 'string' || typeof r.amount !== 'number') continue;
    reports.push({
      process: typeof r.process === 'string' ? r.process : 'Unknown process',
      path: r.path,
      kind: typeof r.kind === 'number' ? r.kind : 0,
      units: typeof r.units === 'number' ? r.units : 0,
      amount: r.amount,
      description: typeof r.description === 'string' ? r.description : undefined,
    });
  }
  if (reports.length === 0) throw new Error('The report contains no memory measurements.');
  return { version: typeof obj.version === 'number' ? obj.version : 1, reports };
}

/** Split a memory-report path into segments, respecting parentheses. */
export function splitMemoryPath(path: string): string[] {
  const segments: string[] = [];
  let current = '';
  let depth = 0;
  for (let i = 0; i < path.length; i++) {
    const ch = path[i];
    if (ch === '(') depth++;
    else if (ch === ')') depth = Math.max(0, depth - 1);
    if (ch === '/' && depth === 0) {
      if (current) segments.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  if (current) segments.push(current);
  return segments;
}

/** Split a path into its comma separated alternatives (commas inside parens or square brackets don't count). */
function splitPathAlternatives(path: string): string[] {
  const parts: string[] = [];
  let current = '';
  let depth = 0; // ( )
  let bracket = 0; // [ ] — realm principals like "[Expanded Principal https://a, moz-extension://b]"
  for (let i = 0; i < path.length; i++) {
    const ch = path[i];
    if (ch === '(') depth++;
    else if (ch === ')') depth = Math.max(0, depth - 1);
    else if (ch === '[') bracket++;
    else if (ch === ']') bracket = Math.max(0, bracket - 1);
    if (ch === ',' && depth === 0 && bracket === 0) {
      parts.push(current);
      current = '';
      if (path[i + 1] === ' ') i++; // Firefox separates multi-paths with ", "
    } else {
      current += ch;
    }
  }
  parts.push(current);
  return parts;
}

/**
 * Unescape Firefox's path escaping.
 * Firefox escapes every "/" inside parenthesised segments as "\".
 * (Verified against real reports: "chrome://a/b" becomes "chrome:\\a\\b";
 * literal backslashes effectively never occur.)
 */
export function unescapePathText(text: string): string {
  return text.replace(/\\/g, '/');
}

/** Shorten a URL-ish string to something readable, e.g. "chatgpt.com/share…" */
function shortenUrl(raw: string, max = 32): string {
  let s = unescapePathText(raw).trim().replace(/\/+$/, '');
  const m = s.match(/^([a-z-]+:\/\/)([^/?#]+)([^#]*)/i);
  if (m) {
    const host = m[2].replace(/^www\./, '');
    const rest = m[3] && m[3] !== '/' ? m[3].split('/').filter(Boolean)[0] : '';
    s = rest ? `${host}/${rest}` : host;
  } else if (s.startsWith('resource:')) {
    s = s.split('/').pop() || s;
  } else {
    s = s.split('/').pop() || s;
  }
  return s.length > max ? s.slice(0, max - 1) + '…' : s;
}

/** Prettify a raw segment for display (keeps parenthesised content readable). */
export function prettifySegment(segment: string): string {
  let label = segment.replace(/^\(!\)\s*/, '');
  label = label.replace(/\(([^)]*)\)/g, (_m, inner: string) => {
    const unescaped = unescapePathText(inner);
    const parts = unescaped.split(',').map((p) => p.trim());
    const shown = parts
      .map((p) => {
        if (/^0x[0-9a-f]+$/i.test(p)) return null; // addresses are noise
        if (p.startsWith('from: ')) return shortenUrl(p.slice(6), 28);
        return shortenUrl(p, 34);
      })
      .filter(Boolean)
      .join(', ');
    return shown ? ` (${shown})` : '';
  });
  label = label.replace(/\\/g, '/');
  if (label.length > 64) label = label.slice(0, 61) + '…';
  return label;
}

/* ------------------------------------------------------------------ */
/* Tree building                                                       */
/* ------------------------------------------------------------------ */

/** Trim desc out of small nodes to keep the payload lean. */
const DESC_MIN_BYTES = 64 * 1024;
const DESC_MAX_LEN = 220;

export function buildTree(reports: RawReport[]): MemTreeNode[] {
  interface MutableNode {
    name: string;
    own: number;
    desc?: string;
    children: Map<string, MutableNode>;
  }
  const rootChildren = new Map<string, MutableNode>();

  const ensureNode = (parentMap: Map<string, MutableNode>, name: string): MutableNode => {
    let node = parentMap.get(name);
    if (!node) {
      node = { name, own: 0, children: new Map() };
      parentMap.set(name, node);
    }
    return node;
  };

  for (const report of reports) {
    if (report.units !== UNITS_BYTES) continue;
    if (report.amount === 0) continue;
    // multi-path reports: count only the first alternative (no double counting)
    const first = splitPathAlternatives(report.path)[0] ?? report.path;
    const segments = splitMemoryPath(first);
    let map = rootChildren;
    let node: MutableNode | null = null;
    for (const seg of segments) {
      node = ensureNode(map, seg);
      map = node.children;
    }
    if (node) {
      node.own += report.amount;
      if (node.desc === undefined && report.description) {
        const d = report.description.trim();
        node.desc = d.length > 400 ? d.slice(0, 397) + '…' : d;
      }
    }
  }

  const convert = (mutable: MutableNode, parentPath: string, depth: number): MemTreeNode => {
    const path = parentPath ? `${parentPath}/${mutable.name}` : mutable.name;
    const children = Array.from(mutable.children.values())
      .map((c) => convert(c, path, depth + 1))
      .sort((a, b) => b.total - a.total);
    const total = mutable.own + children.reduce((s, c) => s + c.total, 0);
    const node: MemTreeNode = {
      name: mutable.name,
      label: prettifySegment(mutable.name),
      own: mutable.own,
      total,
      desc: total >= DESC_MIN_BYTES && mutable.desc ? mutable.desc.slice(0, DESC_MAX_LEN) : undefined,
      children,
      depth,
    };
    if (depth === 0) {
      const note = topLevelNote(mutable.name);
      if (note) node.note = note;
    }
    return node;
  };

  return Array.from(rootChildren.values())
    .map((c) => convert(c, '', 0))
    .sort((a, b) => b.total - a.total);
}

function topLevelNote(name: string): string | undefined {
  if (name === 'explicit')
    return 'Memory that Firefox has identified in detail — the most trustworthy breakdown.';
  if (name.startsWith('js-main-runtime'))
    return 'JavaScript engine memory. This overlaps with (is already included in) the js section of "explicit".';
  if (name === 'window-objects')
    return 'Documents and windows. This overlaps with explicit/window-objects.';
  if (name === 'images') return 'Image memory. This overlaps with explicit/images.';
  if (name === 'heap') return 'Internals of the memory allocator — sub-parts of the "heap-allocated" number.';
  if (name === 'vsize' || name === 'address-space' || name === 'vsize-max-contiguous')
    return 'Virtual address space — NOT actual RAM usage. The OS reserves huge ranges that are never touched.';
  return undefined;
}

/* ------------------------------------------------------------------ */
/* Plain-english categorisation                                        */
/* ------------------------------------------------------------------ */

export interface CategoryMeta {
  label: string;
  icon: string;
  color: string;
  plain: string;
}

export const CATEGORY_META: Record<string, CategoryMeta> = {
  tabs: {
    label: 'Open tabs & pages',
    icon: 'globe',
    color: '#f97316',
    plain: 'The web pages you have open: their structure (DOM), styles and per-page data.',
  },
  javascript: {
    label: 'JavaScript engine',
    icon: 'braces',
    color: '#f59e0b',
    plain: 'Code, objects and data managed by the JavaScript engine — from websites and Firefox itself.',
  },
  images: {
    label: 'Images',
    icon: 'image',
    color: '#ec4899',
    plain: 'Decoded and compressed images kept in memory — photos, icons, canvases.',
  },
  storage: {
    label: 'Storage & databases',
    icon: 'database',
    color: '#a855f7',
    plain: 'Databases and site data: cookies, history, safe-browsing lists, caches.',
  },
  rendering: {
    label: 'Page rendering',
    icon: 'layout',
    color: '#f43f5e',
    plain: 'Computing how pages look: positioning, text runs, fonts and visual trees.',
  },
  network: {
    label: 'Networking',
    icon: 'network',
    color: '#14b8a6',
    plain: 'Connections, DNS lookups and network buffers.',
  },
  graphics: {
    label: 'Graphics',
    icon: 'gpu',
    color: '#06b6d4',
    plain: 'Drawing surfaces and buffers used to paint the screen.',
  },
  workers: {
    label: 'Background workers',
    icon: 'workers',
    color: '#84cc16',
    plain: 'Background scripts that pages and Firefox run outside the main thread.',
  },
  media: {
    label: 'Audio & video',
    icon: 'media',
    color: '#e879f9',
    plain: 'Buffers and decoders for playing media.',
  },
  startup: {
    label: 'Startup cache',
    icon: 'rocket',
    color: '#22c55e',
    plain: 'Pre-compiled scripts and data kept so Firefox starts faster.',
  },
  addons: {
    label: 'Add-ons & extensions',
    icon: 'puzzle',
    color: '#8b5cf6',
    plain: 'Memory used by the extensions you have installed.',
  },
  threads: {
    label: 'Program overhead',
    icon: 'cpu',
    color: '#64748b',
    plain: 'Thread stacks and other fixed costs of running the program.',
  },
  unclassified: {
    label: 'Unlabeled memory',
    icon: 'question',
    color: '#78716c',
    plain: 'Memory Firefox could not attribute to a specific feature. A little is normal.',
  },
  other: {
    label: 'Everything else',
    icon: 'box',
    color: '#a1a1aa',
    plain: 'Assorted smaller memory consumers.',
  },
};

/** Map a direct child segment of "explicit" to a canonical category id. */
export function categoryForSegment(segment: string): string {
  if (segment === 'window-objects' || segment === 'dom') return 'tabs';
  if (segment.startsWith('js') || segment === 'xpconnect' || segment === 'atoms') return 'javascript';
  if (segment === 'workers') return 'workers';
  if (
    segment === 'storage' ||
    segment === 'cert-storage' ||
    segment === 'cookie-service' ||
    segment === 'data-storage' ||
    segment === 'places'
  )
    return 'storage';
  if (segment === 'images') return 'images';
  if (segment === 'layout' || segment === 'font' || segment === 'fonts') return 'rendering';
  if (segment === 'network' || segment === 'necko' || segment === 'dns') return 'network';
  if (segment === 'gfx') return 'graphics';
  if (segment === 'media' || segment === 'audio' || segment === 'video') return 'media';
  if (segment === 'startup-cache' || segment === 'script-preloader') return 'startup';
  if (segment === 'add-ons' || segment === 'addons') return 'addons';
  if (segment === 'heap-unclassified' || segment === 'unclassified') return 'unclassified';
  if (segment === 'threads') return 'threads';
  return 'other';
}

const TOP_LEVEL_SCALARS = new Set([
  'resident',
  'resident-unique',
  'private',
  'vsize',
  'vsize-max-contiguous',
  'address-space',
  'heap-allocated',
  'system-heap-allocated',
  'shmem-allocated',
  'shmem-mapped',
  'heap-chunksize',
  'decommitted',
  'heap',
  'gfx-textures-peak',
  'gfx-tiles-waste',
]);

function metaFor(id: string): CategoryMeta {
  return CATEGORY_META[id] ?? CATEGORY_META.other;
}

function categoriesFromGroups(groups: MemTreeNode[]): Category[] {
  const sums = new Map<string, number>();
  for (const g of groups) {
    if (TOP_LEVEL_SCALARS.has(g.name)) continue;
    if (g.name === 'explicit') continue;
    if (g.total <= 0) continue;
    const id = categoryForSegment(g.name);
    sums.set(id, (sums.get(id) ?? 0) + g.total);
  }
  return Array.from(sums.entries())
    .filter(([, bytes]) => bytes > 0)
    .map(([id, bytes]) => ({ id, bytes, ...metaFor(id) }))
    .sort((a, b) => b.bytes - a.bytes);
}

function collectCategories(explicitRoot: MemTreeNode | undefined, tree: MemTreeNode[]): Category[] {
  // Preferred: direct children of "explicit" (each second-level group maps to a category)
  if (explicitRoot && explicitRoot.children.length > 0) {
    const sums = new Map<string, number>();
    for (const child of explicitRoot.children) {
      if (child.total <= 0) continue;
      const id = categoryForSegment(child.name);
      sums.set(id, (sums.get(id) ?? 0) + child.total);
    }
    return Array.from(sums.entries())
      .filter(([, bytes]) => bytes > 0)
      .map(([id, bytes]) => ({ id, bytes, ...metaFor(id) }))
      .sort((a, b) => b.bytes - a.bytes);
  }
  // Fallback (e.g. GPU process): use non-scalar top-level groups
  return categoriesFromGroups(tree);
}

/* ------------------------------------------------------------------ */
/* Friendly labels                                                     */
/* ------------------------------------------------------------------ */

const TAIL_WORDS: Record<string, string> = {
  'window-objects': 'page objects',
  'js-non-window': 'JS runtime',
  objects: 'JS objects',
  strings: 'JS strings',
  'script-sources': 'script source code',
  'script-data': 'script data',
  'shared-immutable-strings-cache': 'shared string cache',
  'compressed-script': 'compressed script cache',
  shapes: 'JS shapes',
  'type-inference': 'type-inference data',
  'gc-heap': 'GC heap',
  'nursery-committed': 'GC nursery',
  gc: 'garbage collector',
  'element-nodes': 'DOM elements',
  'text-nodes': 'DOM text',
  'comment-nodes': 'DOM comments',
  'media-query-lists': 'media queries',
  'other-dom': 'misc DOM',
  dom: 'DOM',
  styles: 'style rules',
  'style-sheets': 'CSS style sheets',
  'css-declaration': 'CSS declarations',
  'style-sets': 'style sets',
  layout: 'layout structures',
  frames: 'layout frames',
  'pres-shell': 'layout engine',
  'pres-shell-and-style': 'layout & style',
  lineboxes: 'text layout',
  sqlite: 'SQLite databases',
  'prefix-set': 'safe-browsing data',
  cookies: 'cookies',
  'cache-used': 'cache in use',
  network: 'network buffers',
  'decoded-images': 'decoded images',
  'decoded-image': 'decoded image',
  'source-of-vo': 'image source data',
  zones: 'JS zones',
  realms: 'JS realms',
  runtime: 'JS runtime',
  'script-preloader': 'script preloader',
  'memmapped-cache': 'memory-mapped cache',
  'startup-cache': 'startup cache',
  data: 'data',
  wasm: 'WebAssembly',
  'wasm-runtime': 'WebAssembly runtime',
  classes: 'JS classes',
  kernel: 'kernel stacks',
  stacks: 'thread stacks',
  'unused-gc-things': 'unused GC objects',
  'element-data': 'element data',
  misc: 'miscellaneous',
};

const GENERIC_SEGMENTS = new Set([
  'explicit',
  'active',
  'accessible',
  'cached',
  'inactive',
  'other',
]);

/** Extract a readable "site" from a top(...) / window(...) segment, if any. */
function siteFromSegment(segment: string): string | null {
  const m = segment.match(/^(?:top|window)\((.+)\)$/);
  if (!m) return null;
  const inner = unescapePathText(m[1]);
  const urlPart = inner.split(',')[0].trim().replace(/\/+$/, '');
  if (!urlPart) return null;
  if (urlPart.startsWith('moz-extension://')) {
    const rest = urlPart.slice('moz-extension://'.length);
    const uuid = rest.split('/')[0] || 'unknown';
    const file = rest.split('/').filter(Boolean)[1] || '';
    return file ? `Extension ${uuid.slice(0, 8)} (${file})` : `Extension ${uuid.slice(0, 8)}`;
  }
  if (urlPart.startsWith('file://')) return 'a local file';
  if (urlPart.startsWith('chrome://')) {
    const file = urlPart.split('/').pop() || 'Firefox UI';
    return `Firefox UI (${file})`;
  }
  if (urlPart.startsWith('about:')) return urlPart;
  if (urlPart.startsWith('resource://')) return shortenUrl(urlPart, 28);
  const hm = urlPart.match(/^(?:https?):\/\/([^/?#]+)/);
  if (hm && hm[1]) return hm[1].replace(/^www\./, '');
  return shortenUrl(urlPart, 30);
}

function humanizeConsumerPath(path: string): string {
  const segments = splitMemoryPath(path.replace(/^explicit\//, ''));
  let site: string | null = null;
  const words: string[] = [];

  for (const seg of segments) {
    const siteCandidate = siteFromSegment(seg);
    if (siteCandidate) {
      if (!site) site = siteCandidate;
      continue;
    }
    if (/^(js-zone|zone|realm|workers?)\(/.test(seg)) continue; // addresses / generic wrappers
    if (/^worker\(/.test(seg)) {
      const inner = seg.slice(seg.indexOf('(') + 1, seg.lastIndexOf(')'));
      const first = unescapePathText(inner).split(',')[0].trim();
      if (first) {
        const file = first.split('/').pop() || first;
        words.push(`Worker: ${file}`); // anchor word, most specific → goes last
      }
      continue;
    }
    if (/^\(id=\d+\)$/.test(seg) || /\(tid=\d+\)$/.test(seg)) continue;
    const bare = seg.trim();
    if (GENERIC_SEGMENTS.has(bare) || bare === '' || /^0x/i.test(bare)) continue;
    const known = TAIL_WORDS[bare];
    words.push(known ?? bare.replace(/[-_]/g, ' ').trim());
  }

  // prefer the most specific (deepest) words, dropping redundant prefixes
  const picked: string[] = [];
  for (let i = words.length - 1; i >= 0 && picked.length < 2; i--) {
    const w = words[i];
    if (!w) continue;
    if (picked.some((p) => p.toLowerCase() === w.toLowerCase())) continue;
    if (picked.some((p) => p.toLowerCase().includes(w.toLowerCase()))) continue;
    picked.unshift(w);
  }
  let core = picked
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' · ');
  if (!core) core = 'Memory';
  if (site) {
    const siteLabel = /^(an? |firefox)/i.test(site)
      ? site.charAt(0).toUpperCase() + site.slice(1)
      : site;
    return `${siteLabel} — ${core}`;
  }
  return core;
}

/** Friendly name for a process. */
export function describeProcess(raw: string): {
  label: string;
  kind: ProcessKind;
  subtitle: string;
  sites: string[];
  pid?: number;
} {
  const pidMatch = raw.match(/\(pid (\d+)/);
  const pid = pidMatch ? Number(pidMatch[1]) : undefined;
  const base = raw.replace(/\s*\(pid.*\)\s*$/, '').trim();

  const siteMatch = base.match(/^web(?:Isolated|COOP\+COEP)?=(.+)$/);
  if (siteMatch) {
    const siteRaw = siteMatch[1];
    const host = siteRaw.replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/^www\./, '');
    return {
      label: host || siteRaw,
      kind: 'web',
      subtitle: `A website's dedicated process (${siteRaw})`,
      sites: [host || siteRaw],
      pid,
    };
  }
  if (/^main( process)?$/i.test(base)) {
    return { label: 'Browser core', kind: 'main', subtitle: 'The brain of Firefox: window UI, tabs, engine management', sites: [], pid };
  }
  if (base === 'GPU') {
    return { label: 'Graphics (GPU)', kind: 'gpu', subtitle: 'Composites and paints the screen', sites: [], pid };
  }
  if (/^extension$/i.test(base)) {
    return { label: 'Extensions', kind: 'extension', subtitle: 'Runs your installed extensions', sites: [], pid };
  }
  if (base === 'Socket') {
    return { label: 'Networking', kind: 'socket', subtitle: 'Handles network connections', sites: [], pid };
  }
  if (base === 'RDD') {
    return { label: 'Media decoder', kind: 'rdd', subtitle: 'Decodes audio & video in a sandbox', sites: [], pid };
  }
  if (base.startsWith('Utility')) {
    return { label: 'Utility helper', kind: 'utility', subtitle: 'Sandboxed helper process', sites: [], pid };
  }
  if (base === 'prealloc') {
    return { label: 'Spare process', kind: 'prealloc', subtitle: 'Pre-launched so new tabs open faster', sites: [], pid };
  }
  if (base === 'privilegedabout') {
    return { label: 'Internal pages', kind: 'privilegedabout', subtitle: 'Built-in pages like about:memory', sites: [], pid };
  }
  if (base === 'ForkServer') {
    return { label: 'Process spawner', kind: 'forkserver', subtitle: 'Launches new content processes', sites: [], pid };
  }
  if (/^web/i.test(base)) {
    return { label: 'Web content', kind: 'web', subtitle: 'Loads and runs web pages', sites: [], pid };
  }
  return { label: base || 'Unknown', kind: 'other', subtitle: 'Firefox helper process', sites: [], pid };
}

/** Discover site names for a plain "web" process from its window-objects paths. */
function findSites(reports: RawReport[]): string[] {
  const hosts = new Set<string>();
  for (const r of reports) {
    if (r.units !== UNITS_BYTES) continue;
    const segs = splitMemoryPath(r.path);
    for (const seg of segs) {
      const m = seg.match(/^top\(([^,)]+)/);
      if (m) {
        const site = siteFromSegment(m[0]);
        if (site && !site.startsWith('about:')) hosts.add(site);
      }
    }
    if (hosts.size >= 4) break;
  }
  return Array.from(hosts);
}

/**
 * Full UUID form Firefox uses in moz-extension:// URLs. The strict shape guards
 * against picking up truncated URLs inside quoted string previews.
 */
const EXT_UUID_RE =
  /moz-extension:[/\\]+([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/gi;

/**
 * Group add-on memory per extension, aggregated across every process.
 *
 * A report row is a leaf measurement, so each row is attributed to at most one
 * add-on: the first moz-extension://<uuid> reference in its first path
 * alternative, wherever it appears —
 *   - top(moz-extension://uuid/page.html, …)  → the add-on's own windows
 *   - realm([Expanded Principal https://site, moz-extension://uuid/…])  → its
 *     content scripts running inside a web page
 *   - image(…, moz-extension://uuid/icon.png) / worker(moz-extension://…)
 * Only rows under "explicit/" count: top-level groups like
 * "js-main-runtime-realms" repeat the same memory and would double count.
 * References inside quoted string previews ("…") are ignored — that is string
 * CONTENT, not structure.
 */
function findExtensions(reports: RawReport[]): ExtensionInfo[] {
  const byId = new Map<string, { pages: Set<string>; bytes: number }>();
  for (const r of reports) {
    if (r.units !== UNITS_BYTES || r.amount === 0) continue;
    const first = splitPathAlternatives(r.path)[0] ?? r.path;
    if (!first.startsWith('explicit/')) continue;

    EXT_UUID_RE.lastIndex = 0;
    let match: RegExpExecArray | null;
    let valid: RegExpExecArray | null = null;
    while ((match = EXT_UUID_RE.exec(first)) !== null) {
      const i = match.index;
      const boundary =
        i === 0 ||
        first[i - 1] === '(' ||
        first[i - 1] === '[' ||
        (i >= 2 && first[i - 2] === ',' && first[i - 1] === ' ');
      if (boundary) {
        valid = match;
        break;
      }
    }
    if (!valid) continue;

    const uuid = valid[1];
    let entry = byId.get(uuid);
    if (!entry) {
      entry = { pages: new Set(), bytes: 0 };
      byId.set(uuid, entry);
    }
    entry.bytes += r.amount;
    if (entry.pages.size < 12) {
      const after = first.slice(valid.index + valid[0].length);
      const stop = after.search(/[,)\]]/);
      const rawRest = stop === -1 ? after : after.slice(0, stop);
      const file = unescapePathText(rawRest).split('/').filter(Boolean).pop();
      if (file) entry.pages.add(file);
    }
  }
  return Array.from(byId.entries())
    .map(([id, { pages, bytes }]) => ({
      id,
      shortId: id.slice(0, 8),
      pages: Array.from(pages).sort().slice(0, 12),
      bytes,
    }))
    .sort((a, b) => b.bytes - a.bytes);
}

/* ------------------------------------------------------------------ */
/* Top consumers                                                       */
/* ------------------------------------------------------------------ */

function collectConsumers(explicitRoot: MemTreeNode | undefined, tree: MemTreeNode[], limit: number): Consumer[] {
  const out: Consumer[] = [];
  const seen = new Set<string>();
  const walk = (node: MemTreeNode, nodePath: string, catId: string) => {
    if (node.children.length === 0 && node.own > 0) {
      if (!seen.has(nodePath)) {
        seen.add(nodePath);
        out.push({
          label: humanizeConsumerPath(nodePath),
          path: nodePath,
          bytes: node.own,
          categoryId: catId,
          desc: node.desc,
        });
      }
    } else {
      const childCat = node.depth <= 1 ? categoryForSegment(node.name) : catId;
      for (const c of node.children) walk(c, `${nodePath}/${c.name}`, childCat);
    }
  };
  if (explicitRoot) walk(explicitRoot, 'explicit', 'other');
  else for (const top of tree) walk(top, top.name, 'other');
  out.sort((a, b) => b.bytes - a.bytes);
  return out.slice(0, limit);
}

/* ------------------------------------------------------------------ */
/* Main processor                                                      */
/* ------------------------------------------------------------------ */

function findNode(tree: MemTreeNode[], name: string): MemTreeNode | undefined {
  return tree.find((n) => n.name === name);
}

export function processMemoryReport(text: string, fileName: string): ProcessedReport {
  const { version, reports } = parseMemoryReportJson(text);

  const byProcess = new Map<string, RawReport[]>();
  for (const r of reports) {
    let list = byProcess.get(r.process);
    if (!list) {
      list = [];
      byProcess.set(r.process, list);
    }
    list.push(r);
  }

  const processes: ProcessInfo[] = [];
  for (const [rawName, preports] of byProcess) {
    const described = describeProcess(rawName);
    const tree = buildTree(preports);

    const scalar = (name: string): number => {
      const n = findNode(tree, name);
      return n ? n.own || n.total : 0;
    };
    const resident = scalar('resident');
    const residentUnique = scalar('resident-unique');
    const privateBytes = scalar('private');
    const heapAllocated = scalar('heap-allocated');

    const explicitRoot = tree.find((n) => n.name === 'explicit');
    const explicitTotal = explicitRoot ? explicitRoot.total : 0;
    const unclassified = explicitRoot
      ? explicitRoot.children.find((c) => c.name === 'heap-unclassified')
      : undefined;

    const sites = described.kind === 'web' && described.sites.length === 0 ? findSites(preports) : described.sites;
    let subtitle = sites.length > 0 ? `Website: ${sites.join(', ')}` : described.subtitle;

    const extensions = findExtensions(preports);
    if (described.kind === 'extension' && extensions.length > 0) {
      subtitle = `${described.subtitle} — ${extensions.length} add-on${
        extensions.length === 1 ? '' : 's'
      } detected`;
    }

    processes.push({
      id: rawName,
      rawName,
      label: described.label,
      kind: described.kind,
      pid: described.pid,
      subtitle,
      sites,
      resident,
      residentUnique,
      privateBytes,
      heapAllocated,
      explicitTotal,
      unclassifiedBytes: unclassified ? unclassified.total : 0,
      categories: collectCategories(explicitRoot, tree),
      extensions,
      tree,
      topConsumers: collectConsumers(explicitRoot, tree, 12),
      reportCount: preports.length,
    });
  }

  processes.sort((a, b) => b.resident - a.resident);

  return {
    fileName,
    version,
    generatedAt: new Date().toISOString(),
    totalResident: processes.reduce((s, p) => s + p.resident, 0),
    processes,
  };
}

/* ------------------------------------------------------------------ */
/* Formatting helpers (shared client+server)                           */
/* ------------------------------------------------------------------ */

export function formatBytes(bytes: number, compact = false): string {
  const abs = Math.abs(bytes);
  const sign = bytes < 0 ? '-' : '';
  const kb = 1024;
  const mb = kb * 1024;
  const gb = mb * 1024;
  if (abs >= gb) return `${sign}${(abs / gb).toFixed(2)} GB`;
  if (abs >= mb) return `${sign}${(abs / mb).toFixed(abs >= 100 * mb || compact ? 0 : 1)} MB`;
  if (abs >= kb) return `${sign}${(abs / kb).toFixed(abs >= 100 * kb || compact ? 0 : 1)} KB`;
  return `${sign}${abs} B`;
}

export function percentOf(part: number, whole: number): number {
  if (whole <= 0) return 0;
  return (part / whole) * 100;
}
