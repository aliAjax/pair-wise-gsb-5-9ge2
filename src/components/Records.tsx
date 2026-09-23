import {useMemo, useState} from 'react';
import {
  ArrowUpCircle,
  Archive,
  CheckCircle2,
  GitMerge,
  Plus,
  ScrollText,
  ShieldAlert,
  ShieldCheck,
  UserCog,
  XCircle,
} from 'lucide-react';
import {AppState, RecordKind} from '../domain/rules';

const KIND_META: Record<RecordKind, {label: string; icon: any; cls: string}> = {
  intake: {label: '录入', icon: Plus, cls: 'k-intake'},
  merge: {label: '合并', icon: GitMerge, cls: 'k-merge'},
  update: {label: '指派', icon: UserCog, cls: 'k-update'},
  block: {label: '阻断', icon: ShieldAlert, cls: 'k-block'},
  release: {label: '放行', icon: ShieldCheck, cls: 'k-release'},
  upgrade: {label: '升级重扫', icon: ArrowUpCircle, cls: 'k-upgrade'},
  archive: {label: '归档', icon: Archive, cls: 'k-archive'},
  close: {label: '关闭', icon: CheckCircle2, cls: 'k-close'},
  add: {label: '添加依赖', icon: Plus, cls: 'k-add'},
};

const FILTERS: {key: 'all' | RecordKind; label: string}[] = [
  {key: 'all', label: '全部'},
  {key: 'intake', label: '录入'},
  {key: 'merge', label: '合并'},
  {key: 'block', label: '阻断'},
  {key: 'release', label: '放行'},
  {key: 'upgrade', label: '升级重扫'},
  {key: 'archive', label: '归档'},
  {key: 'close', label: '关闭'},
  {key: 'update', label: '指派'},
];

function fmt(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export default function Records({state}: {state: AppState}) {
  const [kind, setKind] = useState<'all' | RecordKind>('all');
  const [query, setQuery] = useState('');

  const rows = useMemo(
    () =>
      [...state.records]
        .sort((a, b) => (a.at < b.at ? 1 : -1))
        .filter((r) => kind === 'all' || r.kind === kind)
        .filter((r) => `${r.depName} ${r.text}`.toLowerCase().includes(query.toLowerCase())),
    [state.records, kind, query],
  );

  return (
    <section className="records-view">
      <div className="pane-head records-head">
        <div>
          <h2>处置记录</h2>
          <p>
            <ScrollText size={12} /> 所有判定与操作均由此追加，刷新后与公告结论、依赖结论保持一致（共 {state.records.length} 条）
          </p>
        </div>
        <div className="tools">
          <input className="ctl" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="搜索依赖 / 记录内容" />
        </div>
      </div>
      <div className="record-filters">
        {FILTERS.map((f) => (
          <button key={f.key} className={`chip ${kind === f.key ? 'active' : ''}`} onClick={() => setKind(f.key)}>
            {f.label}
          </button>
        ))}
      </div>
      <div className="timeline">
        {rows.map((r) => {
          const meta = KIND_META[r.kind];
          const Icon = r.kind === 'block' ? XCircle : meta.icon;
          return (
            <div className={`titem ${meta.cls}`} key={r.id}>
              <div className="t-icon">
                <Icon size={15} />
              </div>
              <div className="t-body">
                <div className="t-meta">
                  <span className={`kind-tag ${meta.cls}`}>{meta.label}</span>
                  <b>{r.depName}</b>
                  {r.ticketId !== undefined && <span className="muted">票据 #{r.ticketId}</span>}
                  <time>{fmt(r.at)}</time>
                </div>
                <p>{r.text}</p>
              </div>
            </div>
          );
        })}
        {rows.length === 0 && <p className="empty-inline">没有匹配的处置记录</p>}
      </div>
    </section>
  );
}
