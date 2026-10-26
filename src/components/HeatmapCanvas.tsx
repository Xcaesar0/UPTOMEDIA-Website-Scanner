import React, { useEffect, useRef, useState } from 'react';
import { Eye, EyeOff, MapPin } from 'lucide-react';
import { HeatmapZone } from '../types/audit';

interface HeatmapCanvasProps {
  screenshotDataUrl: string | null;
  zones: HeatmapZone[];
  siteUrl: string;
}

/**
 * Converts a normalized intensity value (0..255) into a thermal RGB color
 * following the classic eye-tracking spectrum: Blue (#12509B) -> Cyan -> Green -> Yellow -> Red (#E63130)
 */
function thermalColorMap(alphaByte: number): [number, number, number, number] {
  if (alphaByte < 12) return [0, 0, 0, 0];

  const t = Math.min(1, Math.max(0, (alphaByte - 12) / 243));
  let r = 0;
  let g = 0;
  let b = 0;

  if (t < 0.25) {
    // Deep Blue (18, 80, 155) to Cyan (0, 190, 240)
    const local = t / 0.25;
    r = Math.round(18 * (1 - local));
    g = Math.round(80 + local * (190 - 80));
    b = Math.round(155 + local * (240 - 155));
  } else if (t < 0.5) {
    // Cyan (0, 190, 240) to Emerald Green (34, 215, 95)
    const local = (t - 0.25) / 0.25;
    r = Math.round(local * 34);
    g = Math.round(190 + local * (215 - 190));
    b = Math.round(240 * (1 - local) + 95 * local);
  } else if (t < 0.75) {
    // Green (34, 215, 95) to Warm Yellow (250, 204, 21)
    const local = (t - 0.5) / 0.25;
    r = Math.round(34 + local * (250 - 34));
    g = Math.round(215 + local * (204 - 215));
    b = Math.round(95 * (1 - local) + 21 * local);
  } else {
    // Warm Yellow (250, 204, 21) to Brand Vivid Red (230, 49, 48)
    const local = (t - 0.75) / 0.25;
    r = Math.round(250 + local * (230 - 250));
    g = Math.round(204 * (1 - local) + 49 * local);
    b = Math.round(21 + local * (48 - 21));
  }

  // Smooth opacity curve: 0.20 at fringes up to 0.78 at hotspot peaks
  const outAlpha = Math.round((0.2 + Math.pow(t, 0.85) * 0.58) * 255);
  return [r, g, b, outAlpha];
}

