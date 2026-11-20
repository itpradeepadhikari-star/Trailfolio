import { DIFFICULTY_CONFIG, normalizeDifficulty } from '../lib/difficulty';

interface DifficultyBadgeProps {
  difficulty: string | undefined | null;
  size?: 'sm' | 'md';
  showPrefix?: boolean;
  className?: string;
}

export function DifficultyBadge({
  difficulty,
  size = 'sm',
  showPrefix = false,
  className = '',
}: DifficultyBadgeProps) {
  const normalized = normalizeDifficulty(difficulty);
  const cfg = DIFFICULTY_CONFIG[normalized];

  const sizeClasses =
    size === 'md'
      ? 'px-3 py-1.5 text-xs font-semibold rounded-lg gap-2'
      : 'px-2.5 py-1 text-[11px] font-semibold rounded-md gap-1.5';

  return (
    <span
      className={`inline-flex items-center border tracking-wide uppercase whitespace-nowrap shrink-0 ${sizeClasses} ${cfg.badgeClass} ${className}`}
    >
      <span className={`w-1.5 h-1.5 rounded-xs shrink-0 ${cfg.dotClass}`} aria-hidden="true" />
      <span>{showPrefix ? `Difficulty: ${cfg.label}` : cfg.label}</span>
    </span>
  );
}
