// 资料层：初始种子数据（仅原始事实，状态由判定层在首次加载时裁定）

import type {Advisory, Dependency, HandlingRecord} from './types';

export const seedDeps: Dependency[] = [
  {id: 1, name: 'react', version: '18.3.1', license: 'MIT', ecosystem: 'npm', source: 'package.json', note: '核心框架', releaseIntent: true},
  {id: 2, name: 'lodash', version: '4.17.20', license: 'MIT', ecosystem: 'npm', source: 'package.json', note: '工具函数库', releaseIntent: true},
  {id: 3, name: 'axios', version: '0.21.0', license: 'MIT', ecosystem: 'npm', source: 'package.json', note: 'HTTP 客户端', releaseIntent: false},
  {id: 4, name: 'minimist', version: '1.2.8', license: 'MIT', ecosystem: 'npm', source: '手动录入', note: '参数解析', releaseIntent: true},
  {id: 5, name: 'left-pad', version: '1.3.0', license: 'WTFPL', ecosystem: 'npm', source: 'npm audit', note: '历史包袱，待替换', releaseIntent: false},
  {id: 6, name: 'legacy-utils', version: '0.9.2', license: 'GPL-3.0', ecosystem: 'npm', source: '内部扫描', note: '老项目内部工具', releaseIntent: false},
  {id: 7, name: 'chart.js', version: '4.4.4', license: 'MIT', ecosystem: 'npm', source: 'package.json', note: '图表库', releaseIntent: true},
  {id: 8, name: 'debug', version: '4.3.4', license: 'MIT', ecosystem: 'npm', source: 'package.json', note: '调试日志', releaseIntent: true},
];

/** 录入时不预设 status / draftReason —— 由判定层 classify 得出 */
export const seedAdvisories: Omit<Advisory, 'status' | 'draftReason'>[] = [
  {
    id: 101, depId: 2, title: '命令注入（_.template / templateSettings）',
    affectedRange: '>=4.0.0 <4.17.21', severity: 'high',
    fixedVersion: '4.17.21', owner: '王琳', dueDate: '2026-10-05',
    sources: ['GHSA-35jh-r29f-r92q'], createdAt: '2026-09-15T09:00:00Z', updatedAt: '2026-09-15T09:00:00Z',
  },
  {
    id: 102, depId: 2, title: '原型链污染（_.set / _.zipObjectDeep）',
    affectedRange: '>=4.0.0 <4.17.12', severity: 'high',
    fixedVersion: '4.17.12', owner: '王琳', dueDate: '2026-10-10',
    sources: ['CVE-2020-8203'], createdAt: '2026-09-16T09:00:00Z', updatedAt: '2026-09-16T09:00:00Z',
  },
  // axios 两条来源区间重叠，录入时应合并为一条（来源并列）
  {
    id: 201, depId: 3, title: 'SSRF：未授权的重定向与协议跟随',
    affectedRange: '>=0.10.0 <0.21.1', severity: 'critical',
    fixedVersion: '0.21.1', owner: '陈牧', dueDate: '2026-09-30',
    sources: ['GHSA-4w2v-q235-vpvw'], createdAt: '2026-09-14T02:00:00Z', updatedAt: '2026-09-14T02:00:00Z',
  },
  {
    id: 202, depId: 3, title: 'ReDoS：trim 函数正则回溯',
    affectedRange: '>=0.19.0 <=0.21.0', severity: 'high',
    fixedVersion: '0.21.1', owner: '陈牧', dueDate: '2026-10-02',
    sources: ['CVE-2021-3749'], createdAt: '2026-09-14T03:00:00Z', updatedAt: '2026-09-14T03:00:00Z',
  },
  // minimist 当前版本已高于修复版本，首次重扫即归档
  {
    id: 301, depId: 4, title: '原型污染（--__proto__）',
    affectedRange: '<1.2.6', severity: 'medium',
    fixedVersion: '1.2.6', owner: '李珊', dueDate: '2026-09-20',
    sources: ['GHSA-xvch-5gv4-984h'], createdAt: '2026-09-01T08:00:00Z', updatedAt: '2026-09-01T08:00:00Z',
  },
  // 草稿一：修复版本 1.3.1 仍落在受影响区间 <=2.0.0
  {
    id: 401, depId: 5, title: '内存越界读取（打包数据解析）',
    affectedRange: '<=2.0.0', severity: 'high',
    fixedVersion: '1.3.1', owner: '赵启', dueDate: '2026-10-15',
    sources: ['内部扫描'], createdAt: '2026-09-18T06:00:00Z', updatedAt: '2026-09-18T06:00:00Z',
  },
  // 草稿二：缺责任人
  {
    id: 501, depId: 6, title: '压缩目录穿越（unzip 路径未净化）',
    affectedRange: '>=0.5.0 <1.0.0', severity: 'critical',
    fixedVersion: '1.0.0', owner: '', dueDate: '2026-10-20',
    sources: ['GHSA-7pfr-ccr3-qfx5'], createdAt: '2026-09-19T06:00:00Z', updatedAt: '2026-09-19T06:00:00Z',
  },
  // 另一条与 501 区间重叠、且同样缺责任人：合并后仍是草稿
  {
    id: 502, depId: 6, title: '符号链接任意文件覆盖',
    affectedRange: '>=0.9.0 <0.9.9', severity: 'high',
    fixedVersion: '1.0.0', owner: '', dueDate: '2026-10-12',
    sources: ['CVE-2025-99999'], createdAt: '2026-09-19T07:00:00Z', updatedAt: '2026-09-19T07:00:00Z',
  },
];

export const seedRecords: HandlingRecord[] = [
  {id: 1, ts: '2026-09-15T09:00:00Z', action: '录入公告', depId: 2, advisoryId: 101, detail: '从 GHSA-35jh-r29f-r92q 录入，责任人：王琳，截止 2026-10-05'},
  {id: 2, ts: '2026-09-14T02:00:00Z', action: '录入公告', depId: 3, advisoryId: 201, detail: '从 GHSA-4w2v-q235-vpvw 录入'},
  {id: 3, ts: '2026-09-19T06:00:00Z', action: '录入公告', depId: 5, advisoryId: 401, detail: '从内部扫描录入；修复版本 1.3.1 仍在受影响区间 <=2.0.0，保留为草稿'},
];
