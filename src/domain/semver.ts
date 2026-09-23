// 资料层：语义化版本与受影响区间
// 纯函数，不依赖 React / localStorage，便于单独验证。

export interface SemVer {
  major: number;
  minor: number;
  patch: number;
  pre: (string | number)[] | null;
}

/** 解析 1.2.3 / v1.2.3 / 1.2.3-beta.1；失败返回 null（build 元数据忽略）。 */
export function parseVersion(raw: string): SemVer | null {
  const m = String(raw ?? '')
    .trim()
    .replace(/^v/i, '')
    .match(/^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+.*)?$/);
  if (!m) return null;
  const pre =
    m[4] === undefined
      ? null
      : m[4].split('.').map((p) => (/^\d+$/.test(p) ? Number(p) : p));
  return { major: Number(m[1]), minor: Number(m[2]), patch: Number(m[3]), pre };
}

function cmpPre(a: (string | number)[] | null, b: (string | number)[] | null): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1; // 正式版 > 预发布
  if (b === null) return -1;
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) {
    if (i >= a.length) return -1;
    if (i >= b.length) return 1;
    const x = a[i];
    const y = b[i];
    if (typeof x === 'number' && typeof y === 'number') {
      if (x !== y) return x < y ? -1 : 1;
    } else if (typeof x === 'number') return -1; // 数字标识符 < 字符串
    else if (typeof y === 'number') return 1;
    else if (x !== y) return x < y ? -1 : 1;
  }
  return 0;
}

/** 语义版本比较：a<b 为 -1，相等 0，a>b 为 1。入参须为合法版本。 */
export function compareVersions(a: string, b: string): number {
  const va = parseVersion(a)!;
  const vb = parseVersion(b)!;
  for (const k of ['major', 'minor', 'patch'] as const) {
    if (va[k] !== vb[k]) return va[k] < vb[k] ? -1 : 1;
  }
  return cmpPre(va.pre, vb.pre);
}

/** 闭开边界表示的一段连续版本区间；null 表示 ±∞。 */
export interface Interval {
  low: string | null;
  lowInclusive: boolean;
  high: string | null;
  highInclusive: boolean;
}

export const FULL: Interval = { low: null, lowInclusive: true, high: null, highInclusive: true };

/** 取两个下界中更大的一个（相等时开区间更大）。 */
function greaterLow(a: Interval, b: Interval): { v: string | null; inclusive: boolean } {
  if (a.low === null) return { v: b.low, inclusive: b.lowInclusive };
  if (b.low === null) return { v: a.low, inclusive: a.lowInclusive };
  const c = compareVersions(a.low, b.low);
  if (c > 0) return { v: a.low, inclusive: a.lowInclusive };
  if (c < 0) return { v: b.low, inclusive: b.lowInclusive };
  return { v: a.low, inclusive: a.lowInclusive && b.lowInclusive };
}

/** 取两个上界中更小的一个（相等时开区间更小）。 */
function smallerHigh(a: Interval, b: Interval): { v: string | null; inclusive: boolean } {
  if (a.high === null) return { v: b.high, inclusive: b.highInclusive };
  if (b.high === null) return { v: a.high, inclusive: a.highInclusive };
  const c = compareVersions(a.high, b.high);
  if (c < 0) return { v: a.high, inclusive: a.highInclusive };
  if (c > 0) return { v: b.high, inclusive: b.highInclusive };
  return { v: a.high, inclusive: a.highInclusive && b.highInclusive };
}

function chooseLow(a: Interval, b: Interval) {
  // 并集用：更小的下界，相等时闭区间更小
  if (a.low === null || b.low === null) return { v: null, inclusive: true };
  const c = compareVersions(a.low, b.low);
  if (c < 0) return { v: a.low, inclusive: a.lowInclusive };
  if (c > 0) return { v: b.low, inclusive: b.lowInclusive };
  return { v: a.low, inclusive: a.lowInclusive || b.lowInclusive };
}

function chooseHigh(a: Interval, b: Interval) {
  if (a.high === null || b.high === null) return { v: null, inclusive: true };
  const c = compareVersions(a.high, b.high);
  if (c > 0) return { v: a.high, inclusive: a.highInclusive };
  if (c < 0) return { v: b.high, inclusive: b.highInclusive };
  return { v: a.high, inclusive: a.highInclusive || b.highInclusive };
}

/** 两区间交集；无交集返回 null。 */
export function intersect(a: Interval, b: Interval): Interval | null {
  const low = greaterLow(a, b);
  const high = smallerHigh(a, b);
  if (low.v !== null && high.v !== null) {
    const c = compareVersions(low.v, high.v);
    if (c > 0) return null;
    if (c === 0 && !(low.inclusive && high.inclusive)) return null;
  }
  return { low: low.v, lowInclusive: low.inclusive, high: high.v, highInclusive: high.inclusive };
}

/**
 * 区间是否重叠（有正长度交集，或在同一版本点同时闭区间）。
 * 仅端点相触（如 <2.0.0 与 >=2.0.0）不算重叠，不合并来源。
 */
export function intervalsOverlap(a: Interval, b: Interval): boolean {
  return intersect(a, b) !== null;
}

export function rangesOverlap(a: Interval[], b: Interval[]): boolean {
  return a.some((x) => b.some((y) => intervalsOverlap(x, y)));
}

/** 并集（仅在重叠时有意义）。 */
export function union(a: Interval, b: Interval): Interval {
  const low = chooseLow(a, b);
  const high = chooseHigh(a, b);
  return { low: low.v, lowInclusive: low.inclusive, high: high.v, highInclusive: high.inclusive };
}

