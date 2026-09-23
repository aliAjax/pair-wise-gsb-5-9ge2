import {useMemo, useState} from 'react';
import {AlertTriangle, Archive, ArrowUpCircle, ShieldCheck} from 'lucide-react';
import {
  AppState,
  Dep,
  IntakeInput,
  SEVERITY_LABEL,
  Severity,
  previewUpgrade,
  ticketState,
} from '../domain/rules';
import {formatRanges, parseVersion, rangeContains, rangesOverlap, safeParseRange} from '../domain/semver';
import {Field, Modal} from './ui';

const SEV: Severity[] = ['critical', 'high', 'medium', 'low'];

export function AddDepModal({onClose, onSubmit}: {onClose: () => void; onSubmit: (v: any) => void}) {
  const [name, setName] = useState('');
  const [version, setVersion] = useState('1.0.0');
  const [license, setLicense] = useState('MIT');
  const [source, setSource] = useState('npm');
  const [err, setErr] = useState('');

  const submit = () => {
    if (!name.trim()) return setErr('依赖名称不能为空');
    if (version.trim() && !parseVersion(version.trim())) return setErr('版本需为合法语义版本，如 1.2.3');
    onSubmit({name, version, license, source, note: ''});
  };

  return (
    <Modal title="添加依赖" onClose={onClose}>
      <Field label="依赖名称">
        <input className="ctl" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="例如 date-fns" />
      </Field>
      <Field label="当前版本">
        <input className="ctl" value={version} onChange={(e) => setVersion(e.target.value)} placeholder="1.0.0" />
      </Field>
      <div className="field-row">
        <Field label="许可证">
          <select className="ctl" value={license} onChange={(e) => setLicense(e.target.value)}>
            {['MIT', 'BSD-3-Clause', 'Apache-2.0', 'ISC', 'GPL-3.0', '未声明'].map((l) => (
              <option key={l}>{l}</option>
            ))}
          </select>
        </Field>
        <Field label="来源">
          <select className="ctl" value={source} onChange={(e) => setSource(e.target.value)}>
            {['npm', 'Maven', 'Go', 'PyPI', '手动'].map((l) => (
              <option key={l}>{l}</option>
            ))}
          </select>
        </Field>
      </div>
      {err && <p className="form-error">{err}</p>}
      <button className="primary full" onClick={submit}>
        加入清单
      </button>
    </Modal>
  );
}

export function IntakeModal({
  state,
  onClose,
  onSubmit,
}: {
  state: AppState;
  onClose: () => void;
  onSubmit: (v: IntakeInput) => string | null;
}) {
  const [depName, setDepName] = useState('');
  const [advisoryId, setAdvisoryId] = useState('');
  const [origin, setOrigin] = useState('GitHub Advisory');
  const [severity, setSeverity] = useState<Severity>('high');
  const [affectedRange, setAffectedRange] = useState('>=1.0.0 <2.0.0');
  const [fixedVersion, setFixedVersion] = useState('');
  const [title, setTitle] = useState('');
  const [err, setErr] = useState('');

  const parsed = useMemo(() => safeParseRange(affectedRange), [affectedRange]);
  const fixedInRange = fixedVersion.trim() && parsed.length > 0 && rangeContains(parsed, fixedVersion.trim());
  const overlapTicket = useMemo(
    () =>
      state.tickets.find(
        (t) =>
          t.lifecycle === 'active' &&
          t.sources.every((s) => s.advisoryId !== advisoryId.trim()) &&
          state.deps.find((d) => d.id === t.depId)?.name.toLowerCase() === depName.trim().toLowerCase() &&
          rangesOverlap(t.mergedRange, parsed),
      ) || null,
    [state, depName, advisoryId, parsed],
  );

  const submit = () => {
    const e = onSubmit({depName, advisoryId, origin, severity, affectedRange, fixedVersion: fixedVersion || null, title});
    if (e) setErr(e);
  };

  return (
    <Modal title="录入安全公告" onClose={onClose} width={520}>
      <Field label="受影响依赖" hint="按名称匹配清单中的依赖">
        <input className="ctl" list="dep-list" value={depName} onChange={(e) => setDepName(e.target.value)} placeholder="例如 lodash" />
        <datalist id="dep-list">
          {state.deps.map((d) => (
            <option key={d.id} value={d.name} />
          ))}
        </datalist>
      </Field>
      <div className="field-row">
        <Field label="公告编号">
          <input className="ctl" value={advisoryId} onChange={(e) => setAdvisoryId(e.target.value)} placeholder="GHSA-… / CVE-…" />
        </Field>
        <Field label="来源">
          <input className="ctl" value={origin} onChange={(e) => setOrigin(e.target.value)} />
        </Field>
      </div>
      <div className="field-row">
        <Field label="严重级别">
          <select className="ctl" value={severity} onChange={(e) => setSeverity(e.target.value as Severity)}>
            {SEV.map((s) => (
              <option key={s} value={s}>
                {s === 'critical' ? '严重（critical）' : s === 'high' ? '高危（high）' : s === 'medium' ? '中危（medium）' : '低危（low）'}
              </option>
            ))}
          </select>
        </Field>
        <Field label="修复版本" hint="可留空">
          <input className="ctl" value={fixedVersion} onChange={(e) => setFixedVersion(e.target.value)} placeholder="4.17.21" />
        </Field>
      </div>
      <Field label="受影响版本区间" hint="支持 >= > <= < ^ ~ 与 x 通配">
        <input className="ctl" value={affectedRange} onChange={(e) => setAffectedRange(e.target.value)} placeholder=">=4.0.0 <4.17.21" />
      </Field>
      <Field label="漏洞标题" hint="可留空">
        <input className="ctl" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="例如 命令注入风险" />
      </Field>

      <div className="intake-hints">
        {affectedRange.trim() && parsed.length === 0 && (
          <p className="hint bad">
            <AlertTriangle size={13} /> 区间无法解析，录入将被拒绝
          </p>
        )}
        {parsed.length > 0 && (
          <p className="hint ok">解析区间：{formatRanges(parsed)}</p>
        )}
        {fixedInRange && (
          <p className="hint bad">
            <AlertTriangle size={13} /> 修复版本 {fixedVersion.trim()} 仍落在受影响区间，票据只会是草稿
          </p>
        )}
        {fixedVersion.trim() && !parseVersion(fixedVersion.trim()) && (
          <p className="hint bad">
            <AlertTriangle size={13} /> 修复版本不是合法语义版本
          </p>
        )}
        {overlapTicket && (
          <p className="hint merge">
            <ShieldCheck size={13} /> 将与在办票据 #{overlapTicket.id}（{state.deps.find((d) => d.id === overlapTicket.depId)?.name}）区间重叠，自动合并来源
          </p>
        )}
      </div>

      {err && <p className="form-error">{err}</p>}
      <button className="primary full" onClick={submit}>
        录入并判定
      </button>
    </Modal>
  );
}

