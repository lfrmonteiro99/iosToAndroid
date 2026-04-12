/**
 * Shared contact matching utility.
 * Matches phone numbers by stripping non-digit chars and comparing suffixes.
 * Uses last 10 digits for numbers with 10+ digits (North American style),
 * or exact digit match for shorter numbers (international / short codes).
 */
export function findContactByPhone<T extends { phone: string }>(
  phone: string,
  contacts: T[],
): T | undefined {
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 0) return undefined;
  // For short numbers (emergency, short codes), match exactly
  const matchDigits = digits.length >= 10 ? digits.slice(-10) : digits;
  return contacts.find((c) => {
    const cDigits = c.phone.replace(/\D/g, '');
    if (cDigits.length === 0) return false;
    const cMatch = cDigits.length >= 10 ? cDigits.slice(-10) : cDigits;
    return matchDigits === cMatch;
  });
}
