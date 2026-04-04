/**
 * CTP/IP Mobile SDK - Camera Seal Hook
 *
 * React hook that automatically seals photos/videos at the moment
 * of capture. The file never leaves the device. Only the hash
 * goes to the ledger.
 *
 * Usage:
 *   const { sealCapture, lastSeal, pending } = useCameraSeal(operatorId);
 *   // After camera capture:
 *   const seal = await sealCapture(photoBytes, 'Photo of sunset', 'Creation');
 */

import { useState, useCallback, useRef } from 'react';
import { sealFile, retryPendingSeals, DEFAULT_CONFIG } from './seal-service';
import type { SealRecord, SealConfig } from '../types';

interface UseCameraSealOptions {
  config?: Partial<SealConfig>;
  onSealComplete?: (seal: SealRecord) => void;
  onSealFailed?: (error: Error, seal: SealRecord) => void;
}

interface UseCameraSealReturn {
  /** Seal a captured file */
  sealCapture: (
    fileBytes: ArrayBuffer,
    intentText: string,
    domain: string,
    imageData?: ImageData
  ) => Promise<SealRecord>;
  /** Most recent seal */
  lastSeal: SealRecord | null;
  /** Number of pending (unconfirmed) seals */
  pendingCount: number;
  /** Whether a seal operation is in progress */
  sealing: boolean;
  /** Retry all pending seals */
  retryPending: () => Promise<number>;
}

export function useCameraSeal(
  operatorId: string,
  options: UseCameraSealOptions = {}
): UseCameraSealReturn {
  const [lastSeal, setLastSeal] = useState<SealRecord | null>(null);
  const [pendingCount, setPendingCount] = useState(0);
  const [sealing, setSealing] = useState(false);
  const configRef = useRef<SealConfig>({ ...DEFAULT_CONFIG, ...options.config });

  const sealCapture = useCallback(
    async (
      fileBytes: ArrayBuffer,
      intentText: string,
      domain: string,
      imageData?: ImageData
    ): Promise<SealRecord> => {
      setSealing(true);
      setPendingCount(prev => prev + 1);

      try {
        const seal = await sealFile(
          fileBytes,
          operatorId,
          domain,
          intentText,
          configRef.current,
          imageData
        );

        setLastSeal(seal);

        if (seal.status === 'sealed') {
          setPendingCount(prev => Math.max(0, prev - 1));
          options.onSealComplete?.(seal);
        } else if (seal.status === 'failed') {
          options.onSealFailed?.(new Error('Seal submission failed'), seal);
        }

        return seal;
      } finally {
        setSealing(false);
      }
    },
    [operatorId, options]
  );

  const retryPending = useCallback(async (): Promise<number> => {
    const count = await retryPendingSeals(configRef.current);
    setPendingCount(prev => Math.max(0, prev - count));
    return count;
  }, []);

  return { sealCapture, lastSeal, pendingCount, sealing, retryPending };
}
