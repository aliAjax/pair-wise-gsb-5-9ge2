// 判定层：公告合并、草稿规则、高危阻断、升级重扫归档。
// 所有结论都是纯派生：state 是唯一事实来源，刷新后结论必然一致。

import {
  Interval,
  compareVersions,
  formatRanges,
  mergeRanges,
  parseRange,
  parseVersion,
  rangeContains,
  rangesOverlap,
  safeParseRange,
} from './semver';

export type Severity = 'critical' | 'high' | 'medium' | 'low';

export const SEVERITY_RANK: Record<Severity, number> = {
  critical: 3,
  high: 2,
  medium: 1,
  low: 0,
};

export const SEVERITY_LABEL: Record<Severity, string> = {
  critical: '严重',
  high: '高危',
  medium: '中危',
  low: '低危',
};

export const HIGH_SEVERITIES: Severity[] = ['critical', 'high'];

/** 录入的原始公告（资料），一条来源一条。 */
export interface AdvisorySource {
  advisoryId: string;
  origin: string; // GHSA / CVE / OSV / 内部审核 …
  severity: Severity;
  affectedRange: string; // 原始区间文本
  fixedVersion: string | null; // 原始建议修复版本
  title: string;
  fetchedAt: string;
}

export interface Dep {
  id: number;
  name: string;
  version: string;
  license: string;
  source: string;
  note: string;
  releaseMarked: boolean; // 是否被标为“可发布”
}

/** 处置票据：多个区间重叠的来源合并而成。 */
export interface Ticket {
  id: number;
  depId: number;
  sources: AdvisorySource[];
  mergedRange: Interval[]; // 合并后的受影响区间（结构化）
  mergedRangeText: string;
  severity: Severity; // 取来源最高级
  fixedVersion: string | null; // 取最高有效修复版本
  owner: string;
  dueDate: string | null;
  lifecycle: 'active' | 'closed' | 'archived';
  closedNote: string | null;
  createdAt: string;
}

export type RecordKind =
  | 'intake'
  | 'merge'
  | 'update'
  | 'block'
  | 'release'
  | 'upgrade'
  | 'archive'
  | 'close'
  | 'add';

export interface ActionRecord {
  id: number;
  at: string;
  kind: RecordKind;
  depId: number;
  depName: string;
  ticketId?: number;
  text: string;
}

export interface AppState {
  deps: Dep[];
  tickets: Ticket[];
  records: ActionRecord[];
  seq: number;
}

// ---------- 纯判定 ----------

export const isHigh = (s: Severity) => HIGH_SEVERITIES.includes(s);

export function sourcesOf(t: Ticket): AdvisorySource[] {
  return [...t.sources].sort((a, b) => t.sources.indexOf(a) - t.sources.indexOf(b));
}

/** 合并后最高严重级别 */
export function topSeverity(list: AdvisorySource[]): Severity {
  return list.reduce<Severity>((acc, s) => (SEVERITY_RANK[s.severity] > SEVERITY_RANK[acc] ? s.severity : acc), 'low');
}

/** 最高的有效修复版本（可解析即参与比较） */
export function bestFixedVersion(list: AdvisorySource[]): string | null {
  return list.reduce<string | null>((best, s) => {
    const fv = s.fixedVersion?.trim() || null;
    if (!fv) return best;
    if (!best) return fv;
    return compareVersions(fv, best) > 0 ? fv : best;
  }, null);
}

/** 合并区间：把所有来源区间求并并重新编号（相互重叠的合并为一段）。 */
export function mergeSourceRanges(list: AdvisorySource[]): { ranges: Interval[]; text: string } {
  const ranges = mergeRanges(list.flatMap((s) => safeParseRange(s.affectedRange)));
  return { ranges, text: formatRanges(ranges) };
}

export type DraftReason = 'missing-owner' | 'no-fixed' | 'fixed-in-range' | 'no-dep' | 'range-invalid';

export const DRAFT_REASON_TEXT: Record<DraftReason, string> = {
  'missing-owner': '缺少责任人',
  'no-fixed': '没有可落地的修复版本',
  'fixed-in-range': '建议修复版本仍落在受影响区间内',
  'no-dep': '依赖不存在或已删除',
  'range-invalid': '来源区间无法解析',
};

