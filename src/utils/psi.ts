import {
  PsiExtractedData,
  PsiMetricItem,
  PsiOpportunity,
  PsiSeoAuditItem,
  PsiThumbnailItem,
} from '../types/audit';

export const PSI_STORAGE_KEY = 'up2media_psi_api_key';

export function getStoredPsiApiKey(): string {
  try {
    const local = localStorage.getItem(PSI_STORAGE_KEY);
    if (local && local.trim()) return local.trim();
  } catch {
    // ignore storage errors
  }
  const envKey = (import.meta as unknown as { env?: Record<string, string> }).env?.VITE_PSI_API_KEY;
  return envKey ? envKey.trim() : '';
}

export function setStoredPsiApiKey(key: string): void {
  try {
    const trimmed = key.trim();
    if (trimmed) {
      localStorage.setItem(PSI_STORAGE_KEY, trimmed);
    } else {
      localStorage.removeItem(PSI_STORAGE_KEY);
    }
  } catch {
    // ignore storage errors
  }
}

/**
 * Auto-adds https:// if missing and validates URL format.
 */
export function normalizeAndValidateUrl(rawInput: string): {
  valid: boolean;
  url: string;
  error?: string;
} {
  const trimmed = rawInput.trim();
  if (!trimmed) {
    return {
      valid: false,
      url: '',
      error: 'يرجى إدخال رابط الموقع الإلكتروني للبدء.',
    };
  }

  let candidate = trimmed;
  if (!/^https?:\/\//i.test(candidate)) {
    candidate = `https://${candidate}`;
  }

  try {
    const parsed = new URL(candidate);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return {
        valid: false,
        url: candidate,
        error: 'يجب أن يبدأ الرابط ببروتوكول http أو https صحيح.',
      };
    }
    const host = parsed.hostname;
    // Must contain at least one dot and valid TLD characters
    if (!host || !host.includes('.') || host.startsWith('.') || host.endsWith('.')) {
      return {
        valid: false,
        url: candidate,
        error: 'يرجى إدخال نطاق موقع صحيح (مثال: up2media.net).',
      };
    }
    const tld = host.split('.').pop() || '';
    if (tld.length < 2) {
      return {
        valid: false,
        url: candidate,
        error: 'امتداد النطاق غير مكتمل. تأكد من كتابة الرابط بشكل صحيح.',
      };
    }
    return {
      valid: true,
      url: parsed.toString(),
    };
  } catch {
    return {
      valid: false,
      url: candidate,
      error: 'صيغة الرابط غير صحيحة. يرجى التأكد من كتابة عنوان الموقع بشكل سليم.',
    };
  }
}

const SEO_AUDIT_LABELS_AR: Record<string, string> = {
  'document-title': 'عنوان الصفحة في نتائج البحث (Title Tag)',
  'meta-description': 'الوصف التعريفي للصفحة (Meta Description)',
  'http-status-code': 'استجابة الخادم السليمة (HTTP Status)',
  'link-text': 'وضوح النصوص الوصفية للروابط',
  'crawlable-anchors': 'قابلية الروابط للزحف والأرشفة',
  'is-crawlable': 'السماح لمحركات البحث بأرشفة الموقع',
  'robots-txt': 'سلامة إعدادات ملف robots.txt',
  'image-alt': 'النص البديل للصور (Image Alt Attributes)',
  hreflang: 'تحديد لغة الموقع والمنطقة الجغرافية (hreflang)',
  canonical: 'تحديد الرابط الأساسي المعتمد (Canonical URL)',
  'font-size': 'وضوح حجم الخط للقراءة على الجوال',
  'tap-targets': 'ملاءمة حجم الأزرار والروابط للمس',
  viewport: 'تهيئة أبعاد الشاشة للهواتف الذكية (Viewport)',
  'structured-data': 'البيانات المنظمة لمحركات البحث',
};

