import { describe, it, expect } from 'vitest';
import { cn } from './utils';

describe('utils', () => {
  describe('cn()', () => {
    it('should merge tailwind classes correctly', () => {
      const result = cn('bg-red-500', 'bg-blue-500');
      // tailwind-merge resolves conflicts to the latter class
      expect(result).toBe('bg-blue-500');
    });

    it('should handle conditional classes via clsx', () => {
      const isActive = true;
      const isHidden = false;
      const result = cn('p-4', { 'opacity-100': isActive, 'opacity-0': isHidden });
      expect(result).toBe('p-4 opacity-100');
    });

    it('should handle arrays of classes', () => {
      const result = cn(['p-4', 'm-4'], ['flex', 'items-center']);
      expect(result).toBe('p-4 m-4 flex items-center');
    });
  });
});