export interface DraftCheck {
  isDraft: boolean;
  reasons: DraftReason[];
}

/** 草稿规则：缺责任人，或修复版本缺失 / 仍在受影响区间，只留草稿。 */
export function draftReasons(state: AppState, t: Ticket): DraftReason[] {
  const reasons: DraftReason[] = [];
  const dep = state.deps.find((d) => d.id === t.depId);
  if (!dep) reasons.push('no-dep');
  if (t.sources.some((s) => safeParseRange(s.affectedRange).length === 0)) reasons.push('range-invalid');
  if (!t.owner.trim()) reasons.push('missing-owner');
  if (!t.fixedVersion) reasons.push('no-fixed');
  else if (rangeContains(t.mergedRange, t.fixedVersion)) reasons.push('fixed-in-range');
  return reasons;
}

export type TicketState = 'draft' | 'open' | 'closed' | 'archived';

export function ticketState(state: AppState, t: Ticket): TicketState {
  if (t.lifecycle !== 'active') return t.lifecycle;
  return draftReasons(state, t).length > 0 ? 'draft' : 'open';
}

export interface Blocker {
  ticketId: number;
  title: string;
  advisoryIds: string[];
  severity: Severity;
  depVersion: string;
  mergedRangeText: string;
  fixedVersion: string | null;
  owner: string;
  dueDate: string | null;
  rule: string;
  original: {
    severity: Severity;
    depVersion: string;
    affectedRange: string;
    fixedVersion: string | null;
    owner: string;
  };
}

/** 阻断规则：未关闭的高危（严重/高危）公告仍覆盖当前版本 => 依赖不可标为可发布。 */
export function releaseBlockers(state: AppState, dep: Dep): Blocker[] {
  return state.tickets
    .filter((t) => t.depId === dep.id && t.lifecycle === 'active' && isHigh(t.severity))
    .filter((t) => rangeContains(t.mergedRange, dep.version))
    .map((t) => ({
      ticketId: t.id,
      title: t.sources[0].title,
      advisoryIds: t.sources.map((s) => s.advisoryId),
      severity: t.severity,
      depVersion: dep.version,
      mergedRangeText: t.mergedRangeText,
      fixedVersion: t.fixedVersion,
      owner: t.owner,
      dueDate: t.dueDate,
      rule: `规则 R1：未关闭的${SEVERITY_LABEL[t.severity]}公告覆盖当前版本 ${dep.version}（区间 ${t.mergedRangeText}），禁止标为可发布`,
      original: {
        severity: t.severity,
        depVersion: dep.version,
        affectedRange: t.mergedRangeText,
        fixedVersion: t.fixedVersion,
        owner: t.owner,
      },
    }));
}

export type ReleaseVerdict = 'releasable' | 'can-mark' | 'blocked';

export function releaseVerdict(state: AppState, dep: Dep): {
  verdict: ReleaseVerdict;
  blockers: Blocker[];
} {
  const blockers = releaseBlockers(state, dep);
  if (blockers.length > 0) return { verdict: 'blocked', blockers };
  return { verdict: dep.releaseMarked ? 'releasable' : 'can-mark', blockers };
}

/** 票据是否覆盖某版本 */
export const ticketCovers = (t: Ticket, version: string) => rangeContains(t.mergedRange, version);

// ---------- 状态变更（存储无关，输入旧 state 返回新 state） ----------

function nextId(state: AppState): number {
  return state.seq + 1;
}

function log(
  state: AppState,
  kind: RecordKind,
  depId: number,
  text: string,
  ticketId?: number,
): ActionRecord {
  const dep = state.deps.find((d) => d.id === depId);
  return {
    id: nextId(state),
    at: new Date().toISOString(),
    kind,
    depId,
    depName: dep?.name ?? `#${depId}`,
    ticketId,
    text,
  };
}

export interface IntakeInput {
  depName: string; // 按名称匹配已录入依赖
  advisoryId: string;
  origin: string;
  severity: Severity;
  affectedRange: string;
  fixedVersion: string | null;
  title: string;
}

export interface IntakeResult {
  ok: boolean;
  state: AppState;
  error?: string;
}

