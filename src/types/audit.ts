export type AuditStatus = 'ممتاز' | 'جيد' | 'يحتاج تحسين' | 'ضعيف';

export interface VisitorInfo {
  name: string;
  company: string;
  phone: string;
}

export interface PsiMetricItem {
  id: string;
  title: string;
  displayValue: string;
  numericValue: number;
  score: number | null; // 0 to 1 from Lighthouse
}

export interface PsiOpportunity {
  id: string;
  title: string;
  description: string;
  displayValue: string;
  savingsMs?: number;
  savingsBytes?: number;
}

export interface PsiSeoAuditItem {
  id: string;
  title: string;
  passed: boolean;
  displayValue?: string;
}

export interface PsiThumbnailItem {
  timing: number;
  timestamp: number;
  data: string; // base64 data URI
}

export interface PsiExtractedData {
  requestedUrl: string;
  finalUrl: string;
  fetchTime: string;
  scores: {
    performance: number; // 0-100
    seo: number; // 0-100
    accessibility: number; // 0-100
    bestPractices: number; // 0-100
  };
  metrics: {
    lcp: PsiMetricItem;
    fcp: PsiMetricItem;
    cls: PsiMetricItem;
    tbt: PsiMetricItem;
    speedIndex: PsiMetricItem;
    totalByteWeight: PsiMetricItem;
  };
  opportunities: PsiOpportunity[];
  seoChecklist: PsiSeoAuditItem[];
  failedSeoAudits: Array<{
    id: string;
    title: string;
    description: string;
    displayValue?: string;
  }>;
  accessibilityIssues: Array<{
    id: string;
    title: string;
    description: string;
  }>;
  screenshotDataUrl: string | null; // data:image/jpeg;base64,...
  screenshotThumbnails: PsiThumbnailItem[];
}

export interface HeatmapZone {
  x: number; // 0-1
  y: number; // 0-1
  w: number; // 0-1
  h: number; // 0-1
  intensity: number; // 0-1
  label: string;
}

export interface AuditCategorySection {
  score: number;
  status: AuditStatus;
  summary: string;
  issues: [string, string, string] | string[];
  quick_wins: [string, string, string] | string[];
}

export interface GeminiAuditResult {
  overall_score: number;
  one_line_verdict: string;
  performance: AuditCategorySection;
  heatmap: {
    summary: string;
    zones: HeatmapZone[];
    issues: [string, string, string] | string[];
    quick_wins: [string, string, string] | string[];
  };
  seo: AuditCategorySection;
  ux: AuditCategorySection;
}

export interface FullAuditReport {
  url: string;
  analyzedAt: string;
  visitor: VisitorInfo;
  psi: PsiExtractedData;
  ai: GeminiAuditResult;
}
