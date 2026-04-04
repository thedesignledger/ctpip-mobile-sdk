/**
 * CTP/IP Mobile SDK Types
 */

export interface SealConfig {
  apiEndpoint: string;
  enablePerceptualHash: boolean;
  autoSeal: boolean;
  maxAutoSealSize: number;
  retryAttempts: number;
  retryDelayMs: number;
}

export interface SealRecord {
  sealHash: string;
  evidenceHash: string;
  intentHash: string;
  intentText: string;
  operatorId: string;
  domain: string;
  timestamp: string;
  tpnc: number;
  fileSize: number;
  perceptualHash?: PerceptualHash;
  status: 'pending' | 'sealed' | 'failed';
}

export interface PerceptualHash {
  algorithm: 'dHash' | 'pHash' | 'wavelet';
  hash: string;
  bits: number;
}

export interface VerificationResult {
  /** Exact match (SHA-256) */
  exactMatch: boolean;
  /** Perceptual match (dHash, within threshold) */
  perceptualMatch: boolean;
  /** Hamming distance for perceptual comparison */
  perceptualDistance: number;
  /** The seal record from the ledger */
  sealRecord?: SealRecord;
}

export interface DeviceCapabilities {
  /** Device has camera access */
  camera: boolean;
  /** Device has file system access */
  fileSystem: boolean;
  /** Device has biometric sensors (HRV, etc.) */
  biometric: boolean;
  /** Device has gaze tracking */
  gazeTracking: boolean;
  /** Device has secure enclave / TEE */
  secureEnclave: boolean;
}