/** 多区间求并，合并所有相互重叠的区间。 */
export function mergeRanges(list: Interval[]): Interval[] {
  const sorted = [...list].sort((a, b) => {
    if (a.low === null) return -1;
    if (b.low === null) return 1;
    return compareVersions(a.low, b.low);
  });
  const out: Interval[] = [];
  for (const iv of sorted) {
    const last = out[out.length - 1];
    if (last && intervalsOverlap(last, iv)) out[out.length - 1] = union(last, iv);
    else out.push(iv);
  }
  return out;
}

export function rangeContains(ranges: Interval[], version: string): boolean {
  if (!parseVersion(version)) return false;
  return ranges.some((i) => {
    if (i.low !== null) {
      const c = compareVersions(version, i.low);
      if (c < 0 || (c === 0 && !i.lowInclusive)) return false;
    }
    if (i.high !== null) {
      const c = compareVersions(version, i.high);
      if (c > 0 || (c === 0 && !i.highInclusive)) return false;
    }
    return true;
  });
}

function atom(op: string, rawVer: string): Interval[] {
  // 通配段归一：1.x / 1.* / 1
  const parts = rawVer.split('.');
  const nums: (number | null)[] = parts.map((p) =>
    p === '' || p === 'x' || p === 'X' || p === '*' ? null : /^\d+$/.test(p) ? Number(p) : NaN,
  );
  if (nums.some((n) => Number.isNaN(n))) throw new Error(`无法识别的版本段：${rawVer}`);
  const [M, m, p] = [nums[0] ?? null, nums[1] ?? null, nums[2] ?? null];
  const v = (major: number, minor: number, patch: number) => `${major}.${minor}.${patch}`;

  if (op === '>' || op === '>=' || op === '<' || op === '<=') {
    if (M === null) {
      // >* 之类无意义
      if (op[0] === '>') throw new Error('下界不能作用于通配版本');
      return [FULL];
    }
    const val = v(M, m ?? 0, p ?? 0);
    const inclusive = op.length === 2;
    return op[0] === '>'
      ? [{ low: val, lowInclusive: inclusive, high: null, highInclusive: true }]
      : [{ low: null, lowInclusive: true, high: val, highInclusive: inclusive }];
  }

  if (M === null) return [FULL]; // * / x

  if (op === '^') {
    const low = v(M, m ?? 0, p ?? 0);
    let high: string;
    if (M > 0) high = v(M + 1, 0, 0);
    else if (m === null) high = v(M + 1, 0, 0); // ^1 等价于 ^1.0.0
    else if (m > 0) high = v(0, m + 1, 0);
    else if (p === null) high = v(0, m + 1, 0);
    else high = v(0, 0, p + 1);
    return [{ low, lowInclusive: true, high, highInclusive: false }];
  }

  if (op === '~') {
    const low = v(M, m ?? 0, p ?? 0);
    const high = m === null ? v(M + 1, 0, 0) : v(M, m + 1, 0);
    return [{ low, lowInclusive: true, high, highInclusive: false }];
  }

  // 精确 / 缺省：1.2.3 为点；1.2 与 1 为通配区间
  if (m === null) return [{ low: v(M, 0, 0), lowInclusive: true, high: v(M + 1, 0, 0), highInclusive: false }];
  if (p === null) return [{ low: v(M, m, 0), lowInclusive: true, high: v(M, m + 1, 0), highInclusive: false }];
  const point = v(M, m, p);
  return [{ low: point, lowInclusive: true, high: point, highInclusive: true }];
}

/**
 * 解析受影响版本区间，条件之间（空格/逗号分隔）为“且”。
 * 支持 >= > <= < = ^ ~ 与 x 通配，例如 ">=4.0.0 <4.17.21"、"^1.2.0"、"1.2.x"。
 * 非法区间抛错（含中文说明），录入时直接反馈。
 */
export function parseRange(input: string): Interval[] {
  let raw = String(input ?? '').trim();
  // 连写区间 1.2.3 - 2.0.0（两端为裸版本），先改写成 >=low <=high
  raw = raw.replace(
    /(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)\s+-\s+(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)/g,
    '>=$1 <=$2',
  );
  const tokens = raw.split(/[\s,]+/).filter(Boolean);
  if (tokens.length === 0) throw new Error('受影响区间不能为空');

  let acc: Interval = FULL;
  for (const tk of tokens) {
    const m = tk.match(/^(>=|<=|~|\^|>|<|=)?(.*)$/);
    const op = (m![1] ?? '') as string;
    const ver = m![2];
    if (!ver) throw new Error(`无法识别的区间条件：${tk}`);
    for (const iv of atom(op || '=', ver)) {
      const next = intersect(acc, iv);
      if (!next) throw new Error(`区间条件在 “${tk}” 处互相冲突，没有任何版本同时满足`);
      acc = next;
    }
  }
  return [acc];
}

export function safeParseRange(input: string): Interval[] {
  try {
    return parseRange(input);
  } catch {
    return [];
  }
}

export function formatInterval(i: Interval): string {
  if (i.low === null && i.high === null) return '*';
  if (i.low !== null && i.high !== null && compareVersions(i.low, i.high) === 0) return i.low;
  const lo = i.low === null ? '' : `${i.lowInclusive ? '>=' : '>'}${i.low}`;
  const hi = i.high === null ? '' : `${i.highInclusive ? '<=' : '<'}${i.high}`;
  return [lo, hi].filter(Boolean).join(' ');
}

export function formatRanges(ranges: Interval[]): string {
  return ranges.length ? ranges.map(formatInterval).join(' , ') : '区间解析失败';
}
