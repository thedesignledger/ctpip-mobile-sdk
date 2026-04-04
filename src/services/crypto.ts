/**
 * CTP/IP Mobile SDK - Cryptographic Utilities
 *
 * Portable SHA-256 implementation for React Native + browser + Node.
 * No native dependencies required.
 */

/**
 * SHA-256 hash of a string, returning lowercase hex.
 */
export async function sha256_hex(message: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(message);

  if (typeof globalThis.crypto !== 'undefined' && globalThis.crypto.subtle) {
    const hashBuffer = await globalThis.crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  // Node.js fallback
  const { createHash } = await import('crypto');
  return createHash('sha256').update(message).digest('hex');
}

/**
 * SHA-256 hash of raw bytes, returning lowercase hex.
 */
export async function sha256_bytes(data: ArrayBuffer): Promise<string> {
  if (typeof globalThis.crypto !== 'undefined' && globalThis.crypto.subtle) {
    const hashBuffer = await globalThis.crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  const { createHash } = await import('crypto');
  return createHash('sha256').update(Buffer.from(data)).digest('hex');
}

/**
 * Derive IntentSig hash.
 * Formula: SHA-256(fingerprint + userId + tpnc)
 */
export async function derive_intent_sig(
  fingerprint: string,
  userId: string,
  tpnc: number
): Promise<string> {
  return sha256_hex(fingerprint + userId + tpnc.toString());
}

/**
 * Derive seal hash.
 * Formula: SHA-256(evidenceHash + intentHash + gamma + timestamp + operatorId)
 */
export async function derive_seal_hash(
  evidenceHash: string,
  intentHash: string,
  gamma: number,
  timestamp: string,
  operatorId: string
): Promise<string> {
  const preimage = evidenceHash + intentHash + gamma.toFixed(6) + timestamp + operatorId;
  return sha256_hex(preimage);
}
