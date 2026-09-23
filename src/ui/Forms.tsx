// 界面层：录入与升级弹窗（仅收集资料；区间合法性在这里做输入校验，状态裁定在判定层）

import {useState} from 'react';
import {X} from 'lucide-react';
import type {Dependency, Severity} from '../data/types';
import {SEVERITY_LABEL} from '../data/types';
import {isValidRange, parseVersion} from '../domain/versionRange';

function ModalShell({title, onClose, children}: {title: string; onClose: () => void; children: React.ReactNode}) {
  return (
    <div className="backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>{title}</h2>
          <button onClick={onClose}><X size={17}/></button>
        </div>
        {children}
      </div>
    </div>
  );
}

const field = 'block w-full';

export function DepFormModal({onClose, onSubmit}: {
  onClose: () => void;
  onSubmit: (d: Omit<Dependency, 'id' | 'releaseIntent'>) => void;
}) {
  const [name, setName] = useState('');
  const [version, setVersion] = useState('1.0.0');
  const [license, setLicense] = useState('MIT');
  const [ecosystem, setEcosystem] = useState('npm');
  const [source, setSource] = useState('手动录入');
  const [note, setNote] = useState('');

  const valid = name.trim().length > 0 && parseVersion(version) !== null;

  return (
    <ModalShell title="录入依赖" onClose={onClose}>
      <label className={field}>依赖名称
        <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="例如 lodash"/>
      </label>
      <div className="form-row">
        <label>当前版本
          <input value={version} onChange={(e) => setVersion(e.target.value)} placeholder="4.17.21"/>
          {version && parseVersion(version) === null && <small className="err">版本号格式不正确</small>}
        </label>
        <label>生态
          <select value={ecosystem} onChange={(e) => setEcosystem(e.target.value)}>
            <option>npm</option><option>pypi</option><option>maven</option><option>go</option><option>内部</option>
          </select>
        </label>
      </div>
      <div className="form-row">
        <label>许可证
          <select value={license} onChange={(e) => setLicense(e.target.value)}>
            <option>MIT</option><option>BSD-3-Clause</option><option>Apache-2.0</option><option>ISC</option><option>GPL-3.0</option><option>WTFPL</option><option>未知</option>
          </select>
        </label>
        <label>来源
          <input value={source} onChange={(e) => setSource(e.target.value)}/>
        </label>
      </div>
      <label className={field}>备注
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="用途、风险背景（可选）"/>
      </label>
      <button
        className="primary full"
        disabled={!valid}
        onClick={() => valid && onSubmit({name: name.trim(), version, license, ecosystem, source, note})}
      >
        加入依赖清单
      </button>
    </ModalShell>
  );
}

export interface AdvisoryFormValue {
  depId: number;
  title: string;
  affectedRange: string;
  severity: Severity;
  fixedVersion: string;
  owner: string;
  dueDate: string;
  source: string;
}

export function AdvisoryFormModal({defaultDepId, deps, onClose, onSubmit}: {
  defaultDepId: number;
  deps: Dependency[];
  onClose: () => void;
  onSubmit: (v: AdvisoryFormValue) => void;
}) {
  const [depId, setDepId] = useState(defaultDepId);
  const [title, setTitle] = useState('');
  const [affectedRange, setAffectedRange] = useState('');
  const [severity, setSeverity] = useState<Severity>('high');
  const [fixedVersion, setFixedVersion] = useState('');
  const [owner, setOwner] = useState('');
  const [dueDate, setDueDate] = useState('2026-10-31');
  const [source, setSource] = useState('GHSA-');

  const rangeValid = isValidRange(affectedRange);
  const fixedHint = fixedVersion.trim() && parseVersion(fixedVersion) === null;
  const valid = title.trim() && rangeValid && depId > 0 && !fixedHint;

  return (
    <ModalShell title="录入安全公告" onClose={onClose}>
      <label className={field}>关联依赖
        <select value={depId} onChange={(e) => setDepId(Number(e.target.value))}>
          {deps.map((d) => (
            <option key={d.id} value={d.id}>{d.ecosystem}:{d.name} @ {d.version}</option>
          ))}
        </select>
      </label>
      <label className={field}>公告标题
        <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="例如：原型链污染"/>
      </label>
      <label className={field}>受影响版本区间
        <input value={affectedRange} onChange={(e) => setAffectedRange(e.target.value)} placeholder=">=4.0.0 <4.17.21（支持 ^ ~ &lt;= || x 通配）"/>
        {affectedRange && !rangeValid && <small className="err">区间表达式无法解析或下界高于上界</small>}
        {rangeValid && <small className="hint">同依赖、区间重叠的开放公告会自动合并来源</small>}
      </label>
      <div className="form-row">
        <label>严重级别
          <select value={severity} onChange={(e) => setSeverity(e.target.value as Severity)}>
            {(Object.keys(SEVERITY_LABEL) as Severity[]).map((s) => (
              <option key={s} value={s}>{SEVERITY_LABEL[s]}</option>
            ))}
          </select>
        </label>
        <label>修复版本
          <input value={fixedVersion} onChange={(e) => setFixedVersion(e.target.value)} placeholder="可留空（上游未发布）"/>
          {fixedHint && <small className="err">修复版本号格式不正确</small>}
        </label>
      </div>
      <div className="form-row">
        <label>责任人
          <input value={owner} onChange={(e) => setOwner(e.target.value)} placeholder="缺责任人将只留草稿"/>
        </label>
        <label>截止日
          <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)}/>
        </label>
      </div>
      <label className={field}>公告来源
        <input value={source} onChange={(e) => setSource(e.target.value)} placeholder="GHSA-xxxx / CVE-xxxx / 内部扫描"/>
      </label>
      <div className="form-hint">
        裁定规则：修复版本仍落在受影响区间，或缺少责任人时，该公告只保留草稿（不拦截发布）。
      </div>
      <button
        className="primary full"
        disabled={!valid}
        onClick={() => valid && onSubmit({depId, title: title.trim(), affectedRange, severity, fixedVersion: fixedVersion.trim(), owner: owner.trim(), dueDate, source: source.trim() || '手动录入'})}
      >
        录入并自动裁定
      </button>
    </ModalShell>
  );
}

export function UpgradeModal({dep, onClose, onSubmit}: {
  dep: Dependency;
  onClose: () => void;
  onSubmit: (version: string) => void;
}) {
  const [version, setVersion] = useState(dep.version);
  const valid = parseVersion(version) !== null && version !== dep.version;
  return (
    <ModalShell title={`升级 ${dep.name}`} onClose={onClose}>
      <p className="modal-note">升级后将对该依赖<b>重新扫描</b>：当前版本不再命中受影响区间的旧公告自动归档，并重新计算发布结论。</p>
      <label className={field}>新版本
        <input autoFocus value={version} onChange={(e) => setVersion(e.target.value)} placeholder="例如 4.17.21"/>
        {version && parseVersion(version) === null && <small className="err">版本号格式不正确</small>}
      </label>
      <button className="primary full" disabled={!valid} onClick={() => valid && onSubmit(version)}>
        升级并重新扫描
      </button>
    </ModalShell>
  );
}
