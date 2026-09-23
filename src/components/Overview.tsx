import {useMemo, useState} from 'react';
import {
  AlertTriangle,
  ArrowUpCircle,
  Check,
  FileCode2,
  Info,
  Layers3,
  ShieldAlert,
  ShieldCheck,
} from 'lucide-react';
import {
  AppState,
  Blocker,
  Dep,
  SEVERITY_LABEL,
  releaseVerdict,
  ticketCovers,
  ticketState,
} from '../domain/rules';
import {SeverityBadge} from './ui';
import {UpgradeModal} from './modals';

const LICENSE_COLORS: Record<string, string> = {
  MIT: '#35b995',
  'BSD-3-Clause': '#6d9ee8',
  'GPL-3.0': '#ec8c75',
  'Apache-2.0': '#b18ee4',
  ISC: '#58b0a5',
};

function verdictOf(state: AppState, dep: Dep) {
  return releaseVerdict(state, dep);
}

function VerdictPill({state, dep}: {state: AppState; dep: Dep}) {
  const {verdict} = verdictOf(state, dep);
  if (verdict === 'blocked')
    return (
      <span className="verdict blocked">
        <ShieldAlert size={13} /> 发布受阻
      </span>
    );
  if (verdict === 'releasable')
    return (
      <span className="verdict releasable">
        <Check size={13} /> 可发布
      </span>
    );
  return (
    <span className="verdict can-mark">
      <ShieldCheck size={13} /> 无阻断
    </span>
  );
}

function BlockPanel({
  state,
  dep,
  blockers,
  onUpgrade,
  onMark,
}: {
  state: AppState;
  dep: Dep;
  blockers: Blocker[];
  onUpgrade: () => void;
  onMark: () => void;
}) {
  return (
    <div className="block-panel">
      <div className="block-head">
        <ShieldAlert size={16} />
        <b>发布受阻</b>
        <span>
          {blockers.length} 张未关闭的{blockers.some((b) => b.severity === 'critical') ? '严重/高危' : '高危'}
          公告覆盖当前版本
        </span>
      </div>
      {blockers.map((b) => (
        <div className="block-card" key={b.ticketId}>
          <div className="block-card-head">
            <SeverityBadge severity={b.severity} />
            <b>{b.title}</b>
            <span className="muted">#{b.ticketId}</span>
          </div>
          <div className="block-grid">
            <div>
              <label>依赖 / 当前版本</label>
              <b>
                {dep.name}@{b.depVersion}
              </b>
            </div>
            <div>
              <label>受影响版本区间</label>
              <b className="range-text">{b.mergedRangeText}</b>
            </div>
            <div>
              <label>建议修复版本</label>
              <b>{b.fixedVersion || '无'}</b>
            </div>
            <div>
              <label>责任人 / 截止日</label>
              <b>
                {b.owner || '（空）'}
                {b.dueDate ? ` / ${b.dueDate}` : ''}
              </b>
            </div>
          </div>
          <p className="rule-line">
            <Info size={12} /> {b.rule}
          </p>
          <p className="original-line">
            原值：severity={b.original.severity}（{SEVERITY_LABEL[b.original.severity]}）· depVersion=
            {b.original.depVersion} · affectedRange={b.original.affectedRange} · fixedVersion=
            {b.original.fixedVersion ?? 'null'} · owner={b.original.owner || '（空）'}
          </p>
        </div>
      ))}
      <div className="block-actions">
        <button className="outline" onClick={onUpgrade}>
          <ArrowUpCircle size={14} /> 升级后重新扫描
        </button>
        <button className="ghost-danger" onClick={onMark}>
          仍尝试标记可发布（记录阻断）
        </button>
      </div>
    </div>
  );
}

