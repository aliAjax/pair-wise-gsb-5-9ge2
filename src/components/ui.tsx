import {ReactNode} from 'react';
import {X} from 'lucide-react';
import {SEVERITY_LABEL, Severity, TicketState} from '../domain/rules';

export function SeverityBadge({severity}: {severity: Severity}) {
  return <i className={`sev ${severity}`}>{SEVERITY_LABEL[severity]}</i>;
}

const TICKET_LABEL: Record<TicketState, string> = {
  draft: '草稿',
  open: '待处置',
  closed: '已关闭',
  archived: '已归档',
};

export function TicketBadge({state}: {state: TicketState}) {
  return (
    <span className={`tstate ${state}`}>
      <span className="dot" />
      {TICKET_LABEL[state]}
    </span>
  );
}

export function Modal({
  title,
  onClose,
  children,
  width = 460,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  width?: number;
}) {
  return (
    <div className="backdrop" onClick={onClose}>
      <div className="modal" style={{width: `min(${width}px, 100%)`}} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>{title}</h2>
          <button onClick={onClose} aria-label="关闭">
            <X size={17} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <label className="field">
      <span>
        {label}
        {hint && <em>{hint}</em>}
      </span>
      {children}
    </label>
  );
}

export const inputCls = 'ctl';

export function EmptyState({text}: {text: string}) {
  return <div className="empty-state">{text}</div>;
}
