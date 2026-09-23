// 判定层：公告策略引擎
// 规则全部集中于此，界面与存储层不自行做安全判定

import type {Advisory, Dependency, Severity} from '../data/types';
import {OPEN_STATUSES, SEVERITY_ORDER} from '../data/types';
import {
  advisoryHits,
  formatIntervals,
  rangesOverlap,
  satisfies,
  unionRanges,
} from './versionRange';

/** 规则标识（受阻面板中"命中规则"列引用这些常量） */
export const RULE_FIXED_IN_RANGE = 'R1 修复版本仍落在受影响区间';
export const RULE_OWNER_MISSING = 'R2 缺少责任人';
export const RULE_HIGH_OPEN_BLOCKS_RELEASE = 'R3 未关闭的高危/严重公告命中当前版本 → 阻止发布';
/** 严重级别达到 high 即参与发布拦截 */
export const BLOCKING_MIN_SEVERITY: Severity = 'high';

export interface ClassifyResult {
  status: Advisory['status'];
  draftReason?: string;
}

/** 草稿裁定：修复版本仍在受影响区间，或缺少责任人 → 只能保留草稿 */
export function classifyAdvisory(a: Pick<Advisory, 'affectedRange' | 'fixedVersion' | 'owner'>): ClassifyResult {
  const reasons: string[] = [];
  if (!a.owner.trim()) reasons.push(RULE_OWNER_MISSING);
  if (a.fixedVersion.trim() && satisfies(a.fixedVersion, a.affectedRange)) {
    reasons.push(`${RULE_FIXED_IN_RANGE}（修复版本 ${a.fixedVersion} ∈ ${a.affectedRange}）`);
  }
  if (reasons.length) return {status: 'draft', draftReason: reasons.join('；')};
  return {status: 'active'};
}

export interface MergeResult {
  advisories: Advisory[];
  merged: {kept: Advisory; absorbed: Advisory[]}[];
}

function mergeSeverity(a: Severity, b: Severity): Severity {
  return SEVERITY_ORDER[a] >= SEVERITY_ORDER[b] ? a : b;
}

/** 较晚的修复版本（空值视为无修复，排序在最后） */
function maxFixedVersion(a: string, b: string): string {
  if (!a) return b;
  if (!b) return a;
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d > 0 ? a : b;
  }
  return a;
}

function earliestDate(a: string, b: string): string {
  if (!a) return b;
  if (!b) return a;
  return a < b ? a : b;
}

/**
 * 录入新公告：与同依赖、开放状态、受影响区间重叠的公告合并来源。
 * - 区间取并集，严重级别取最高，修复版本取较晚者，截止日取最早，责任人取首个非空
 * - 合并后重新裁定 active/draft；被吸收的公告删除
 * - 已关闭/已归档的公告不参与合并
 */
