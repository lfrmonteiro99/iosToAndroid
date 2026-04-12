/**
 * Shared contact matching utility.
 * Matches phone numbers by comparing the last 10 digits (strips non-digit chars).
 */
export function findContactByPhone<T extends { phone: string }>(
  phone: string,
  contacts: T[],
): T | undefined {
  const digits = phone.replace(/\D/g, '').slice(-10);
  if (digits.length === 0) return undefined;
  return contacts.find((c) => c.phone.replace(/\D/g, '').slice(-10) === digits);
}