// 避免在 JSX 里写复杂 IIFE：小包装（rangesOverlap 已在顶部引入）

export function UpgradeModal({
  state,
  dep,
  onClose,
  onSubmit,
}: {
  state: AppState;
  dep: Dep;
  onClose: () => void;
  onSubmit: (version: string) => string | null;
}) {
  const [version, setVersion] = useState(dep.version);
  const [err, setErr] = useState('');
  const valid = parseVersion(version.trim());
  const preview = valid && version.trim() !== dep.version ? previewUpgrade(state, dep.id, version.trim()) : null;

  const submit = () => {
    const e = onSubmit(version.trim());
    if (e) setErr(e);
  };

  return (
    <Modal title={`升级并重扫 · ${dep.name}`} onClose={onClose}>
      <div className="upgrade-versions">
        <div>
          <label>当前版本</label>
          <b>{dep.version}</b>
        </div>
        <ArrowUpCircle size={18} />
        <div>
          <label>升级到</label>
          <input className="ctl" value={version} onChange={(e) => setVersion(e.target.value)} placeholder="x.y.z" />
        </div>
      </div>

      {version.trim() && !valid && <p className="hint bad"><AlertTriangle size={13} /> 版本需为合法语义版本</p>}
      {preview && (
        <div className="rescan-preview">
          <p className="preview-title">重新扫描预览</p>
          {preview.archived.length === 0 && preview.stillOpen.length === 0 && <p className="hint">无在办公告</p>}
          {preview.archived.map((t) => (
            <p key={t.id} className="hint archive">
              <Archive size={13} /> 票据 #{t.id}（{t.sources.map((s) => s.advisoryId).join('/')}，{SEVERITY_LABEL[t.severity]}）
              不再覆盖 {version.trim()}，<b>将归档</b>
            </p>
          ))}
          {preview.stillOpen.map((t) => (
            <p key={t.id} className="hint warn">
              <AlertTriangle size={13} /> 票据 #{t.id} 区间 {t.mergedRangeText} 仍覆盖 {version.trim()}，
              保持{ticketState(state, t) === 'draft' ? '草稿' : '待处置'}
            </p>
          ))}
          <p className="hint">升级后可发布标记将重置，需要重新判定。</p>
        </div>
      )}
      {err && <p className="form-error">{err}</p>}
      <button className="primary full" onClick={submit} disabled={!preview}>
        确认升级并重新扫描
      </button>
    </Modal>
  );
}

export function AssignModal({
  ticket,
  onClose,
  onSubmit,
}: {
  ticket: any;
  onClose: () => void;
  onSubmit: (patch: {owner: string; dueDate: string | null}) => void;
}) {
  const [owner, setOwner] = useState(ticket.owner);
  const [dueDate, setDueDate] = useState(ticket.dueDate || '');
  return (
    <Modal title={`指派处置 · 票据 #${ticket.id}`} onClose={onClose} width={420}>
      <Field label="责任人">
        <input className="ctl" autoFocus value={owner} onChange={(e) => setOwner(e.target.value)} placeholder="例如 Maya Chen" />
      </Field>
      <Field label="截止日">
        <input className="ctl" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
      </Field>
      <button className="primary full" onClick={() => onSubmit({owner, dueDate: dueDate || null})}>
        保存并重算结论
      </button>
    </Modal>
  );
}

export function CloseModal({
  ticketId,
  onClose,
  onSubmit,
}: {
  ticketId: number;
  onClose: () => void;
  onSubmit: (note: string) => void;
}) {
  const [note, setNote] = useState('已升级到修复版本并回归验证');
  return (
    <Modal title={`关闭票据 #${ticketId}`} onClose={onClose} width={420}>
      <Field label="处置说明">
        <textarea className="ctl" rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>
      <button className="primary full" onClick={() => onSubmit(note)}>
        确认关闭
      </button>
    </Modal>
  );
}
