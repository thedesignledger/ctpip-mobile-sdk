/**
 * CTP/IP Mobile SDK - Seal Verification
 *
 * Verify any file against the Fractal Fabric.
 * Two verification paths:
 *   1. Exact match: SHA-256 of original bytes (for unmodified files)
 *   2. Perceptual match: dHash comparison (for re-encoded copies)
 *
 * Source: Session discussion on EXIF stripping and platform re-encoding
 */

import { hashFile, computePerceptualHash, verifyPerceptual } from './seal-service';
import { sha256_hex } from './crypto';
import type { VerificationResult, SealRecord } from '../types';

/** Verification API endpoint */
const VERIFY_ENDPOINT = 'https://sealed.energy/api/v1/verify';

/**
 * Verify a file against the Fractal Fabric.
 *
 * Process:
 * 1. Hash the file (SHA-256)
 * 2. Query the ledger for matching seal
 * 3. If no exact match and image, try perceptual hash
 * 4. Return verification result
 */
export async function verifyFile(
  fileBytes: ArrayBuffer,
  apiEndpoint: string = VERIFY_ENDPOINT,
  imageData?: ImageData,
): Promise<VerificationResult> {
  // Step 1: Exact hash
  const fileHash = await hashFile(fileBytes);

  // Step 2: Query ledger
  const exactSeal = await querySeal(fileHash, apiEndpoint);

  if (exactSeal) {
    return {
      exactMatch: true,
      perceptualMatch: true,
      perceptualDistance: 0,
      sealRecord: exactSeal,
    };
  }

  // Step 3: Perceptual match (images only)
  if (imageData) {
    const perceptual = await computePerceptualHash(imageData);
    const perceptualSeal = await queryPerceptualSeal(perceptual.hash, apiEndpoint);

    if (perceptualSeal) {
      // Compute distance to confirm
      const distance = hammingDistanceHex(perceptual.hash, perceptualSeal.perceptualHash?.hash || '');
      return {
        exactMatch: false,
        perceptualMatch: distance <= 10,
        perceptualDistance: distance,
        sealRecord: perceptualSeal,
      };
    }
  }

  // No match found
  return {
    exactMatch: false,
    perceptualMatch: false,
    perceptualDistance: Infinity,
  };
}

/**
 * Query the ledger for a seal by SHA-256 evidence hash.
 */
async function querySeal(
  evidenceHash: string,
  apiEndpoint: string
): Promise<SealRecord | undefined> {
  try {
    const response = await fetch(`${apiEndpoint}?hash=${evidenceHash}`, {
      headers: { 'X-CTP-Protocol-Version': 'R11' },
    });
    if (!response.ok) return undefined;
    const data = await response.json();
    return data.seal || undefined;
  } catch {
    return undefined;
  }
}

/**
 * Query the ledger for a seal by perceptual hash.
 */
async function queryPerceptualSeal(
  perceptualHash: string,
  apiEndpoint: string
): Promise<SealRecord | undefined> {
  try {
    const response = await fetch(`${apiEndpoint}?phash=${perceptualHash}&threshold=10`, {
      headers: { 'X-CTP-Protocol-Version': 'R11' },
    });
    if (!response.ok) return undefined;
    const data = await response.json();
    return data.seal || undefined;
  } catch {
    return undefined;
  }
}

/**
 * Hamming distance between two hex strings.
 */
function hammingDistanceHex(a: string, b: string): number {
  if (a.length !== b.length) return Infinity;
  const xor = BigInt('0x' + a) ^ BigInt('0x' + b);
  let count = 0;
  let bits = xor;
  while (bits > 0n) {
    count += Number(bits & 1n);
    bits >>= 1n;
  }
  return count;
}

/**
 * Generate a shareable verification link.
 * Anyone with this link can verify the seal independently.
 */
export function generateVerificationLink(sealHash: string): string {
  return `https://sealed.energy/verify/${sealHash}`;
}

/**
 * Generate embeddable metadata for sharing.
 * This can be attached to files before uploading to platforms.
 *
 * Note: EXIF is stripped by most platforms (Instagram, Twitter, etc).
 * The seal survives independently on the ledger. This metadata is
 * a convenience for platforms that preserve it.
 */
export function generateSealMetadata(seal: SealRecord): Record<string, string> {
  return {
    'CTP-IP-Seal': seal.sealHash,
    'CTP-IP-Evidence': seal.evidenceHash,
    'CTP-IP-Verify': generateVerificationLink(seal.sealHash),
    'CTP-IP-Protocol': 'R11',
    'CTP-IP-Domain': seal.domain,
    'CTP-IP-Timestamp': seal.timestamp,
  };
}
