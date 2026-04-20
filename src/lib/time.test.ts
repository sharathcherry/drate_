import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { formatTimeAgo } from './time';

describe('formatTimeAgo', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T12:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns "Just now" for very recent timestamps', () => {
    const value = new Date('2026-01-01T11:59:40.000Z');
    expect(formatTimeAgo(value)).toBe('Just now');
  });

  it('returns minute format', () => {
    const value = new Date('2026-01-01T11:50:00.000Z');
    expect(formatTimeAgo(value)).toBe('10m ago');
  });

  it('returns day format', () => {
    const value = new Date('2025-12-30T12:00:00.000Z');
    expect(formatTimeAgo(value)).toBe('2d ago');
  });

  it('supports Firestore-style toDate objects', () => {
    const tsLike = { toDate: () => new Date('2026-01-01T11:00:00.000Z') };
    expect(formatTimeAgo(tsLike)).toBe('1h ago');
  });
});
