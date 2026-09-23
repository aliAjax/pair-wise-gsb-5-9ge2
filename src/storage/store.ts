// 存储层：localStorage 持久化、结构校验、初始示例数据。
// 界面只通过 loadState/saveState 接触本地存储，判定逻辑全部在 domain 内。

import {
  ActionRecord,
  AdvisorySource,
  AppState,
  Dep,
  Severity,
  Ticket,
  addDependency,
  intakeAdvisory,
  markReleasable,
  upgradeDependency,
  closeTicket,
  updateTicket,
} from '../domain/rules';

const KEY = 'license-lens-security-v1';
export const SCHEMA_VERSION = 1;

function isStr(x: unknown): x is string {
  return typeof x === 'string';
}
function isNum(x: unknown): x is number {
  return typeof x === 'number' && Number.isFinite(x);
}

const SEVERITIES: Severity[] = ['critical', 'high', 'medium', 'low'];

function validateSource(x: any): x is AdvisorySource {
  return (
    x &&
    isStr(x.advisoryId) &&
    isStr(x.origin) &&
    SEVERITIES.includes(x.severity) &&
    isStr(x.affectedRange) &&
    (x.fixedVersion === null || isStr(x.fixedVersion)) &&
    isStr(x.title) &&
    isStr(x.fetchedAt)
  );
}

function validateDep(x: any): x is Dep {
  return (
    x &&
    isNum(x.id) &&
    isStr(x.name) &&
    isStr(x.version) &&
    isStr(x.license) &&
    isStr(x.source) &&
    typeof x.note === 'string' &&
    typeof x.releaseMarked === 'boolean'
  );
}

function validateTicket(x: any): x is Ticket {
  return (
    x &&
    isNum(x.id) &&
    isNum(x.depId) &&
    Array.isArray(x.sources) &&
    x.sources.every(validateSource) &&
    Array.isArray(x.mergedRange) &&
    isStr(x.mergedRangeText) &&
    SEVERITIES.includes(x.severity) &&
    (x.fixedVersion === null || isStr(x.fixedVersion)) &&
    isStr(x.owner) &&
    (x.dueDate === null || isStr(x.dueDate)) &&
    ['active', 'closed', 'archived'].includes(x.lifecycle) &&
    (x.closedNote === null || isStr(x.closedNote)) &&
    isStr(x.createdAt)
  );
}

function validateRecord(x: any): x is ActionRecord {
  return (
    x &&
    isNum(x.id) &&
    isStr(x.at) &&
    isStr(x.kind) &&
    isNum(x.depId) &&
    isStr(x.depName) &&
    (x.ticketId === undefined || isNum(x.ticketId)) &&
    isStr(x.text)
  );
}

/** 结构校验：损坏/缺字段一律回退初始数据，避免刷新后结论与记录不一致。 */
export function validateState(raw: unknown): raw is AppState {
  if (!raw || typeof raw !== 'object') return false;
  const s = raw as any;
  return (
    Array.isArray(s.deps) &&
    s.deps.every(validateDep) &&
    Array.isArray(s.tickets) &&
    s.tickets.every(validateTicket) &&
    Array.isArray(s.records) &&
    s.records.every(validateRecord) &&
    isNum(s.seq)
  );
}

function isoDays(daysFromNow: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  return d.toISOString().slice(0, 10);
}

/**
 * 示例数据：全部走判定层入口构建（添加/录入/升级/关闭/标记），
 * 保证初次加载与刷新后看到的公告、依赖结论、处置记录完全一致。
 */
