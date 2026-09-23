// 存储层：localStorage 持久化 + 应用状态装配
// 不做安全判定，只把判定层的纯函数应用到状态上，并追加处置记录

import {useCallback, useEffect, useMemo, useReducer, useRef} from 'react';
import type {Advisory, Dependency, HandlingRecord} from '../data/types';
import {seedAdvisories, seedDeps, seedRecords} from '../data/seed';
import {
  ingestAdvisory,
  reclassify,
  releaseBlockers,
  rescanDependency,
  type Blocker,
} from '../domain/advisoryPolicy';

const STORAGE_KEY = 'license-lens-security-console-v1';

export interface ConsoleState {
  deps: Dependency[];
  advisories: Advisory[];
  records: HandlingRecord[];
  seq: number;
}

/** 首次装配：录入全部种子公告（走合并规则），再对每个依赖重扫（旧公告归档） */
function bootstrap(): ConsoleState {
  let advisories: Advisory[] = [];
  const records: HandlingRecord[] = [...seedRecords];
  const now = new Date().toISOString();
  let seq = 1000;

  for (const raw of seedAdvisories) {
    const incoming: Advisory = {...raw, status: 'active'};
    const result = ingestAdvisory(advisories, incoming);
    for (const {kept, absorbed} of result.merged) {
      records.push({
        id: seq++,
        ts: now,
        action: '合并来源',
        depId: kept.depId,
        advisoryId: kept.id,
        detail: `区间重叠，${absorbed.map((a) => a.sources.join('+')).join('、')} 并入 ${kept.sources.join('+')}，合并后区间 ${kept.affectedRange}`,
      });
    }
    const target = result.merged.length ? result.merged[0].kept : result.advisories.find((a) => a.id === incoming.id);
    if (target?.status === 'draft') {
      records.push({
        id: seq++,
        ts: now,
        action: '保留草稿',
        depId: target.depId,
        advisoryId: target.id,
        detail: target.draftReason ?? '资料不完整',
      });
    }
    advisories = result.advisories;
  }

  // 用当前依赖版本统一重扫（如 minimist 1.2.8 已脱离 <1.2.6 → 归档）
  for (const dep of seedDeps) {
    const r = rescanDependency(advisories, dep);
    for (const a of r.archived) {
      records.push({
        id: seq++,
        ts: now,
        action: '重扫归档',
        depId: dep.id,
        advisoryId: a.id,
        detail: `依赖当前版本 ${dep.version} 已不在受影响区间 ${a.affectedRange}（修复版本 ${a.fixedVersion || '未知'}），旧公告归档`,
      });
    }
    advisories = r.advisories;
  }

  return {deps: seedDeps, advisories, records, seq};
}

function load(): ConsoleState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as ConsoleState;
      if (parsed && Array.isArray(parsed.deps) && Array.isArray(parsed.advisories)) return parsed;
    }
  } catch {
    // 数据损坏时回退到种子
  }
  return bootstrap();
}

type Action =
  | {type: 'addDep'; dep: Dependency}
  | {type: 'upgradeDep'; depId: number; version: string; note?: string}
  | {type: 'requestRelease'; depId: number; want: boolean}
  | {type: 'addAdvisory'; advisory: Advisory}
  | {type: 'updateAdvisory'; advisory: Advisory}
  | {type: 'closeAdvisory'; advisoryId: number}
  | {type: 'reset'};

function nextId(state: ConsoleState): number {
  return state.seq + 1;
}

function record(state: ConsoleState, r: Omit<HandlingRecord, 'id' | 'ts'>): {records: HandlingRecord[]; seq: number} {
  const id = state.seq + 1;
  const entry: HandlingRecord = {id, ts: new Date().toISOString(), ...r};
  return {records: [entry, ...state.records], seq: id};
}

