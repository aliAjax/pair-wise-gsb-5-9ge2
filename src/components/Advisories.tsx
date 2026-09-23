import {useMemo, useState} from 'react';
import {
  AlertTriangle,
  Archive,
  CheckCircle2,
  ClipboardList,
  FileWarning,
  GitMerge,
  User,
} from 'lucide-react';
import {
  AppState,
  DRAFT_REASON_TEXT,
  Ticket,
  SEVERITY_LABEL,
  draftReasons,
  isHigh,
  ticketCovers,
  ticketState,
} from '../domain/rules';
import {SeverityBadge, TicketBadge} from './ui';
import {AssignModal, CloseModal} from './modals';

type Tab = 'active' | 'draft' | 'closed' | 'archived';

function SourceRows({ticket}: {ticket: Ticket}) {
  return (
    <div className="sources">
      <p className="sources-title">
        <GitMerge size={13} /> 合并来源（{ticket.sources.length}）
      </p>
      {ticket.sources.map((s) => (
        <div className="source-row" key={s.advisoryId}>
          <div className="source-head">
            <SeverityBadge severity={s.severity} />
            <b>{s.advisoryId}</b>
            <span className="muted">{s.origin}</span>
          </div>
          <p>{s.title}</p>
          <p className="source-meta">
            原始区间 <code>{s.affectedRange}</code>
            {' · '}建议修复 <code>{s.fixedVersion || '无'}</code>
          </p>
        </div>
      ))}
    </div>
  );
}

