import type { RatingBreakdown, RatingScore } from './types';

const SCORE_VALUES: RatingScore[] = [1, 2, 3, 4, 5];

export function isValidRatingScore(value: number): value is RatingScore {
  return SCORE_VALUES.includes(value as RatingScore);
}

export function createEmptyRatingBreakdown(): RatingBreakdown {
  return { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 };
}

export function normalizeRatingBreakdown(input?: Partial<RatingBreakdown> | null): RatingBreakdown {
  const normalized = createEmptyRatingBreakdown();
  if (!input) return normalized;

  for (const score of SCORE_VALUES) {
    const key = String(score) as keyof RatingBreakdown;
    const value = input[key];
    normalized[key] = typeof value === 'number' && Number.isFinite(value) ? value : 0;
  }

  return normalized;
}

export function applyRatingToProfileStats(
  current: {
    averageRating: number;
    totalRatings: number;
    ratingBreakdown?: Partial<RatingBreakdown> | null;
  },
  score: RatingScore,
) {
  const currentTotal = Number.isFinite(current.totalRatings) ? current.totalRatings : 0;
  const currentAverage = Number.isFinite(current.averageRating) ? current.averageRating : 0;
  const newTotal = currentTotal + 1;
  const newAverage = Number(((currentAverage * currentTotal + score) / newTotal).toFixed(2));

  const nextBreakdown = normalizeRatingBreakdown(current.ratingBreakdown);
  const scoreKey = String(score) as keyof RatingBreakdown;
  nextBreakdown[scoreKey] += 1;

  return {
    averageRating: newAverage,
    totalRatings: newTotal,
    ratingBreakdown: nextBreakdown,
  };
}
