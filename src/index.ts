/**
 * CTP/IP Mobile SDK
 *
 * Seal digital artifacts at the moment of creation.
 * Hash on device. Seal on ledger. Files never leave the device.
 *
 * Source: R11 Sealed Unified Corpus (DOI: 10.5281/zenodo.19362640)
 * License: Apache 2.0
 *
 * @module @ctpip/mobile
 */

// Seal Service
export {
  sealFile,
  hashFile,
  computePerceptualHash,
  verifyFile as verifyFileBytes,
  verifyPerceptual,
  retryPendingSeals,
  DEFAULT_CONFIG,
} from './services/seal-service';

// Camera Hook
export { useCameraSeal } from './services/camera-hook';

// File Watcher
export {
  FileWatcherService,
  MOBILE_WATCH_PRESETS,
} from './services/file-watcher';
export type { WatchConfig, WatcherState } from './services/file-watcher';

// Verification
export {
  verifyFile,
  generateVerificationLink,
  generateSealMetadata,
} from './services/verification';

// Crypto
export {
  sha256_hex,
  sha256_bytes,
  derive_intent_sig,
  derive_seal_hash,
} from './services/crypto';

// Types
export type {
  SealConfig,
  SealRecord,
  PerceptualHash,
  VerificationResult,
  DeviceCapabilities,
} from './types';
