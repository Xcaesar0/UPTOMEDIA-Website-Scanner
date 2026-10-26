import React from 'react';
import { AuditStatus } from '../types/audit';

interface ScoreRingProps {
  score: number;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  status?: AuditStatus;
  showStatusLabel?: boolean;
}

export function getScoreColorInfo(score: number) {
  if (score >= 90) {
    return {
      stroke: '#16A34A', // emerald-600 / green
      text: 'text-emerald-500 dark:text-emerald-400',
      bgTint: 'bg-emerald-500/10 border-emerald-500/25',
      dot: 'bg-emerald-500',
      label: 'ممتاز' as AuditStatus,
    };
  }
  if (score >= 50) {
    return {
      stroke: '#F59E0B', // amber-500
      text: 'text-amber-500 dark:text-amber-400',
      bgTint: 'bg-amber-500/10 border-amber-500/25',
      dot: 'bg-amber-500',
      label: (score >= 75 ? 'جيد' : 'يحتاج تحسين') as AuditStatus,
    };
  }
  return {
    stroke: '#E63130', // brand red
    text: 'text-[#E63130] dark:text-[#FF5252]',
    bgTint: 'bg-[#E63130]/10 border-[#E63130]/25',
    dot: 'bg-[#E63130]',
    label: 'ضعيف' as AuditStatus,
  };
}

export const ScoreRing: React.FC<ScoreRingProps> = ({
  score,
  size = 'md',
}) => {
  const clampedScore = Math.max(0, Math.min(100, Math.round(score || 0)));
  const colorInfo = getScoreColorInfo(clampedScore);

  const dimensions = {
    sm: { box: 56, radius: 22, strokeWidth: 4.5, fontSize: 'text-base' },
    md: { box: 76, radius: 31, strokeWidth: 5.5, fontSize: 'text-xl' },
    lg: { box: 112, radius: 46, strokeWidth: 7, fontSize: 'text-3xl' },
    xl: { box: 148, radius: 60, strokeWidth: 9, fontSize: 'text-4xl' },
  }[size];

  const circumference = 2 * Math.PI * dimensions.radius;
  const dashOffset = circumference - (clampedScore / 100) * circumference;
  const center = dimensions.box / 2;

  return (
    <div
      className="relative inline-flex items-center justify-center shrink-0 select-none"
      style={{ width: dimensions.box, height: dimensions.box }}
    >
      <svg
        width={dimensions.box}
        height={dimensions.box}
        viewBox={`0 0 ${dimensions.box} ${dimensions.box}`}
        className="-rotate-90 transform"
      >
        <circle
          cx={center}
          cy={center}
          r={dimensions.radius}
          fill="transparent"
          stroke="currentColor"
          strokeWidth={dimensions.strokeWidth}
          className="text-slate-200 dark:text-slate-800/90"
        />
        <circle
          cx={center}
          cy={center}
          r={dimensions.radius}
          fill="transparent"
          stroke={colorInfo.stroke}
          strokeWidth={dimensions.strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          strokeLinecap="round"
          className="transition-all duration-700 ease-out"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span
          className={`western-nums font-bold tracking-tight ${dimensions.fontSize} ${colorInfo.text}`}
        >
          {clampedScore}
        </span>
      </div>
    </div>
  );
};
