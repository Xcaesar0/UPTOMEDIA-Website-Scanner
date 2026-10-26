import React, { useEffect, useState } from 'react';
import {
  Activity,
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ClipboardPaste,
  Eye,
  Gauge,
  Globe,
  MessageCircle,
  Moon,
  Printer,
  RefreshCw,
  RotateCcw,
  Search,
  Settings,
  Smartphone,
  Sparkles,
  Sun,
  UserCheck,
  X,
  XCircle,
  Zap,
} from 'lucide-react';
import { BrandLogo } from './components/BrandLogo';
import { HeatmapCanvas } from './components/HeatmapCanvas';
import { ScoreRing, getScoreColorInfo } from './components/ScoreRing';
import {
  FullAuditReport,
  GeminiAuditResult,
  PsiExtractedData,
  VisitorInfo,
} from './types/audit';
import {
  getStoredPsiApiKey,
  normalizeAndValidateUrl,
  runPageSpeedInsights,
  setStoredPsiApiKey,
  toWesternDigits,
} from './utils/psi';

type ScreenState = 'input' | 'loading' | 'results';

const LOADING_STEPS = [
  'قياس سرعة الموقع…',
  'التقاط شكل الموقع على الجوال…',
  'فحص محركات البحث…',
  'تحليل تجربة المستخدم بالذكاء الاصطناعي…',
  'تجهيز التقرير…',
];

function getMetricDotColor(score: number | null, metricId: string, numericValue: number): string {
  if (score !== null) {
    if (score >= 0.9) return 'bg-emerald-500';
    if (score >= 0.5) return 'bg-amber-500';
    return 'bg-[#E63130]';
  }
  if (metricId === 'total-byte-weight') {
    if (numericValue <= 1600000) return 'bg-emerald-500';
    if (numericValue <= 3200000) return 'bg-amber-500';
    return 'bg-[#E63130]';
  }
  return 'bg-amber-500';
}