/**
 * 录入公告：
 * - 区间与同依赖任一在办票据重叠 => 合并来源（最高严重级 / 最高修复版本 / 合并区间）；
 * - 无重叠则新建票据；
 * - 修复版本仍在受影响区间或缺责任人等情况，票据结论自动成为“草稿”。
 */
export function intakeAdvisory(state: AppState, input: IntakeInput): IntakeResult {
  const errors: string[] = [];
  const dep = state.deps.find((d) => d.name.toLowerCase() === input.depName.trim().toLowerCase());
  if (!dep) errors.push(`依赖 “${input.depName}” 尚未录入，请先添加依赖`);
  const advId = input.advisoryId.trim();
  if (!advId) errors.push('公告编号不能为空');
  if (!input.origin.trim()) errors.push('来源不能为空');
  let intervals: Interval[] = [];
  try {
    intervals = parseRange(input.affectedRange);
  } catch (e) {
    errors.push((e as Error).message);
  }
  if (input.fixedVersion?.trim() && !parseVersion(input.fixedVersion.trim()))
    errors.push(`修复版本 “${input.fixedVersion}” 不是合法语义版本`);
  if (errors.length) return { ok: false, state, error: errors.join('；') };

  const src: AdvisorySource = {
    advisoryId: advId,
    origin: input.origin.trim(),
    severity: input.severity,
    affectedRange: input.affectedRange.trim(),
    fixedVersion: input.fixedVersion?.trim() || null,
    title: input.title.trim() || `${advId} 安全公告`,
    fetchedAt: new Date().toISOString(),
  };

  const target = state.tickets.find(
    (t) =>
      t.depId === dep!.id &&
      t.lifecycle === 'active' &&
      t.sources.some((s) => s.advisoryId === advId) === false &&
      rangesOverlap(t.mergedRange, intervals),
  );

  const records = [...state.records];
  let tickets: Ticket[];
  let seq = state.seq;

  if (target) {
    const sources = [...target.sources, src];
    const { ranges, text } = mergeSourceRanges(sources);
    tickets = state.tickets.map((t) =>
      t.id === target.id
        ? {
            ...t,
            sources,
            mergedRange: ranges,
            mergedRangeText: text,
            severity: topSeverity(sources),
            fixedVersion: bestFixedVersion(sources),
          }
        : t,
    );
    const draft = draftReasons({ ...state, tickets }, tickets.find((t) => t.id === target.id)!);
    seq += 1;
    records.push({
      id: seq,
      at: new Date().toISOString(),
      kind: 'merge',
      depId: dep!.id,
      depName: dep!.name,
      ticketId: target.id,
      text:
        `${advId}（${src.origin}，${SEVERITY_LABEL[src.severity]}，区间 ${src.affectedRange}）` +
        `与票据 #${target.id} 区间重叠，已合并来源；合并区间 ${text}，结论：${
          draft.length ? `草稿（${draft.map((d) => DRAFT_REASON_TEXT[d]).join('、')}）` : '待处置'
        }`,
    });
  } else {
    const sources = [src];
    const { ranges, text } = mergeSourceRanges(sources);
    seq += 1;
    const id = seq;
    tickets = [
      ...state.tickets,
      {
        id,
        depId: dep!.id,
        sources,
        mergedRange: ranges,
        mergedRangeText: text,
        severity: src.severity,
        fixedVersion: src.fixedVersion,
        owner: '',
        dueDate: null,
        lifecycle: 'active',
        closedNote: null,
        createdAt: new Date().toISOString(),
      },
    ];
    const draft = draftReasons({ ...state, tickets }, tickets.find((t) => t.id === id)!);
    seq += 1;
    records.push({
      id: seq,
      at: new Date().toISOString(),
      kind: 'intake',
      depId: dep!.id,
      depName: dep!.name,
      ticketId: id,
      text:
        `录入公告 ${advId}（${src.origin}，${SEVERITY_LABEL[src.severity]}，受影响 ${src.affectedRange}` +
        (src.fixedVersion ? `，修复 ${src.fixedVersion}` : '，无修复版本') +
        `），生成票据 #${id}，结论：${
          draft.length ? `草稿（${draft.map((d) => DRAFT_REASON_TEXT[d]).join('、')}）` : '待处置'
        }`,
    });
  }
  return { ok: true, state: { deps: state.deps, tickets, records, seq } };
}

