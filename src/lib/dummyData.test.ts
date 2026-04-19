import { describe, it, expect } from 'vitest';
import { getDummyProfile, DUMMY_PROFILES } from './dummyData';

describe('Dummy Data Utilities', () => {
  it('should initialize DUMMY_PROFILES with the correct shape', () => {
    expect(Array.isArray(DUMMY_PROFILES)).toBe(true);
    expect(DUMMY_PROFILES.length).toBeGreaterThan(0);
    expect(DUMMY_PROFILES[0]).toHaveProperty('id');
    expect(DUMMY_PROFILES[0]).toHaveProperty('displayName');
    expect(DUMMY_PROFILES[0]).toHaveProperty('location');
    expect(DUMMY_PROFILES[0]).toHaveProperty('photos');
  });

  it('should retrieve a specific profile by ID', () => {
    const profile = getDummyProfile('dummy_alex');
    expect(profile).not.toBeNull();
    expect(profile?.displayName).toContain('Alex');
  });

  it('should return null for non-existent profiles', () => {
    const profile = getDummyProfile('dummy_does_not_exist');
    expect(profile).toBeNull();
  });
});
