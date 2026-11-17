/**
 * Circuit seed for a fresh race.
 *
 * The seed fully determines the circuit, but nothing in the game is keyed to a
 * particular seed: best times are kept per level, so a new circuit on every load
 * does not strand the player's record.
 */
export function randomSeed(): string {
  const bytes = new Uint8Array(8);
  const webCrypto = globalThis.crypto;
  if (webCrypto && typeof webCrypto.getRandomValues === 'function') {
    webCrypto.getRandomValues(bytes);
  } else {
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = Math.floor(Math.random() * 256);
    }
  }
  let hex = '';
  for (const byte of bytes) {
    hex += byte.toString(16).padStart(2, '0');
  }
  return `circuit-${hex}`;
}
