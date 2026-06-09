/** Strip everything but digits; normalize a leading Russian 8 to 7. */
export function normalizePhone(phone: string): string {
  let digits = phone.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("8")) {
    digits = "7" + digits.slice(1);
  }
  return digits;
}

/** Build a wa.me deep link with a pre-filled message. */
export function buildWaLink(phone: string, text: string): string {
  const num = normalizePhone(phone);
  return `https://wa.me/${num}?text=${encodeURIComponent(text)}`;
}
