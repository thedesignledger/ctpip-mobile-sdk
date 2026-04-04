/**
 * CTP/IP Mobile Seal Service
 *
 * Background service that seals digital artifacts at the moment of creation.
 * Hashes on device. Seals on ledger. Files never leave the device.
 *
 * Architecture:
 *   Device Camera/File System -> Hash on device -> Seal on ledger
 *   -> Embed seal reference as metadata -> Upload anywhere with provenance
 *
 * Source: R11 Book III S.III.A.4, Appendix G
 */

import { sha256_hex, derive_seal_hash, derive_intent_sig } from './crypto';
import type { SealRecord, SealConfig, PerceptualHash } from './types';

/**
 * Default configuration
 */
export const DEFAULT_CONFIG: SealConfig = {
  /** API endpoint for seal submission */
  apiEndpoint: 'https://sealed.energy/api/v1/seal',
  /** Enable perceptual hashing alongside SHA-256 */
  enablePerceptualHash: true,
  /** Automatically seal new files in watched directories */
  autoSeal: false,
  /** Maximum file size for auto-sealing (bytes) */
  maxAutoSealSize: 100 * 1024 * 1024, // 100MB
  /** Retry configuration */
  retryAttempts: 3,
  retryDelayMs: 5000,
};

/**
 * Compute SHA-256 hash of file bytes.
 *
 * This is the cryptographic hash that provides exact-match verification.
 * If you have the original file, you can hash it and check the ledger.
 */
export async function hashFile(fileBytes: ArrayBuffer): Promise<string> {
  const hashBuffer = await crypto.subtle.digest('SHA-256', fileBytes);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Compute perceptual hash (dHash) of an image.
 *
 * Produces the same output for visually identical images regardless
 * of compression, resizing, or re-encoding. The original file and
 * the Instagram-compressed version produce matching perceptual hashes.
 *
 * Algorithm: Difference Hash (dHash)
 * - Resize to 9x8 greyscale
 * - Compare adjacent pixels
 * - Produce 64-bit binary fingerprint
 *
 * Source: Session discussion on platform re-encoding
 */
export async function computePerceptualHash(
  imageData: ImageData
): Promise<PerceptualHash> {
  // Resize to 9x8 greyscale
  const width = 9;
  const height = 8;
  const grey = resizeToGreyscale(imageData, width, height);

  // Compute difference hash: compare adjacent horizontal pixels
  let hash = '';
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width - 1; x++) {
      const left = grey[y * width + x];
      const right = grey[y * width + (x + 1)];
      hash += left < right ? '1' : '0';
    }
  }

  // Convert binary string to hex
  const hexHash = BigInt('0b' + hash).toString(16).padStart(16, '0');

  return {
    algorithm: 'dHash',
    hash: hexHash,
    bits: 64,
  };
}

/**
 * Resize image to greyscale pixel array.
 */
function resizeToGreyscale(
  imageData: ImageData,
  targetWidth: number,
  targetHeight: number
): number[] {
  const { data, width, height } = imageData;
  const result: number[] = [];

  for (let ty = 0; ty < targetHeight; ty++) {
    for (let tx = 0; tx < targetWidth; tx++) {
      // Map target pixel to source region
      const sx = Math.floor((tx / targetWidth) * width);
      const sy = Math.floor((ty / targetHeight) * height);
      const idx = (sy * width + sx) * 4;

      // Convert to greyscale (luminance)
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      result.push(Math.round(0.299 * r + 0.587 * g + 0.114 * b));
    }
  }

  return result;
}

/**
 * Seal a file at the moment of creation.
 *
 * Process:
 * 1. Compute SHA-256 of raw bytes (exact match for original)
 * 2. Optionally compute perceptual hash (fuzzy match for re-encoded copies)
 * 3. Generate IntentSig from device fingerprint + operator + TPNC
 * 4. Submit seal to ledger
 * 5. Return seal record with both hashes
 *
 * The file NEVER leaves the device. Only the hash goes to the ledger.
 */
