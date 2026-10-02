// Random, non-sequential diagram ids. 31 symbols (no i, l, o, 0, 1) x 12 = ~59 bits.
const ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";
export const ID_LENGTH = 12;

export function generateId(length = ID_LENGTH): string {
  // Largest multiple of the alphabet size that fits in a byte: reject above it to avoid modulo bias.
  const limit = 256 - (256 % ALPHABET.length);
  let id = "";
  while (id.length < length) {
    const bytes = crypto.getRandomValues(new Uint8Array(length * 2));
    for (const byte of bytes) {
      if (byte < limit && id.length < length) id += ALPHABET[byte % ALPHABET.length];
    }
  }
  return id;
}

export function isValidId(id: string): boolean {
  return /^[a-z0-9]{10,32}$/.test(id);
}