const OPPORTUNITY_LABELS_AR: Record<string, string> = {
  'render-blocking-resources': 'تقليل الملفات التي تؤخر ظهور الصفحة',
  'unused-css-rules': 'إزالة أكواد التصميم (CSS) غير المستخدمة',
  'unused-javascript': 'تقليل أكواد البرمجة (JavaScript) غير الضرورية',
  'modern-image-formats': 'تحويل الصور إلى صيغ حديثة وسريعة (WebP / AVIF)',
  'offscreen-images': 'تأجيل تحميل الصور خارج الشاشة (Lazy Loading)',
  'unminified-css': 'ضغط ملفات التنسيق (CSS)',
  'unminified-javascript': 'ضغط ملفات البرمجة (JavaScript)',
  'efficient-animated-content': 'استبدال الصور المتحركة الثقيلة بملفات فيديو خفيفة',
  'duplicated-javascript': 'إزالة المكتبات البرمجية المكررة',
  'legacy-javascript': 'تحديث الأكواد البرمجية القديمة لتسريع الجوال',
  'uses-optimized-images': 'ضغط حجم الصور دون فقدان الجودة',
  'uses-text-compression': 'تفعيل ضغط النصوص والبيانات من الخادم (Gzip / Brotli)',
  'uses-responsive-images': 'تخصيص أحجام الصور لتناسب شاشة الجوال',
  'server-response-time': 'تسريع وقت استجابة الخادم الرئيسي (TTFB)',
  redirects: 'تقليل عمليات إعادة التوجيه المتكررة للرابط',
  'uses-rel-preconnect': 'تسريع الاتصال المبكر بالخدمات الخارجية',
  'font-display': 'إظهار النصوص فوراً أثناء تحميل الخطوط',
};

export function formatBytesWestern(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 KB';
  const mb = bytes / (1024 * 1024);
  if (mb >= 1) {
    return `${mb.toFixed(2)} MB`;
  }
  const kb = bytes / 1024;
  return `${Math.round(kb)} KB`;
}

export function formatMsWestern(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return '0 ms';
  if (ms >= 1000) {
    return `${(ms / 1000).toFixed(1)} s`;
  }
  return `${Math.round(ms)} ms`;
}

/**
 * Ensures any Arabic-Indic numerals or non-Western digits in display strings are converted to Western 0-9.
 */
export function toWesternDigits(input: string): string {
  if (!input) return '';
  return input
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 1632))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 1776))
    .replace(/\u00a0/g, ' ');
}

function extractMetric(
  audits: Record<string, any>,
  id: string,
  fallbackTitle: string,
  customFormatter?: (numericVal: number, rawDisplay: string) => string
): PsiMetricItem {
  const a = audits?.[id];
  const numericValue = typeof a?.numericValue === 'number' ? a.numericValue : 0;
  const rawDisplay = toWesternDigits(a?.displayValue || '');
  const displayValue = customFormatter
    ? customFormatter(numericValue, rawDisplay)
    : rawDisplay || formatMsWestern(numericValue);

  return {
    id,
    title: a?.title || fallbackTitle,
    displayValue,
    numericValue,
    score: typeof a?.score === 'number' ? a.score : null,
  };
}

