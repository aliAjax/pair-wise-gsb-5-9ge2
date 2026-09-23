// 界面层：公告总览（全部公告，支持状态/级别过滤）

import {useState} from 'react';
import {AlertTriangle, Search} from 'lucide-react';
import type {Advisory, AdvisoryStatus, Dependency} from '../data/types';
import {advisoryHits} from '../domain/versionRange';
import {SeverityBadge, StatusPill, DraftReason} from './widgets';

const depName = (deps: Dependency[], id: number) => deps.find((d) => d.id === id)?.name ?? `#${id}`;
const depVersion = (deps: Dependency[], id: number) => deps.find((d) => d.id === id)?.version ?? '';

export function AdvisoryBoard({deps, advisories, onSelectDep}: {
  deps: Dependency[];
  advisories: Advisory[];
  onSelectDep: (id: number) => void;
}) {
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<'open' | AdvisoryStatus | 'all'>('open');

  const filtered = advisories
    .filter((a) => {
      if (status === 'all') return true;
      if (status === 'open') return a.status === 'active' || a.status === 'draft';
      return a.status === status;
    })
    .filter((a) => {
      const q = query.toLowerCase();
      return !q || `${a.title} ${a.sources.join(' ')} ${depName(deps, a.depId)}`.toLowerCase().includes(q);
    })
    .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));

  return (
    <section className="board">
      <div className="pane-head">
        <div>
          <h2>安全公告台账</h2>
          <p>区间重叠的来源已自动合并；草稿不参与发布拦截</p>
        </div>
        <div className="tools">
          <div className="search"><Search size={15}/><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="搜索公告 / 编号 / 依赖"/></div>
          <select value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
            <option value="open">开放中</option>
            <option value="active">仅生效</option>
            <option value="draft">仅草稿</option>
            <option value="archived">已归档</option>
            <option value="closed">已关闭</option>
            <option value="all">全部</option>
          </select>
        </div>
      </div>
      <div className="adv-table">
        <div className="atr th">
          <span>公告 / 来源</span><span>依赖</span><span>受影响区间</span><span>级别</span><span>责任人 / 截止</span><span>状态</span>
        </div>
        {filtered.map((a) => {
          const hits = advisoryHits(a, depVersion(deps, a.depId));
          return (
            <button key={a.id} className={`atr ${a.status}`} onClick={() => onSelectDep(a.depId)}>
              <span className="a-title">
                <b>{a.title}</b>
                <small>{a.sources.join(' + ')}{a.sources.length > 1 && '（已合并）'}</small>
              </span>
              <span>{depName(deps, a.depId)}<small className="muted"> 当前 {depVersion(deps, a.depId)}{!hits && (a.status === 'active' || a.status === 'draft') && ' · 未命中'}</small></span>
              <span><code>{a.affectedRange}</code><small className="muted">修复 {a.fixedVersion || '未发布'}</small></span>
              <span><SeverityBadge severity={a.severity}/></span>
              <span><b className={a.owner ? '' : 'missing'}>{a.owner || '缺责任人'}</b><small className="muted">{a.dueDate}</small></span>
              <span><StatusPill status={a.status}/></span>
            </button>
          );
        })}
        {filtered.length === 0 && (
          <div className="board-empty"><AlertTriangle size={18}/><span>没有符合条件的公告</span></div>
        )}
      </div>
      {filtered.some((a) => a.status === 'draft') && (
        <div className="board-foot">
          <DraftReason reason="草稿规则：修复版本仍落在受影响区间（R1）或缺少责任人（R2）。补齐资料后在依赖详情中编辑，将自动转为生效。"/>
        </div>
      )}
    </section>
  );
}
