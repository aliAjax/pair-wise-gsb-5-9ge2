// 界面层：公告处置资料编辑（保存后由判定层重新裁定 active/draft）

import {useState} from 'react';
import {X} from 'lucide-react';
import type {Advisory} from '../data/types';
import {SeverityBadge, StatusPill} from './widgets';
import {parseVersion} from '../domain/versionRange';

export function AdvisoryEditor({advisory, onCancel, onSave}: {
  advisory: Advisory;
  onCancel: () => void;
  onSave: (a: Advisory) => void;
}) {
  const [owner, setOwner] = useState(advisory.owner);
  const [fixedVersion, setFixedVersion] = useState(advisory.fixedVersion);
  const [dueDate, setDueDate] = useState(advisory.dueDate);
  const fixedBad = fixedVersion.trim() !== '' && parseVersion(fixedVersion) === null;

  return (
    <div className="backdrop" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>处置公告</h2>
          <button onClick={onCancel}><X size={17}/></button>
        </div>
        <div className="editor-title">
          <b>{advisory.title}</b>
          <div><SeverityBadge severity={advisory.severity}/> <StatusPill status={advisory.status}/></div>
        </div>
        <p className="modal-note">
          受影响区间 <code>{advisory.affectedRange}</code> 来自公告来源，不可修改。
          保存后重新裁定：<b>修复版本仍在区间内或缺责任人 → 草稿</b>。
        </p>
        <label className="block w-full">责任人
          <input value={owner} onChange={(e) => setOwner(e.target.value)} placeholder="指派处理人"/>
        </label>
        <label className="block w-full">修复版本
          <input value={fixedVersion} onChange={(e) => setFixedVersion(e.target.value)} placeholder="上游已发布的安全版本；留空=未发布"/>
          {fixedBad && <small className="err">版本号格式不正确</small>}
        </label>
        <label className="block w-full">截止日
          <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)}/>
        </label>
        <div className="modal-row">
          <button className="outline" onClick={onCancel}>取消</button>
          <button
            className="primary grow"
            disabled={fixedBad}
            onClick={() => onSave({...advisory, owner: owner.trim(), fixedVersion: fixedVersion.trim(), dueDate})}
          >
            保存并重新裁定
          </button>
        </div>
      </div>
    </div>
  );
}
