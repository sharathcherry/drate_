import { describe, expect, it } from 'vitest';
import {
  applyRatingToProfileStats,
  createEmptyRatingBreakdown,
  isValidRatingScore,
  normalizeRatingBreakdown,
} from './ratingStats';

describe('ratingStats', () => {
  it('creates empty breakdown with all score keys', () => {
    expect(createEmptyRatingBreakdown()).toEqual({
      '1': 0,
      '2': 0,
      '3': 0,
      '4': 0,
      '5': 0,
    });
  });

  it('normalizes missing and invalid breakdown values', () => {
    expect(normalizeRatingBreakdown({ '1': 2, '3': Number.NaN })).toEqual({
      '1': 2,
      '2': 0,
      '3': 0,
      '4': 0,
      '5': 0,
    });
  });

  it('applies score updates to totals, average and breakdown', () => {
    const next = applyRatingToProfileStats(
      {
        averageRating: 4,
        totalRatings: 2,
        ratingBreakdown: { '1': 0, '2': 0, '3': 0, '4': 2, '5': 0 },
      },
      5,
    );

    expect(next.totalRatings).toBe(3);
    expect(next.averageRating).toBe(4.33);
    expect(next.ratingBreakdown).toEqual({ '1': 0, '2': 0, '3': 0, '4': 2, '5': 1 });
  });

  it('validates rating score bounds', () => {
    expect(isValidRatingScore(1)).toBe(true);
    expect(isValidRatingScore(5)).toBe(true);
    expect(isValidRatingScore(0)).toBe(false);
    expect(isValidRatingScore(6)).toBe(false);
  });
});
