// 判定层验收脚本：覆盖合并/草稿/阻断/升级归档/刷新一致性。
import {buildSeedState} from '../src/storage/store.ts';
import {
  addDependency,
  closeTicket,
  draftReasons,
  intakeAdvisory,
  markReleasable,
  releaseBlockers,
  releaseVerdict,
  ticketCovers,
  ticketState,
  updateTicket,
  upgradeDependency,
} from '../src/domain/rules.ts';
import {intervalsOverlap, parseRange, rangeContains} from '../src/domain/semver.ts';

let pass = 0;
let fail = 0;
function check(name, cond, extra = '') {
  if (cond) {
    pass++;
  } else {
    fail++;
    console.error(`✘ ${name}${extra ? ' — ' + extra : ''}`);
  }
}
const dep = (s, name) => s.deps.find((d) => d.name === name);
const ticketsOf = (s, name) => s.tickets.filter((t) => t.depId === dep(s, name).id);

// 1. 区间：包含 / 端点相触不重叠
check('4.17.20 落在 >=4.0.0 <4.17.21', rangeContains(parseRange('>=4.0.0 <4.17.21'), '4.17.20'));
check('4.17.21 不在 >=4.0.0 <4.17.21', !rangeContains(parseRange('>=4.0.0 <4.17.21'), '4.17.21'));
check('<2.0.0 与 >=2.0.0 端点相触不算重叠', !intervalsOverlap(parseRange('<2.0.0')[0], parseRange('>=2.0.0')[0]));
check('<2.0.0 与 <=2.0.0 在 2.0.0 重叠', intervalsOverlap(parseRange('<2.0.0')[0], parseRange('<=2.0.0')[0]));
check('^1.2.0 含 1.9.9 不含 2.0.0', rangeContains(parseRange('^1.2.0'), '1.9.9') && !rangeContains(parseRange('^1.2.0'), '2.0.0'));
check('1.2.x 解析为 1.2 段', rangeContains(parseRange('1.2.x'), '1.2.8') && !rangeContains(parseRange('1.2.x'), '1.3.0'));
check('连写区间 1.0.0 - 2.0.0 含两端', rangeContains(parseRange('1.0.0 - 2.0.0'), '1.0.0') && rangeContains(parseRange('1.0.0 - 2.0.0'), '2.0.0'));

// 2. 种子：lodash 两条重叠来源合并
const seed = buildSeedState();
const lodashTickets = ticketsOf(seed, 'lodash');
check('lodash 两条公告合并为 1 张票据', lodashTickets.length === 1, `实际 ${lodashTickets.length}`);
const lt = lodashTickets[0];
check('合并后 2 个来源', lt.sources.length === 2);
check('合并区间为一段 >=4.0.0 <4.17.21', lt.mergedRangeText === '>=4.0.0 <4.17.21', lt.mergedRangeText);
check('合并取最高修复版本 4.17.21', lt.fixedVersion === '4.17.21');
check('严重级别 high', lt.severity === 'high');

// 3. 草稿规则
const miniTickets = ticketsOf(seed, 'minimist');
check('minimist 1 张票据', miniTickets.length === 1);
check('minimist 缺责任人 → 草稿', ticketState(seed, miniTickets[0]) === 'draft');
check('草稿原因含 missing-owner', draftReasons(seed, miniTickets[0]).includes('missing-owner'));

const lpTickets = ticketsOf(seed, 'legacy-parser');
check('legacy-parser 修复版本在区间内 → 草稿', ticketState(seed, lpTickets[0]) === 'draft');
check('草稿原因含 fixed-in-range', draftReasons(seed, lpTickets[0]).includes('fixed-in-range'));

// 补全责任人后草稿转待处置
let s = updateTicket(seed, miniTickets[0].id, {owner: 'Ren', dueDate: '2026-10-01'});
check('补全责任人后草稿 → 待处置', ticketState(s, s.tickets.find((t) => t.id === miniTickets[0].id)) === 'open');

// 4. 高危阻断发布
check('lodash 发布受阻', releaseVerdict(seed, dep(seed, 'lodash')).verdict === 'blocked');
check('lodash 阻断明细 1 条', releaseBlockers(seed, dep(seed, 'lodash')).length === 1);
const before = markReleasable(seed, dep(seed, 'lodash').id);
check('阻断尝试不改变标记', dep(before, 'lodash').releaseMarked === false);
check('阻断尝试生成 block 记录', before.records.filter((r) => r.kind === 'block').length >= 1);
const blocker = releaseBlockers(seed, dep(seed, 'lodash'))[0];
check('阻断明细含规则文本', blocker.rule.includes('规则 R1'));
check('阻断明细保留原值', blocker.original.depVersion === '4.17.20' && blocker.original.owner === '');

// 中危不阻断
check('axios 中危不阻断（已标记可发布）', releaseVerdict(seed, dep(seed, 'axios')).verdict === 'releasable');
// react 无公告
check('react 可发布', releaseVerdict(seed, dep(seed, 'react')).verdict === 'releasable');