function reducer(state: ConsoleState, action: Action): ConsoleState {
  switch (action.type) {
    case 'addDep': {
      const dep = action.dep;
      const r = record(state, {action: '录入依赖', depId: dep.id, detail: `${dep.ecosystem}:${dep.name}@${dep.version}（${dep.license}）加入清单`});
      return {...state, deps: [...state.deps, dep], ...r};
    }

    case 'upgradeDep': {
      const dep = state.deps.find((d) => d.id === action.depId);
      if (!dep) return state;
      const oldVersion = dep.version;
      const updated: Dependency = {...dep, version: action.version};
      const scan = rescanDependency(state.advisories, updated);
      let records = state.records;
      let seq = state.seq;
      const push = (r: Omit<HandlingRecord, 'id' | 'ts'>) => {
        seq += 1;
        records = [{id: seq, ts: new Date().toISOString(), ...r}, ...records];
      };
      push({action: '升级版本', depId: dep.id, detail: `${dep.name} ${oldVersion} → ${action.version}，触发重新扫描`});
      for (const a of scan.archived) {
        push({
          action: '重扫归档',
          depId: dep.id,
          advisoryId: a.id,
          detail: `升级后 ${dep.name}@${action.version} 不再命中区间 ${a.affectedRange}，公告 ${a.sources.join('+')} 归档`,
        });
      }
      return {
        ...state,
        deps: state.deps.map((d) => (d.id === dep.id ? updated : d)),
        advisories: scan.advisories,
        records,
        seq,
      };
    }

    case 'requestRelease': {
      const dep = state.deps.find((d) => d.id === action.depId);
      if (!dep) return state;
      if (action.want) {
        const blockers = releaseBlockers(dep, state.advisories);
        if (blockers.length) {
          // 拦截：记录一次失败的发布操作，保留原值（不允许标记）
          const r = record(state, {
            action: '发布被阻止',
            depId: dep.id,
            detail: blockers
              .map((b) => `${b.advisory.sources.join('+')}：${b.evidence.severity}，区间 ${b.evidence.affectedRange}，当前 ${b.evidence.depVersion}，修复 ${b.evidence.fixedVersion}（${b.rule}）`)
              .join('；'),
          });
          return {...state, ...r};
        }
        const r = record(state, {action: '标记可发布', depId: dep.id, detail: `${dep.name}@${dep.version} 无未关闭的高危公告命中，结论：可发布`});
        return {...state, deps: state.deps.map((d) => (d.id === dep.id ? {...d, releaseIntent: true} : d)), ...r};
      }
      const r = record(state, {action: '撤销发布标记', depId: dep.id, detail: `${dep.name} 发布申请撤销`});
      return {...state, deps: state.deps.map((d) => (d.id === dep.id ? {...d, releaseIntent: false} : d)), ...r};
    }

    case 'addAdvisory': {
      const result = ingestAdvisory(state.advisories, action.advisory);
      const dep = state.deps.find((d) => d.id === action.advisory.depId);
      let records = state.records;
      let seq = state.seq;
      const push = (r: Omit<HandlingRecord, 'id' | 'ts'>) => {
        seq += 1;
        records = [{id: seq, ts: new Date().toISOString(), ...r}, ...records];
      };
      if (result.merged.length) {
        for (const {kept, absorbed} of result.merged) {
          push({
            action: '合并来源',
            depId: kept.depId,
            advisoryId: kept.id,
            detail: `受影响区间重叠：${absorbed.map((a) => `${a.sources.join('+')}(${a.affectedRange})`).join('、')} 并入 ${kept.sources.join('+')}；合并后区间 ${kept.affectedRange}，级别 ${kept.severity}，修复 ${kept.fixedVersion || '无'}，截止 ${kept.dueDate}`,
          });
        }
      } else {
        push({
          action: '录入公告',
          depId: action.advisory.depId,
          advisoryId: action.advisory.id,
          detail: `${dep?.name ?? ''}：${action.advisory.title}，区间 ${action.advisory.affectedRange}，级别 ${action.advisory.severity}，来源 ${action.advisory.sources.join('+')}`,
        });
      }
      const saved = result.advisories.find((a) => a.id === action.advisory.id) ?? result.merged[0]?.kept;
      if (saved?.status === 'draft') {
        push({action: '保留草稿', depId: saved.depId, advisoryId: saved.id, detail: saved.draftReason ?? '资料不完整，不能生效'});
      }
      return {...state, advisories: result.advisories, records, seq};
    }

    case 'updateAdvisory': {
      const updated = reclassify(action.advisory);
      const before = state.advisories.find((a) => a.id === updated.id);
      let records = state.records;
      let seq = state.seq;
      const push = (r: Omit<HandlingRecord, 'id' | 'ts'>) => {
        seq += 1;
        records = [{id: seq, ts: new Date().toISOString(), ...r}, ...records];
      };
      push({
        action: '编辑公告',
        depId: updated.depId,
        advisoryId: updated.id,
        detail: `责任人「${before?.owner || '空'}」→「${updated.owner || '空'}」，修复版本「${before?.fixedVersion || '无'}」→「${updated.fixedVersion || '无'}」，截止 ${updated.dueDate}`,
      });
      if (before?.status === 'draft' && updated.status === 'active') {
        push({action: '草稿转生效', depId: updated.depId, advisoryId: updated.id, detail: '资料补齐并通过裁定，公告生效参与发布拦截'});
      } else if (before?.status === 'active' && updated.status === 'draft') {
        push({action: '生效转草稿', depId: updated.depId, advisoryId: updated.id, detail: updated.draftReason ?? '裁定不通过，退回草稿'});
      }
      return {...state, advisories: state.advisories.map((a) => (a.id === updated.id ? updated : a)), records, seq};
    }

    case 'closeAdvisory': {
      const target = state.advisories.find((a) => a.id === action.advisoryId);
      if (!target) return state;
      const updated: Advisory = {...target, status: 'closed', updatedAt: new Date().toISOString()};
      const r = record(state, {
        action: '关闭公告',
        depId: target.depId,
        advisoryId: target.id,
        detail: `人工确认处置完成（已升级至 ${target.fixedVersion || '修复版本'} / 风险接受），${target.sources.join('+')} 关闭`,
      });
      return {...state, advisories: state.advisories.map((a) => (a.id === target.id ? updated : a)), ...r};
    }

    case 'reset':
      return bootstrap();

    default:
      return state;
  }
}

