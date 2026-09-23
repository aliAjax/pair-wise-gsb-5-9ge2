// 判定层：语义化版本与版本区间引擎（semver 子集）
// 区间统一表示为 [下界, 上界]，null 表示无界；inclusive 表示端点开闭

import type {Advisory} from '../data/types';

export interface SemVer {
  major: number;
  minor: number;
  patch: number;
}

export interface Interval {
  low: SemVer | null;
  lowInclusive: boolean;
  high: SemVer | null;
  highInclusive: boolean;
}

export function parseVersion(input: string): SemVer | null {
  const m = input.trim().match(/^v?(\d+)(?:\.(\d+))?(?:\.(\d+))?(?:[-+].*)?$/);
  if (!m) return null;
  return {
    major: Number(m[1]),
    minor: Number(m[2] ?? 0),
    patch: Number(m[3] ?? 0),
  };
}

export function cmpVersion(a: SemVer, b: SemVer): number {
  return a.major - b.major || a.minor - b.minor || a.patch - b.patch;
}

export function formatVersion(v: SemVer): string {
  return `${v.major}.${v.minor}.${v.patch}`;
}

const FULL: Interval = {low: null, lowInclusive: true, high: null, highInclusive: true};

/** 解析单条区间表达式：>=, <=, >, <, =, ^, ~, x 通配, 精确版本，空格表示 AND，"||" 表示 OR */
export function parseRange(expr: string): Interval[] {
  const orParts = expr.split('||').map((s) => s.trim()).filter(Boolean);
  if (orParts.length === 0) return [];
  return orParts.map((part) => {
    if (part === '*' || part === '' || part.toLowerCase() === 'x') return FULL;
    return part.split(/\s+/).map(parseComparator).reduce(intersect, FULL);
  });
}

function parseComparator(token: string): Interval {
  const t = token.trim();
  let op = '=';
  let body = t;
  const m = t.match(/^(>=|<=|>|<|=|\^|~)/);
  if (m) {
    op = m[1];
    body = t.slice(op.length).trim();
  }
  // x 通配：1.x / 1.2.x
  const xm = body.match(/^v?(\d+)(?:\.(\d+|[xX*]))?(?:\.(\d+|[xX*]))?/);
  const isX = (s: string | undefined) => s === undefined || s === 'x' || s === 'X' || s === '*';
  if (op === '=' && xm && (isX(xm[2]) || (xm[2] !== undefined && isX(xm[3])))) {
    const major = Number(xm[1]);
    if (isX(xm[2])) {
      return {low: {major, minor: 0, patch: 0}, lowInclusive: true, high: {major: major + 1, minor: 0, patch: 0}, highInclusive: false};
    }
    const minor = Number(xm[2]);
    return {low: {major, minor, patch: 0}, lowInclusive: true, high: {major, minor: minor + 1, patch: 0}, highInclusive: false};
  }
  const v = parseVersion(body);
  if (!v) return {low: null, lowInclusive: true, high: null, highInclusive: true};
  switch (op) {
    case '>':
      return {low: v, lowInclusive: false, high: null, highInclusive: true};
    case '>=':
      return {low: v, lowInclusive: true, high: null, highInclusive: true};
    case '<':
      return {low: null, lowInclusive: true, high: v, highInclusive: false};
    case '<=':
      return {low: null, lowInclusive: true, high: v, highInclusive: true};
    case '^': {
      // ^1.2.3 := >=1.2.3 <2.0.0（major=0 时按 semver 规则收缩到次版本）
      const high = v.major > 0 ? {major: v.major + 1, minor: 0, patch: 0}
        : v.minor > 0 ? {major: 0, minor: v.minor + 1, patch: 0}
        : {major: 0, minor: 0, patch: v.patch + 1};
      return {low: v, lowInclusive: true, high, highInclusive: false};
    }
    case '~': {
      // ~1.2.3 := >=1.2.3 <1.3.0
      return {low: v, lowInclusive: true, high: {major: v.major, minor: v.minor + 1, patch: 0}, highInclusive: false};
    }
    default:
      // 精确版本：[v, v]
      return {low: v, lowInclusive: true, high: v, highInclusive: true};
  }
}

/** 区间是否可解析（供界面表单校验） */
export function isValidRange(expr: string): boolean {
  if (!expr.trim()) return false;
  const ivs = parseRange(expr);
  return ivs.length > 0 && ivs.every((iv) => iv.low === null || iv.high === null || cmpVersion(iv.low, iv.high) <= 0);
}

