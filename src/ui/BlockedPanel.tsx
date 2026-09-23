// 界面层：发布受阻面板 —— 列依赖、版本区间、规则和原值

import {ShieldOff} from 'lucide-react';
import type {Blocker} from '../domain/advisoryPolicy';
import {SEVERITY_LABEL} from '../data/types';

export function BlockedPanel({blockers, title}: {blockers: Blocker[]; title?: string}) {
  if (blockers.length === 0) return null;
  return (
    <div className="blocked-panel">
      <div className="blocked-head">
        <ShieldOff size={15}/>
        <b>{title ?? '发布被阻止'}</b>
        <span>{blockers.length} 条未关闭的高危/严重公告命中当前版本</span>
      </div>
      <div className="blocked-table">
        <div className="btr th">
          <span>依赖 / 公告</span>
          <span>受影响版本区间</span>
          <span>命中规则</span>
          <span>原值</span>
        </div>
        {blockers.map((b, i) => (
          <div className="btr" key={`${b.advisory.id}-${i}`}>
            <span className="b-dep">
              <b>{b.dep.name}</b>
              <small>{b.advisory.title}</small>
              <small className="src">{b.advisory.sources.join(' + ')}</small>
            </span>
            <span>
              <code>{b.evidence.affectedRange}</code>
              <small>当前版本 {b.evidence.depVersion}</small>
            </span>
            <span className="b-rule">{b.rule}</span>
            <span className="b-evidence">
              <small>严重级别：{SEVERITY_LABEL[b.evidence.severity]}</small>
              <small>修复版本：{b.evidence.fixedVersion}</small>
              <small>公告状态：{b.evidence.status === 'active' ? '生效中' : b.evidence.status}</small>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
