// 资料层：领域类型定义 —— 只描述数据形状，不含任何判定逻辑

/** 严重级别（数值越大越严重，合并时取最大） */
export type Severity = 'low' | 'medium' | 'high' | 'critical';

export const SEVERITY_ORDER: Record<Severity, number> = {
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
};

export const SEVERITY_LABEL: Record<Severity, string> = {
  low: '低危',
  medium: '中危',
  high: '高危',
  critical: '严重',
};

/** 公告生命周期状态：草稿 / 生效 / 已关闭(人工) / 已归档(升级重扫后不再命中) */
export type AdvisoryStatus = 'draft' | 'active' | 'closed' | 'archived';

/** 开放状态：可能参与合并与拦截判定（草稿只参与合并展示，不拦截） */
export const OPEN_STATUSES: AdvisoryStatus[] = ['draft', 'active'];

/** 依赖 */
export interface Dependency {
  id: number;
  name: string;
  version: string;
  license: string;
  ecosystem: string;
  source: string;
  note: string;
  /** 用户主观标记：是否希望发布；最终结论由阻断规则裁定 */
  releaseIntent: boolean;
}

/** 安全公告 */
export interface Advisory {
  id: number;
  depId: number;
  title: string;
  /** 受影响版本区间表达式，如 ">=4.0.0 <4.17.21"、"<=2.1.0"、"*" */
  affectedRange: string;
  severity: Severity;
  /** 修复版本；为空表示上游尚未发布修复 */
  fixedVersion: string;
  owner: string;
  dueDate: string; // ISO 日期 yyyy-mm-dd
  sources: string[]; // 合并来源：GHSA / CVE / 内部扫描 等
  status: AdvisoryStatus;
  /** 仅为草稿时给出的原因（修复版本仍命中区间 / 缺责任人） */
  draftReason?: string;
  createdAt: string;
  updatedAt: string;
}

/** 处置记录 */
export interface HandlingRecord {
  id: number;
  ts: string;
  action: string;
  /** 关联依赖与公告 */
  depId?: number;
  advisoryId?: number;
  detail: string;
}