export function buildSeedState(): AppState {
  let s: AppState = { deps: [], tickets: [], records: [], seq: 0 };

  const dep = (
    name: string,
    version: string,
    license: string,
    note: string,
    source = 'npm',
  ): number => {
    const r = addDependency(s, { name, version, license, source, note });
    s = r.state;
    return s.deps.find((d) => d.name === name)!.id;
  };

  const adv = (
    depName: string,
    advisoryId: string,
    origin: string,
    severity: Severity,
    affectedRange: string,
    fixedVersion: string | null,
    title: string,
  ) => {
    s = intakeAdvisory(s, { depName, advisoryId, origin, severity, affectedRange, fixedVersion, title }).state;
  };

  const react = dep('react', '18.3.1', 'MIT', '宽松许可，可商用');
  const lodash = dep('lodash', '4.17.20', 'MIT', '宽松许可，可商用');
  const minimist = dep('minimist', '1.2.5', 'MIT', '命令行参数解析');
  const legacyParser = dep('legacy-parser', '2.1.0', 'GPL-3.0', '可能与闭源分发冲突', '手动');
  const axios = dep('axios', '1.6.0', 'MIT', 'HTTP 客户端');
  // 以受影响版本录入，稍后演示升级重扫归档
  const chartjs = dep('chart.js', '4.4.2', 'MIT', '宽松许可，可商用');
  dep('highlight.js', '11.10.0', 'BSD-3-Clause', '再发布需保留版权声明');

  // lodash：两条来源区间重叠 → 合并为一张票据（演示“区间重叠合并来源”）
  adv('lodash', 'GHSA-35jh-rf8c-vhwp', 'GitHub Advisory', 'high', '>=4.0.0 <4.17.21', '4.17.21', '命令注入风险');
  adv('lodash', 'SNYK-JS-LODASH-1040724', 'Snyk', 'high', '>=4.0.0 <=4.17.20', '4.17.21', '命令注入（ReDoS 变体）');

  // minimist：高危 + 缺责任人（修复版本合法）→ 草稿（缺责任人）
  adv('minimist', 'GHSA-xvch-5gv4-984h', 'GitHub Advisory', 'high', '>=0.0.0 <1.2.6', '1.2.6', '原型链污染');

  // legacy-parser：内部上报，给的修复版本 2.1.0 仍在受影响区间 → 草稿
  adv('legacy-parser', 'SEC-INTERNAL-0042', '内部安全审核', 'critical', '>=2.0.0 <3.0.0', '2.1.0', '反序列化远程代码执行');

  // axios：中危，非阻断；补全责任人/截止日后可正常标为可发布
  adv('axios', 'CVE-2024-39338', 'NVD', 'medium', '>=0.5.0 <1.7.4', '1.7.4', 'SSRF 风险（需特定配置）');

  // chart.js：已升级到修复版本 → 升级重扫，旧公告归档
  adv('chart.js', 'GHSA-6c89-hcjx-qvhx', 'GitHub Advisory', 'low', '>=4.0.0 <4.4.3', '4.4.3', '色彩解析拒绝服务');
  s = upgradeDependency(s, chartjs, '4.4.4');

  // highlight.js：中危票据，演示已关闭（接受风险并跟踪）
  adv('highlight.js', 'GHSA-7wwv-vh3v-89cq', 'GitHub Advisory', 'medium', '>=11.0.0 <11.9.0', '11.9.0', '语言定义 ReDoS');
  const hlTicket = s.tickets.find((t) => t.depId === s.deps.find((d) => d.name === 'highlight.js')!.id)!;
  s = updateTicket(s, hlTicket.id, { owner: 'Zen Li', dueDate: isoDays(-2) });
  s = closeTicket(s, hlTicket.id, '输出已隔离不可信输入，升级跟踪到下个迭代');

  // axios：补全责任人与截止日（中危不阻断），然后成功标为可发布
  const axiosTicket = s.tickets.find((t) => t.depId === axios)!;
  s = updateTicket(s, axiosTicket.id, { owner: 'Maya Chen', dueDate: isoDays(7) });
  s = markReleasable(s, axios);

  // react：无公告，直接可发布
  s = markReleasable(s, react);

  // lodash/minimist/legacy-parser：尝试标为可发布 → 被阻断，生成处置记录
  s = markReleasable(s, lodash);
  s = markReleasable(s, minimist);
  s = markReleasable(s, legacyParser);

  return s;
}

export function loadState(): AppState {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (validateState(parsed)) return parsed;
    }
  } catch {
    /* 存储不可用时退回种子数据 */
  }
  return buildSeedState();
}

export function saveState(state: AppState): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* 容量/隐私模式失败时静默：判定结论仍在内存中一致 */
  }
}

export function resetState(): AppState {
  const seed = buildSeedState();
  saveState(seed);
  return seed;
}