export default function Advisories({
  state,
  selectedId,
  onSelect,
  onAssign,
  onClose,
}: {
  state: AppState;
  selectedId: number;
  onSelect: (id: number) => void;
  onAssign: (id: number, patch: {owner: string; dueDate: string | null}) => void;
  onClose: (id: number, note: string) => void;
}) {
  const [tab, setTab] = useState<Tab>('active');
  const [query, setQuery] = useState('');
  const [assign, setAssign] = useState<Ticket | null>(null);
  const [closeFor, setCloseFor] = useState<number | null>(null);

  const enriched = useMemo(
    () => state.tickets.map((t) => ({t, ts: ticketState(state, t)})),
    [state],
  );

  const counts = {
    active: enriched.filter(({ts}) => ts === 'open').length,
    draft: enriched.filter(({ts}) => ts === 'draft').length,
    closed: enriched.filter(({ts}) => ts === 'closed').length,
    archived: enriched.filter(({ts}) => ts === 'archived').length,
  };

  const list = enriched
    .filter(({ts}) => ts === tab)
    .filter(({t}) => {
      const dep = state.deps.find((d) => d.id === t.depId);
      const hay = `${dep?.name ?? ''} ${t.sources.map((s) => `${s.advisoryId} ${s.title}`).join(' ')}`.toLowerCase();
      return hay.includes(query.toLowerCase());
    })
    .sort((a, b) => b.t.id - a.t.id);

  const current = state.tickets.find((t) => t.id === selectedId) ?? list[0]?.t ?? null;
  const currentEnriched = current ? {t: current, ts: ticketState(state, current)} : null;
  const currentDep = current ? state.deps.find((d) => d.id === current.depId) : null;
  const currentReasons = current ? draftReasons(state, current) : [];
  const overdue =
    current &&
    current.lifecycle === 'active' &&
    current.dueDate &&
    new Date(current.dueDate) < new Date(new Date().toDateString());
  const coveringNow = current && currentDep ? ticketCovers(current, currentDep.version) : false;

  const tabs: {key: Tab; label: string; n: number}[] = [
    {key: 'active', label: '待处置', n: counts.active},
    {key: 'draft', label: '草稿', n: counts.draft},
    {key: 'closed', label: '已关闭', n: counts.closed},
    {key: 'archived', label: '已归档', n: counts.archived},
  ];

  return (
    <>
      <section className="adv-tabs">
        {tabs.map((tb) => (
          <button key={tb.key} className={`adv-tab ${tab === tb.key ? 'active' : ''}`} onClick={() => setTab(tb.key)}>
            {tb.label}
            <span className={tb.key === 'draft' && tb.n > 0 ? 'pulse' : ''}>{tb.n}</span>
          </button>
        ))}
        <div className="adv-search">
          <input className="ctl" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="搜索依赖 / 公告编号 / 标题" />
        </div>
      </section>

      <section className="workspace">
        <div className="table-pane">
          <div className="table">
            <div className="tr th ticket-grid">
              <span>依赖 / 公告</span>
              <span>级别</span>
              <span>责任人 / 截止</span>
              <span>结论</span>
            </div>
            {list.map(({t, ts}) => {
              const dep = state.deps.find((d) => d.id === t.depId);
              const over =
                t.lifecycle === 'active' && t.dueDate && new Date(t.dueDate) < new Date(new Date().toDateString());
              return (
                <button
                  key={t.id}
                  className={`tr ticket-grid ${current?.id === t.id ? 'selected' : ''}`}
                  onClick={() => onSelect(t.id)}
                >
                  <span>
                    <b className="dep-name">{dep?.name ?? `#${t.depId}`}</b>
                    <small className="block-id">
                      {t.sources[0].advisoryId}
                      {t.sources.length > 1 && <em className="merge-tag">+{t.sources.length - 1} 来源合并</em>}
                    </small>
                  </span>
                  <span>
                    <SeverityBadge severity={t.severity} />
                  </span>
                  <span className={over ? 'overdue' : ''}>
                    {t.owner || <em className="muted">未指派</em>}
                    {t.dueDate ? <small className={over ? 'overdue' : 'muted'}> · {t.dueDate}</small> : ''}
                  </span>
                  <span>
                    <TicketBadge state={ts} />
                  </span>
                </button>
              );
            })}
            {list.length === 0 && <p className="empty-inline">没有“{tabs.find((t) => t.key === tab)?.label}”票据</p>}
          </div>
        </div>

        <div className="detail ticket-detail">
          {current && currentEnriched && currentDep ? (
            <>
              <div className="detail-head">
                <div
                  className={`detail-icon ${isHigh(current.severity) ? 'danger' : ''}`}
                >
                  {currentEnriched.ts === 'draft' ? (
                    <FileWarning size={20} />
                  ) : current.lifecycle === 'archived' ? (
                    <Archive size={20} />
                  ) : current.lifecycle === 'closed' ? (
                    <CheckCircle2 size={20} />
                  ) : (
                    <ClipboardList size={20} />
                  )}
                </div>
                <div>
                  <span>
                    TICKET #{current.id} · {currentDep.name}@{currentDep.version}
                  </span>
                  <h2>{current.sources[0].title}</h2>
                </div>
                <TicketBadge state={currentEnriched.ts} />
              </div>

              <div className="detail-grid">
                <div>
                  <label>合并受影响区间</label>
                  <b className="range-text">{current.mergedRangeText}</b>
                </div>
                <div>
                  <label>修复版本</label>
                  <b className={currentReasons.includes('fixed-in-range') ? 'danger-text' : ''}>
                    {current.fixedVersion || '无'}
                  </b>
                </div>
                <div>
                  <label>当前版本是否受影响</label>
                  <b className={coveringNow ? 'danger-text' : 'teal-text'}>
                    {coveringNow ? `是（${currentDep.version} 在区间内）` : '否'}
                  </b>
                </div>
              </div>

              {current.lifecycle === 'active' && currentReasons.length > 0 && (
                <div className="finding risk draft-box">
                  <div className="finding-icon">
                    <AlertTriangle size={16} />
                  </div>
                  <div>
                    <b>票据仅保存为草稿，不进入处置流程</b>
                    <ul>
                      {currentReasons.map((r) => (
                        <li key={r}>{DRAFT_REASON_TEXT[r]}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}

              {current.lifecycle === 'active' && isHigh(current.severity) && coveringNow && (
                <div className="finding risk">
                  <div className="finding-icon">
                    <AlertTriangle size={16} />
                  </div>
                  <div>
                    <b>{SEVERITY_LABEL[current.severity]}未关闭，正在阻断 {currentDep.name} 发布</b>
                    <p>升级到 {current.fixedVersion || '区间外版本'} 并重新扫描后，票据可归档并解除阻断。</p>
                  </div>
                </div>
              )}

              {overdue && (
                <p className="overdue-banner">已超过截止日 {current.dueDate}，请尽快处置</p>
              )}

              {current.lifecycle === 'closed' && (
                <div className="finding ok">
                  <div className="finding-icon">
                    <CheckCircle2 size={16} />
                  </div>
                  <div>
                    <b>票据已关闭</b>
                    <p>{current.closedNote}</p>
                  </div>
                </div>
              )}
              {current.lifecycle === 'archived' && (
                <div className="finding ok">
                  <div className="finding-icon">
                    <Archive size={16} />
                  </div>
                  <div>
                    <b>旧公告已归档</b>
                    <p>{current.closedNote}</p>
                  </div>
                </div>
              )}

              {current.lifecycle === 'active' && (
                <div className="assign-row">
                  <div>
                    <User size={14} />
                    <span>{current.owner || '未指派责任人'}</span>
                    {current.dueDate ? <small>截止 {current.dueDate}</small> : <small>未设截止日</small>}
                  </div>
                  <button className="outline sm" onClick={() => setAssign(current)}>
                    指派 / 改期
                  </button>
                </div>
              )}

              <SourceRows ticket={current} />

              {current.lifecycle === 'active' && (
                <div className="ticket-actions">
                  <button className="primary sm" onClick={() => setCloseFor(current.id)}>
                    验证并关闭票据
                  </button>
                  <span className="muted small">关闭需以“已升级 / 风险已隔离”为前提，动作记入处置记录</span>
                </div>
              )}
            </>
          ) : (
            <p className="empty-inline">选择左侧票据查看合并来源与处置操作</p>
          )}
        </div>
      </section>

      {assign && (
        <AssignModal
          ticket={assign}
          onClose={() => setAssign(null)}
          onSubmit={(patch) => {
            onAssign(assign.id, patch);
            setAssign(null);
          }}
        />
      )}
      {closeFor !== null && (
        <CloseModal
          ticketId={closeFor}
          onClose={() => setCloseFor(null)}
          onSubmit={(note) => {
            onClose(closeFor, note);
            setCloseFor(null);
          }}
        />
      )}
    </>
  );
}
