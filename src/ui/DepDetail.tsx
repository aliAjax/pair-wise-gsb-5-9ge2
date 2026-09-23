// 界面层：依赖详情 —— 发布结论、命中公告、升级/发布操作与受阻原值

import {useEffect, useState} from 'react';
import {ArrowUpCircle, CheckCircle2, Package, ShieldCheck, ShieldX, X} from 'lucide-react';
import type {Advisory, Dependency, HandlingRecord} from '../data/types';
import {releaseVerdict, type Blocker} from '../domain/advisoryPolicy';
import {SeverityBadge, StatusPill, VerdictTag, DraftReason} from './widgets';
import {BlockedPanel} from './BlockedPanel';
import {AdvisoryEditor} from './AdvisoryEditor';

export function DepDetail({dep, advisories, records, blockers, onClose, onUpgrade, onRequestRelease, onSaveAdvisory, onCloseAdvisory}: {
  dep: Dependency | null;
  advisories: Advisory[];
  records: HandlingRecord[];
  blockers: Blocker[];
  onClose: () => void;
  onUpgrade: () => void;
  onRequestRelease: (want: boolean) => void;
  onSaveAdvisory: (a: Advisory) => void;
  onCloseAdvisory: (id: number) => void;
}) {
  const [editing, setEditing] = useState<Advisory | null>(null);
  const [showBlockers, setShowBlockers] = useState(false);

  useEffect(() => {
    setEditing(null);
    setShowBlockers(false);
  }, [dep?.id]);

  if (!dep) {
    return (
      <div className="detail empty-detail">
        <Package size={26}/>
        <b>选择左侧依赖</b>
        <p>查看安全公告、发布结论与处置记录。</p>
      </div>
    );
  }

  const verdict = releaseVerdict(dep, advisories);
  const depAdvisories = [...advisories.filter((a) => a.depId === dep.id)].sort(
    (a, b) => Number(a.status === 'archived' || a.status === 'closed') - Number(b.status === 'archived' || b.status === 'closed'),
  );
  const depRecords = records.filter((r) => r.depId === dep.id).slice(0, 6);

  return (
    <div className="detail">
      <div className="detail-head">
        <div className="detail-icon dep-ic"><Package size={20}/></div>
        <div className="grow">
          <span>SELECTED DEPENDENCY · {dep.ecosystem}</span>
          <h2>{dep.name} <small className="ver-line">v{dep.version}</small></h2>
        </div>
        <button className="close" onClick={onClose}><X size={16}/></button>
      </div>

      <div className="detail-grid">
        <div><label>许可证</label><b>{dep.license}</b></div>
        <div><label>来源</label><b>{dep.source}</b></div>
        <div><label>发布结论</label><VerdictTag verdict={verdict}/></div>
      </div>

      <div className={`verdict-banner ${verdict}`}>
        {verdict === 'releasable'
          ? <><ShieldCheck size={17}/><div><b>结论：可发布</b><p>当前版本没有未关闭的高危/严重公告命中。</p></div></>
          : verdict === 'blocked'
            ? <><ShieldX size={17}/><div><b>结论：发布受阻</b><p>存在 {blockers.length} 条未关闭的高危/严重公告命中 {dep.version}，升级或处置后再发布。</p></div></>
            : <><CheckCircle2 size={17}/><div><b>尚未申请发布</b><p>资料齐备后可申请标记为可发布；系统会按规则裁定。</p></div></>}
      </div>

      {verdict === 'blocked' && (
        showBlockers
          ? <BlockedPanel blockers={blockers}/>
          : <button className="link-btn" onClick={() => setShowBlockers(true)}>展开受阻详情（依赖 / 版本区间 / 规则 / 原值）→</button>
      )}

      <div className="detail-actions">
        <button className="outline" onClick={onUpgrade}><ArrowUpCircle size={14}/> 升级并重扫</button>
        {dep.releaseIntent
          ? <button className="outline" onClick={() => onRequestRelease(false)}>撤销发布标记</button>
          : (
            <button className={verdict === 'blocked' ? 'primary danger-soft' : 'primary'} onClick={() => onRequestRelease(true)}>
              {verdict === 'blocked' ? '尝试标记可发布（将被阻止）' : '标记为可发布'}
            </button>
          )}
      </div>

      <div className="sub-head"><h3>安全公告</h3><span>{depAdvisories.filter((a) => a.status === 'active' || a.status === 'draft').length} 开放 / {depAdvisories.length} 全部</span></div>
      <div className="adv-list">
        {depAdvisories.length === 0 && <p className="muted none">没有关联公告。</p>}
        {depAdvisories.map((a) => (
          <div key={a.id} className={`adv-card ${a.status}`}>
            <div className="adv-top">
              <b title={a.title}>{a.title}</b>
              <StatusPill status={a.status}/>
            </div>
            <div className="adv-meta">
              <SeverityBadge severity={a.severity}/>
              <span><code>{a.affectedRange}</code></span>
              <span className="muted">修复 {a.fixedVersion || '未发布'}</span>
            </div>
            <div className="adv-meta">
              <span className="muted">责任人 {a.owner || '—'}</span>
              <span className="muted">截止 {a.dueDate}</span>
            </div>
            <div className="adv-sources">
              {a.sources.map((s) => <i key={s}>{s}</i>)}
              {a.sources.length > 1 && <small>区间重叠已合并来源</small>}
            </div>
            {a.status === 'draft' && <DraftReason reason={a.draftReason}/>}
            {(a.status === 'active' || a.status === 'draft') && (
              <div className="adv-actions">
                <button className="text-btn" onClick={() => setEditing(a)}>编辑处置资料</button>
                <button className="text-btn" onClick={() => onCloseAdvisory(a.id)}>人工关闭</button>
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="sub-head"><h3>最近处置记录</h3></div>
      <div className="mini-log">
        {depRecords.length === 0 && <p className="muted none">暂无记录。</p>}
        {depRecords.map((r) => (
          <div key={r.id} className="log-line">
            <span className={`log-tag tag-${r.action}`}>{r.action}</span>
            <span>{r.detail}</span>
          </div>
        ))}
      </div>

      {editing && (
        <AdvisoryEditor
          advisory={editing}
          onCancel={() => setEditing(null)}
          onSave={(a) => {onSaveAdvisory(a); setEditing(null);}}
        />
      )}
    </div>
  );
}
