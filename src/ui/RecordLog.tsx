// 界面层：处置记录时间线 —— 与公告状态、依赖结论保持同一事实来源

import {useState} from 'react';
import {History, Search} from 'lucide-react';
import type {Dependency, HandlingRecord} from '../data/types';

const depName = (deps: Dependency[], id?: number) => (id === undefined ? '' : deps.find((d) => d.id === id)?.name ?? `#${id}`);

function fmt(ts: string): string {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return ts;
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function RecordLog({deps, records}: {deps: Dependency[]; records: HandlingRecord[]}) {
  const [query, setQuery] = useState('');
  const filtered = records.filter((r) => !query || `${r.action} ${r.detail} ${depName(deps, r.depId)}`.toLowerCase().includes(query.toLowerCase()));

  return (
    <section className="board record-board">
      <div className="pane-head">
        <div>
          <h2>处置记录</h2>
          <p>录入、合并、草稿、升级重扫归档、发布拦截均在此留痕</p>
        </div>
        <div className="tools">
          <div className="search"><Search size={15}/><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="搜索记录"/></div>
        </div>
      </div>
      <div className="timeline">
        {filtered.length === 0 && <div className="board-empty"><History size={18}/><span>暂无处置记录</span></div>}
        {filtered.map((r) => (
          <div key={r.id} className="tl-item">
            <span className={`log-tag tag-${r.action}`}>{r.action}</span>
            <div className="tl-body">
              <div className="tl-meta">
                {r.depId !== undefined && <b>{depName(deps, r.depId)}</b>}
                <time>{fmt(r.ts)}</time>
              </div>
              <p>{r.detail}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