/** 维护人补录责任人 / 截止日；结论随规则即时重算。 */
export function updateTicket(
  state: AppState,
  ticketId: number,
  patch: { owner?: string; dueDate?: string | null },
): AppState {
  const t = state.tickets.find((x) => x.id === ticketId);
  if (!t || t.lifecycle !== 'active') return state;
  const tickets = state.tickets.map((x) => (x.id === ticketId ? { ...x, ...patch } : x));
  const updated = tickets.find((x) => x.id === ticketId)!;
  const draft = draftReasons({ ...state, tickets }, updated);
  const changed: string[] = [];
  if (patch.owner !== undefined && patch.owner.trim() !== t.owner.trim())
    changed.push(`责任人 “${t.owner.trim() || '空'}” → “${patch.owner.trim()}”`);
  if (patch.dueDate !== undefined && (patch.dueDate || null) !== (t.dueDate || null))
    changed.push(`截止日 “${t.dueDate || '未定'}” → “${patch.dueDate || '未定'}”`);
  if (!changed.length) return { ...state, tickets };
  const seq = state.seq + 1;
  return {
    deps: state.deps,
    tickets,
    seq,
    records: [
      ...state.records,
      {
        id: seq,
        at: new Date().toISOString(),
        kind: 'update',
        depId: t.depId,
        depName: state.deps.find((d) => d.id === t.depId)?.name ?? `#${t.depId}`,
        ticketId,
        text: `票据 #${ticketId} ${changed.join('，')}；结论：${
          draft.length ? `草稿（${draft.map((d) => DRAFT_REASON_TEXT[d]).join('、')}）` : '待处置'
        }`,
      },
    ],
  };
}

/** 尝试标为可发布：高危未关闭 => 记录阻断并保持原结论。 */
export function markReleasable(state: AppState, depId: number): AppState {
  const dep = state.deps.find((d) => d.id === depId);
  if (!dep) return state;
  const blockers = releaseBlockers(state, dep);
  const seq = state.seq + 1;
  if (blockers.length > 0) {
    return {
      ...state,
      seq,
      records: [
        ...state.records,
        {
          id: seq,
          at: new Date().toISOString(),
          kind: 'block',
          depId,
          depName: dep.name,
          text:
            `依赖 ${dep.name}@${dep.version} 标为可发布被阻断：${blockers.length} 张高危票据未关闭。` +
            blockers
              .map(
                (b) =>
                  ` 票据 #${b.ticketId}（${b.advisoryIds.join('/')}，${SEVERITY_LABEL[b.severity]}，` +
                  `区间 ${b.mergedRangeText}，原值 责任人=${b.owner || '空'} / 修复=${b.fixedVersion || '无'}）`,
              )
              .join('；'),
        },
      ],
    };
  }
  if (dep.releaseMarked) return state;
  return {
    ...state,
    seq,
    deps: state.deps.map((d) => (d.id === depId ? { ...d, releaseMarked: true } : d)),
    records: [
      ...state.records,
      {
        id: seq,
        at: new Date().toISOString(),
        kind: 'release',
        depId,
        depName: dep.name,
        text: `依赖 ${dep.name}@${dep.version} 无高危阻断，已标为可发布`,
      },
    ],
  };
}

export interface UpgradePreview {
  version: string;
  archived: Ticket[];
  stillOpen: Ticket[];
}

/** 升级前预览：哪些在办票据将因新版本落出区间而归档。 */
export function previewUpgrade(state: AppState, depId: number, newVersion: string): UpgradePreview | null {
  const dep = state.deps.find((d) => d.id === depId);
  if (!dep) return null;
  const active = state.tickets.filter((t) => t.depId === depId && t.lifecycle === 'active');
  return {
    version: newVersion,
    archived: active.filter((t) => !rangeContains(t.mergedRange, newVersion)),
    stillOpen: active.filter((t) => rangeContains(t.mergedRange, newVersion)),
  };
}

