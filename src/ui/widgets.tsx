// 界面层：通用展示组件（徽章、状态标签等纯展示）

import {AlertTriangle, Archive, Check, FileEdit, Info} from 'lucide-react';
import type {AdvisoryStatus, Severity} from '../data/types';
import {SEVERITY_LABEL} from '../data/types';

const severityStyle: Record<Severity, {color: string; bg: string}> = {
  low: {color: '#5b8def', bg: '#eef4ff'},
  medium: {color: '#c78a43', bg: '#fff7eb'},
  high: {color: '#d66c5e', bg: '#fff1ef'},
  critical: {color: '#fff', bg: '#d1493b'},
};

export function SeverityBadge({severity}: {severity: Severity}) {
  const s = severityStyle[severity];
  return (
    <i className="badge" style={{color: s.color, background: s.bg}}>
      {SEVERITY_LABEL[severity]}
    </i>
  );
}

const statusMeta: Record<AdvisoryStatus, {label: string; cls: string}> = {
  draft: {label: '草稿', cls: 'draft'},
  active: {label: '生效中', cls: 'active'},
  closed: {label: '已关闭', cls: 'closed'},
  archived: {label: '已归档', cls: 'archived'},
};

export function StatusPill({status}: {status: AdvisoryStatus}) {
  const m = statusMeta[status];
  return <span className={`pill ${m.cls}`}>{m.label}</span>;
}

export function DraftReason({reason}: {reason?: string}) {
  if (!reason) return null;
  return (
    <div className="draft-reason">
      <Info size={13}/>
      <span>{reason}</span>
    </div>
  );
}

export function VerdictTag({verdict}: {verdict: 'releasable' | 'blocked' | 'not-requested'}) {
  if (verdict === 'releasable') {
    return (
      <span className="verdict ok">
        <Check size={13}/> 可发布
      </span>
    );
  }
  if (verdict === 'blocked') {
    return (
      <span className="verdict blocked">
        <AlertTriangle size={13}/> 发布受阻
      </span>
    );
  }
  return (
    <span className="verdict idle">
      <FileEdit size={13}/> 未申请
    </span>
  );
}

export function ArchivedTag({show}: {show: boolean}) {
  if (!show) return null;
  return (
    <span className="archived-inline">
      <Archive size={12}/> 历史
    </span>
  );
}