export const HeatmapCanvas: React.FC<HeatmapCanvasProps> = ({
  screenshotDataUrl,
  zones,
  siteUrl,
}) => {
  const [showOverlay, setShowOverlay] = useState(true);
  const [showLabels, setShowLabels] = useState(true);
  const [activeZoneIdx, setActiveZoneIdx] = useState<number | null>(null);
  const [imgDimensions, setImgDimensions] = useState<{ w: number; h: number }>({
    w: 390,
    h: 720,
  });

  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (!screenshotDataUrl) return;
    const img = new Image();
    img.onload = () => {
      if (img.naturalWidth > 0 && img.naturalHeight > 0) {
        setImgDimensions({
          w: img.naturalWidth,
          h: img.naturalHeight,
        });
      }
    };
    img.src = screenshotDataUrl;
  }, [screenshotDataUrl]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = imgDimensions.w || 390;
    const height = imgDimensions.h || 720;
    canvas.width = width;
    canvas.height = height;

    ctx.clearRect(0, 0, width, height);
    if (!showOverlay || !zones || zones.length === 0) return;

    // Offscreen canvas to accumulate radial intensity gradients
    const offscreen = document.createElement('canvas');
    offscreen.width = width;
    offscreen.height = height;
    const offCtx = offscreen.getContext('2d');
    if (!offCtx) return;

    zones.forEach((zone, index) => {
      const zx = Math.max(0, Math.min(0.92, Number(zone.x) || 0.15));
      const zy = Math.max(0, Math.min(0.92, Number(zone.y) || 0.15));
      const zw = Math.max(0.12, Math.min(0.85, Number(zone.w) || 0.35));
      const zh = Math.max(0.08, Math.min(0.5, Number(zone.h) || 0.18));

      const cx = Math.min(width * 0.9, Math.max(width * 0.1, (zx + zw / 2) * width));
      const cy = Math.min(height * 0.92, Math.max(height * 0.08, (zy + zh / 2) * height));

      const rx = Math.max(width * 0.16, (zw * width) * 0.65);
      const ry = Math.max(height * 0.09, (zh * height) * 0.65);

      const isHighlighted = activeZoneIdx === index;
      const baseIntensity = Math.max(
        0.38,
        Math.min(1, Number(zone.intensity) || 0.75)
      );
      const effectiveIntensity = isHighlighted
        ? Math.min(1, baseIntensity + 0.2)
        : baseIntensity;

      offCtx.save();
      offCtx.translate(cx, cy);
      offCtx.scale(1, ry / rx);

      const grad = offCtx.createRadialGradient(0, 0, rx * 0.08, 0, 0, rx);
      grad.addColorStop(0, `rgba(0, 0, 0, ${effectiveIntensity})`);
      grad.addColorStop(0.45, `rgba(0, 0, 0, ${effectiveIntensity * 0.65})`);
      grad.addColorStop(0.78, `rgba(0, 0, 0, ${effectiveIntensity * 0.25})`);
      grad.addColorStop(1, 'rgba(0, 0, 0, 0)');

      offCtx.fillStyle = grad;
      offCtx.beginPath();
      offCtx.arc(0, 0, rx, 0, Math.PI * 2);
      offCtx.fill();
      offCtx.restore();
    });

    // Colorize accumulated alpha map
    const imgData = offCtx.getImageData(0, 0, width, height);
    const data = imgData.data;
    for (let i = 0; i < data.length; i += 4) {
      const alpha = data[i + 3];
      if (alpha > 12) {
        const [r, g, b, a] = thermalColorMap(alpha);
        data[i] = r;
        data[i + 1] = g;
        data[i + 2] = b;
        data[i + 3] = a;
      } else {
        data[i + 3] = 0;
      }
    }
    ctx.putImageData(imgData, 0, 0);
  }, [zones, showOverlay, activeZoneIdx, imgDimensions]);

  return (
    <div className="flex flex-col gap-3">
      {/* Controls bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 print-hidden">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowOverlay((v) => !v)}
            className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0 min-h-[40px] ${
              showOverlay
                ? 'bg-[#E63130] text-white shadow-sm'
                : 'bg-slate-200/80 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-300 dark:hover:bg-slate-700'
            }`}
          >
            {showOverlay ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            <span>{showOverlay ? 'إخفاء الخريطة الحرارية' : 'إظهار الخريطة الحرارية'}</span>
          </button>

          {showOverlay && (
            <button
              type="button"
              onClick={() => setShowLabels((v) => !v)}
              className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0 min-h-[40px] ${
                showLabels
                  ? 'bg-[#12509B]/15 text-[#12509B] dark:bg-[#12509B]/30 dark:text-blue-300 border border-[#12509B]/30'
                  : 'bg-slate-100 dark:bg-slate-800/60 text-slate-600 dark:text-slate-400'
              }`}
            >
              <MapPin className="w-3.5 h-3.5" />
              <span>أرقام النقاط</span>
            </button>
          )}
        </div>

        {/* Thermal Scale Legend */}
        <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
          <span>تركيز منخفض</span>
          <div
            className="h-2.5 w-20 rounded-full"
            style={{
              background:
                'linear-gradient(to left, #E63130 0%, #FACC15 38%, #22C55E 68%, #12509B 100%)',
            }}
          />
          <span>تركيز عالٍ</span>
        </div>
      </div>

      {/* Main Mobile Screen + Heatmap Canvas Container */}
      <div className="grid grid-cols-1 sm:grid-cols-12 gap-4 items-start">
        <div className="sm:col-span-6 flex justify-center">
          <div className="relative w-full max-w-[270px] rounded-[24px] border-4 border-slate-800 dark:border-slate-700 bg-slate-900 shadow-lg overflow-hidden">
            {/* Mobile top notch bar */}
            <div className="bg-slate-900 text-slate-300 px-3 py-1.5 flex items-center justify-between text-[10px] border-b border-slate-800">
              <span className="western-nums truncate max-w-[180px] opacity-75">
                {siteUrl.replace(/^https?:\/\//, '')}
              </span>
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
            </div>

            {/* Viewport area */}
            <div className="relative w-full aspect-[9/16] bg-slate-950 overflow-hidden">
              {screenshotDataUrl ? (
                <img
                  src={screenshotDataUrl}
                  alt="لقطة شاشة الموقع على الجوال"
                  className="w-full h-full object-cover object-top select-none"
                />
              ) : (
                /* Structured fallback mobile preview if target site blocked headless screenshot */
                <div className="w-full h-full flex flex-col justify-between p-4 bg-gradient-to-b from-slate-900 via-slate-900 to-slate-950 text-slate-300">
                  <div className="space-y-3">
                    <div className="h-4 w-24 bg-slate-700/70 rounded" />
                    <div className="h-24 w-full bg-slate-800/90 rounded-xl border border-slate-700/60 flex items-center justify-center text-xs text-slate-400 text-center px-3">
                      معاينة هيكل شاشة الجوال للموقع
                    </div>
                    <div className="h-5 w-4/5 bg-slate-700/80 rounded" />
                    <div className="h-3.5 w-3/5 bg-slate-800 rounded" />
                    <div className="h-10 w-36 bg-[#E63130]/40 border border-[#E63130]/60 rounded-lg" />
                  </div>
                  <div className="grid grid-cols-2 gap-2 pt-4">
                    <div className="h-20 bg-slate-800/70 rounded-lg" />
                    <div className="h-20 bg-slate-800/70 rounded-lg" />
                  </div>
                </div>
              )}

              {/* Thermal Radial Gradient Canvas Overlay */}
              <canvas
                ref={canvasRef}
                className={`absolute inset-0 w-full h-full pointer-events-none transition-opacity duration-300 ${
                  showOverlay ? 'opacity-100' : 'opacity-0'
                }`}
              />

              {/* Numbered hotspot badges */}
              {showOverlay &&
                showLabels &&
                zones.map((z, idx) => {
                  const cxPct = Math.min(
                    90,
                    Math.max(10, ((Number(z.x) || 0.15) + (Number(z.w) || 0.3) / 2) * 100)
                  );
                  const cyPct = Math.min(
                    90,
                    Math.max(8, ((Number(z.y) || 0.15) + (Number(z.h) || 0.15) / 2) * 100)
                  );
                  const isCurrent = activeZoneIdx === idx;
                  return (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setActiveZoneIdx(isCurrent ? null : idx)}
                      style={{ left: `${cxPct}%`, top: `${cyPct}%` }}
                      title={z.label}
                      className={` -translate-x-1/2 -translate-y-1/2 absolute w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold western-nums transition-transform cursor-pointer shadow-md border ${
                        isCurrent
                          ? 'bg-[#E63130] text-white border-white scale-125 z-20'
                          : 'bg-slate-950/85 text-white border-white/80 hover:scale-110 z-10'
                      }`}
                    >
                      {idx + 1}
                    </button>
                  );
                })}
            </div>
          </div>
        </div>

        {/* Zones Interactive List */}
        <div className="sm:col-span-6 flex flex-col justify-between gap-2.5">
          <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">
            مناطق جذب الانتباه المتوقعة (اضغط للتمييز):
          </div>
          <div className="space-y-2">
            {zones.slice(0, 5).map((zone, idx) => {
              const pct = Math.round(
                Math.max(0.35, Math.min(1, Number(zone.intensity) || 0.75)) * 100
              );
              const isSelected = activeZoneIdx === idx;
              return (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setActiveZoneIdx(isSelected ? null : idx)}
                  className={`w-full text-right p-2.5 rounded-xl border transition-colors flex items-center justify-between gap-2 cursor-pointer ${
                    isSelected
                      ? 'bg-[#E63130]/10 border-[#E63130]/50 dark:bg-[#E63130]/15'
                      : 'bg-slate-50/80 dark:bg-slate-800/40 border-slate-200/70 dark:border-white/5 hover:border-slate-300 dark:hover:border-white/15'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span
                      className={`w-5 h-5 rounded-full text-[11px] font-bold western-nums flex items-center justify-center shrink-0 ${
                        pct >= 80
                          ? 'bg-[#E63130] text-white'
                          : pct >= 60
                          ? 'bg-amber-500 text-slate-950'
                          : 'bg-[#12509B] text-white'
                      }`}
                    >
                      {idx + 1}
                    </span>
                    <span className="text-xs font-medium text-slate-800 dark:text-slate-200 truncate">
                      {zone.label}
                    </span>
                  </div>
                  <span className="western-nums text-xs font-semibold text-slate-500 dark:text-slate-400 shrink-0">
                    {pct}%
                  </span>
                </button>
              );
            })}
          </div>

          <p className="text-[11px] leading-relaxed text-slate-500 dark:text-slate-400 pt-1 border-t border-slate-200/60 dark:border-white/10">
            خريطة متوقعة بالذكاء الاصطناعي — الخريطة الفعلية تحتاج تتبع سلوك الزوار
          </p>
        </div>
      </div>
    </div>
  );
};