/**
 * 升级依赖并重新扫描：
 * - 新版本落出某票据合并区间 => 该票据归档（保留来源与处置历史）；
 * - 仍在区间内的票据保持在办；
 * - 清除可发布标记，需要按新版本重新判定。
 */
export function upgradeDependency(state: AppState, depId: number, newVersion: string): AppState {
  const dep = state.deps.find((d) => d.id === depId);
  if (!dep || !newVersion.trim() || newVersion.trim() === dep.version) return state;
  const version = newVersion.trim();
  const preview = previewUpgrade(state, depId, version)!;

  const tickets = state.tickets.map((t) => {
    if (t.depId !== depId || t.lifecycle !== 'active') return t;
    if (preview.archived.some((a) => a.id === t.id))
      return { ...t, lifecycle: 'archived' as const, closedNote: `升级至 ${version} 后不再受影响，重新扫描归档` };
    return t;
  });

  let seq = state.seq;
  const records = [...state.records];
  const push = (r: Omit<ActionRecord, 'id' | 'at'>) => {
    seq += 1;
    records.push({ id: seq, at: new Date().toISOString(), ...r });
  };

  push({
    kind: 'upgrade',
    depId,
    depName: dep.name,
    text: `依赖 ${dep.name} 版本 ${dep.version} → ${version}，已按新版本重新扫描；可发布标记重置`,
  });
  for (const t of preview.archived) {
    push({
      kind: 'archive',
      depId,
      depName: dep.name,
      ticketId: t.id,
      text: `票据 #${t.id}（${t.sources.map((s) => s.advisoryId).join('/')}，区间 ${t.mergedRangeText}）不再覆盖 ${version}，旧公告归档`,
    });
  }

  return {
    seq,
    tickets,
    records,
    deps: state.deps.map((d) => (d.id === depId ? { ...d, version, releaseMarked: false } : d)),
  };
}

export function closeTicket(state: AppState, ticketId: number, note: string): AppState {
  const t = state.tickets.find((x) => x.id === ticketId);
  if (!t || t.lifecycle !== 'active') return state;
  // 高危票据关闭前仍需满足规则：覆盖当前版本的高危不能直接“接受风险”关闭——
  // 产品规则只要求“未关闭的高危阻断发布”，关闭动作保留但记录结论。
  const dep = state.deps.find((d) => d.id === t.depId);
  const covering = dep ? ticketCovers(t, dep.version) : false;
  const tickets = state.tickets.map((x) =>
    x.id === ticketId ? { ...x, lifecycle: 'closed' as const, closedNote: note.trim() || '已修复并验证' } : x,
  );
  const seq = state.seq + 1;
  return {
    deps: state.deps,
    tickets,
    seq,
    records: [
      ...state.records,
      {
        id: seq,
        at: new Date().toISOString(),
        kind: 'close',
        depId: t.depId,
        depName: dep?.name ?? `#${t.depId}`,
        ticketId,
        text:
          `票据 #${ticketId} 已关闭（${note.trim() || '已修复并验证'}）` +
          (covering && isHigh(t.severity) ? '；注意关闭时当前版本仍在受影响区间' : ''),
      },
    ],
  };
}

export interface NewDepInput {
  name: string;
  version: string;
  license: string;
  source: string;
  note: string;
}

export function addDependency(state: AppState, input: NewDepInput): IntakeResult {
  const name = input.name.trim();
  if (!name) return { ok: false, state, error: '依赖名称不能为空' };
  if (state.deps.some((d) => d.name.toLowerCase() === name.toLowerCase()))
    return { ok: false, state, error: `依赖 ${name} 已存在` };
  const id = state.seq + 1;
  const dep: Dep = {
    id,
    name,
    version: input.version.trim() || '0.0.0',
    license: input.license || '未声明',
    source: input.source.trim() || '手动',
    note: input.note.trim(),
    releaseMarked: false,
  };
  return {
    ok: true,
    state: {
      deps: [...state.deps, dep],
      tickets: state.tickets,
      seq: id + 1,
      records: [
        ...state.records,
        {
          id: id + 1,
          at: new Date().toISOString(),
          kind: 'add',
          depId: id,
          depName: name,
          text: `添加依赖 ${name}@${dep.version}（${dep.license}，来源 ${dep.source}）`,
        },
      ],
    },
  };
}
