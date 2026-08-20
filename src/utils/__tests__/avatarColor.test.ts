import { avatarColorForName } from '../avatarColor';

describe('avatarColorForName', () => {
  it('returns a hex color string', () => {
    expect(avatarColorForName('Ana Silva')).toMatch(/^#[0-9A-F]{6}$/i);
  });

  it('is idempotent — same name always returns the same color', () => {
    const name = 'João Santos';
    expect(avatarColorForName(name)).toBe(avatarColorForName(name));
  });

  it('returns a color for an empty string without throwing', () => {
    expect(() => avatarColorForName('')).not.toThrow();
    expect(avatarColorForName('')).toMatch(/^#[0-9A-F]{6}$/i);
  });

  it('returns different colors for different names (distribution check)', () => {
    const names = ['Alice', 'Bob', 'Carol', 'Dave', 'Eve', 'Frank', 'Grace', 'Heidi', 'Ivan'];
    const colors = names.map(avatarColorForName);
    const unique = new Set(colors);
    // With 9 palette colors and 9 distinct names, expect at least 3 distinct colors
    expect(unique.size).toBeGreaterThanOrEqual(3);
  });
});