export default function Overview({
  state,
  onMark,
  onUpgrade,
  onSelectTicket,
  onAddDep,
}: {
  state: AppState;
  onMark: (id: number) => void;
  onUpgrade: (id: number, version: string) => string | null;
  onSelectTicket: (id: number) => void;
  onAddDep: () => void;
}) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'blocked' | 'releasable' | 'can-mark'>('all');
  const [selected, setSelected] = useState<number>(state.deps[0]?.id ?? 0);
  const [upgrading, setUpgrading] = useState<Dep | null>(null);

  const rows = useMemo(
    () =>
      state.deps
        .map((d) => ({dep: d, ...releaseVerdict(state, d)}))
        .filter((r) => filter === 'all' || r.verdict === filter)
        .filter((r) => `${r.dep.name}@${r.dep.version}`.toLowerCase().includes(query.toLowerCase())),
    [state, query, filter],
  );

  const current = state.deps.find((d) => d.id === selected) ?? null;
  const currentResult = current ? releaseVerdict(state, current) : null;
  const currentTickets = current
    ? state.tickets.filter((t) => t.depId === current.id).map((t) => ({t, ts: ticketState(state, t)}))
    : [];

  const blockedCount = state.deps.filter((d) => releaseVerdict(state, d).verdict === 'blocked').length;
  const releasableCount = state.deps.filter((d) => releaseVerdict(state, d).verdict === 'releasable').length;
  const activeHigh = state.tickets.filter(
    (t) => t.lifecycle === 'active' && (t.severity === 'high' || t.severity === 'critical'),
  ).length;
  const score = state.deps.length
    ? Math.round((state.deps.filter((d) => releaseVerdict(state, d).verdict !== 'blocked').length / state.deps.length) * 100)
    : 100;

  return (
    <>
      <section className="hero">
        <div>
          <span className="tag">PROJECT · AURORA-WEB</span>
          <h2>发布闸门：高危公告处置台</h2>
          <p>
            扫描 <b>{state.deps.length} 个依赖</b>，<b className="warning">{blockedCount} 个依赖</b> 因未关闭的高危公告
            发布受阻，{activeHigh} 张高危票据在办。
          </p>
        </div>
        <div className="scan-score">
          <div className="score-ring">
            <strong>
              {score}
              <small>%</small>
            </strong>
          </div>
          <div>
            <span>可放行率</span>
            <b>{blockedCount === 0 ? '全部可放行' : '存在阻断'}</b>
            <small>{releasableCount} 个已标记可发布</small>
          </div>
        </div>
      </section>

      <section className="summary">
        <div>
          <span>全部依赖</span>
          <b>{state.deps.length}</b>
          <small>清单与许可证视图共用</small>
        </div>
        <div>
          <span>发布受阻</span>
          <b className="red">{blockedCount}</b>
          <small>高危公告覆盖当前版本</small>
        </div>
        <div>
          <span>已标可发布</span>
          <b className="teal">{releasableCount}</b>
          <small>无未关闭高危阻断</small>
        </div>
        <div>
          <span>在办高危</span>
          <b className="orange">{activeHigh}</b>
          <small>含草稿票据</small>
        </div>
      </section>

      <section className="workspace">
        <div className="table-pane">
          <div className="pane-head">
            <div>
              <h2>依赖发布判定</h2>
              <p>受阻时展开可见依赖、版本区间、规则与原值</p>
            </div>
            <div className="tools">
              <div className="search">
                <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="搜索依赖 / 版本" />
              </div>
              <select value={filter} onChange={(e) => setFilter(e.target.value as any)}>
                <option value="all">全部结论</option>
                <option value="blocked">发布受阻</option>
                <option value="releasable">可发布</option>
                <option value="can-mark">无阻断未标记</option>
              </select>
            </div>
          </div>
          <div className="table">
            <div className="tr th dep-grid">
              <span>依赖</span>
              <span>版本 / 许可证</span>
              <span>覆盖公告</span>
              <span>发布结论</span>
            </div>
            {rows.map(({dep, verdict, blockers}) => {
              const covering = state.tickets.filter(
                (t) => t.lifecycle === 'active' && ticketCovers(t, dep.version),
              ).length;
              return (
                <button
                  key={dep.id}
                  className={`tr dep-grid ${dep.id === selected ? 'selected' : ''}`}
                  onClick={() => setSelected(dep.id)}
                >
                  <span className="dep-name">
                    <span className="pkg-dot" /> {dep.name}
                  </span>
                  <span className="muted">
                    {dep.version}
                    <i
                      className="license"
                      style={{
                        color: LICENSE_COLORS[dep.license] || '#888',
                        background: (LICENSE_COLORS[dep.license] || '#888') + '18',
                      }}
                    >
                      {dep.license}
                    </i>
                  </span>
                  <span>{covering > 0 ? `${covering} 张覆盖` : '—'}</span>
                  <span>
                    <VerdictPill state={state} dep={dep} />
                    {verdict === 'blocked' && blockers.length > 0 && (
                      <em className="block-count">{blockers.length}</em>
                    )}
                  </span>
                </button>
              );
            })}
            {rows.length === 0 && <p className="empty-inline">没有匹配的依赖</p>}
          </div>
          <div className="pane-foot">
            <button className="text-btn" onClick={onAddDep}>
              + 添加依赖
            </button>
          </div>
        </div>

        <div className="detail">
          {current && currentResult && (
            <>
              <div className="detail-head">
                <div
                  className="detail-icon"
                  style={{
                    background: (LICENSE_COLORS[current.license] || '#888') + '1c',
                    color: LICENSE_COLORS[current.license] || '#888',
                  }}
                >
                  <FileCode2 size={20} />
                </div>
                <div>
                  <span>SELECTED DEPENDENCY</span>
                  <h2>
                    {current.name} <small>{current.version}</small>
                  </h2>
                </div>
              </div>

              <div className="detail-grid">
                <div>
                  <label>许可证</label>
                  <b>{current.license}</b>
                </div>
                <div>
                  <label>来源</label>
                  <b>{current.source}</b>
                </div>
                <div>
                  <label>发布标记</label>
                  <b>{current.releaseMarked ? '已标记可发布' : '未标记'}</b>
                </div>
              </div>

              {currentResult.verdict === 'blocked' ? (
                <BlockPanel
                  state={state}
                  dep={current}
                  blockers={currentResult.blockers}
                  onUpgrade={() => setUpgrading(current)}
                  onMark={() => onMark(current.id)}
                />
              ) : (
                <div className={`finding ${currentResult.verdict === 'releasable' ? 'ok' : 'warn'}`}>
                  <div className="finding-icon">
                    {currentResult.verdict === 'releasable' ? <ShieldCheck size={16} /> : <Check size={16} />}
                  </div>
                  <div>
                    <b>{currentResult.verdict === 'releasable' ? '可发布' : '当前无高危阻断'}</b>
                    <p>
                      {current.releaseMarked
                        ? '该依赖已标为可发布；升级版本后标记会重置并重新扫描。'
                        : '没有覆盖当前版本的未关闭高危公告，可标记为可发布。中低危公告仍建议按票据跟踪。'}
                    </p>
                    <div className="finding-actions">
                      {!current.releaseMarked && (
                        <button className="primary sm" onClick={() => onMark(current.id)}>
                          标为可发布
                        </button>
                      )}
                      <button className="outline sm" onClick={() => setUpgrading(current)}>
                        <ArrowUpCircle size={13} /> 升级重扫
                      </button>
                    </div>
                  </div>
                </div>
              )}

              <div className="ticket-refs">
                <p className="refs-title">
                  <Layers3 size={13} /> 关联票据（{currentTickets.length}）
                </p>
                {currentTickets.length === 0 && <p className="muted small">暂无公告票据</p>}
                {currentTickets.map(({t, ts}) => (
                  <button key={t.id} className="ticket-ref" onClick={() => onSelectTicket(t.id)}>
                    <SeverityBadge severity={t.severity} />
                    <span className="ticket-ref-title">{t.sources[0].title}</span>
                    <span className={`tstate mini ${ts}`}>{ts === 'draft' ? '草稿' : ts === 'open' ? '待处置' : ts === 'closed' ? '已关闭' : '已归档'}</span>
                    <span className="muted small">#{t.id}</span>
                  </button>
                ))}
              </div>

              <div className="full-license">
                <div>
                  <Info size={15} />
                  <span>许可证备注</span>
                </div>
                <p>{current.note || `${current.license}：分发前请核对仓库 LICENSE 全文义务。`}</p>
              </div>
            </>
          )}
        </div>
      </section>

      {upgrading && (
        <UpgradeModal
          state={state}
          dep={upgrading}
          onClose={() => setUpgrading(null)}
          onSubmit={(v) => {
            const e = onUpgrade(upgrading.id, v);
            if (!e) setUpgrading(null);
            return e;
          }}
        />
      )}
    </>
  );
}
