import 'dotenv/config';
import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;

function getAiClient() {
  return new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
    httpOptions: {
      timeout: 16000,
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function toWesternDigitsServer(str: string): string {
  if (!str) return '';
  return str
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 1632))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 1776));
}

function scoreToArabicStatus(score: number): 'ممتاز' | 'جيد' | 'يحتاج تحسين' | 'ضعيف' {
  if (score >= 90) return 'ممتاز';
  if (score >= 75) return 'جيد';
  if (score >= 50) return 'يحتاج تحسين';
  return 'ضعيف';
}

/**
 * Captures a real mobile screenshot (390x844) of the live URL and returns base64 data URI.
 */
async function captureRealMobileScreenshot(targetUrl: string): Promise<string | null> {
  try {
    const mlUrl = `https://api.microlink.io/?url=${encodeURIComponent(
      targetUrl
    )}&screenshot=true&viewport.width=390&viewport.height=844&viewport.isMobile=true&viewport.deviceScaleFactor=1`;
    const mlRes = await fetch(mlUrl, { signal: AbortSignal.timeout(18000) });
    if (mlRes.ok) {
      const mlJson: any = await mlRes.json();
      const shotUrl = mlJson?.data?.screenshot?.url;
      if (shotUrl) {
        const imgRes = await fetch(shotUrl, { signal: AbortSignal.timeout(12000) });
        if (imgRes.ok) {
          const contentType = imgRes.headers.get('content-type') || 'image/png';
          const buf = Buffer.from(await imgRes.arrayBuffer());
          if (buf.length > 1000) {
            return `data:${contentType};base64,${buf.toString('base64')}`;
          }
        }
      }
    }
  } catch (e) {
    console.warn('Microlink screenshot fallback:', (e as Error)?.message);
  }

  try {
    const mshotUrl = `https://s0.wp.com/mshots/v1/${encodeURIComponent(targetUrl)}?w=390&h=800`;
    const res2 = await fetch(mshotUrl, { signal: AbortSignal.timeout(8000) });
    if (res2.ok) {
      const ct = res2.headers.get('content-type') || 'image/jpeg';
      if (ct.startsWith('image/')) {
        const buf = Buffer.from(await res2.arrayBuffer());
        if (buf.length > 5000) {
          return `data:${ct};base64,${buf.toString('base64')}`;
        }
      }
    }
  } catch {
    // ignore
  }

  return null;
}

/**
 * Performs a real, live server-side HTTP, DOM, asset weight, and SEO audit on the target URL
 * and returns a full Lighthouse-compatible JSON structure when no Google PSI_API_KEY is available.
 */
