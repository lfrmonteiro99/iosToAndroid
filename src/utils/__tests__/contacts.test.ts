import { normalizePhoneKey, findContactByPhone } from '../contacts';

describe('normalizePhoneKey', () => {
  it('normalizes a number with country code', () => {
    expect(normalizePhoneKey('+351912345678')).toBe('912345678');
  });

  it('normalizes the same number without a country code to the same key', () => {
    expect(normalizePhoneKey('912345678')).toBe('912345678');
  });

  it('normalizes the same number with 00 international prefix to the same key', () => {
    expect(normalizePhoneKey('00351 912 345 678')).toBe('912345678');
  });

  it('strips spaces, hyphens and parentheses', () => {
    expect(normalizePhoneKey('+1 (555) 123-4567')).toBe(normalizePhoneKey('5551234567'));
  });

  it('keeps a 5-digit short code as an exact value (no truncation)', () => {
    expect(normalizePhoneKey('12345')).toBe('12345');
  });

  it('keeps two distinct 5-digit short codes distinct', () => {
    expect(normalizePhoneKey('12345')).not.toBe(normalizePhoneKey('12346'));
  });

  it('returns an empty string for an empty phone', () => {
    expect(normalizePhoneKey('')).toBe('');
  });
});

describe('findContactByPhone', () => {
  const contacts = [
    { id: 'c1', phone: '+351912345678' },
    { id: 'c2', phone: '12345' },
  ];

  it('matches a contact across formats via the normalized key', () => {
    expect(findContactByPhone('912345678', contacts)).toEqual(contacts[0]);
  });

  it('matches a short code exactly', () => {
    expect(findContactByPhone('12345', contacts)).toEqual(contacts[1]);
  });

  it('does not match a different short code', () => {
    expect(findContactByPhone('12346', contacts)).toBeUndefined();
  });

  it('returns undefined for an empty phone', () => {
    expect(findContactByPhone('', contacts)).toBeUndefined();
  });
});