function intersect(a: Interval, b: Interval): Interval {
  // 取更大的下界、更小的上界
  let low: SemVer | null = a.low;
  let lowInclusive = a.lowInclusive;
  if (b.low !== null && (low === null || cmpVersion(b.low, low) > 0)) {
    low = b.low;
    lowInclusive = b.lowInclusive;
  } else if (b.low !== null && low !== null && cmpVersion(b.low, low) === 0) {
    lowInclusive = a.lowInclusive && b.lowInclusive;
  }
  let high: SemVer | null = a.high;
  let highInclusive = a.highInclusive;
  if (b.high !== null && (high === null || cmpVersion(b.high, high) < 0)) {
    high = b.high;
    highInclusive = b.highInclusive;
  } else if (b.high !== null && high !== null && cmpVersion(b.high, high) === 0) {
    highInclusive = a.highInclusive && b.highInclusive;
  }
  return {low, lowInclusive, high, highInclusive};
}

function inInterval(v: SemVer, iv: Interval): boolean {
  if (iv.low !== null) {
    const c = cmpVersion(v, iv.low);
    if (c < 0 || (c === 0 && !iv.lowInclusive)) return false;
  }
  if (iv.high !== null) {
    const c = cmpVersion(v, iv.high);
    if (c > 0 || (c === 0 && !iv.highInclusive)) return false;
  }
  return true;
}

/** 版本是否命中区间表达式（任意一段 OR 命中即算） */
export function satisfies(version: string, expr: string): boolean {
  const v = parseVersion(version);
  if (!v) return false;
  return parseRange(expr).some((iv) => inInterval(v, iv));
}

function ivOverlap(a: Interval, b: Interval): boolean {
  // 以两端是否互相排斥判断
  if (a.high !== null && b.low !== null) {
    const c = cmpVersion(a.high, b.low);
    if (c < 0 || (c === 0 && !(a.highInclusive && b.lowInclusive))) return false;
  }
  if (b.high !== null && a.low !== null) {
    const c = cmpVersion(b.high, a.low);
    if (c < 0 || (c === 0 && !(b.highInclusive && a.lowInclusive))) return false;
  }
  return true;
}

/** 两个区间表达式是否在任一 OR 段上重叠 */
export function rangesOverlap(aExpr: string, bExpr: string): boolean {
  const as = parseRange(aExpr);
  const bs = parseRange(bExpr);
  return as.some((a) => bs.some((b) => ivOverlap(a, b)));
}

/** 合并重叠的区间表达式，返回并集；有交集/相接的段会融合 */
export function unionRanges(expressions: string[]): Interval[] {
  const ivs = expressions.flatMap(parseRange).sort((a, b) => {
    const la = a.low;
    const lb = b.low;
    if (la === null) return -1;
    if (lb === null) return 1;
    return cmpVersion(la, lb) || Number(b.lowInclusive) - Number(a.lowInclusive);
  });
  const merged: Interval[] = [];
  for (const iv of ivs) {
    const last = merged[merged.length - 1];
    if (last && ivOverlap(last, iv)) {
      if (iv.high === null) {
        last.high = null;
        last.highInclusive = true;
      } else if (last.high === null) {
        // 保持无上界
      } else if (cmpVersion(iv.high, last.high) > 0 || (cmpVersion(iv.high, last.high) === 0 && iv.highInclusive)) {
        last.high = iv.high;
        last.highInclusive = iv.highInclusive;
      }
    } else {
      merged.push({...iv});
    }
  }
  return merged;
}

/** 将区间集合格式化为可读表达式，作为公告合并后受影响区间的"原值" */
export function formatIntervals(ivs: Interval[]): string {
  if (ivs.length === 0) return '';
  return ivs.map((iv) => {
    if (iv.low === null && iv.high === null) return '*';
    if (iv.low && iv.high && cmpVersion(iv.low, iv.high) === 0 && iv.lowInclusive && iv.highInclusive) {
      return formatVersion(iv.low);
    }
    const parts: string[] = [];
    if (iv.low) parts.push(`${iv.lowInclusive ? '>=' : '>'}${formatVersion(iv.low)}`);
    if (iv.high) parts.push(`${iv.highInclusive ? '<=' : '<'}${formatVersion(iv.high)}`);
    return parts.join(' ');
  }).join(' || ');
}

/** 公告当前是否命中某个依赖版本 */
export function advisoryHits(a: Advisory, version: string): boolean {
  return satisfies(version, a.affectedRange);
}