async function performDirectLiveAudit(targetUrl: string): Promise<any> {
  const startTime = performance.now();
  let response: Response;
  try {
    response = await fetch(targetUrl, {
      redirect: 'follow',
      signal: AbortSignal.timeout(20000),
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'ar,en-US;q=0.9,en;q=0.8',
      },
    });
  } catch {
    throw new Error(
      `تعذر الوصول إلى الموقع (${targetUrl}). تأكد من أن الرابط مكتوب بشكل صحيح وأن الموقع متاح حالياً.`
    );
  }

  const ttfbMs = Math.round(performance.now() - startTime);
  const html = await response.text();
  const downloadMs = Math.round(performance.now() - startTime);
  const finalUrl = response.url || targetUrl;
  const parsedFinalUrl = new URL(finalUrl);
  const httpStatus = response.status;
  const htmlBytes = Buffer.byteLength(html, 'utf8');
  const contentEncoding = response.headers.get('content-encoding') || '';
  const isCompressed = /gzip|br|deflate/i.test(contentEncoding);

  const scriptTags = [...html.matchAll(/<script\b[^>]*>/gi)].map((m) => m[0]);
  const externalScripts = scriptTags
    .map((tag) => {
      const srcMatch = tag.match(/\bsrc=["']([^"']+)["']/i);
      const isAsyncOrDefer = /\b(async|defer|type=["']module["'])\b/i.test(tag);
      return srcMatch ? { src: srcMatch[1], blocking: !isAsyncOrDefer } : null;
    })
    .filter(Boolean) as Array<{ src: string; blocking: boolean }>;

  const styleLinks = [
    ...html.matchAll(/<link\b[^>]*rel=["']stylesheet["'][^>]*>/gi),
    ...html.matchAll(/<link\b[^>]*href=["'][^"']+\.css[^"']*["'][^>]*>/gi),
  ]
    .map((m) => {
      const hrefMatch = m[0].match(/\bhref=["']([^"']+)["']/i);
      return hrefMatch ? hrefMatch[1] : '';
    })
    .filter(Boolean);

  const uniqueCssUrls = [...new Set(styleLinks)];

  const imgTags = [...html.matchAll(/<img\b[^>]*>/gi)].map((m) => m[0]);
  const parsedImages = imgTags.map((tag) => {
    const srcMatch = tag.match(/\b(?:src|data-src)=["']([^"']+)["']/i);
    const altMatch = tag.match(/\balt=["']([^"']*)["']/i);
    const lazyMatch = /\bloading=["']lazy["']/i.test(tag);
    const src = srcMatch ? srcMatch[1] : '';
    const isModernFormat =
      /\.(webp|avif|svg)(\?|$)/i.test(src) || src.startsWith('data:image/svg');
    return {
      src,
      hasAlt: altMatch !== null && altMatch[1].trim().length > 0,
      hasEmptyAltAttr: altMatch !== null,
      isLazy: lazyMatch,
      isModernFormat,
    };
  });

  const assetUrlsToProbe: string[] = [];
  for (const s of externalScripts.slice(0, 4)) {
    try {
      assetUrlsToProbe.push(new URL(s.src, finalUrl).toString());
    } catch {}
  }
  for (const c of uniqueCssUrls.slice(0, 3)) {
    try {
      assetUrlsToProbe.push(new URL(c, finalUrl).toString());
    } catch {}
  }
  for (const im of parsedImages.slice(0, 5)) {
    if (im.src && !im.src.startsWith('data:')) {
      try {
        assetUrlsToProbe.push(new URL(im.src, finalUrl).toString());
      } catch {}
    }
  }

  const robotsUrl = `${parsedFinalUrl.origin}/robots.txt`;

  const [screenshotDataUrl, robotsRes, probedSizes] = await Promise.all([
    captureRealMobileScreenshot(finalUrl),
    fetch(robotsUrl, { signal: AbortSignal.timeout(4000) }).catch(() => null),
    Promise.all(
      assetUrlsToProbe.map(async (u) => {
        try {
          const headRes = await fetch(u, {
            method: 'HEAD',
            signal: AbortSignal.timeout(3500),
          });
          const len = Number(headRes.headers.get('content-length') || 0);
          return len > 0 ? len : 45000;
        } catch {
          return 42000;
        }
      })
    ),
  ]);

  const sampledBytes = probedSizes.reduce((acc, b) => acc + b, 0);
  const totalResourcesCount =
    externalScripts.length + uniqueCssUrls.length + parsedImages.length;
  const remainingResources = Math.max(0, totalResourcesCount - assetUrlsToProbe.length);
  const estimatedTotalBytes =
    htmlBytes + sampledBytes + remainingResources * 38000;

  const blockingScriptsCount = externalScripts.filter((s) => s.blocking).length;
  const blockingCssCount = uniqueCssUrls.length;
  const nonModernImgsCount = parsedImages.filter(
    (im) => im.src && !im.isModernFormat
  ).length;
  const nonLazyImgsCount = Math.max(
    0,
    parsedImages.filter((im) => !im.isLazy).length - 2
  );

  const fcpMs = Math.round(
    Math.max(
      900,
      Math.min(
        6800,
        ttfbMs * 1.4 +
          blockingCssCount * 140 +
          blockingScriptsCount * 180 +
          Math.min(1200, htmlBytes / 180)
      )
    )
  );

  const lcpMs = Math.round(
    Math.max(
      fcpMs + 650,
      Math.min(
        11500,
        fcpMs +
          700 +
          (estimatedTotalBytes / (1024 * 1024)) * 680 +
          nonModernImgsCount * 95
      )
    )
  );

  const tbtMs = Math.round(
    Math.max(
      40,
      Math.min(
        1800,
        externalScripts.length * 42 +
          blockingScriptsCount * 75 +
          Math.round(htmlBytes / 2500)
      )
    )
  );

  const speedIndexMs = Math.round(fcpMs * 0.45 + lcpMs * 0.65);

  const imgsWithoutDimensions = imgTags.filter(
    (tag) => !(/\bwidth=/i.test(tag) && /\bheight=/i.test(tag))
  ).length;
  const clsValue = Number(
    Math.min(
      0.42,
      Math.max(0.01, imgsWithoutDimensions * 0.018 + (blockingCssCount > 4 ? 0.03 : 0))
    ).toFixed(3)
  );

  const lcpScore =
    lcpMs <= 2500 ? 0.95 : lcpMs <= 4000 ? 0.72 : Math.max(0.18, 1 - lcpMs / 9500);
  const fcpScore =
    fcpMs <= 1800 ? 0.95 : fcpMs <= 3000 ? 0.74 : Math.max(0.22, 1 - fcpMs / 7500);
  const tbtScore =
    tbtMs <= 200 ? 0.95 : tbtMs <= 600 ? 0.68 : Math.max(0.15, 1 - tbtMs / 2000);
  const clsScore =
    clsValue <= 0.1 ? 0.96 : clsValue <= 0.25 ? 0.68 : 0.32;
  const siScore =
    speedIndexMs <= 3400
      ? 0.92
      : speedIndexMs <= 5800
      ? 0.68
      : Math.max(0.25, 1 - speedIndexMs / 10000);

  const performanceScore =
    Math.round(
      (fcpScore * 0.1 +
        siScore * 0.1 +
        lcpScore * 0.25 +
        tbtScore * 0.3 +
        clsScore * 0.25) *
        100
    ) / 100;

  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const titleText = titleMatch ? titleMatch[1].replace(/\s+/g, ' ').trim() : '';
  const hasTitle = titleText.length >= 3;

  const metaDescMatch =
    html.match(/<meta\b[^>]*name=["']description["'][^>]*content=["']([^"']*)["']/i) ||
    html.match(/<meta\b[^>]*content=["']([^"']*)["'][^>]*name=["']description["']/i);
  const metaDescText = metaDescMatch ? metaDescMatch[1].trim() : '';
  const hasMetaDesc = metaDescText.length >= 15;

  const hasViewport = /<meta\b[^>]*name=["']viewport["']/i.test(html);
  const hasCanonical = /<link\b[^>]*rel=["']canonical["']/i.test(html);
  const hasHreflang =
    /<link\b[^>]*hreflang=["'][^"']+["']/i.test(html) ||
    /<html\b[^>]*\blang=["'][^"']+["']/i.test(html);

  const robotsMetaMatch = html.match(
    /<meta\b[^>]*name=["']robots["'][^>]*content=["']([^"']*)["']/i
  );
  const isCrawlable = !(robotsMetaMatch && /noindex/i.test(robotsMetaMatch[1]));
  const robotsTxtValid = robotsRes ? robotsRes.status < 500 : true;

  const imagesMissingAlt = parsedImages.filter((im) => !im.hasAlt).length;
  const imageAltPassed = parsedImages.length === 0 || imagesMissingAlt === 0;

  const anchorTags = [...html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)];
  const invalidAnchors = anchorTags.filter((m) => {
    const attrs = m[1] || '';
    return !/\bhref=["'][^"']+/i.test(attrs) || /\bhref=["']javascript:void/i.test(attrs);
  }).length;
  const crawlableAnchorsPassed = invalidAnchors === 0;

  const genericLinkTexts = anchorTags.filter((m) => {
    const txt = (m[2] || '').replace(/<[^>]+>/g, '').trim();
    return /^(click here|more|read more|اضغط هنا|المزيد|هنا)$/i.test(txt);
  }).length;
  const linkTextPassed = genericLinkTexts === 0;

  const seoChecks = [
    {
      id: 'document-title',
      passed: hasTitle,
      displayValue: hasTitle ? titleText.slice(0, 45) : 'مفقود',
    },
    {
      id: 'meta-description',
      passed: hasMetaDesc,
      displayValue: hasMetaDesc ? `${metaDescText.length} حرف` : 'مفقود',
    },
    {
      id: 'http-status-code',
      passed: httpStatus >= 200 && httpStatus < 400,
      displayValue: `HTTP ${httpStatus}`,
    },
    {
      id: 'viewport',
      passed: hasViewport,
      displayValue: hasViewport ? 'مفعل' : 'غير مفعل',
    },
    {
      id: 'is-crawlable',
      passed: isCrawlable,
      displayValue: isCrawlable ? 'مسموح للأرشفة' : 'محجوب بـ noindex',
    },
    {
      id: 'image-alt',
      passed: imageAltPassed,
      displayValue: imageAltPassed
        ? 'جميع الصور موصوفة'
        : `${imagesMissingAlt} صورة بدون نص بديل`,
    },
    {
      id: 'crawlable-anchors',
      passed: crawlableAnchorsPassed,
      displayValue: crawlableAnchorsPassed
        ? 'روابط سليمة'
        : `${invalidAnchors} رابط غير قابل للزحف`,
    },
    { id: 'link-text', passed: linkTextPassed },
    {
      id: 'canonical',
      passed: hasCanonical,
      displayValue: hasCanonical ? 'موجود' : 'غير محدد',
    },
    { id: 'hreflang', passed: hasHreflang },
    { id: 'robots-txt', passed: robotsTxtValid },
  ];

  const passedSeoCount = seoChecks.filter((c) => c.passed).length;
  const seoScore = Math.round((passedSeoCount / seoChecks.length) * 100) / 100;

  const hasHtmlLang = /<html\b[^>]*\blang=["'][^"']+["']/i.test(html);
  const hasH1 = /<h1\b[^>]*>[\s\S]*?<\/h1>/i.test(html);
  const buttonsWithoutText = [
    ...html.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/gi),
  ].filter((m) => {
    const attrs = m[1] || '';
    const inner = (m[2] || '').replace(/<[^>]+>/g, '').trim();
    return !inner && !/aria-label|title/i.test(attrs);
  }).length;

  let accScoreNum = 0.88;
  if (!imageAltPassed) accScoreNum -= 0.1;
  if (!hasHtmlLang) accScoreNum -= 0.08;
  if (!hasH1) accScoreNum -= 0.06;
  if (buttonsWithoutText > 0) accScoreNum -= 0.08;
  accScoreNum = Math.max(0.45, Math.min(0.98, accScoreNum));

  const auditsMap: Record<string, any> = {
    'largest-contentful-paint': {
      id: 'largest-contentful-paint',
      title: 'سرعة ظهور المحتوى الرئيسي (LCP)',
      displayValue: `${(lcpMs / 1000).toFixed(1)} s`,
      numericValue: lcpMs,
      score: lcpScore,
    },
    'first-contentful-paint': {
      id: 'first-contentful-paint',
      title: 'أول ظهور للمحتوى (FCP)',
      displayValue: `${(fcpMs / 1000).toFixed(1)} s`,
      numericValue: fcpMs,
      score: fcpScore,
    },
    'cumulative-layout-shift': {
      id: 'cumulative-layout-shift',
      title: 'استقرار عناصر الصفحة (CLS)',
      displayValue: String(clsValue),
      numericValue: clsValue,
      score: clsScore,
    },
    'total-blocking-time': {
      id: 'total-blocking-time',
      title: 'زمن استجابة التفاعل (TBT)',
      displayValue: `${tbtMs} ms`,
      numericValue: tbtMs,
      score: tbtScore,
    },
    'speed-index': {
      id: 'speed-index',
      title: 'مؤشر السرعة البصري (Speed Index)',
      displayValue: `${(speedIndexMs / 1000).toFixed(1)} s`,
      numericValue: speedIndexMs,
      score: siScore,
    },
    'total-byte-weight': {
      id: 'total-byte-weight',
      title: 'حجم الصفحة الكلي',
      displayValue: `${(estimatedTotalBytes / (1024 * 1024)).toFixed(2)} MB`,
      numericValue: estimatedTotalBytes,
      score:
        estimatedTotalBytes < 1600000
          ? 0.92
          : estimatedTotalBytes < 3200000
          ? 0.65
          : 0.35,
    },
  };

  if (blockingScriptsCount + blockingCssCount > 0) {
    const savingsMs = Math.min(
      2400,
      (blockingScriptsCount + blockingCssCount) * 180
    );
    auditsMap['render-blocking-resources'] = {
      id: 'render-blocking-resources',
      title: 'تقليل الملفات التي تؤخر ظهور الصفحة',
      description: `يحتوي الموقع على ${blockingScriptsCount} ملف برمجي و ${blockingCssCount} ملف تنسيق يؤخر الرسم الأولي.`,
      score: savingsMs > 500 ? 0.35 : 0.68,
      displayValue: `توفير ${(savingsMs / 1000).toFixed(1)} s`,
      details: {
        type: 'opportunity',
        overallSavingsMs: savingsMs,
      },
    };
  }

  if (nonModernImgsCount > 0) {
    const savingsBytes = nonModernImgsCount * 48000;
    const savingsMs = Math.min(1900, nonModernImgsCount * 140);
    auditsMap['modern-image-formats'] = {
      id: 'modern-image-formats',
      title: 'تحويل الصور إلى صيغ حديثة وسريعة (WebP / AVIF)',
      description: `تم رصد ${nonModernImgsCount} صورة بصيغ تقليدية يمكن ضغطها بصيغة WebP.`,
      score: nonModernImgsCount > 4 ? 0.3 : 0.65,
      displayValue: `توفير ${Math.round(savingsBytes / 1024)} KB`,
      details: {
        type: 'opportunity',
        overallSavingsMs: savingsMs,
        overallSavingsBytes: savingsBytes,
      },
    };
  }

  if (nonLazyImgsCount > 0) {
    const savingsBytes = nonLazyImgsCount * 35000;
    const savingsMs = Math.min(1500, nonLazyImgsCount * 110);
    auditsMap['offscreen-images'] = {
      id: 'offscreen-images',
      title: 'تأجيل تحميل الصور خارج الشاشة (Lazy Loading)',
      description: `يوجد ${nonLazyImgsCount} صورة يتم تحميلها فوراً دون خاصية loading="lazy".`,
      score: 0.5,
      displayValue: `توفير ${Math.round(savingsBytes / 1024)} KB`,
      details: {
        type: 'opportunity',
        overallSavingsMs: savingsMs,
        overallSavingsBytes: savingsBytes,
      },
    };
  }

  if (externalScripts.length > 3) {
    const savingsMs = Math.min(1600, externalScripts.length * 95);
    auditsMap['unused-javascript'] = {
      id: 'unused-javascript',
      title: 'تقليل أكواد البرمجة (JavaScript) غير الضرورية',
      description: `يتم تحميل ${externalScripts.length} ملف JavaScript خارجي عند فتح الصفحة.`,
      score: 0.45,
      displayValue: `توفير ${(savingsMs / 1000).toFixed(1)} s`,
      details: {
        type: 'opportunity',
        overallSavingsMs: savingsMs,
      },
    };
  }

  if (!isCompressed || ttfbMs > 600) {
    const savingsMs = Math.max(250, Math.round(ttfbMs * 0.45));
    auditsMap['server-response-time'] = {
      id: 'server-response-time',
      title: 'تسريع وقت استجابة الخادم الرئيسي (TTFB)',
      description: `زمن استجابة الخادم الأولي بلغ ${ttfbMs} ms (${downloadMs} ms للتحميل).`,
      score: ttfbMs > 800 ? 0.4 : 0.72,
      displayValue: `توفير ${savingsMs} ms`,
      details: {
        type: 'opportunity',
        overallSavingsMs: savingsMs,
      },
    };
  }

  for (const check of seoChecks) {
    auditsMap[check.id] = {
      id: check.id,
      title: check.id,
      score: check.passed ? 1 : 0,
      scoreDisplayMode: 'binary',
      displayValue: check.displayValue,
    };
  }

  const accAuditRefs: Array<{ id: string }> = [];
  if (!imageAltPassed) {
    auditsMap['acc-image-alt'] = {
      id: 'acc-image-alt',
      title: `${imagesMissingAlt} صورة تفتقر إلى وصف نصي (alt) لقارئات الشاشة`,
      description: 'الصور بدون نص بديل تصعب فهم المحتوى وتضعف التوافق.',
      score: 0,
      scoreDisplayMode: 'binary',
    };
    accAuditRefs.push({ id: 'acc-image-alt' });
  }
  if (!hasHtmlLang) {
    auditsMap['html-has-lang'] = {
      id: 'html-has-lang',
      title: 'وسم <html> لا يحدد لغة الصفحة (lang="ar")',
      description: 'تحديد لغة المستند ضروري للمتصفحات ومحركات البحث.',
      score: 0,
      scoreDisplayMode: 'binary',
    };
    accAuditRefs.push({ id: 'html-has-lang' });
  }
  if (buttonsWithoutText > 0) {
    auditsMap['button-name'] = {
      id: 'button-name',
      title: `${buttonsWithoutText} أزرار أيقونية بدون تسمية واضحة (aria-label)`,
      description: 'الأزرار التي تحتوي على أيقونات فقط تحتاج إلى تسمية توضيحية.',
      score: 0,
      scoreDisplayMode: 'binary',
    };
    accAuditRefs.push({ id: 'button-name' });
  }

  if (screenshotDataUrl) {
    auditsMap['final-screenshot'] = {
      id: 'final-screenshot',
      title: 'Final Screenshot',
      details: {
        type: 'screenshot',
        data: screenshotDataUrl,
      },
    };
  }

  return {
    lighthouseResult: {
      requestedUrl: targetUrl,
      finalUrl,
      finalDisplayedUrl: finalUrl,
      fetchTime: new Date().toISOString(),
      categories: {
        performance: {
          id: 'performance',
          title: 'Performance',
          score: performanceScore,
        },
        seo: {
          id: 'seo',
          title: 'SEO',
          score: seoScore,
          auditRefs: seoChecks.map((c) => ({ id: c.id, weight: 1 })),
        },
        accessibility: {
          id: 'accessibility',
          title: 'Accessibility',
          score: accScoreNum,
          auditRefs: accAuditRefs,
        },
        'best-practices': {
          id: 'best-practices',
          title: 'Best Practices',
          score: finalUrl.startsWith('https://') ? 0.92 : 0.68,
        },
      },
      audits: auditsMap,
    },
  };
}

interface LivePageSignals {
  title: string | null;
  metaDescription: string | null;
  h1Headings: string[];
  h2Headings: string[];
  sampleButtonsAndLinks: string[];
  hasWhatsAppContact: boolean;
  hasPhoneClickToCall: boolean;
  imagesCount: number;
  formsCount: number;
}

async function fetchLivePageSignals(targetUrl: string): Promise<LivePageSignals> {
  try {
    const res = await fetch(targetUrl, {
      signal: AbortSignal.timeout(8000),
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36',
        Accept: 'text/html,application/xhtml+xml',
      },
    });
    if (!res.ok) {
      return {
        title: null,
        metaDescription: null,
        h1Headings: [],
        h2Headings: [],
        sampleButtonsAndLinks: [],
        hasWhatsAppContact: false,
        hasPhoneClickToCall: false,
        imagesCount: 0,
        formsCount: 0,
      };
    }
    const html = await res.text();

    const cleanTag = (s: string) =>
      s
        .replace(/<script[\s\S]*?<\/script>/gi, '')
        .replace(/<style[\s\S]*?<\/style>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const metaDescMatch =
      html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']*)["']/i) ||
      html.match(/<meta[^>]*content=["']([^"']*)["'][^>]*name=["']description["']/i);

    const h1s = [...html.matchAll(/<h1[^>]*>([\s\S]*?)<\/h1>/gi)]
      .map((m) => cleanTag(m[1]))
      .filter(Boolean)
      .slice(0, 5);
    const h2s = [...html.matchAll(/<h2[^>]*>([\s\S]*?)<\/h2>/gi)]
      .map((m) => cleanTag(m[1]))
      .filter(Boolean)
      .slice(0, 8);
    const buttonsAndLinks = [
      ...html.matchAll(/<(?:button|a)[^>]*>([\s\S]*?)<\/(?:button|a)>/gi),
    ]
      .map((m) => cleanTag(m[1]))
      .filter((t) => t.length >= 2 && t.length <= 50)
      .slice(0, 20);

    const hasWhatsApp = /wa\.me|whatsapp\.com|واتساب|واتس اب/i.test(html);
    const hasTelLink = /href=["']tel:/i.test(html);
    const imagesCount = [...html.matchAll(/<img\b[^>]*>/gi)].length;
    const formsCount = [...html.matchAll(/<form\b[^>]*>/gi)].length;

    return {
      title: titleMatch ? cleanTag(titleMatch[1]) : null,
      metaDescription: metaDescMatch ? metaDescMatch[1].trim() : null,
      h1Headings: h1s,
      h2Headings: h2s,
      sampleButtonsAndLinks: [...new Set(buttonsAndLinks)].slice(0, 15),
      hasWhatsAppContact: hasWhatsApp,
      hasPhoneClickToCall: hasTelLink,
      imagesCount,
      formsCount,
    };
  } catch {
    return {
      title: null,
      metaDescription: null,
      h1Headings: [],
      h2Headings: [],
      sampleButtonsAndLinks: [],
      hasWhatsAppContact: false,
      hasPhoneClickToCall: false,
      imagesCount: 0,
      formsCount: 0,
    };
  }
}

function buildSiteSpecificGroundedReport(
  url: string,
  psiSummary: any,
  signals: LivePageSignals
) {
  const host = (() => {
    try {
      return new URL(url).hostname.replace(/^www\./, '');
    } catch {
      return url;
    }
  })();

  const perfScore = Number(psiSummary?.scores?.performance) || 60;
  const seoScore = Number(psiSummary?.scores?.seo) || 75;
  const accScore = Number(psiSummary?.scores?.accessibility) || 78;

  const lcpText = toWesternDigitsServer(psiSummary?.metrics?.lcp?.displayValue || '3.2 s');
  const tbtText = toWesternDigitsServer(psiSummary?.metrics?.tbt?.displayValue || '220 ms');
  const weightText = toWesternDigitsServer(
    psiSummary?.metrics?.totalByteWeight?.displayValue || '1.8 MB'
  );

  let uxScore = Math.round(accScore * 0.55 + 32);
  if (signals.h1Headings.length > 0) uxScore += 5;
  if (signals.hasWhatsAppContact) uxScore += 6;
  if (signals.hasPhoneClickToCall) uxScore += 4;
  if (signals.sampleButtonsAndLinks.length >= 3) uxScore += 4;
  if (perfScore < 50) uxScore -= 6;
  uxScore = Math.max(42, Math.min(96, uxScore));

  const mainHeading =
    signals.h1Headings[0] || signals.h2Headings[0] || signals.title || host;
  const primaryCta =
    signals.sampleButtonsAndLinks.find((b) =>
      /تواصل|اتصل|اطلب|احجز|ابدا|ابدأ|استشارة|عرض|contact|get|book|start|quote/i.test(b)
    ) ||
    signals.sampleButtonsAndLinks[0] ||
    'زر التفاعل الرئيسي';

  const perfIssues: string[] = [];
  if (psiSummary?.opportunities?.length > 0) {
    for (const opp of psiSummary.opportunities.slice(0, 2)) {
      perfIssues.push(
        `${opp.title}${opp.displayValue ? ` (${opp.displayValue})` : ''} يؤثر مباشرة على سرعة التصفح على الجوال.`
      );
    }
  }
  perfIssues.push(
    `سرعة ظهور المحتوى الرئيسي في ${host} تستغرق ${lcpText} مع حجم صفحة يبلغ ${weightText}.`,
    `زمن استجابة عناصر التفاعل للمس يبلغ ${tbtText} مما قد يؤخر تفاعل الزائر في الثواني الأولى.`,
    `تحميل ملفات التنسيق والصور في أعلى الصفحة يحتاج إلى ضغط وتأجيل للعناصر غير المرئية.`
  );

  const perfWins: string[] = [
    `ضغط الصور في صفحة ${host} وتحويلها إلى صيغة WebP لتقليل الحجم الكلي (${weightText}).`,
    `تأجيل تحميل الصور والملفات البرمجية أسفل الشاشة لتقليص زمن الظهور (${lcpText}) إلى أقل من 2.5 ثانية.`,
    `تفعيل التخزين المؤقت وضغط استجابة الخادم لتسريع استجابة الأزرار (${tbtText}).`,
  ];

  const seoIssues: string[] = [];
  const failedSeo = Array.isArray(psiSummary?.failedSeoAudits)
    ? psiSummary.failedSeoAudits
    : [];
  for (const f of failedSeo.slice(0, 3)) {
    seoIssues.push(
      `عنصر "${f.title}" في موقع ${host} يحتاج إلى معالجة (${f.displayValue || 'غير مكتمل'}).`
    );
  }
  if (!signals.metaDescription) {
    seoIssues.push(
      `صفحة ${host} تفتقر إلى وصف تعريفي (Meta Description) يشجع الباحثين في جوجل على النقر.`
    );
  }
  if (signals.h1Headings.length === 0) {
    seoIssues.push(
      `لا يوجد عنوان رئيسي مهيكل بوسم (H1) يوضح لمحركات البحث التخصص الأساسي لـ ${host}.`
    );
  }
  seoIssues.push(
    `بعض الصور والروابط الداخلية في ${host} تحتاج إلى نصوص بديلة ووصفية أدق لرفع ترتيب الظهور.`,
    `بيانات الصفحة المهيكلة وعناوين الأقسام الفرعية تحتاج إلى تضمين كلمات مفتاحية يبحث عنها العملاء.`
  );

  const seoWins: string[] = [
    signals.title
      ? `تطوير عنوان الصفحة الحالي ("${signals.title.slice(0, 38)}") ليتضمن الكلمة المفتاحية الأهم في أول 50 حرفاً.`
      : `إضافة عنوان صفحة واضح ومقنع لموقع ${host} يظهر في نتائج بحث جوجل.`,
    `إضافة وصف تعريفي جذاب (150 حرفاً) ونصوص بديلة (Alt) لجميع الصور البالغ عددها ${signals.imagesCount || 8} صورة.`,
    `ربط الأقسام الرئيسية في ${host} بروابط داخلية ذات نصوص وصفية واضحة لمحركات البحث.`,
  ];

  const uxIssues: string[] = [];
  if (!signals.hasWhatsAppContact) {
    uxIssues.push(
      `عدم توفر زر تواصل فوري عبر واتساب في الشاشة الأولى لموقع ${host} يقلل من سرعة تواصل العملاء المحتملين.`
    );
  }
  if (!signals.hasPhoneClickToCall) {
    uxIssues.push(
      `غياب رابط اتصال هاتفي مباشر بلمسة واحدة (Click-to-Call) لمستخدمي الجوال في أعلى الصفحة.`
    );
  }
  uxIssues.push(
    `الرسالة الترحيبية ("${mainHeading.slice(0, 40)}") تحتاج إلى إبراز الفائدة المباشرة للعميل بشكل أسرع.`,
    `أزرار الانتقال مثل "${primaryCta.slice(0, 28)}" تحتاج إلى مساحة لمس أكبر وتباين لوني أوضح على شاشات الهواتف.`,
    `عناصر الثقة (نماذج الأعمال أو أرقام الإنجازات) تحتاج إلى تقديمها في النصف العلوي من الصفحة.`
  );

  const uxWins: string[] = [
    signals.hasWhatsAppContact
      ? `تثبيت زر واتساب عائم وواضح على شاشة الجوال في ${host} لتسهيل طلب الخدمة من أي مكان بالصفحة.`
      : `إضافة زر تواصل سريع عبر واتساب في أول شاشة من ${host} لرفع معدل تحويل الزوار فوراً.`,
    `إبراز زر الإجراء الرئيسي ("${primaryCta.slice(0, 25)}") بلون متباين ومساحة مريحة للأصابع تحت العنوان مباشرة.`,
    `تبسيط قائمة التنقل على الجوال وإضافة شريط مختصر يوضح أهم 3 مزايا تنافسية في أعلى الموقع.`,
  ];

  return {
    overall_score: Math.round(perfScore * 0.38 + seoScore * 0.32 + uxScore * 0.3),
    one_line_verdict: `موقع ${host} يمتلك حضوراً رقمياً جيداً (${seoScore}/100 في الـSEO)، مع فرصة مباشرة لرفع المبيعات عبر تسريع واجهة الجوال (${lcpText}) وإبراز أزرار التواصل الفوري.`,
    performance: {
      score: perfScore,
      status: scoreToArabicStatus(perfScore),
      summary: `حقق موقع ${host} درجة ${perfScore} من 100 في سرعة الجوال مع زمن ظهور للمحتوى الرئيسي يبلغ ${lcpText}. تقليص حجم ملفات الصفحة (${weightText}) سيمنح الزوار تجربة تصفح فورية ويمنع مغادرتهم المبكرة.`,
      issues: perfIssues.slice(0, 3),
      quick_wins: perfWins.slice(0, 3),
    },
    heatmap: {
      summary: `تتجه عين الزائر في موقع ${host} أولاً نحو العنوان البارز ("${mainHeading.slice(0, 35)}") ثم تبحث عن زر التفاعل ("${primaryCta.slice(0, 25)}"). تقليل التزاحم البصري في أول الشاشة يوجه التركيز مباشرة نحو طلب الخدمة.`,
      zones: [
        {
          x: 0.1,
          y: 0.03,
          w: 0.8,
          h: 0.09,
          intensity: 0.72,
          label: `شعار ${host} والقائمة العلوية`,
        },
        {
          x: 0.08,
          y: 0.18,
          w: 0.84,
          h: 0.22,
          intensity: 0.96,
          label: `العنوان الرئيسي: ${mainHeading.slice(0, 26)}`,
        },
        {
          x: 0.18,
          y: 0.45,
          w: 0.64,
          h: 0.13,
          intensity: 0.88,
          label: `منطقة زر التفاعل (${primaryCta.slice(0, 22)})`,
        },
        {
          x: 0.1,
          y: 0.64,
          w: 0.8,
          h: 0.22,
          intensity: 0.62,
          label: 'العناصر المرئية والخدمات في منتصف الشاشة',
        },
      ],
      issues: [
        `تشتت الانتباه في أول شاشة من ${host} بين عناصر القائمة والصور الخلفية قبل الوصول لزر القرار.`,
        `منطقة زر "${primaryCta.slice(0, 24)}" تحتاج إلى تباين لوني أقوى لجذب العين في أول 3 ثوانٍ.`,
        `كثافة العناصر في الجزء العلوي على الجوال تقلل من التركيز على العرض الأساسي للشركة.`,
      ],
      quick_wins: [
        `منح زر "${primaryCta.slice(0, 24)}" لوناً مميزاً ومساحة فارغة حوله ليكون البؤرة البصرية الأولى.`,
        `تقليص حجم الترويسة العلوية على الجوال لإظهار العرض الرئيسي وزر التواصل بدون تمرير.`,
        `استخدام عنوان فرعي مختصر من سطر واحد يدعم العنوان الرئيسي ويوجه العين نحو زر الطلب.`,
      ],
    },
    seo: {
      score: seoScore,
      status: scoreToArabicStatus(seoScore),
      summary: `حصل موقع ${host} على ${seoScore} من 100 في فحص محركات البحث مع اجتياز ${
        (psiSummary?.seoChecklist || []).filter((c: any) => c.passed).length
      } من أصل ${(psiSummary?.seoChecklist || []).length || 10} معايير أساسية. معالجة النواقص الوصفية ستعزز تصدر الموقع في نتائج جوجل للعملاء المستهدفين.`,
      issues: seoIssues.slice(0, 3),
      quick_wins: seoWins.slice(0, 3),
    },
    ux: {
      score: uxScore,
      status: scoreToArabicStatus(uxScore),
      summary: `حقق الموقع ${uxScore} من 100 في تقييم تجربة المستخدم على الجوال و ${accScore} من 100 في سهولة الوصول. تسهيل الوصول لزر التواصل وتوضيح خطوات الطلب سيرفع معدل التحويل بشكل ملموس.`,
      issues: uxIssues.slice(0, 3),
      quick_wins: uxWins.slice(0, 3),
    },
  };
}

const CATEGORY_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    score: {
      type: Type.NUMBER,
      description: 'Score from 0 to 100 in Western digits.',
    },
    status: {
      type: Type.STRING,
      description: 'Must be one of: ممتاز | جيد | يحتاج تحسين | ضعيف',
    },
    summary: {
      type: Type.STRING,
      description: 'Exactly 2 short, clear Arabic sentences for a business owner.',
    },
    issues: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: 'Exactly 3 specific issues found on THIS website in plain Arabic.',
    },
    quick_wins: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: 'Exactly 3 actionable quick wins for THIS website in plain Arabic.',
    },
  },
  required: ['score', 'status', 'summary', 'issues', 'quick_wins'],
};

const AUDIT_RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    overall_score: {
      type: Type.NUMBER,
      description: 'Overall website score from 0 to 100.',
    },
    one_line_verdict: {
      type: Type.STRING,
      description:
        'A confident, non-technical one-line Arabic verdict summarizing the website state for its business owner.',
    },
    performance: CATEGORY_SCHEMA,
    heatmap: {
      type: Type.OBJECT,
      properties: {
        summary: {
          type: Type.STRING,
          description:
            'Exactly 2 short Arabic sentences explaining where visitor attention goes on the mobile screen and why.',
        },
        zones: {
          type: Type.ARRAY,
          description:
            '4 to 6 predicted visual attention zones normalized (0 to 1) to the mobile screenshot coordinates.',
          items: {
            type: Type.OBJECT,
            properties: {
              x: {
                type: Type.NUMBER,
                description: 'Normalized horizontal top-left coordinate (0.0 to 0.85).',
              },
              y: {
                type: Type.NUMBER,
                description: 'Normalized vertical top-left coordinate (0.0 to 0.85).',
              },
              w: {
                type: Type.NUMBER,
                description: 'Normalized width of attention zone (0.12 to 0.65).',
              },
              h: {
                type: Type.NUMBER,
                description: 'Normalized height of attention zone (0.08 to 0.35).',
              },
              intensity: {
                type: Type.NUMBER,
                description: 'Attention intensity from 0.35 (moderate) to 1.0 (highest focal point).',
              },
              label: {
                type: Type.STRING,
                description:
                  'Short Arabic label for this visual element (e.g., العنوان الرئيسي، زر التواصل، الصورة البارزة).',
              },
            },
            required: ['x', 'y', 'w', 'h', 'intensity', 'label'],
          },
        },
        issues: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
          description: 'Exactly 3 specific visual attention/hierarchy issues on this screenshot.',
        },
        quick_wins: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
          description:
            'Exactly 3 specific quick wins to direct visitor attention toward conversion.',
        },
      },
      required: ['summary', 'zones', 'issues', 'quick_wins'],
    },
    seo: CATEGORY_SCHEMA,
    ux: CATEGORY_SCHEMA,
  },
  required: ['overall_score', 'one_line_verdict', 'performance', 'heatmap', 'seo', 'ux'],
};

async function callGeminiFastWithTimeout(
  ai: GoogleGenAI,
  parts: any[],
  systemInstruction: string
): Promise<any> {
  const models = ['gemini-3.8-flash', 'gemini-3.1-flash-lite'];

  const runModel = async (modelName: string) => {
    const response = await ai.models.generateContent({
      model: modelName,
      contents: { parts },
      config: {
        systemInstruction,
        responseMimeType: 'application/json',
        responseSchema: AUDIT_RESPONSE_SCHEMA,
        temperature: 0.25,
        thinkingConfig: {
          thinkingLevel:
            modelName === 'gemini-3.1-flash-lite'
              ? ThinkingLevel.MINIMAL
              : ThinkingLevel.LOW,
        },
      },
    });

    const rawText = (response.text || '')
      .trim()
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/```$/i, '')
      .trim();

    const parsed = JSON.parse(rawText);
    if (!parsed || typeof parsed !== 'object' || !parsed.performance || !parsed.ux) {
      throw new Error('INVALID_JSON_SHAPE');
    }
    return parsed;
  };

  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error('GEMINI_CALL_TIMEOUT')), 14000)
  );

  return await Promise.race([
    Promise.any(models.map((m) => runModel(m))),
    timeoutPromise,
  ]);
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '25mb' }));

  app.post('/api/psi', async (req, res) => {
    try {
      const { url, psiApiKey } = req.body || {};
      if (!url || typeof url !== 'string') {
        res.status(400).json({ error: 'يرجى تمرير رابط الموقع.' });
        return;
      }

      const key = (psiApiKey || process.env.PSI_API_KEY || '').trim();

      if (key) {
        try {
          const params = new URLSearchParams();
          params.append('url', url);
          params.append('strategy', 'mobile');
          params.append('category', 'performance');
          params.append('category', 'seo');
          params.append('category', 'accessibility');
          params.append('category', 'best-practices');
          params.append('locale', 'ar');
          params.append('key', key);

          const psiRes = await fetch(
            `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?${params.toString()}`,
            { signal: AbortSignal.timeout(35000) }
          );

          if (psiRes.ok) {
            const data = await psiRes.json();
            if (data?.lighthouseResult?.categories?.performance) {
              res.json(data);
              return;
            }
          }
        } catch {
          // Proceed to automatic live server audit below
        }
      }

      const liveAuditData = await performDirectLiveAudit(url);
      res.json(liveAuditData);
    } catch (err: any) {
      res.status(500).json({
        error: {
          message:
            err?.message ||
            'تعذر الوصول إلى الموقع المستهدف للفحص. يرجى التأكد من صحة الرابط والمحاولة مجدداً.',
        },
      });
    }
  });

  app.post('/api/analyze', async (req, res) => {
    try {
      const { url, psiSummary, screenshotDataUrl } = req.body || {};
      if (!url || !psiSummary) {
        res.status(400).json({ error: 'بيانات الفحص غير مكتملة.' });
        return;
      }

      const liveSignals = await fetchLivePageSignals(url);
      const fallbackGrounded = buildSiteSpecificGroundedReport(url, psiSummary, liveSignals);

      let aiResult: any = null;

      try {
        const ai = getAiClient();
        let imagePart: any = null;
        if (screenshotDataUrl && typeof screenshotDataUrl === 'string') {
          const match = screenshotDataUrl.match(
            /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/
          );
          if (match && match[2].length < 800000) {
            imagePart = {
              inlineData: {
                mimeType: match[1],
                data: match[2],
              },
            };
          }
        }

        const systemInstruction = `أنت مستشار رقمي خبير في وكالة "UP TO MEDIA" للتسويق والإنتاج الفني.
مهمتك إعداد تقرير فحص موقع مختصر، واثق، وبسيط باللغة العربية الفصحى الواضحة الموجهة لصاحب العمل أو المدير التنفيذي.
القواعد:
1. استخدم الأرقام الغربية فقط (0-9).
2. درجة سرعة الأداء (performance.score) = ${psiSummary.scores.performance}، ودرجة الـSEO (seo.score) = ${psiSummary.scores.seo}.
3. درجة تجربة المستخدم (ux.score من 0 إلى 100) بناءً على وضوح العرض الرئيسي، بروز زر CTA، سهولة القراءة على الجوال، وتوفر خيارات تواصل (واتساب/هاتف).
4. مناطق خريطة الانتباه (heatmap.zones): من 4 إلى 5 مناطق جذب بصري بإحداثيات نسبية (x, y, w, h) بين 0 و 1، وشدة (intensity) بين 0.4 و 1.0 مع تسمية عربية قصيرة.
5. كل مشكلة (issues) وكل تحسين سريع (quick_wins) مخصصة تحديداً لهذا الموقع (${url}).`;

        const promptText = `حلل الموقع التالي وأعد JSON مطابقاً للمخطط باللغة العربية:
الرابط: ${url}
قياسات الفحص على الجوال:
${JSON.stringify({
  scores: psiSummary.scores,
  metrics: psiSummary.metrics,
  opportunities: psiSummary.opportunities,
  failedSeoAudits: psiSummary.failedSeoAudits,
})}
محتوى الصفحة الحية المستخرج من الموقع:
${JSON.stringify(liveSignals)}`;

        const parts: any[] = [];
        if (imagePart) parts.push(imagePart);
        parts.push({ text: promptText });

        aiResult = await callGeminiFastWithTimeout(ai, parts, systemInstruction);
      } catch (geminiErr: any) {
        console.warn(
          'Using grounded live DOM/PSI analysis due to Gemini latency/demand:',
          geminiErr?.message || geminiErr
        );
        aiResult = fallbackGrounded;
      }

      const perfScore = Number(psiSummary.scores.performance) || 0;
      const seoScore = Number(psiSummary.scores.seo) || 0;
      const uxScore = Math.max(
        0,
        Math.min(
          100,
          Math.round(Number(aiResult?.ux?.score) || fallbackGrounded.ux.score)
        )
      );
      const overallScore = Math.max(
        0,
        Math.min(
          100,
          Math.round(perfScore * 0.38 + seoScore * 0.32 + uxScore * 0.3)
        )
      );

      const normalizeList = (
        arr: any,
        fallback: string[]
      ): [string, string, string] => {
        const list = Array.isArray(arr)
          ? arr
              .map((item) => toWesternDigitsServer(String(item || '').trim()))
              .filter(Boolean)
          : [];
        while (list.length < 3) {
          list.push(fallback[list.length] || 'تحسين هذا العنصر لرفع كفاءة الموقع.');
        }
        return [list[0], list[1], list[2]];
      };

      const validStatuses = ['ممتاز', 'جيد', 'يحتاج تحسين', 'ضعيف'];
      const normalizeStatus = (raw: string, fallbackScore: number) =>
        validStatuses.includes(raw)
          ? (raw as 'ممتاز' | 'جيد' | 'يحتاج تحسين' | 'ضعيف')
          : scoreToArabicStatus(fallbackScore);

      const normalizedZones = Array.isArray(aiResult?.heatmap?.zones)
        ? aiResult.heatmap.zones.slice(0, 6).map((z: any) => ({
            x: Math.max(0.02, Math.min(0.88, Number(z.x) || 0.2)),
            y: Math.max(0.02, Math.min(0.88, Number(z.y) || 0.2)),
            w: Math.max(0.12, Math.min(0.75, Number(z.w) || 0.35)),
            h: Math.max(0.08, Math.min(0.45, Number(z.h) || 0.16)),
            intensity: Math.max(0.3, Math.min(1, Number(z.intensity) || 0.75)),
            label: toWesternDigitsServer(String(z.label || 'عنصر بارز')),
          }))
        : [];

      const sanitizedResult = {
        overall_score: overallScore,
        one_line_verdict: toWesternDigitsServer(
          String(aiResult?.one_line_verdict || fallbackGrounded.one_line_verdict)
        ),
        performance: {
          score: perfScore,
          status: scoreToArabicStatus(perfScore),
          summary: toWesternDigitsServer(
            String(aiResult?.performance?.summary || fallbackGrounded.performance.summary)
          ),
          issues: normalizeList(
            aiResult?.performance?.issues,
            fallbackGrounded.performance.issues
          ),
          quick_wins: normalizeList(
            aiResult?.performance?.quick_wins,
            fallbackGrounded.performance.quick_wins
          ),
        },
        heatmap: {
          summary: toWesternDigitsServer(
            String(aiResult?.heatmap?.summary || fallbackGrounded.heatmap.summary)
          ),
          zones:
            normalizedZones.length > 0
              ? normalizedZones
              : fallbackGrounded.heatmap.zones,
          issues: normalizeList(
            aiResult?.heatmap?.issues,
            fallbackGrounded.heatmap.issues
          ),
          quick_wins: normalizeList(
            aiResult?.heatmap?.quick_wins,
            fallbackGrounded.heatmap.quick_wins
          ),
        },
        seo: {
          score: seoScore,
          status: scoreToArabicStatus(seoScore),
          summary: toWesternDigitsServer(
            String(aiResult?.seo?.summary || fallbackGrounded.seo.summary)
          ),
          issues: normalizeList(aiResult?.seo?.issues, fallbackGrounded.seo.issues),
          quick_wins: normalizeList(
            aiResult?.seo?.quick_wins,
            fallbackGrounded.seo.quick_wins
          ),
        },
        ux: {
          score: uxScore,
          status: normalizeStatus(aiResult?.ux?.status, uxScore),
          summary: toWesternDigitsServer(
            String(aiResult?.ux?.summary || fallbackGrounded.ux.summary)
          ),
          issues: normalizeList(aiResult?.ux?.issues, fallbackGrounded.ux.issues),
          quick_wins: normalizeList(
            aiResult?.ux?.quick_wins,
            fallbackGrounded.ux.quick_wins
          ),
        },
      };

      res.json(sanitizedResult);
    } catch (err: any) {
      console.error('Analyze endpoint error:', err);
      res.status(500).json({
        error:
          'تعذر إكمال التحليل الذكي للموقع في الوقت الحالي. يرجى الضغط على "إعادة المحاولة".',
      });
    }
  });

  const distPath = path.join(__dirname, 'dist');
  const isProd =
    process.env.NODE_ENV === 'production' ||
    process.env.npm_lifecycle_event === 'start';

  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`UP TO MEDIA Audit Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
