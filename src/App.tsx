import {useEffect, useMemo, useState} from 'react';
import {
  AlertTriangle,
  ChevronDown,
  FileCode2,
  Layers3,
  Plus,
  RotateCcw,
  ScrollText,
  ShieldCheck,
  Sparkles,
  Download,
} from 'lucide-react';
import {
  AppState,
  IntakeInput,
  closeTicket,
  draftReasons,
  intakeAdvisory,
  addDependency,
  markReleasable,
  releaseVerdict,
  updateTicket,
  upgradeDependency,
} from './domain/rules';
import {loadState, resetState, saveState} from './storage/store';
import Overview from './components/Overview';
import Advisories from './components/Advisories';
import Records from './components/Records';
import {AddDepModal, IntakeModal} from './components/modals';

type View = 'overview' | 'advisories' | 'records';

export default function App() {
  // 存储层只在初始化/变更时接触；判定全部由 domain 纯函数派生。
  const [state, setState] = useState<AppState>(() => loadState());
  const [view, setView] = useState<View>('overview');
  const [selectedTicket, setSelectedTicket] = useState(0);
  const [showAddDep, setShowAddDep] = useState(false);
  const [showIntake, setShowIntake] = useState(false);

  useEffect(() => saveState(state), [state]);

  const counts = useMemo(() => {
    let draft = 0;
    let highActive = 0;
    for (const t of state.tickets) {
      if (t.lifecycle !== 'active') continue;
      if (draftReasons(state, t).length > 0) draft++;
      if (t.severity === 'high' || t.severity === 'critical') highActive++;
    }
    return {
      blocked: state.deps.filter((d) => releaseVerdict(state, d).verdict === 'blocked').length,
      draft,
      highActive,
    };
  }, [state]);

  const openTicket = (id: number) => {
    setSelectedTicket(id);
    setView('advisories');
  };

  const handleIntake = (input: IntakeInput): string | null => {
    const r = intakeAdvisory(state, input);
    if (!r.ok) return r.error!;
    setState(r.state);
    const ticket = r.state.tickets[r.state.tickets.length - 1];
    setSelectedTicket(ticket?.id ?? 0);
    setView('advisories');
    setShowIntake(false);
    return null;
  };

  const handleAddDep = (v: {name: string; version: string; license: string; source: string; note: string}) => {
    const r = addDependency(state, v);
    if (!r.ok) {
      alert(r.error);
      return;
    }
    setState(r.state);
    setShowAddDep(false);
  };

  const exportMd = () => {
    const lines: string[] = ['# 依赖安全公告处置报告', ''];
    for (const d of state.deps) {
      const {verdict, blockers} = releaseVerdict(state, d);
      lines.push(`## ${d.name}@${d.version}（${d.license}）`);
      lines.push(
        `- 发布结论：${verdict === 'blocked' ? '发布受阻' : verdict === 'releasable' ? '可发布（已标记）' : '无阻断（未标记）'}`,
      );
      for (const b of blockers) {
        lines.push(`- 阻断：票据 #${b.ticketId} ${b.advisoryIds.join('/')}（${b.severity}）区间 ${b.mergedRangeText}`);
        lines.push(`  - ${b.rule}`);
        lines.push(
          `  - 原值：depVersion=${b.original.depVersion}，affectedRange=${b.original.affectedRange}，fixedVersion=${b.original.fixedVersion ?? 'null'}，owner=${b.original.owner || '空'}`,
        );
      }
      lines.push('');
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([lines.join('\n')], {type: 'text/markdown'}));
    a.download = 'security-advisory-report.md';
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="shell">
      <aside>
        <div className="brand">
          <div className="brand-icon">
            <ShieldCheck size={18} />
          </div>
          <div>
            <b>License Lens</b>
            <small>SECURITY ADVISORY DESK</small>
          </div>
        </div>
        <div className="nav-title">WORKSPACE</div>
        <button className={`nav ${view === 'overview' ? 'active' : ''}`} onClick={() => setView('overview')}>
          <Layers3 size={16} />
          依赖发布判定
          <span>{state.deps.length}</span>
        </button>
        <button className={`nav ${view === 'advisories' ? 'active' : ''}`} onClick={() => setView('advisories')}>
          <AlertTriangle size={16} />
          安全公告处置
          <span className={counts.draft > 0 ? 'amber' : ''}>{counts.highActive}</span>
        </button>
        <button className={`nav ${view === 'records' ? 'active' : ''}`} onClick={() => setView('records')}>
          <ScrollText size={16} />
          处置记录
          <span>{state.records.length}</span>
        </button>
        <button className="nav" onClick={() => setShowAddDep(true)}>
          <Plus size={16} />
          添加依赖
        </button>

        <div className="aside-bottom">
          <div className="mini-card">
            <Sparkles size={16} />
            <div>
              <b>结论实时派生</b>
              <small>公告 / 依赖结论 / 处置记录同源，刷新一致</small>
            </div>
          </div>
          <button
            className="nav reset-nav"
            onClick={() => {
              if (confirm('重置为示例数据？当前修改将被清除。')) setState(resetState());
            }}
          >
            <RotateCcw size={14} /> 重置示例数据
          </button>
          <div className="user">
            <div className="avatar">ZL</div>
            <span>Zen Li</span>
            <ChevronDown size={14} />
          </div>
        </div>
      </aside>

      <main>
        <header>
          <div>
            <div className="crumb">
              WORKSPACE / <b>SECURITY ADVISORY DESK</b>
            </div>
            <h1>依赖安全公告处置台</h1>
            <p>录入公告并跟踪修复，未关闭的高危公告会守住发布闸门。</p>
          </div>
          <div className="head-actions">
            <button className="outline" onClick={exportMd}>
              <Download size={15} />
              导出报告
            </button>
            <button className="primary" onClick={() => setShowIntake(true)}>
              <AlertTriangle size={15} />
              录入公告
            </button>
          </div>
        </header>

        {view === 'overview' && (
          <Overview
            state={state}
            onMark={(id) => setState(markReleasable(state, id))}
            onUpgrade={(id, v) => {
              const dep = state.deps.find((d) => d.id === id);
              if (!dep) return '依赖不存在';
              if (v === dep.version) return '新版本与当前版本相同';
              setState(upgradeDependency(state, id, v));
              return null;
            }}
            onSelectTicket={openTicket}
            onAddDep={() => setShowAddDep(true)}
          />
        )}
        {view === 'advisories' && (
          <Advisories
            state={state}
            selectedId={selectedTicket}
            onSelect={setSelectedTicket}
            onAssign={(id, patch) => setState(updateTicket(state, id, patch))}
            onClose={(id, note) => setState(closeTicket(state, id, note))}
          />
        )}
        {view === 'records' && <Records state={state} />}
      </main>

      {showAddDep && <AddDepModal onClose={() => setShowAddDep(false)} onSubmit={handleAddDep} />}
      {showIntake && (
        <IntakeModal state={state} onClose={() => setShowIntake(false)} onSubmit={handleIntake} />
      )}
    </div>
  );
}
