import type { TrekDifficulty } from '../types/trail';

export const DIFFICULTY_LEVELS: readonly TrekDifficulty[] = [
  'Easy',
  'Moderate',
  'Challenging',
  'Extreme',
] as const;

export interface DifficultyConfig {
  label: TrekDifficulty;
  shortHint: string;
  badgeClass: string;
  dotClass: string;
  activeButtonClass: string;
  textClass: string;
}

export const DIFFICULTY_CONFIG: Record<TrekDifficulty, DifficultyConfig> = {
  Easy: {
    label: 'Easy',
    shortHint: 'Gentle pace & paths',
    badgeClass: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    dotClass: 'bg-emerald-500',
    activeButtonClass: 'bg-emerald-50 text-emerald-900 border-emerald-500 ring-1 ring-emerald-500/20',
    textClass: 'text-emerald-700',
  },
  Moderate: {
    label: 'Moderate',
    shortHint: 'Steady elevation & distance',
    badgeClass: 'bg-indigo-50 text-indigo-800 border-indigo-200',
    dotClass: 'bg-indigo-600',
    activeButtonClass: 'bg-[#EEF2FF] text-[#3730A3] border-[#4F46E5] ring-1 ring-[#4F46E5]/20',
    textClass: 'text-[#4F46E5]',
  },
  Challenging: {
    label: 'Challenging',
    shortHint: 'Steep, long, or rugged terrain',
    badgeClass: 'bg-amber-50 text-amber-900 border-amber-300',
    dotClass: 'bg-amber-500',
    activeButtonClass: 'bg-amber-50 text-amber-900 border-amber-500 ring-1 ring-amber-500/20',
    textClass: 'text-amber-700',
  },
  Extreme: {
    label: 'Extreme',
    shortHint: 'High altitude or technical exposure',
    badgeClass: 'bg-rose-50 text-rose-800 border-rose-200',
    dotClass: 'bg-rose-600',
    activeButtonClass: 'bg-rose-50 text-rose-900 border-rose-500 ring-1 ring-rose-500/20',
    textClass: 'text-rose-700',
  },
};

export function normalizeDifficulty(value: string | undefined | null): TrekDifficulty {
  if (value === 'Easy' || value === 'Moderate' || value === 'Challenging' || value === 'Extreme') {
    return value;
  }
  if (value === 'Alpine') {
    return 'Extreme';
  }
  return 'Moderate';
}