export async function sealFile(
  fileBytes: ArrayBuffer,
  operatorId: string,
  domain: string,
  intentText: string,
  config: SealConfig = DEFAULT_CONFIG,
  imageData?: ImageData,
): Promise<SealRecord> {
  // Step 1: Cryptographic hash
  const evidenceHash = await hashFile(fileBytes);

  // Step 2: Perceptual hash (images only)
  let perceptualHash: PerceptualHash | undefined;
  if (config.enablePerceptualHash && imageData) {
    perceptualHash = await computePerceptualHash(imageData);
  }

  // Step 3: IntentSig
  const fingerprint = await getDeviceFingerprint();
  const tpnc = Date.now(); // Phase 0: UTC proxy for TPNC
  const intentHash = await derive_intent_sig(fingerprint, operatorId, tpnc);

  // Step 4: Seal hash
  const timestamp = new Date().toISOString();
  const sealHash = await derive_seal_hash(
    evidenceHash, intentHash, 0, // Gamma computed server-side
    timestamp, operatorId
  );

  // Step 5: Build seal record
  const sealRecord: SealRecord = {
    sealHash,
    evidenceHash,
    intentHash,
    intentText,
    operatorId,
    domain,
    timestamp,
    tpnc,
    fileSize: fileBytes.byteLength,
    perceptualHash,
    status: 'pending',
  };

  // Step 6: Submit to ledger (async, retries)
  submitSeal(sealRecord, config).catch(err => {
    console.error('[CTP/IP] Seal submission failed:', err);
    sealRecord.status = 'failed';
    // Store locally for retry
    storeLocalSeal(sealRecord);
  });

  return sealRecord;
}

/**
 * Submit seal to the Fractal Fabric.
 */
async function submitSeal(
  record: SealRecord,
  config: SealConfig
): Promise<void> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < config.retryAttempts; attempt++) {
    try {
      const response = await fetch(config.apiEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CTP-Protocol-Version': 'R11',
        },
        body: JSON.stringify({
          evidence_hash: record.evidenceHash,
          intent_hash: record.intentHash,
          intent_text: record.intentText,
          operator_id: record.operatorId,
          domain: record.domain,
          timestamp: record.timestamp,
          file_size: record.fileSize,
          perceptual_hash: record.perceptualHash?.hash,
          perceptual_algorithm: record.perceptualHash?.algorithm,
        }),
      });

      if (response.ok) {
        record.status = 'sealed';
        return;
      }

      lastError = new Error(`HTTP ${response.status}: ${await response.text()}`);
    } catch (err) {
      lastError = err as Error;
    }

    // Wait before retry
    if (attempt < config.retryAttempts - 1) {
      await new Promise(r => setTimeout(r, config.retryDelayMs * (attempt + 1)));
    }
  }

  throw lastError || new Error('Seal submission failed after retries');
}

/**
 * Get device fingerprint for IntentSig derivation.
 * In production, this would use device-specific identifiers.
 */
async function getDeviceFingerprint(): Promise<string> {
  // Platform-specific: React Native device info, or browser fingerprint
  const components = [
    typeof navigator !== 'undefined' ? navigator.userAgent : 'node',
    typeof screen !== 'undefined' ? `${screen.width}x${screen.height}` : '0x0',
    new Date().getTimezoneOffset().toString(),
  ];
  return sha256_hex(components.join('|'));
}

/**
 * Store seal locally for offline retry.
 */
async function storeLocalSeal(record: SealRecord): Promise<void> {
  // In React Native: AsyncStorage
  // In browser: IndexedDB
  // Stub - platform-specific implementation required
  console.log('[CTP/IP] Storing seal locally for retry:', record.sealHash);
}

/**
 * Retry all locally stored seals.
 * Call this when network connectivity is restored.
 */
export async function retryPendingSeals(
  config: SealConfig = DEFAULT_CONFIG
): Promise<number> {
  // Platform-specific: read from AsyncStorage/IndexedDB
  // Submit each, remove on success
  // Return count of successfully submitted seals
  return 0; // Stub
}

/**
 * Verify a file against a seal record.
 * Re-hashes the file and checks against the stored evidence hash.
 */
export async function verifyFile(
  fileBytes: ArrayBuffer,
  expectedHash: string
): Promise<boolean> {
  const computedHash = await hashFile(fileBytes);
  return computedHash === expectedHash;
}

/**
 * Verify a re-encoded image against a perceptual hash.
 * Computes the perceptual hash and checks Hamming distance.
 */
export async function verifyPerceptual(
  imageData: ImageData,
  expectedHash: string,
  maxDistance: number = 10
): Promise<{ match: boolean; distance: number }> {
  const computed = await computePerceptualHash(imageData);
  const distance = hammingDistance(computed.hash, expectedHash);
  return { match: distance <= maxDistance, distance };
}

/**
 * Hamming distance between two hex strings.
 */
function hammingDistance(a: string, b: string): number {
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