export function parsePsiResponse(rawJson: any, requestedUrl: string): PsiExtractedData {
  const lh = rawJson?.lighthouseResult;
  if (!lh || !lh.categories || !lh.audits) {
    throw new Error('لم تكتمل بيانات الفحص من Google PageSpeed لهذا الموقع.');
  }

  const categories = lh.categories;
  const audits = lh.audits;

  const scores = {
    performance: Math.round((categories.performance?.score ?? 0) * 100),
    seo: Math.round((categories.seo?.score ?? 0) * 100),
    accessibility: Math.round((categories.accessibility?.score ?? 0) * 100),
    bestPractices: Math.round((categories['best-practices']?.score ?? 0) * 100),
  };

  const metrics = {
    lcp: extractMetric(audits, 'largest-contentful-paint', 'سرعة ظهور المحتوى الرئيسي (LCP)'),
    fcp: extractMetric(audits, 'first-contentful-paint', 'أول ظهور للمحتوى (FCP)'),
    cls: extractMetric(
      audits,
      'cumulative-layout-shift',
      'استقرار عناصر الصفحة (CLS)',
      (val, disp) => disp || val.toFixed(3)
    ),
    tbt: extractMetric(audits, 'total-blocking-time', 'زمن استجابة التفاعل (TBT)'),
    speedIndex: extractMetric(audits, 'speed-index', 'مؤشر السرعة البصري (Speed Index)'),
    totalByteWeight: extractMetric(
      audits,
      'total-byte-weight',
      'حجم الصفحة الكلي',
      (val) => formatBytesWestern(val)
    ),
  };

  // Extract top 3 opportunities with estimated savings
  const opportunityCandidates: Array<PsiOpportunity & { sortWeight: number }> = [];
  for (const [id, audit] of Object.entries<any>(audits)) {
    if (!audit) continue;
    const isOpportunity =
      audit.details?.type === 'opportunity' ||
      typeof audit.details?.overallSavingsMs === 'number' ||
      typeof audit.details?.overallSavingsBytes === 'number';

    const score = typeof audit.score === 'number' ? audit.score : null;
    if (isOpportunity && score !== null && score < 0.9) {
      const savingsMs =
        typeof audit.details?.overallSavingsMs === 'number'
          ? Math.round(audit.details.overallSavingsMs)
          : undefined;
      const savingsBytes =
        typeof audit.details?.overallSavingsBytes === 'number'
          ? Math.round(audit.details.overallSavingsBytes)
          : undefined;

      const sortWeight =
        (savingsMs || 0) + (savingsBytes ? savingsBytes / 500 : 0) + (1 - score) * 500;

      let savingsLabel = toWesternDigits(audit.displayValue || '');
      if (savingsMs && savingsMs > 0) {
        savingsLabel = `توفير ${formatMsWestern(savingsMs)}`;
      } else if (savingsBytes && savingsBytes > 0) {
        savingsLabel = `توفير ${formatBytesWestern(savingsBytes)}`;
      }

      opportunityCandidates.push({
        id,
        title: OPPORTUNITY_LABELS_AR[id] || audit.title || id,
        description: audit.description || '',
        displayValue: savingsLabel,
        savingsMs,
        savingsBytes,
        sortWeight,
      });
    }
  }

  opportunityCandidates.sort((a, b) => b.sortWeight - a.sortWeight);
  const opportunities: PsiOpportunity[] = opportunityCandidates
    .slice(0, 3)
    .map(({ sortWeight: _, ...rest }) => rest);

  // Extract SEO checklist & failed SEO audits
  const seoAuditRefs: Array<{ id: string; weight?: number }> =
    categories.seo?.auditRefs || [];
  const seoChecklist: PsiSeoAuditItem[] = [];
  const failedSeoAudits: Array<{
    id: string;
    title: string;
    description: string;
    displayValue?: string;
  }> = [];

  const seenSeoIds = new Set<string>();
  const targetSeoIds = [
    ...seoAuditRefs.map((r) => r.id),
    'document-title',
    'meta-description',
    'http-status-code',
    'link-text',
    'crawlable-anchors',
    'is-crawlable',
    'robots-txt',
    'image-alt',
    'hreflang',
    'canonical',
    'viewport',
  ];

  for (const id of targetSeoIds) {
    if (seenSeoIds.has(id)) continue;
    const audit = audits[id];
    if (!audit) continue;
    const mode = audit.scoreDisplayMode;
    if (mode === 'notApplicable' || mode === 'manual' || mode === 'informative') {
      continue;
    }
    if (audit.score === null || audit.score === undefined) continue;

    seenSeoIds.add(id);
    const passed = audit.score >= 0.9;
    const arabicTitle = SEO_AUDIT_LABELS_AR[id] || audit.title || id;
    const disp = toWesternDigits(audit.displayValue || '');

    seoChecklist.push({
      id,
      title: arabicTitle,
      passed,
      displayValue: disp || undefined,
    });

    if (!passed) {
      failedSeoAudits.push({
        id,
        title: arabicTitle,
        description: audit.description || '',
        displayValue: disp || undefined,
      });
    }
  }

  // Sort checklist so failed items appear prominently at the top followed by passed items
  seoChecklist.sort((a, b) => Number(a.passed) - Number(b.passed));

  // Extract accessibility issues for UX context
  const accessibilityIssues: Array<{ id: string; title: string; description: string }> = [];
  const accRefs: Array<{ id: string }> = categories.accessibility?.auditRefs || [];
  for (const ref of accRefs) {
    const a = audits[ref.id];
    if (
      a &&
      typeof a.score === 'number' &&
      a.score < 0.9 &&
      a.scoreDisplayMode !== 'notApplicable' &&
      a.scoreDisplayMode !== 'manual'
    ) {
      accessibilityIssues.push({
        id: ref.id,
        title: a.title || ref.id,
        description: a.description || '',
      });
    }
  }

  // Extract mobile screenshot & thumbnails
  const screenshotDataUrl: string | null =
    audits['final-screenshot']?.details?.data ||
    lh.fullPageScreenshot?.screenshot?.data ||
    null;

  const rawThumbs = audits['screenshot-thumbnails']?.details?.items;
  const screenshotThumbnails: PsiThumbnailItem[] = Array.isArray(rawThumbs)
    ? rawThumbs
        .filter((item: any) => item && typeof item.data === 'string')
        .map((item: any) => ({
          timing: typeof item.timing === 'number' ? item.timing : 0,
          timestamp: typeof item.timestamp === 'number' ? item.timestamp : 0,
          data: item.data,
        }))
    : [];

  return {
    requestedUrl,
    finalUrl: lh.finalDisplayedUrl || lh.finalUrl || requestedUrl,
    fetchTime: lh.fetchTime || new Date().toISOString(),
    scores,
    metrics,
    opportunities,
    seoChecklist,
    failedSeoAudits,
    accessibilityIssues: accessibilityIssues.slice(0, 8),
    screenshotDataUrl,
    screenshotThumbnails,
  };
}

