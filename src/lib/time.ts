import type { TimestampLike } from './types';

export function toUnixMs(timestamp: TimestampLike): number {
  if (!timestamp) return 0;
  if (typeof (timestamp as { toMillis?: () => number }).toMillis === 'function') {
    return (timestamp as { toMillis: () => number }).toMillis();
  }

  const date =
    typeof (timestamp as { toDate?: () => Date }).toDate === 'function'
      ? (timestamp as { toDate: () => Date }).toDate()
      : new Date(timestamp as string | number | Date);

  return date.getTime();
}

export function formatTimeAgo(timestamp: TimestampLike): string {
  if (!timestamp) return '';

  const now = new Date();
  const diffInSeconds = Math.floor((now.getTime() - toUnixMs(timestamp)) / 1000);

  if (diffInSeconds < 60) return 'Just now';
  const diffInMinutes = Math.floor(diffInSeconds / 60);
  if (diffInMinutes < 60) return `${diffInMinutes}m ago`;
  const diffInHours = Math.floor(diffInMinutes / 60);
  if (diffInHours < 24) return `${diffInHours}h ago`;
  const diffInDays = Math.floor(diffInHours / 24);
  if (diffInDays < 30) return `${diffInDays}d ago`;
  const diffInMonths = Math.floor(diffInDays / 30);
  if (diffInMonths < 12) return `${diffInMonths}mo ago`;

  return `${Math.floor(diffInMonths / 12)}y ago`;
}