export default function App() {
  // Default to dark mode for the booth screen
  const [isDark, setIsDark] = useState<boolean>(true);
  const [screen, setScreen] = useState<ScreenState>('input');

  // Input state
  const [urlInput, setUrlInput] = useState<string>('');
  const [urlError, setUrlError] = useState<string | null>(null);
  const [showVisitorFields, setShowVisitorFields] = useState<boolean>(false);
  const [visitor, setVisitor] = useState<VisitorInfo>({
    name: '',
    company: '',
    phone: '',
  });

  // Loading & Error state
  const [activeStepIndex, setActiveStepIndex] = useState<number>(0);
  const [elapsedSeconds, setElapsedSeconds] = useState<number>(0);
  const [pipelineError, setPipelineError] = useState<string | null>(null);
  const [targetUrlBeingAnalyzed, setTargetUrlBeingAnalyzed] = useState<string>('');

  // Report state
  const [report, setReport] = useState<FullAuditReport | null>(null);

  // Settings modal for optional PSI_API_KEY
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
  const [psiKeyInput, setPsiKeyInput] = useState<string>(() => getStoredPsiApiKey());
  const [psiKeySavedToast, setPsiKeySavedToast] = useState<boolean>(false);

  // Sync dark class on <html>
  useEffect(() => {
    const root = document.documentElement;
    if (isDark) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [isDark]);

  // Elapsed timer during loading
  useEffect(() => {
    if (screen !== 'loading' || pipelineError) return;
    const interval = setInterval(() => {
      setElapsedSeconds((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [screen, pipelineError]);

  const handleSavePsiKey = (e: React.FormEvent) => {
    e.preventDefault();
    setStoredPsiApiKey(psiKeyInput);
    setPsiKeySavedToast(true);
    setTimeout(() => {
      setPsiKeySavedToast(false);
      setIsSettingsOpen(false);
    }, 900);
  };

  const handlePasteFromClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        setUrlInput(text.trim());
        setUrlError(null);
      }
    } catch {
      // Clipboard permission may be restricted inside some frames; ignore gracefully
    }
  };

  const executeAuditPipeline = async (rawUrlToRun?: string) => {
    const candidateInput = rawUrlToRun !== undefined ? rawUrlToRun : urlInput;
    const validation = normalizeAndValidateUrl(candidateInput);

    if (!validation.valid) {
      setUrlError(validation.error || 'يرجى إدخال رابط موقع صحيح.');
      return;
    }

    setUrlError(null);
    setPipelineError(null);
    setUrlInput(validation.url);
    setTargetUrlBeingAnalyzed(validation.url);
    setScreen('loading');
    setActiveStepIndex(0);
    setElapsedSeconds(0);

    // Step progression timer for visual booth engagement while Step A runs
    const stepTimer1 = setTimeout(() => {
      setActiveStepIndex((prev) => (prev < 1 ? 1 : prev));
    }, 3200);
    const stepTimer2 = setTimeout(() => {
      setActiveStepIndex((prev) => (prev < 2 ? 2 : prev));
    }, 6800);

    try {
      // STEP A: Real measurements (Google PageSpeed Insights v5 / Live Server Audit)
      const psiData: PsiExtractedData = await runPageSpeedInsights(
        validation.url,
        psiKeyInput
      );

      clearTimeout(stepTimer1);
      clearTimeout(stepTimer2);

      // Light up steps 1, 2, 3 and advance to step 4 (AI UX & Heatmap Analysis)
      setActiveStepIndex(3);

      // Compress screenshot to a lightweight JPEG (~30KB) for fast upload & multimodal inference,
      // and avoid duplicating the large screenshot inside psiSummary
      const compressScreenshotForApi = async (
        dataUrl: string | null
      ): Promise<string | null> => {
        if (!dataUrl) return null;
        return new Promise((resolve) => {
          const img = new Image();
          img.onload = () => {
            try {
              const canvas = document.createElement('canvas');
              const targetW = 360;
              const scale = targetW / (img.naturalWidth || 390);
              const targetH = Math.min(
                720,
                Math.round((img.naturalHeight || 720) * scale)
              );
              canvas.width = targetW;
              canvas.height = targetH;
              const ctx = canvas.getContext('2d');
              if (ctx) {
                ctx.drawImage(img, 0, 0, targetW, targetH);
                resolve(canvas.toDataURL('image/jpeg', 0.68));
                return;
              }
            } catch {
              // ignore
            }
            resolve(dataUrl.length < 400000 ? dataUrl : null);
          };
          img.onerror = () => resolve(null);
          img.src = dataUrl;
        });
      };

      const compactScreenshot = await compressScreenshotForApi(psiData.screenshotDataUrl);
      const {
        screenshotDataUrl: _omitShot,
        screenshotThumbnails: _omitThumbs,
        ...compactPsiSummary
      } = psiData;

      // STEP B: AI Analysis via Gemini Flash on Server
      const aiResponse = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: validation.url,
          psiSummary: compactPsiSummary,
          screenshotDataUrl: compactScreenshot,
        }),
      });

      const rawAiText = await aiResponse.text();
      let parsedAiBody: any = null;
      try {
        parsedAiBody = JSON.parse(rawAiText);
      } catch {
        throw new Error(
          'استغرق التحليل وقتاً أطول من المعتاد بسبب ضغط الشبكة. يرجى الضغط على "إعادة المحاولة".'
        );
      }

      if (!aiResponse.ok) {
        throw new Error(
          parsedAiBody?.error ||
            'تعذر إتمام التحليل الذكي لتجربة المستخدم. يرجى المحاولة مرة أخرى.'
        );
      }

      const aiData: GeminiAuditResult = parsedAiBody;

      // Advance to Step 5: "تجهيز التقرير…"
      setActiveStepIndex(4);
      await new Promise((r) => setTimeout(r, 650));

      const nowFormatted = new Intl.DateTimeFormat('en-GB', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      }).format(new Date());

      setReport({
        url: validation.url,
        analyzedAt: nowFormatted,
        visitor: {
          name: visitor.name.trim(),
          company: visitor.company.trim(),
          phone: visitor.phone.trim(),
        },
        psi: psiData,
        ai: aiData,
      });

      setScreen('results');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err: any) {
      clearTimeout(stepTimer1);
      clearTimeout(stepTimer2);
      setPipelineError(
        err?.message || 'حدث خطأ غير متوقع أثناء فحص الموقع. يرجى المحاولة مرة أخرى.'
      );
    }
  };

  const handleResetToNewAudit = () => {
    setReport(null);
    setPipelineError(null);
    setUrlInput('');
    setUrlError(null);
    setVisitor({ name: '', company: '', phone: '' });
    setActiveStepIndex(0);
    setElapsedSeconds(0);
    setScreen('input');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Build WhatsApp consultation link with prefilled Arabic message
  const getWhatsAppConsultationUrl = () => {
    if (!report) return 'https://wa.me/962791214158';
    const lines = [
      'مرحباً فريق UP TO MEDIA،',
      `قمت بإجراء فحص مجاني لموقعي في جناح المعرض وأرغب بحجز استشارة لتحسين الأداء:`,
      `• رابط الموقع: ${report.url}`,
      `• النتيجة الإجمالية: ${report.ai.overall_score}/100`,
      `• سرعة الأداء: ${report.ai.performance.score}/100 | الـSEO: ${report.ai.seo.score}/100 | تجربة المستخدم: ${report.ai.ux.score}/100`,
    ];
    if (report.visitor.name || report.visitor.company) {
      lines.push(
        `• الزائر: ${[report.visitor.name, report.visitor.company]
          .filter(Boolean)
          .join(' - ')}`
      );
    }
    return `https://wa.me/962791214158?text=${encodeURIComponent(lines.join('\n'))}`;
  };

  return (
    <div
      dir="rtl"
      className={`min-h-screen flex flex-col justify-between relative overflow-x-hidden transition-colors duration-300 ${
        isDark
          ? 'bg-[#070B14] text-slate-100'
          : 'bg-[#F8F9FB] text-slate-900'
      }`}
    >
      {/* Ambient Brand 3D-Sphere-Inspired Glows (#E63130 Red & #12509B Blue) */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 overflow-hidden print-hidden z-0"
      >
        <div
          className={`absolute -top-36 -right-36 w-[480px] h-[480px] rounded-full blur-[130px] transition-opacity duration-500 ${
            isDark ? 'opacity-25' : 'opacity-15'
          }`}
          style={{
            background: 'radial-gradient(circle, #E63130 0%, transparent 70%)',
          }}
        />
        <div
          className={`absolute top-1/3 -left-40 w-[540px] h-[540px] rounded-full blur-[140px] transition-opacity duration-500 ${
            isDark ? 'opacity-35' : 'opacity-15'
          }`}
          style={{
            background: 'radial-gradient(circle, #12509B 0%, transparent 70%)',
          }}
        />
      </div>

      {/* Top Navigation Bar (Strict 3-Zone Contract) */}
      <header
        className={`relative z-20 border-b transition-colors ${
          isDark
            ? 'bg-[#070B14]/80 border-white/10'
            : 'bg-white/85 border-slate-200/80'
        } backdrop-blur-md`}
      >
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3.5 flex items-center justify-between gap-8">
          {/* Zone 1: Brand Wordmark / Logo */}
          <a
            href="#top"
            onClick={(e) => {
              e.preventDefault();
              if (screen === 'results') handleResetToNewAudit();
            }}
            className="inline-flex items-center whitespace-nowrap shrink-0 focus:outline-none"
          >
            <BrandLogo isDark={isDark} className="h-10 sm:h-11 w-auto" />
          </a>

          {/* Zone 2: Concise Navigation Links */}
          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600 dark:text-slate-300 print-hidden">
            <span className="whitespace-nowrap shrink-0 text-slate-900 dark:text-white font-semibold">
              فحص الموقع المجاني
            </span>
            <a
              href="https://up2media.net"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-[#E63130] transition-colors whitespace-nowrap shrink-0"
            >
              موقع الوكالة
            </a>
            <a
              href="https://wa.me/962791214158"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-[#E63130] transition-colors whitespace-nowrap shrink-0"
            >
              تواصل واتساب
            </a>
          </nav>

          {/* Zone 3: Controls */}
          <div className="flex items-center gap-2.5 shrink-0 print-hidden">
            {screen === 'results' && (
              <button
                type="button"
                onClick={handleResetToNewAudit}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-semibold bg-[#E63130] text-white hover:bg-[#d12827] transition-colors cursor-pointer whitespace-nowrap shrink-0 min-h-[44px]"
              >
                <RotateCcw className="w-4 h-4" />
                <span>فحص موقع جديد</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => setIsDark((d) => !d)}
              aria-label={isDark ? 'تفعيل الوضع الفاتح' : 'تفعيل الوضع الداكن'}
              title={isDark ? 'الوضع الفاتح' : 'الوضع الداكن'}
              className={`p-2.5 rounded-xl border transition-colors cursor-pointer min-h-[44px] min-w-[44px] inline-flex items-center justify-center ${
                isDark
                  ? 'bg-slate-900/90 border-white/10 text-slate-200 hover:bg-slate-800'
                  : 'bg-slate-100 border-slate-200 text-slate-700 hover:bg-slate-200'
              }`}
            >
              {isDark ? <Sun className="w-5 h-5 text-amber-400" /> : <Moon className="w-5 h-5" />}
            </button>

            <button
              type="button"
              onClick={() => setIsSettingsOpen(true)}
              aria-label="إعدادات متقدمة"
              title="إعدادات مفتاح PageSpeed (اختياري)"
              className={`relative p-2.5 rounded-xl border transition-colors cursor-pointer min-h-[44px] min-w-[44px] inline-flex items-center justify-center ${
                isDark
                  ? 'bg-slate-900/90 border-white/10 text-slate-300 hover:bg-slate-800'
                  : 'bg-slate-100 border-slate-200 text-slate-700 hover:bg-slate-200'
              }`}
            >
              <Settings className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="relative z-10 flex-1 w-full max-w-6xl mx-auto px-4 sm:px-6 py-8 sm:py-12 flex flex-col justify-center">
        {/* ================= SCREEN 1: INPUT ================= */}
        {screen === 'input' && (
          <div className="w-full max-w-3xl mx-auto">
            <div
              className={`rounded-3xl border p-6 sm:p-10 md:p-12 transition-all ${
                isDark
                  ? 'bg-[#0D1424]/90 border-white/10 shadow-[0_25px_70px_-15px_rgba(18,80,155,0.28)]'
                  : 'bg-white border-slate-200/90 shadow-xl'
              }`}
            >
              {/* Brand Hero Header */}
              <div className="text-center space-y-4 mb-8">
                <div className="flex justify-center mb-3">
                  <BrandLogo isDark={isDark} className="h-14 sm:h-16 w-auto" />
                </div>

                <h1
                  className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight leading-tight"
                  style={{ textWrap: 'balance' }}
                >
                  اكتشف أداء موقعك خلال دقيقة
                </h1>

                <p className="text-base sm:text-lg text-slate-600 dark:text-slate-300 max-w-xl mx-auto leading-relaxed">
                  فحص مجاني للسرعة، الانتباه، الـSEO وتجربة المستخدم
                </p>
              </div>

              {/* Main Audit Input Form */}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  executeAuditPipeline();
                }}
                className="space-y-5"
                noValidate
              >
                <div>
                  <label
                    htmlFor="website-url-input"
                    className="block text-sm font-semibold mb-2 text-slate-700 dark:text-slate-200"
                  >
                    رابط الموقع الإلكتروني
                  </label>
                  <div className="relative flex items-center">
                    <div className="absolute right-4 pointer-events-none text-slate-400">
                      <Globe className="w-6 h-6" />
                    </div>
                    <input
                      id="website-url-input"
                      type="text"
                      inputMode="url"
                      autoCapitalize="none"
                      autoCorrect="off"
                      spellCheck={false}
                      dir="ltr"
                      value={urlInput}
                      onChange={(e) => {
                        setUrlInput(e.target.value);
                        if (urlError) setUrlError(null);
                      }}
                      placeholder="https://example.com"
                      className={`w-full min-h-[60px] pr-13 pl-24 py-4 rounded-2xl text-base sm:text-lg font-medium western-nums border-2 transition-colors focus:outline-none ${
                        urlError
                          ? 'border-[#E63130] bg-[#E63130]/5 text-slate-900 dark:text-white'
                          : isDark
                          ? 'bg-[#070B14]/90 border-white/15 text-white placeholder:text-slate-500 focus:border-[#E63130]'
                          : 'bg-slate-50 border-slate-300 text-slate-900 placeholder:text-slate-400 focus:border-[#12509B]'
                      }`}
                    />
                    <button
                      type="button"
                      onClick={handlePasteFromClipboard}
                      title="لصق الرابط من الحافظة"
                      className={`absolute left-2.5 px-3.5 py-2 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer min-h-[42px] ${
                        isDark
                          ? 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-white/10'
                          : 'bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 shadow-xs'
                      }`}
                    >
                      <ClipboardPaste className="w-4 h-4" />
                      <span>لصق</span>
                    </button>
                  </div>

                  {urlError && (
                    <div className="mt-2.5 flex items-center gap-2 text-sm text-[#E63130] dark:text-[#FF6B6B] font-medium">
                      <AlertCircle className="w-4 h-4 shrink-0" />
                      <span>{urlError}</span>
                    </div>
                  )}

                  {/* Quick-select sample sites for booth demos */}
                  <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                    <span>تجربة سريعة:</span>
                    {['up2media.net', 'aljazeera.net', 'mawdoo3.com'].map((sample) => (
                      <button
                        key={sample}
                        type="button"
                        onClick={() => {
                          setUrlInput(`https://${sample}`);
                          setUrlError(null);
                        }}
                        className={`px-2.5 py-1 rounded-lg western-nums font-medium transition-colors cursor-pointer ${
                          isDark
                            ? 'bg-white/5 hover:bg-white/10 text-slate-300'
                            : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                        }`}
                      >
                        {sample}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Collapsible Optional Visitor Info ("بيانات الزائر") */}
                <div
                  className={`rounded-2xl border transition-colors ${
                    isDark
                      ? 'bg-[#070B14]/60 border-white/10'
                      : 'bg-slate-50/80 border-slate-200/80'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => setShowVisitorFields((v) => !v)}
                    className="w-full px-5 py-4 flex items-center justify-between text-right text-sm font-semibold text-slate-700 dark:text-slate-200 cursor-pointer min-h-[52px]"
                  >
                    <div className="flex items-center gap-2.5">
                      <UserCheck className="w-4 h-4 text-[#12509B] dark:text-blue-400" />
                      <span>بيانات الزائر (اختياري — تظهر في التقرير فقط)</span>
                    </div>
                    {showVisitorFields ? (
                      <ChevronUp className="w-5 h-5 text-slate-400" />
                    ) : (
                      <ChevronDown className="w-5 h-5 text-slate-400" />
                    )}
                  </button>

                  {showVisitorFields && (
                    <div className="px-5 pb-5 pt-1 grid grid-cols-1 sm:grid-cols-3 gap-3.5 border-t border-slate-200/60 dark:border-white/5">
                      <div>
                        <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">
                          الاسم الكريم
                        </label>
                        <input
                          type="text"
                          value={visitor.name}
                          onChange={(e) =>
                            setVisitor((prev) => ({ ...prev, name: e.target.value }))
                          }
                          placeholder="مثال: أحمد محمود"
                          className={`w-full px-3.5 py-2.5 rounded-xl text-sm border focus:outline-none min-h-[44px] ${
                            isDark
                              ? 'bg-[#0D1424] border-white/10 text-white focus:border-blue-500'
                              : 'bg-white border-slate-300 text-slate-900 focus:border-[#12509B]'
                          }`}
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">
                          اسم الشركة / العلامة
                        </label>
                        <input
                          type="text"
                          value={visitor.company}
                          onChange={(e) =>
                            setVisitor((prev) => ({ ...prev, company: e.target.value }))
                          }
                          placeholder="مثال: شركة الرواد"
                          className={`w-full px-3.5 py-2.5 rounded-xl text-sm border focus:outline-none min-h-[44px] ${
                            isDark
                              ? 'bg-[#0D1424] border-white/10 text-white focus:border-blue-500'
                              : 'bg-white border-slate-300 text-slate-900 focus:border-[#12509B]'
                          }`}
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">
                          رقم الهاتف / واتساب
                        </label>
                        <input
                          type="tel"
                          dir="ltr"
                          value={visitor.phone}
                          onChange={(e) =>
                            setVisitor((prev) => ({
                              ...prev,
                              phone: toWesternDigits(e.target.value),
                            }))
                          }
                          placeholder="+962 79 000 0000"
                          className={`w-full px-3.5 py-2.5 rounded-xl text-sm western-nums border focus:outline-none min-h-[44px] ${
                            isDark
                              ? 'bg-[#0D1424] border-white/10 text-white focus:border-blue-500'
                              : 'bg-white border-slate-300 text-slate-900 focus:border-[#12509B]'
                          }`}
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* Big Primary CTA Button */}
                <button
                  type="submit"
                  className="w-full min-h-[62px] py-4 px-8 rounded-2xl text-lg sm:text-xl font-bold text-white bg-gradient-to-l from-[#E63130] to-[#c82322] hover:from-[#f03a39] hover:to-[#d62827] shadow-[0_12px_35px_-8px_rgba(230,49,48,0.55)] transition-all flex items-center justify-center gap-3 cursor-pointer whitespace-nowrap"
                >
                  <Zap className="w-6 h-6" />
                  <span>ابدأ التحليل</span>
                  <ArrowLeft className="w-5 h-5" />
                </button>
              </form>

              {/* 4 Pillars Preview Footer inside Input Card */}
              <div className="mt-8 pt-6 border-t border-slate-200/70 dark:border-white/10 grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
                {[
                  { icon: Gauge, label: 'سرعة الأداء والجوال' },
                  { icon: Eye, label: 'خريطة الانتباه الذكية' },
                  { icon: Search, label: 'تحسين محركات البحث' },
                  { icon: Smartphone, label: 'تجربة المستخدم والتحويل' },
                ].map((item, idx) => (
                  <div
                    key={idx}
                    className={`p-3 rounded-xl border flex flex-col items-center gap-2 ${
                      isDark
                        ? 'bg-white/[0.02] border-white/5 text-slate-300'
                        : 'bg-slate-50 border-slate-200/60 text-slate-700'
                    }`}
                  >
                    <item.icon className="w-5 h-5 text-[#E63130]" />
                    <span className="text-xs font-medium">{item.label}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ================= SCREEN 2: LOADING ================= */}
        {screen === 'loading' && (
          <div className="w-full max-w-2xl mx-auto">
            <div
              className={`rounded-3xl border p-6 sm:p-10 transition-all ${
                isDark
                  ? 'bg-[#0D1424]/95 border-white/10 shadow-[0_25px_70px_-15px_rgba(18,80,155,0.3)]'
                  : 'bg-white border-slate-200 shadow-xl'
              }`}
            >
              <div className="text-center space-y-2 mb-8">
                <div className="inline-flex items-center gap-2 text-xs font-semibold text-[#E63130] mb-1">
                  <span>جاري الفحص المباشر</span>
                  <span>·</span>
                  <span className="western-nums">{elapsedSeconds}s</span>
                </div>
                <h2 className="text-2xl sm:text-3xl font-bold">
                  نحلل موقعك الآن خطوة بخطوة
                </h2>
                <p
                  dir="ltr"
                  className="western-nums text-sm font-medium text-slate-500 dark:text-slate-400 truncate max-w-md mx-auto"
                >
                  {targetUrlBeingAnalyzed}
                </p>
              </div>

              {/* Progress Bar */}
              {!pipelineError && (
                <div className="w-full h-2.5 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden mb-8">
                  <div
                    className="h-full bg-gradient-to-l from-[#E63130] via-[#12509B] to-blue-400 transition-all duration-700 ease-out rounded-full"
                    style={{
                      width: `${Math.min(96, (activeStepIndex + 1) * 19)}%`,
                    }}
                  />
                </div>
              )}

              {/* 5 Sequential Steps */}
              <div className="space-y-3.5">
                {LOADING_STEPS.map((stepText, idx) => {
                  const isCompleted = !pipelineError && idx < activeStepIndex;
                  const isCurrent = !pipelineError && idx === activeStepIndex;

                  return (
                    <div
                      key={idx}
                      className={`p-4 rounded-2xl border transition-all flex items-center justify-between gap-4 ${
                        isCurrent
                          ? isDark
                            ? 'bg-[#12509B]/20 border-[#12509B] text-white shadow-sm'
                            : 'bg-blue-50/90 border-[#12509B] text-slate-900 shadow-sm'
                          : isCompleted
                          ? isDark
                            ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                            : 'bg-emerald-50 border-emerald-200 text-emerald-900'
                          : isDark
                          ? 'bg-white/[0.02] border-white/5 text-slate-500'
                          : 'bg-slate-50 border-slate-200/60 text-slate-400'
                      }`}
                    >
                      <div className="flex items-center gap-3.5">
                        <span
                          className={`w-8 h-8 rounded-xl western-nums text-sm font-bold flex items-center justify-center shrink-0 ${
                            isCompleted
                              ? 'bg-emerald-500 text-white'
                              : isCurrent
                              ? 'bg-[#E63130] text-white'
                              : isDark
                              ? 'bg-slate-800 text-slate-400'
                              : 'bg-slate-200 text-slate-600'
                          }`}
                        >
                          {isCompleted ? <CheckCircle2 className="w-5 h-5" /> : idx + 1}
                        </span>
                        <span className="text-base sm:text-lg font-semibold">{stepText}</span>
                      </div>

                      {isCurrent && (
                        <RefreshCw className="w-5 h-5 text-[#E63130] animate-spin shrink-0" />
                      )}
                      {isCompleted && (
                        <span className="text-xs font-semibold text-emerald-500">مكتمل</span>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Error State with Retry */}
              {pipelineError && (
                <div className="mt-6 p-5 rounded-2xl border border-[#E63130]/40 bg-[#E63130]/10 space-y-4">
                  <div className="flex items-start gap-3">
                    <AlertCircle className="w-6 h-6 text-[#E63130] shrink-0 mt-0.5" />
                    <div className="space-y-1">
                      <h3 className="font-bold text-base text-slate-900 dark:text-white">
                        تعذر إكمال الفحص
                      </h3>
                      <p className="text-sm text-slate-700 dark:text-slate-200 leading-relaxed">
                        {pipelineError}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-3 pt-1">
                    <button
                      type="button"
                      onClick={() => executeAuditPipeline(targetUrlBeingAnalyzed)}
                      className="px-5 py-2.5 rounded-xl bg-[#E63130] hover:bg-[#d12827] text-white text-sm font-bold inline-flex items-center gap-2 cursor-pointer min-h-[44px]"
                    >
                      <RefreshCw className="w-4 h-4" />
                      <span>إعادة المحاولة</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleResetToNewAudit}
                      className={`px-4 py-2.5 rounded-xl border text-sm font-semibold inline-flex items-center gap-2 cursor-pointer min-h-[44px] ${
                        isDark
                          ? 'border-white/15 text-slate-200 hover:bg-white/5'
                          : 'border-slate-300 text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      <span>تغيير الرابط</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ================= SCREEN 3: RESULTS ================= */}
        {screen === 'results' && report && (
          <div className="w-full space-y-6">
            {/* Print-only Header */}
            <div className="hidden print-only border-b border-slate-300 pb-4 mb-4">
              <div className="flex items-center justify-between">
                <BrandLogo isDark={false} className="h-10 w-auto" />
                <div className="text-left text-xs text-slate-600">
                  <div className="font-bold text-slate-900">
                    UP TO MEDIA — تقرير الفحص المجاني للموقع
                  </div>
                  <div className="western-nums">{report.analyzedAt}</div>
                </div>
              </div>
            </div>

            {/* Top Overall Verdict Banner */}
            <section
              className={`print-card rounded-3xl border p-6 sm:p-8 transition-all ${
                isDark
                  ? 'bg-[#0D1424]/95 border-white/10 shadow-[0_20px_50px_-15px_rgba(0,0,0,0.5)]'
                  : 'bg-white border-slate-200/90 shadow-lg'
              }`}
            >
              <div className="flex flex-col lg:flex-row items-center justify-between gap-6">
                {/* Site Info & One-line Verdict */}
                <div className="space-y-3 text-center lg:text-right flex-1">
                  <div className="flex flex-wrap items-center justify-center lg:justify-start gap-2 text-xs sm:text-sm text-slate-500 dark:text-slate-400">
                    <span
                      dir="ltr"
                      className="western-nums font-semibold text-[#12509B] dark:text-blue-400"
                    >
                      {report.url}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span className="western-nums">{report.analyzedAt}</span>
                    {(report.visitor.name || report.visitor.company) && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="font-medium text-slate-700 dark:text-slate-200">
                          إعداد خاص لـ:{' '}
                          {[report.visitor.name, report.visitor.company]
                            .filter(Boolean)
                            .join(' — ')}
                        </span>
                      </>
                    )}
                    {report.visitor.phone && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="western-nums">{report.visitor.phone}</span>
                      </>
                    )}
                  </div>

                  <h1
                    className="text-2xl sm:text-3xl font-bold leading-snug text-slate-900 dark:text-white print-text-dark"
                    style={{ textWrap: 'balance' }}
                  >
                    {report.ai.one_line_verdict}
                  </h1>

                  {/* Sub-scores quick summary line */}
                  <div className="pt-1 flex flex-wrap items-center justify-center lg:justify-start gap-4 text-xs sm:text-sm text-slate-600 dark:text-slate-300">
                    <span>
                      الأداء:{' '}
                      <strong className="western-nums font-bold">
                        {report.ai.performance.score}/100
                      </strong>
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>
                      الـSEO:{' '}
                      <strong className="western-nums font-bold">
                        {report.ai.seo.score}/100
                      </strong>
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>
                      تجربة المستخدم:{' '}
                      <strong className="western-nums font-bold">
                        {report.ai.ux.score}/100
                      </strong>
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>
                      إمكانية الوصول:{' '}
                      <strong className="western-nums font-bold">
                        {report.psi.scores.accessibility}/100
                      </strong>
                    </span>
                  </div>
                </div>

                {/* Big Circular Overall Score */}
                <div className="flex flex-col items-center gap-2 shrink-0">
                  <ScoreRing score={report.ai.overall_score} size="xl" />
                  <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                    التقييم العام للموقع
                  </span>
                </div>
              </div>
            </section>

            {/* 4 Cards in a 2x2 Grid (Stack on Mobile) */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* CARD 1: سرعة الأداء (Performance) */}
              <article
                className={`print-card rounded-3xl border p-6 sm:p-7 flex flex-col justify-between gap-6 ${
                  isDark
                    ? 'bg-[#0D1424]/90 border-white/10'
                    : 'bg-white border-slate-200/90 shadow-sm'
                }`}
              >
                <div className="space-y-5">
                  {/* Card Header */}
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3.5">
                      <div className="w-12 h-12 rounded-2xl bg-[#E63130]/15 text-[#E63130] flex items-center justify-center shrink-0">
                        <Gauge className="w-6 h-6" />
                      </div>
                      <div>
                        <h2 className="text-xl font-bold text-slate-900 dark:text-white print-text-dark">
                          1. سرعة الأداء
                        </h2>
                        <div className="text-xs font-semibold text-slate-500 dark:text-slate-400 mt-0.5">
                          الحالة:{' '}
                          <span
                            className={getScoreColorInfo(report.ai.performance.score).text}
                          >
                            {report.ai.performance.status}
                          </span>
                        </div>
                      </div>
                    </div>
                    <ScoreRing score={report.ai.performance.score} size="md" />
                  </div>

                  {/* 2-Sentence Summary */}
                  <p className="text-sm sm:text-base text-slate-700 dark:text-slate-200 leading-relaxed print-text-dark">
                    {report.ai.performance.summary}
                  </p>

                  {/* 4 Mini Metrics: LCP, CLS, TBT, حجم الصفحة */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                    {[
                      {
                        label: 'ظهور المحتوى (LCP)',
                        value: report.psi.metrics.lcp.displayValue,
                        dot: getMetricDotColor(
                          report.psi.metrics.lcp.score,
                          'largest-contentful-paint',
                          report.psi.metrics.lcp.numericValue
                        ),
                      },
                      {
                        label: 'استقرار الصفحة (CLS)',
                        value: report.psi.metrics.cls.displayValue,
                        dot: getMetricDotColor(
                          report.psi.metrics.cls.score,
                          'cumulative-layout-shift',
                          report.psi.metrics.cls.numericValue
                        ),
                      },
                      {
                        label: 'زمن التفاعل (TBT)',
                        value: report.psi.metrics.tbt.displayValue,
                        dot: getMetricDotColor(
                          report.psi.metrics.tbt.score,
                          'total-blocking-time',
                          report.psi.metrics.tbt.numericValue
                        ),
                      },
                      {
                        label: 'حجم الصفحة',
                        value: report.psi.metrics.totalByteWeight.displayValue,
                        dot: getMetricDotColor(
                          report.psi.metrics.totalByteWeight.score,
                          'total-byte-weight',
                          report.psi.metrics.totalByteWeight.numericValue
                        ),
                      },
                    ].map((m, i) => (
                      <div
                        key={i}
                        className={`p-3 rounded-2xl border flex flex-col justify-between gap-1.5 ${
                          isDark
                            ? 'bg-[#070B14]/70 border-white/5'
                            : 'bg-slate-50 border-slate-200/70'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-1">
                          <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                            {m.label}
                          </span>
                          <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${m.dot}`} />
                        </div>
                        <div className="western-nums text-sm sm:text-base font-bold text-slate-900 dark:text-white">
                          {m.value}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Top PSI Opportunities if present */}
                  {report.psi.opportunities.length > 0 && (
                    <div
                      className={`p-3.5 rounded-2xl border text-xs space-y-2 ${
                        isDark
                          ? 'bg-[#12509B]/10 border-[#12509B]/25'
                          : 'bg-blue-50/60 border-blue-200/70'
                      }`}
                    >
                      <div className="font-bold text-slate-800 dark:text-slate-200">
                        فرص تسريع التحميل المرصودة تقنياً:
                      </div>
                      <div className="space-y-1.5">
                        {report.psi.opportunities.map((opp, idx) => (
                          <div
                            key={idx}
                            className="flex items-center justify-between gap-2 text-slate-700 dark:text-slate-300"
                          >
                            <span className="truncate">{opp.title}</span>
                            {opp.displayValue && (
                              <span className="western-nums font-semibold text-[#E63130] dark:text-amber-400 shrink-0">
                                {opp.displayValue}
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Issues & Quick Wins */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4 border-t border-slate-200/70 dark:border-white/10">
                  <div className="space-y-2">
                    <h3 className="text-xs font-bold text-[#E63130] dark:text-[#FF6B6B] flex items-center gap-1.5">
                      <XCircle className="w-4 h-4 shrink-0" />
                      <span>أبرز المشاكل</span>
                    </h3>
                    <ul className="space-y-2 text-xs sm:text-sm text-slate-700 dark:text-slate-300">
                      {report.ai.performance.issues.slice(0, 3).map((issue, idx) => (
                        <li key={idx} className="leading-relaxed flex items-start gap-2">
                          <span className="text-[#E63130] font-bold">•</span>
                          <span>{issue}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="space-y-2">
                    <h3 className="text-xs font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4 shrink-0" />
                      <span>تحسينات سريعة</span>
                    </h3>
                    <ul className="space-y-2 text-xs sm:text-sm text-slate-700 dark:text-slate-300">
                      {report.ai.performance.quick_wins.slice(0, 3).map((win, idx) => (
                        <li key={idx} className="leading-relaxed flex items-start gap-2">
                          <span className="text-emerald-500 font-bold">✓</span>
                          <span>{win}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </article>

              {/* CARD 2: خريطة الانتباه المتوقعة (Predicted Attention Heatmap) */}
              <article
                className={`print-card rounded-3xl border p-6 sm:p-7 flex flex-col justify-between gap-6 ${
                  isDark
                    ? 'bg-[#0D1424]/90 border-white/10'
                    : 'bg-white border-slate-200/90 shadow-sm'
                }`}
              >
                <div className="space-y-5">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3.5">
                      <div className="w-12 h-12 rounded-2xl bg-[#12509B]/20 text-[#12509B] dark:text-blue-400 flex items-center justify-center shrink-0">
                        <Eye className="w-6 h-6" />
                      </div>
                      <div>
                        <h2 className="text-xl font-bold text-slate-900 dark:text-white print-text-dark">
                          2. خريطة الانتباه المتوقعة
                        </h2>
                        <div className="text-xs font-semibold text-slate-500 dark:text-slate-400 mt-0.5">
                          تحليل التسلسل البصري لأول شاشة على الجوال
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* 2-Sentence Summary */}
                  <p className="text-sm sm:text-base text-slate-700 dark:text-slate-200 leading-relaxed print-text-dark">
                    {report.ai.heatmap.summary}
                  </p>

                  {/* Interactive Heatmap Canvas Overlay */}
                  <HeatmapCanvas
                    screenshotDataUrl={report.psi.screenshotDataUrl}
                    zones={report.ai.heatmap.zones}
                    siteUrl={report.url}
                  />
                </div>

                {/* Issues & Quick Wins */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4 border-t border-slate-200/70 dark:border-white/10">
                  <div className="space-y-2">
                    <h3 className="text-xs font-bold text-[#E63130] dark:text-[#FF6B6B] flex items-center gap-1.5">
                      <XCircle className="w-4 h-4 shrink-0" />
                      <span>أبرز المشاكل</span>
                    </h3>
                    <ul className="space-y-2 text-xs sm:text-sm text-slate-700 dark:text-slate-300">
                      {report.ai.heatmap.issues.slice(0, 3).map((issue, idx) => (
                        <li key={idx} className="leading-relaxed flex items-start gap-2">
                          <span className="text-[#E63130] font-bold">•</span>
                          <span>{issue}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="space-y-2">
                    <h3 className="text-xs font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4 shrink-0" />
                      <span>تحسينات سريعة</span>
                    </h3>
                    <ul className="space-y-2 text-xs sm:text-sm text-slate-700 dark:text-slate-300">
                      {report.ai.heatmap.quick_wins.slice(0, 3).map((win, idx) => (
                        <li key={idx} className="leading-relaxed flex items-start gap-2">
                          <span className="text-emerald-500 font-bold">✓</span>
                          <span>{win}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </article>

              {/* CARD 3: تحسين محركات البحث (SEO) */}
              <article
                className={`print-card rounded-3xl border p-6 sm:p-7 flex flex-col justify-between gap-6 ${
                  isDark
                    ? 'bg-[#0D1424]/90 border-white/10'
                    : 'bg-white border-slate-200/90 shadow-sm'
                }`}
              >
                <div className="space-y-5">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3.5">
                      <div className="w-12 h-12 rounded-2xl bg-[#12509B]/20 text-[#12509B] dark:text-blue-400 flex items-center justify-center shrink-0">
                        <Search className="w-6 h-6" />
                      </div>
                      <div>
                        <h2 className="text-xl font-bold text-slate-900 dark:text-white print-text-dark">
                          3. تحسين محركات البحث (SEO)
                        </h2>
                        <div className="text-xs font-semibold text-slate-500 dark:text-slate-400 mt-0.5">
                          الحالة:{' '}
                          <span className={getScoreColorInfo(report.ai.seo.score).text}>
                            {report.ai.seo.status}
                          </span>
                        </div>
                      </div>
                    </div>
                    <ScoreRing score={report.ai.seo.score} size="md" />
                  </div>

                  {/* 2-Sentence Summary */}
                  <p className="text-sm sm:text-base text-slate-700 dark:text-slate-200 leading-relaxed print-text-dark">
                    {report.ai.seo.summary}
                  </p>

                  {/* Checklist of Passed ✓ / Failed ✗ items from PSI */}
                  <div className="space-y-2">
                    <div className="text-xs font-bold text-slate-500 dark:text-slate-400">
                      قائمة الفحص التقني لمحركات البحث:
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {report.psi.seoChecklist.slice(0, 8).map((item) => (
                        <div
                          key={item.id}
                          className={`px-3 py-2 rounded-xl border text-xs flex items-center justify-between gap-2 ${
                            item.passed
                              ? isDark
                                ? 'bg-emerald-500/5 border-emerald-500/20 text-slate-200'
                                : 'bg-emerald-50/60 border-emerald-200/70 text-slate-800'
                              : isDark
                              ? 'bg-[#E63130]/10 border-[#E63130]/30 text-slate-100'
                              : 'bg-red-50/70 border-red-200 text-slate-900'
                          }`}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span
                              className={`font-bold text-sm shrink-0 ${
                                item.passed ? 'text-emerald-500' : 'text-[#E63130]'
                              }`}
                            >
                              {item.passed ? '✓' : '✗'}
                            </span>
                            <span className="truncate font-medium">{item.title}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Issues & Quick Wins */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4 border-t border-slate-200/70 dark:border-white/10">
                  <div className="space-y-2">
                    <h3 className="text-xs font-bold text-[#E63130] dark:text-[#FF6B6B] flex items-center gap-1.5">
                      <XCircle className="w-4 h-4 shrink-0" />
                      <span>أبرز المشاكل</span>
                    </h3>
                    <ul className="space-y-2 text-xs sm:text-sm text-slate-700 dark:text-slate-300">
                      {report.ai.seo.issues.slice(0, 3).map((issue, idx) => (
                        <li key={idx} className="leading-relaxed flex items-start gap-2">
                          <span className="text-[#E63130] font-bold">•</span>
                          <span>{issue}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="space-y-2">
                    <h3 className="text-xs font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4 shrink-0" />
                      <span>تحسينات سريعة</span>
                    </h3>
                    <ul className="space-y-2 text-xs sm:text-sm text-slate-700 dark:text-slate-300">
                      {report.ai.seo.quick_wins.slice(0, 3).map((win, idx) => (
                        <li key={idx} className="leading-relaxed flex items-start gap-2">
                          <span className="text-emerald-500 font-bold">✓</span>
                          <span>{win}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </article>

              {/* CARD 4: تجربة المستخدم (UX) */}
              <article
                className={`print-card rounded-3xl border p-6 sm:p-7 flex flex-col justify-between gap-6 ${
                  isDark
                    ? 'bg-[#0D1424]/90 border-white/10'
                    : 'bg-white border-slate-200/90 shadow-sm'
                }`}
              >
                <div className="space-y-5">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3.5">
                      <div className="w-12 h-12 rounded-2xl bg-[#E63130]/15 text-[#E63130] flex items-center justify-center shrink-0">
                        <Smartphone className="w-6 h-6" />
                      </div>
                      <div>
                        <h2 className="text-xl font-bold text-slate-900 dark:text-white print-text-dark">
                          4. تجربة المستخدم (UX)
                        </h2>
                        <div className="text-xs font-semibold text-slate-500 dark:text-slate-400 mt-0.5">
                          الحالة:{' '}
                          <span className={getScoreColorInfo(report.ai.ux.score).text}>
                            {report.ai.ux.status}
                          </span>
                        </div>
                      </div>
                    </div>
                    <ScoreRing score={report.ai.ux.score} size="md" />
                  </div>

                  {/* 2-Sentence Summary */}
                  <p className="text-sm sm:text-base text-slate-700 dark:text-slate-200 leading-relaxed print-text-dark">
                    {report.ai.ux.summary}
                  </p>

                  {/* UX & Accessibility Indicators */}
                  <div className="grid grid-cols-2 gap-3">
                    <div
                      className={`p-3.5 rounded-2xl border ${
                        isDark
                          ? 'bg-[#070B14]/70 border-white/5'
                          : 'bg-slate-50 border-slate-200/70'
                      }`}
                    >
                      <div className="text-xs text-slate-500 dark:text-slate-400 mb-1">
                        سهولة الوصول والقراءة
                      </div>
                      <div className="western-nums text-lg font-bold text-slate-900 dark:text-white">
                        {report.psi.scores.accessibility}/100
                      </div>
                    </div>
                    <div
                      className={`p-3.5 rounded-2xl border ${
                        isDark
                          ? 'bg-[#070B14]/70 border-white/5'
                          : 'bg-slate-50 border-slate-200/70'
                      }`}
                    >
                      <div className="text-xs text-slate-500 dark:text-slate-400 mb-1">
                        أفضل الممارسات التقنية
                      </div>
                      <div className="western-nums text-lg font-bold text-slate-900 dark:text-white">
                        {report.psi.scores.bestPractices}/100
                      </div>
                    </div>
                  </div>
                </div>

                {/* Issues & Quick Wins */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4 border-t border-slate-200/70 dark:border-white/10">
                  <div className="space-y-2">
                    <h3 className="text-xs font-bold text-[#E63130] dark:text-[#FF6B6B] flex items-center gap-1.5">
                      <XCircle className="w-4 h-4 shrink-0" />
                      <span>أبرز المشاكل</span>
                    </h3>
                    <ul className="space-y-2 text-xs sm:text-sm text-slate-700 dark:text-slate-300">
                      {report.ai.ux.issues.slice(0, 3).map((issue, idx) => (
                        <li key={idx} className="leading-relaxed flex items-start gap-2">
                          <span className="text-[#E63130] font-bold">•</span>
                          <span>{issue}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="space-y-2">
                    <h3 className="text-xs font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4 shrink-0" />
                      <span>تحسينات سريعة</span>
                    </h3>
                    <ul className="space-y-2 text-xs sm:text-sm text-slate-700 dark:text-slate-300">
                      {report.ai.ux.quick_wins.slice(0, 3).map((win, idx) => (
                        <li key={idx} className="leading-relaxed flex items-start gap-2">
                          <span className="text-emerald-500 font-bold">✓</span>
                          <span>{win}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </article>
            </div>

            {/* Bottom CTA Band in Brand Colors (#12509B & #E63130) */}
            <section
              className="rounded-3xl p-6 sm:p-10 text-white relative overflow-hidden shadow-xl print-card"
              style={{
                background:
                  'linear-gradient(135deg, #12509B 0%, #0D3568 55%, #E63130 100%)',
              }}
            >
              <div className="relative z-10 flex flex-col lg:flex-row items-center justify-between gap-6">
                <div className="space-y-2 text-center lg:text-right">
                  <h2 className="text-2xl sm:text-3xl font-bold print-text-dark">
                    تريد رفع هذه الأرقام؟ فريق UP TO MEDIA جاهز
                  </h2>
                  <p className="text-sm sm:text-base text-blue-100 print-text-muted max-w-xl">
                    نحول موقعك إلى منصة سريعة، متصدرة في نتائج البحث، ومصممة لتحويل الزوار إلى عملاء فعليين.
                  </p>
                </div>

                <div className="flex flex-wrap items-center justify-center gap-3.5 shrink-0 print-hidden">
                  <a
                    href={getWhatsAppConsultationUrl()}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-6 py-3.5 rounded-2xl bg-emerald-500 hover:bg-emerald-600 text-white font-bold text-sm sm:text-base inline-flex items-center gap-2.5 shadow-lg transition-colors whitespace-nowrap min-h-[52px]"
                  >
                    <MessageCircle className="w-5 h-5" />
                    <span>احجز استشارة عبر واتساب</span>
                  </a>

                  <button
                    type="button"
                    onClick={() => window.print()}
                    className="px-5 py-3.5 rounded-2xl bg-white text-slate-900 hover:bg-slate-100 font-bold text-sm sm:text-base inline-flex items-center gap-2 shadow-md transition-colors cursor-pointer whitespace-nowrap min-h-[52px]"
                  >
                    <Printer className="w-5 h-5 text-[#12509B]" />
                    <span>اطبع / حفظ PDF</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleResetToNewAudit}
                    className="px-5 py-3.5 rounded-2xl bg-slate-950/40 hover:bg-slate-950/60 border border-white/25 text-white font-semibold text-sm sm:text-base inline-flex items-center gap-2 transition-colors cursor-pointer whitespace-nowrap min-h-[52px]"
                  >
                    <RotateCcw className="w-4 h-4" />
                    <span>فحص موقع جديد</span>
                  </button>
                </div>
              </div>
            </section>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer
        className={`relative z-10 border-t py-6 px-4 sm:px-6 text-xs sm:text-sm transition-colors ${
          isDark
            ? 'bg-[#050810] border-white/10 text-slate-400'
            : 'bg-white border-slate-200/80 text-slate-600'
        }`}
      >
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-center sm:text-right">
          <div className="font-semibold text-slate-800 dark:text-slate-200 print-text-dark">
            UP TO MEDIA — وكالة الاستهداف العربية للإنتاج الفني وخدمات التسويق
          </div>

          <div className="flex flex-wrap items-center justify-center gap-4">
            <a
              href="https://wa.me/962791214158"
              target="_blank"
              rel="noopener noreferrer"
              dir="ltr"
              className="western-nums font-semibold hover:text-[#E63130] transition-colors"
            >
              WhatsApp: +962 79 121 4158
            </a>
            <span aria-hidden="true">·</span>
            <a
              href="https://up2media.net"
              target="_blank"
              rel="noopener noreferrer"
              className="western-nums font-semibold text-[#12509B] dark:text-blue-400 hover:underline"
            >
              up2media.net
            </a>
          </div>
        </div>
      </footer>

      {/* Optional Settings Modal for PSI_API_KEY */}
      {isSettingsOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4 print-hidden">
          <div
            className={`w-full max-w-md rounded-3xl border p-6 space-y-4 shadow-2xl ${
              isDark
                ? 'bg-[#0D1424] border-white/15 text-white'
                : 'bg-white border-slate-200 text-slate-900'
            }`}
          >
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold">إعدادات الفحص المتقدمة (اختياري)</h3>
              <button
                type="button"
                onClick={() => setIsSettingsOpen(false)}
                className="p-2 rounded-xl hover:bg-slate-200/50 dark:hover:bg-white/10 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div
              className={`p-3.5 rounded-2xl text-xs leading-relaxed border ${
                isDark
                  ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-300'
                  : 'bg-emerald-50 border-emerald-200 text-emerald-900'
              }`}
            >
              النظام مُعدّ ومجهز بالكامل ليعمل تلقائياً بدون الحاجة لإدخال أي مفتاح! هذا الحقل اختياري فقط في حال أردت استخدام مفتاح Google PageSpeed API مخصص.
            </div>

            <form onSubmit={handleSavePsiKey} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold mb-1.5 text-slate-500 dark:text-slate-400">
                  مفتاح Google PageSpeed API (اختياري)
                </label>
                <input
                  type="password"
                  dir="ltr"
                  value={psiKeyInput}
                  onChange={(e) => setPsiKeyInput(e.target.value)}
                  placeholder="AIzaSy... (اتركه فارغاً للتشغيل التلقائي)"
                  className={`w-full px-3.5 py-2.5 rounded-xl text-sm western-nums border focus:outline-none min-h-[44px] ${
                    isDark
                      ? 'bg-[#070B14] border-white/15 text-white'
                      : 'bg-slate-50 border-slate-300 text-slate-900'
                  }`}
                />
              </div>

              <div className="flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => {
                    setPsiKeyInput('');
                    setStoredPsiApiKey('');
                  }}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-500 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
                >
                  استخدام الوضع التلقائي
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-xl text-xs font-bold bg-[#12509B] hover:bg-blue-700 text-white cursor-pointer min-h-[40px]"
                >
                  {psiKeySavedToast ? '✓ تم الحفظ' : 'حفظ الإعدادات'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
