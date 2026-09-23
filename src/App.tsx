// 界面层 / 组合根：License Lens —— 依赖安全公告处置台
// 判定全部来自 domain/*，状态与持久化来自 store/*，本文件只负责装配与交互

import {useMemo, useState} from 'react';
import {
  AlertTriangle,
  ChevronDown,
  Download,
  History,
  Layers3,
  Plus,
  RotateCcw,
  Search,
  ShieldCheck,
  ShieldAlert,
  Sparkles,
  X,
} from 'lucide-react';
import type {Dependency} from './data/types';
import {SEVERITY_LABEL} from './data/types';
import {useConsoleStore} from './store/consoleStore';
import {releaseBlockers, releaseVerdict} from './domain/advisoryPolicy';
import {VerdictTag} from './ui/widgets';
import {BlockedPanel} from './ui/BlockedPanel';
import {AdvisoryBoard} from './ui/AdvisoryBoard';
import {RecordLog} from './ui/RecordLog';
import {DepDetail} from './ui/DepDetail';
import {AdvisoryFormModal, DepFormModal, UpgradeModal, type AdvisoryFormValue} from './ui/Forms';

type Tab = 'deps' | 'advisories' | 'records';

export default function App() {
  const store = useConsoleStore();
  const {deps, advisories, records, blockersByDep} = store;

  const [tab, setTab] = useState<Tab>('deps');
  const [selected, setSelected] = useState<number | null>(deps[0]?.id ?? null);
  const [query, setQuery] = useState('');
  const [showDepForm, setShowDepForm] = useState(false);
  const [showAdvForm, setShowAdvForm] = useState(false);
  const [upgradeDep, setUpgradeDep] = useState<Dependency | null>(null);
  const [popupBlockers, setPopupBlockers] = useState<number | null>(null);

  const current = deps.find((d) => d.id === selected) ?? null;

  const stats = useMemo(() => {
    const open = advisories.filter((a) => a.status === 'active' || a.status === 'draft');
    const active = advisories.filter((a) => a.status === 'active');
    const drafts = advisories.filter((a) => a.status === 'draft');
    const blockedDepIds = new Set<number>();
    for (const dep of deps) {
      if (releaseBlockers(dep, advisories).length) blockedDepIds.add(dep.id);
    }
    const overdue = open.filter((a) => a.dueDate && a.dueDate < new Date().toISOString().slice(0, 10));
    return {open: open.length, active: active.length, drafts: drafts.length, blocked: blockedDepIds.size, overdue: overdue.length};
  }, [advisories, deps]);

  const filteredDeps = useMemo(
    () => deps.filter((d) => `${d.name} ${d.license} ${d.ecosystem}`.toLowerCase().includes(query.toLowerCase())),
    [deps, query],
  );

  const selectDep = (id: number) => {
    setSelected(id);
    setTab('deps');
  };

  const handleAddDep = (input: Omit<Dependency, 'id' | 'releaseIntent'>) => {
    const id = store.addDep(input);
    setShowDepForm(false);
    setSelected(id);
  };

  const handleAddAdvisory = (v: AdvisoryFormValue) => {
    store.addAdvisory({
      depId: v.depId,
      title: v.title,
      affectedRange: v.affectedRange,
      severity: v.severity,
      fixedVersion: v.fixedVersion,
      owner: v.owner,
      dueDate: v.dueDate,
      sources: [v.source],
    });
    setShowAdvForm(false);
    setSelected(v.depId);
    setTab('deps');
  };

  const handleRequestRelease = (depId: number, want: boolean) => {
    const ok = store.requestRelease(depId, want);
    if (want && !ok) setPopupBlockers(depId); // 受阻：弹窗列出依赖、区间、规则、原值
  };

  const popupDep = popupBlockers !== null ? deps.find((d) => d.id === popupBlockers) ?? null : null;
  const popupList = popupDep ? releaseBlockers(popupDep, advisories) : [];

  const exportReport = () => {
    const lines: string[] = [];
    lines.push('# 依赖安全公告处置报告');
    lines.push(`\n> 生成时间 ${new Date().toLocaleString('zh-CN')} · License Lens Security Console\n`);
    lines.push('## 依赖与发布结论\n');
    lines.push('| 依赖 | 版本 | 许可证 | 发布结论 | 阻断公告数 |');
    lines.push('|---|---|---|---|---|');
    for (const d of deps) {
      const v = releaseVerdict(d, advisories);
      const label = v === 'releasable' ? '可发布' : v === 'blocked' ? '受阻' : '未申请';
      lines.push(`| ${d.name} | ${d.version} | ${d.license} | ${label} | ${releaseBlockers(d, advisories).length} |`);
    }
    lines.push('\n## 开放公告\n');
    lines.push('| 依赖 | 标题 | 受影响区间 | 级别 | 修复版本 | 责任人 | 截止 | 状态 | 来源 |');
    lines.push('|---|---|---|---|---|---|---|---|---|');
    for (const a of advisories.filter((x) => x.status === 'active' || x.status === 'draft')) {
      const dep = deps.find((d) => d.id === a.depId);
      lines.push(`| ${dep?.name ?? '#' + a.depId} | ${a.title} | ${a.affectedRange} | ${SEVERITY_LABEL[a.severity]} | ${a.fixedVersion || '未发布'} | ${a.owner || '缺'} | ${a.dueDate} | ${a.status === 'draft' ? '草稿' : '生效'} | ${a.sources.join('+')} |`);
    }
    const blob = new Blob([lines.join('\n')], {type: 'text/markdown'});
    const url = URL.createObjectURL(blob);
    const el = document.createElement('a');
    el.href = url;
    el.download = 'security-advisory-report.md';
    el.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="shell">
      <aside>
        <div className="brand">
          <div className="brand-icon"><ShieldCheck size={18}/></div>
          <div><b>License Lens</b><small>security advisory desk</small></div>
        </div>
        <div className="nav-title">WORKSPACE · AURORA-WEB</div>
        <button className={`nav ${tab === 'deps' ? 'active' : ''}`} onClick={() => setTab('deps')}>
          <Layers3 size={16}/>依赖总览 <span>{deps.length}</span>
        </button>
        <button className={`nav ${tab === 'advisories' ? 'active' : ''}`} onClick={() => setTab('advisories')}>
          <ShieldAlert size={16}/>公告台账 <span className="red">{stats.open}</span>
        </button>
        <button className={`nav ${tab === 'records' ? 'active' : ''}`} onClick={() => setTab('records')}>
          <History size={16}/>处置记录 <span>{records.length}</span>
        </button>
        <div className="aside-bottom">
          <div className="mini-card">
            <Sparkles size={16}/>
            <div><b>{stats.blocked} 个依赖发布受阻</b><small>{stats.active} 条生效 · {stats.drafts} 条草稿 · {stats.overdue} 条临期/逾期</small></div>
          </div>
          <div className="user"><div className="avatar">ZL</div><span>Zen Li</span><ChevronDown size={14}/></div>
        </div>
      </aside>

      <main>
        <header>
          <div>
            <div className="crumb">WORKSPACE / <b>SECURITY ADVISORY DESK</b></div>
            <h1>依赖安全公告处置台</h1>
            <p>录入公告与处置资料，自动裁定草稿、合并来源、卡住高风险发布。</p>
          </div>
          <div className="head-actions">
            <button className="outline" onClick={exportReport}><Download size={15}/>导出报告</button>
            <button className="outline" onClick={() => {if (confirm('重置为初始演示数据？本地修改将被清除。')) store.reset();}}>
              <RotateCcw size={14}/>重置演示数据
            </button>
            <button className="primary" onClick={() => setShowAdvForm(true)}><Plus size={16}/>录入公告</button>
          </div>
        </header>

        <section className="hero">
          <div>
            <span className="tag">RULE SET · 发布闸门</span>
            <h2>未关闭的高危公告命中当前版本 → 禁止发布</h2>
            <p>
              共 <b>{deps.length} 个依赖</b>，<b className="warning">{stats.active} 条生效公告</b>、
              <b className="warning"> {stats.drafts} 条草稿</b>，<b className="warning">{stats.blocked} 个依赖</b>发布受阻；
              升级后重新扫描，脱离区间的旧公告自动归档。
            </p>
          </div>
          <div className="rule-chips">
            <span><i>R1</i> 修复版本仍在受影响区间 → 草稿</span>
            <span><i>R2</i> 缺责任人 → 草稿</span>
            <span><i>R3</i> 高危/严重未关闭且命中 → 阻断</span>
          </div>
        </section>

        <section className="summary">
          <div><span>全部依赖</span><b>{deps.length}</b><small>跨 {new Set(deps.map((d) => d.ecosystem)).size} 个生态</small></div>
          <div><span>生效公告</span><b className="red">{stats.active}</b><small>参与发布拦截裁定</small></div>
          <div><span>草稿公告</span><b className="orange">{stats.drafts}</b><small>R1 修复在区间内 / R2 缺责任人</small></div>
          <div><span>受阻依赖</span><b className="red">{stats.blocked}</b><small>需升级到修复版本或人工关闭</small></div>
        </section>

        {tab === 'deps' && (
          <>
            <section className="workspace">
              <div className="table-pane">
                <div className="pane-head">
                  <div><h2>依赖清单</h2><p>选择依赖查看公告与发布结论</p></div>
                  <div className="tools">
                    <div className="search"><Search size={15}/><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="搜索依赖"/></div>
                    <button className="primary small" onClick={() => setShowDepForm(true)}><Plus size={14}/>依赖</button>
                  </div>
                </div>
                <div className="table">
                  <div className="tr th"><span>依赖名称</span><span>版本</span><span>许可证</span><span>发布结论</span></div>
                  {filteredDeps.map((d) => {
                    const blockers = blockersByDep.get(d.id) ?? [];
                    const v = releaseVerdict(d, advisories);
                    return (
                      <button key={d.id} className={d.id === selected ? 'tr selected' : 'tr'} onClick={() => setSelected(d.id)}>
                        <span className="dep-name"><span className={`pkg-dot ${blockers.length ? 'hot' : ''}`}/>{d.name}<small className="eco">{d.ecosystem}</small></span>
                        <span className="muted">{d.version}</span>
                        <span><i className="license">{d.license}</i></span>
                        <span className="verdict-cell">
                          <VerdictTag verdict={v}/>
                          {blockers.length > 0 && <em className="block-count"><AlertTriangle size={11}/>{blockers.length}</em>}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <DepDetail
                dep={current}
                advisories={advisories}
                records={records}
                blockers={current ? blockersByDep.get(current.id) ?? [] : []}
                onClose={() => setSelected(null)}
                onUpgrade={() => current && setUpgradeDep(current)}
                onRequestRelease={(want) => current && handleRequestRelease(current.id, want)}
                onSaveAdvisory={store.updateAdvisory}
                onCloseAdvisory={store.closeAdvisory}
              />
            </section>
          </>
        )}

        {tab === 'advisories' && <AdvisoryBoard deps={deps} advisories={advisories} onSelectDep={selectDep}/>}
        {tab === 'records' && <RecordLog deps={deps} records={records}/>}
      </main>

      {showDepForm && <DepFormModal onClose={() => setShowDepForm(false)} onSubmit={handleAddDep}/>}
      {showAdvForm && (
        <AdvisoryFormModal
          defaultDepId={current?.id ?? deps[0]?.id ?? 0}
          deps={deps}
          onClose={() => setShowAdvForm(false)}
          onSubmit={handleAddAdvisory}
        />
      )}
      {upgradeDep && (
        <UpgradeModal
          dep={upgradeDep}
          onClose={() => setUpgradeDep(null)}
          onSubmit={(version) => {
            store.upgradeDep(upgradeDep.id, version);
            setUpgradeDep(null);
          }}
        />
      )}

      {popupDep && (
        <div className="backdrop" onClick={() => setPopupBlockers(null)}>
          <div className="modal wide" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h2>无法标记 {popupDep.name} 可发布</h2>
              <button onClick={() => setPopupBlockers(null)}><X size={17}/></button>
            </div>
            <p className="modal-note">已记录一次被阻止的发布尝试；请先升级到修复版本或人工关闭公告，再重新扫描。</p>
            <BlockedPanel blockers={popupList} title="发布受阻明细"/>
          </div>
        </div>
      )}
    </div>
  );
}