export function ingestAdvisory(list: Advisory[], incoming: Advisory): MergeResult {
  const mergeWith = list.filter(
    (a) =>
      a.depId === incoming.depId &&
      OPEN_STATUSES.includes(a.status) &&
      rangesOverlap(a.affectedRange, incoming.affectedRange),
  );

  if (mergeWith.length === 0) {
    const c = classifyAdvisory(incoming);
    return {advisories: [...list, {...incoming, ...c}], merged: []};
  }

  const absorbed = mergeWith.slice();
  // 既有公告在前、新录入在后，保证合并后来源顺序稳定（最早录入者为主）
  const group = [...mergeWith, incoming];
  const sources = Array.from(new Set(group.flatMap((a) => a.sources)));
  const union = formatIntervals(unionRanges(group.map((a) => a.affectedRange)));
  const severity = group.reduce<Severity>((acc, a) => mergeSeverity(acc, a.severity), 'low');
  const fixedVersion = group.map((a) => a.fixedVersion).reduce(maxFixedVersion, '');
  const owner = group.map((a) => a.owner).find((o) => o.trim()) ?? '';
  const dueDate = group.map((a) => a.dueDate).reduce(earliestDate, '');
  // 保留最早创建、最晚更新的条目作为主公告
  const earliest = group.reduce((x, y) => (x.createdAt < y.createdAt ? x : y));
  const latest = group.reduce((x, y) => (x.updatedAt > y.updatedAt ? x : y));

  const titles = Array.from(new Set(group.map((a) => a.title)));
  const primary = titles[0];
  const extra = titles.slice(1);
  const title = extra.length ? `${primary}（合并 ${extra.length} 条同源公告）` : primary;

  const mergedAdvisory: Advisory = {
    ...earliest,
    title,
    affectedRange: union,
    severity,
    fixedVersion,
    owner,
    dueDate,
    sources,
    updatedAt: latest.updatedAt,
  };
  const c = classifyAdvisory(mergedAdvisory);
  const finalAdvisory: Advisory = {...mergedAdvisory, ...c};

  const absorbedIds = new Set(absorbed.map((a) => a.id));
  const rest = list.filter((a) => !absorbedIds.has(a.id));
  return {advisories: [...rest, finalAdvisory], merged: [{kept: finalAdvisory, absorbed}]};
}

/** 编辑公告（责任人 / 修复版本 / 截止日）后重新裁定草稿状态 */
export function reclassify(a: Advisory): Advisory {
  if (a.status === 'closed' || a.status === 'archived') return a;
  return {...a, ...classifyAdvisory(a)};
}

export interface RescanResult {
  advisories: Advisory[];
  archived: Advisory[];
}

/**
 * 升级后重新扫描：开放公告若不再命中依赖当前版本，归档为历史。
 * 草稿同样参与（升级后命中解除即归档），关闭状态保持不动。
 */
export function rescanDependency(
  list: Advisory[],
  dep: Dependency,
): RescanResult {
  const now = new Date().toISOString();
  const archived: Advisory[] = [];
  const advisories = list.map((a) => {
    if (a.depId !== dep.id || a.status === 'closed' || a.status === 'archived') return a;
    if (!advisoryHits(a, dep.version)) {
      archived.push(a);
      return {...a, status: 'archived' as const, updatedAt: now};
    }
    return a;
  });
  return {advisories, archived};
}

export interface Blocker {
  dep: Dependency;
  advisory: Advisory;
  rule: string;
  /** 受阻展示所需的原值 */
  evidence: {
    depVersion: string;
    affectedRange: string;
    severity: Severity;
    fixedVersion: string;
    status: Advisory['status'];
  };
}

/** 计算阻止某依赖发布的公告：未关闭(draft 不算)、级别≥high、命中当前版本 */
export function releaseBlockers(dep: Dependency, advisories: Advisory[]): Blocker[] {
  return advisories
    .filter(
      (a) =>
        a.depId === dep.id &&
        a.status === 'active' &&
        SEVERITY_ORDER[a.severity] >= SEVERITY_ORDER[BLOCKING_MIN_SEVERITY] &&
        advisoryHits(a, dep.version),
    )
    .map((a) => ({
      dep,
      advisory: a,
      rule: `${RULE_HIGH_OPEN_BLOCKS_RELEASE}（当前 ${dep.version} ∈ ${a.affectedRange}）`,
      evidence: {
        depVersion: dep.version,
        affectedRange: a.affectedRange,
        severity: a.severity,
        fixedVersion: a.fixedVersion || '上游未发布',
        status: a.status,
      },
    }));
}

/** 依赖发布结论（刷新后依然一致：纯函数，从原始状态推导） */
export type ReleaseVerdict = 'releasable' | 'blocked' | 'not-requested';

export function releaseVerdict(dep: Dependency, advisories: Advisory[]): ReleaseVerdict {
  if (!dep.releaseIntent) return 'not-requested';
  return releaseBlockers(dep, advisories).length ? 'blocked' : 'releasable';
}