export interface ConsoleStore {
  deps: Dependency[];
  advisories: Advisory[];
  records: HandlingRecord[];
  blockersByDep: Map<number, Blocker[]>;
  addDep: (input: Omit<Dependency, 'id' | 'releaseIntent'>) => number;
  upgradeDep: (depId: number, version: string) => void;
  requestRelease: (depId: number, want: boolean) => boolean;
  addAdvisory: (input: Omit<Advisory, 'id' | 'status' | 'draftReason' | 'createdAt' | 'updatedAt'>) => number;
  updateAdvisory: (a: Advisory) => void;
  closeAdvisory: (advisoryId: number) => void;
  reset: () => void;
}

export function useConsoleStore(): ConsoleStore {
  const [state, dispatch] = useReducer(reducer, undefined, load);
  const stateRef = useRef(state);
  stateRef.current = state;

  // 刷新一致：任何变更都落盘；下次加载原样恢复，发布结论再由纯函数推导
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state]);

  const blockersByDep = useMemo(() => {
    const map = new Map<number, Blocker[]>();
    for (const dep of state.deps) {
      const bs = releaseBlockers(dep, state.advisories);
      if (bs.length) map.set(dep.id, bs);
    }
    return map;
  }, [state.deps, state.advisories]);

  const addDep = useCallback((input: Omit<Dependency, 'id' | 'releaseIntent'>) => {
    const id = nextId(stateRef.current);
    dispatch({type: 'addDep', dep: {...input, id, releaseIntent: false}});
    return id;
  }, []);

  const upgradeDep = useCallback((depId: number, version: string) => {
    dispatch({type: 'upgradeDep', depId, version});
  }, []);

  const requestRelease = useCallback((depId: number, want: boolean) => {
    const dep = stateRef.current.deps.find((d) => d.id === depId);
    if (!dep) return false;
    if (want && releaseBlockers(dep, stateRef.current.advisories).length) {
      dispatch({type: 'requestRelease', depId, want: true}); // reducer 会拒绝并记录
      return false;
    }
    dispatch({type: 'requestRelease', depId, want});
    return want;
  }, []);

  const addAdvisory = useCallback((input: Omit<Advisory, 'id' | 'status' | 'draftReason' | 'createdAt' | 'updatedAt'>) => {
    const id = nextId(stateRef.current);
    const now = new Date().toISOString();
    // status 占位，ingestAdvisory 内部会重新 classify
    const incoming: Advisory = {...input, id, status: 'active', createdAt: now, updatedAt: now};
    dispatch({type: 'addAdvisory', advisory: incoming});
    return id;
  }, []);

  const updateAdvisory = useCallback((a: Advisory) => {
    dispatch({type: 'updateAdvisory', advisory: {...a, updatedAt: new Date().toISOString()}});
  }, []);

  const closeAdvisory = useCallback((advisoryId: number) => {
    dispatch({type: 'closeAdvisory', advisoryId});
  }, []);

  const reset = useCallback(() => dispatch({type: 'reset'}), []);

  return useMemo(
    () => ({
      deps: state.deps,
      advisories: state.advisories,
      records: state.records,
      blockersByDep,
      addDep,
      upgradeDep,
      requestRelease,
      addAdvisory,
      updateAdvisory,
      closeAdvisory,
      reset,
    }),
    [state, blockersByDep, addDep, upgradeDep, requestRelease, addAdvisory, updateAdvisory, closeAdvisory, reset],
  );
}