export async function runPageSpeedInsights(
  targetUrl: string,
  psiApiKey?: string
): Promise<PsiExtractedData> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 90000); // 90s timeout

  try {
    const effectiveKey = (psiApiKey ?? getStoredPsiApiKey()).trim();

    // If user explicitly provided a PSI key, try direct browser PSI call first
    if (effectiveKey) {
      try {
        const params = new URLSearchParams();
        params.append('url', targetUrl);
        params.append('strategy', 'mobile');
        params.append('category', 'performance');
        params.append('category', 'seo');
        params.append('category', 'accessibility');
        params.append('category', 'best-practices');
        params.append('locale', 'ar');
        params.append('key', effectiveKey);

        const directRes = await fetch(
          `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?${params.toString()}`,
          { method: 'GET', signal: controller.signal }
        );
        if (directRes.ok) {
          const directData = await directRes.json();
          if (directData?.lighthouseResult?.categories?.performance) {
            return parsePsiResponse(directData, targetUrl);
          }
        }
      } catch {
        // Fallback to server endpoint below
      }
    }

    // Call our server endpoint (/api/psi) which tries PSI v5 and automatically falls back to
    // our zero-config live server HTTP/DOM/SEO + mobile screenshot engine if no PSI key is set
    const response = await fetch('/api/psi', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: targetUrl, psiApiKey: effectiveKey }),
      signal: controller.signal,
    });

    const rawText = await response.text();
    let data: any = null;
    try {
      data = JSON.parse(rawText);
    } catch {
      throw new Error(
        'تعذر قراءة استجابة خادم الفحص بسبب بطء الاتصال. يرجى الضغط على "إعادة المحاولة".'
      );
    }

    if (!response.ok) {
      const rawMessage: string =
        data?.error?.message || data?.error || response.statusText || '';
      throw new Error(
        rawMessage ||
          'تعذر الوصول إلى الموقع المستهدف للفحص. تأكد من كتابة الرابط بشكل صحيح وحاول مرة أخرى.'
      );
    }

    return parsePsiResponse(data, targetUrl);
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      throw new Error(
        'استغرق فحص الموقع أكثر من 90 ثانية (انتهت المهلة). يرجى التحقق من اتصال الإنترنت أو المحاولة مرة أخرى.'
      );
    }
    throw err instanceof Error
      ? err
      : new Error('حدث خطأ غير متوقع أثناء قياس سرعة الموقع. يرجى المحاولة مرة أخرى.');
  } finally {
    clearTimeout(timeoutId);
  }
}
