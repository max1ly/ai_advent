import { describe, it, expect, beforeEach } from 'vitest';
import {
  getProfiles,
  getProfileById,
  createProfile,
  deleteProfile,
  clearAllMemory,
} from '@/lib/db';

// clearAllMemory doesn't clear user_profiles, so we need manual cleanup
function clearProfiles() {
  for (const p of getProfiles()) {
    deleteProfile(p.id);
  }
}

beforeEach(() => {
  clearAllMemory();
  clearProfiles();
});

describe('User Profiles CRUD', () => {
  it('creates a profile and retrieves it', () => {
    const id = createProfile('Developer', 'Be concise, use code examples.');
    const profile = getProfileById(id);

    expect(profile).not.toBeNull();
    expect(profile!.name).toBe('Developer');
    expect(profile!.description).toBe('Be concise, use code examples.');
    expect(profile!.id).toBe(id);
  });

  it('lists all profiles ordered by name', () => {
    createProfile('Tutor', 'Explain step by step.');
    createProfile('Analyst', 'Use structured lists.');
    createProfile('Developer', 'Be concise.');

    const profiles = getProfiles();
    expect(profiles).toHaveLength(3);
    expect(profiles[0].name).toBe('Analyst');
    expect(profiles[1].name).toBe('Developer');
    expect(profiles[2].name).toBe('Tutor');
  });

  it('returns null for unknown profile id', () => {
    expect(getProfileById(9999)).toBeNull();
  });

  it('deletes a profile by id', () => {
    const id1 = createProfile('Profile A', 'Description A');
    createProfile('Profile B', 'Description B');

    deleteProfile(id1);

    const profiles = getProfiles();
    expect(profiles).toHaveLength(1);
    expect(profiles[0].name).toBe('Profile B');
  });

  it('enforces unique name constraint', () => {
    createProfile('Developer', 'Description 1');

    expect(() => createProfile('Developer', 'Description 2')).toThrow(/UNIQUE constraint/);
  });

  it('returns empty array when no profiles exist', () => {
    expect(getProfiles()).toHaveLength(0);
  });

  it('deleting non-existent profile is a no-op', () => {
    createProfile('Only One', 'Desc');
    deleteProfile(9999);
    expect(getProfiles()).toHaveLength(1);
  });
});

describe('Profile persistence', () => {
  it('profiles survive across function calls', () => {
    const id = createProfile('Persistent', 'This should persist.');

    // Simulate "new request" by fetching again
    const fetched = getProfileById(id);
    expect(fetched!.name).toBe('Persistent');
    expect(fetched!.description).toBe('This should persist.');
  });

  it('profiles are independent of memory system', () => {
    createProfile('My Profile', 'My description.');
    clearAllMemory();

    // Profiles should still exist after clearAllMemory
    const profiles = getProfiles();
    expect(profiles).toHaveLength(1);
    expect(profiles[0].name).toBe('My Profile');
  });
});