// 5. 升级后重扫归档
const chartTickets = ticketsOf(seed, 'chart.js');
check('chart.js 已升级且票据归档', chartTickets.length === 1 && chartTickets[0].lifecycle === 'archived');
check('chart.js 不被阻断', releaseVerdict(seed, dep(seed, 'chart.js')).verdict !== 'blocked');
check('chart.js 归档记录存在', seed.records.some((r) => r.kind === 'archive'));

// 升级 lodash 到修复版本 → 票据归档、阻断解除、标记重置
const up = upgradeDependency(seed, dep(seed, 'lodash').id, '4.17.21');
const upTicket = up.tickets.find((t) => t.id === lt.id);
check('升级后 lodash 票据归档', upTicket.lifecycle === 'archived');
check('归档说明含新版本', upTicket.closedNote.includes('4.17.21'));
check('升级后阻断解除', releaseVerdict(up, dep(up, 'lodash')).verdict === 'can-mark');
check('升级记录写入', up.records.some((r) => r.kind === 'upgrade' && r.text.includes('4.17.20 → 4.17.21')));

// 升级到仍受影响版本：票据保持在办
const up2 = upgradeDependency(seed, dep(seed, 'lodash').id, '4.17.19');
check('升级到仍受影响版本 → 票据仍在办', up2.tickets.find((t) => t.id === lt.id).lifecycle === 'active');
check('仍阻断', releaseVerdict(up2, dep(up2, 'lodash')).verdict === 'blocked');

// 6. 非重叠新公告不合并
let s2 = addDependency(seed, {name: 'demo-pkg', version: '1.0.0', license: 'MIT', source: 'npm', note: ''}).state;
const r1 = intakeAdvisory(s2, {depName: 'demo-pkg', advisoryId: 'A-1', origin: 'GHSA', severity: 'low', affectedRange: '<2.0.0', fixedVersion: '2.0.0', title: 't1'});
s2 = r1.state;
const r2 = intakeAdvisory(s2, {depName: 'demo-pkg', advisoryId: 'A-2', origin: 'CVE', severity: 'low', affectedRange: '>=3.0.0 <4.0.0', fixedVersion: '4.0.0', title: 't2'});
s2 = r2.state;
check('端点相触的两条公告不合并', ticketsOf(s2, 'demo-pkg').length === 2);
// 重叠区间并入已有票据
const r3 = intakeAdvisory(s2, {depName: 'demo-pkg', advisoryId: 'A-3', origin: 'OSV', severity: 'medium', affectedRange: '>=1.5.0 <2.1.0', fixedVersion: '2.1.0', title: 't3'});
s2 = r3.state;
const merged = ticketsOf(s2, 'demo-pkg').find((t) => t.sources.some((x) => x.advisoryId === 'A-1'));
check('重叠公告并入票据，来源=2', merged.sources.length === 2);
check('合并取最高级别 medium', merged.severity === 'medium');
check('合并区间取并集 <2.1.0', merged.mergedRangeText === '<2.1.0', merged.mergedRangeText);
check('产生 merge 记录', s2.records.some((r) => r.kind === 'merge'));
// 给两张在办票据补责任人，demo-pkg 是低/中危 → 不阻断
for (const t of ticketsOf(s2, 'demo-pkg')) s2 = updateTicket(s2, t.id, {owner: 'Q', dueDate: '2026-12-01'});
check('低中危不阻断', releaseVerdict(s2, dep(s2, 'demo-pkg')).verdict === 'can-mark');

// 7. 校验拒绝
const badRange = intakeAdvisory(seed, {depName: 'lodash', advisoryId: 'BAD', origin: 'x', severity: 'low', affectedRange: '>=2.0.0 <1.0.0', fixedVersion: null, title: ''});
check('冲突区间被拒绝', !badRange.ok && badRange.error.includes('冲突'));
const badDep = intakeAdvisory(seed, {depName: 'ghost-pkg', advisoryId: 'B', origin: 'x', severity: 'low', affectedRange: '*', fixedVersion: null, title: ''});
check('未知依赖被拒绝', !badDep.ok);
const dup = addDependency(seed, {name: 'lodash', version: '1.0.0', license: 'MIT', source: 'npm', note: ''});
check('重复依赖被拒绝', !dup.ok);

// 8. 高危票据关闭后解除阻断（规则只约束“未关闭”）
let s3 = updateTicket(seed, lt.id, {owner: 'Ren', dueDate: '2026-10-01'});
s3 = closeTicket(s3, lt.id, '已修复');
check('关闭高危票据后阻断解除', releaseVerdict(s3, dep(s3, 'lodash')).verdict === 'can-mark');

// 9. 刷新一致性：种子重建两次结果深度一致
const seed2 = buildSeedState();
check('两次构建种子状态一致', JSON.stringify(seed2.deps) === JSON.stringify(seed.deps) && JSON.stringify(seed2.tickets.map(({lifecycle, sources: n}) => 0)) === JSON.stringify(seed.tickets.map(() => 0)));

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
