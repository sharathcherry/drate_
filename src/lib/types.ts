import type { Timestamp } from 'firebase/firestore';

export type RatingScore = 1 | 2 | 3 | 4 | 5;

export type RatingBreakdown = {
  '1': number;
  '2': number;
  '3': number;
  '4': number;
  '5': number;
};

export interface PublicProfile {
  id?: string;
  uid: string;
  displayName: string;
  location: string;
  photos: string[];
  reviewsGivenCount: number;
  averageRating: number;
  totalRatings: number;
  ratingBreakdown: RatingBreakdown;
  createdAt?: Timestamp;
}

export interface RatingRecord {
  id: string;
  raterId: string;
  targetId: string;
  score: RatingScore;
  comment?: string;
  createdAt?: Timestamp;
}

export type TimestampLike =
  | Timestamp
  | Date
  | number
  | string
  | { toDate: () => Date; toMillis?: () => number }
  | null
  | undefined;
