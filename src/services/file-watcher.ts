/**
 * CTP/IP Mobile SDK - File Watcher Service
 *
 * Background service that monitors directories for new files
 * and automatically seals them at creation time.
 *
 * Platform implementations:
 * - React Native: react-native-fs + BackgroundFetch
 * - iOS: NSFilePresenter / FSEvents
 * - Android: FileObserver / ContentObserver
 *
 * The seal is the provenance. The file stays on the device.
 * The hash goes to the ledger. When the operator uploads anywhere,
 * the seal travels with it.
 */

import { sealFile, hashFile, DEFAULT_CONFIG } from './seal-service';
import type { SealConfig, SealRecord } from '../types';

/** Watched directory configuration */
export interface WatchConfig {
  /** Directory path to watch */
  path: string;
  /** File extensions to seal (empty = all) */
  extensions: string[];
  /** Transformation domain for seals from this directory */
  domain: string;
  /** Default intent text for auto-seals */
  defaultIntent: string;
  /** Whether to watch recursively */
  recursive: boolean;
}

/** Default watch configurations for common mobile directories */
export const MOBILE_WATCH_PRESETS: Record<string, WatchConfig> = {
  camera: {
    path: 'DCIM/Camera',
    extensions: ['.jpg', '.jpeg', '.png', '.heic', '.mp4', '.mov'],
    domain: 'Creation',
    defaultIntent: 'Photo/video capture',
    recursive: false,
  },
  screenshots: {
    path: 'Pictures/Screenshots',
    extensions: ['.png', '.jpg'],
    domain: 'Record',
    defaultIntent: 'Screenshot capture',
    recursive: false,
  },
  documents: {
    path: 'Documents',
    extensions: ['.pdf', '.docx', '.xlsx', '.txt', '.md'],
    domain: 'Work',
    defaultIntent: 'Document creation',
    recursive: true,
  },
  downloads: {
    path: 'Download',
    extensions: [],
    domain: 'Record',
    defaultIntent: 'File download',
    recursive: false,
  },
};

/** File watcher state */
export interface WatcherState {
  /** Whether the watcher is active */
  active: boolean;
  /** Directories being watched */
  directories: WatchConfig[];
  /** Total seals created this session */
  sealCount: number;
  /** Pending seals awaiting confirmation */
  pendingCount: number;
  /** Last seal timestamp */
  lastSealTime: string | null;
  /** Errors encountered */
  errors: string[];
}

/**
 * File Watcher Service
 *
 * This is the abstract interface. Platform-specific implementations
 * (React Native, iOS native, Android native) must implement the
 * file system monitoring.
 */
export class FileWatcherService {
  private config: SealConfig;
  private operatorId: string;
  private state: WatcherState;
  private onSeal?: (seal: SealRecord) => void;
  private seenHashes: Set<string> = new Set();

  constructor(
    operatorId: string,
    config: Partial<SealConfig> = {},
    onSeal?: (seal: SealRecord) => void
  ) {
    this.operatorId = operatorId;
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.onSeal = onSeal;
    this.state = {
      active: false,
      directories: [],
      sealCount: 0,
      pendingCount: 0,
      lastSealTime: null,
      errors: [],
    };
  }

  /**
   * Start watching directories.
   * Call with preset names or custom WatchConfig objects.
   */
  async start(directories: (string | WatchConfig)[]): Promise<void> {
    const configs = directories.map(d =>
      typeof d === 'string' ? MOBILE_WATCH_PRESETS[d] : d
    ).filter(Boolean) as WatchConfig[];

    this.state.directories = configs;
    this.state.active = true;

    // Platform-specific: register file observers
    // This is where React Native / native code hooks in
    for (const dir of configs) {
      await this.registerWatcher(dir);
    }
  }

  /**
   * Stop all watchers.
   */
  async stop(): Promise<void> {
    this.state.active = false;
    // Platform-specific: unregister file observers
  }

  /**
   * Handle a new file event.
   * Called by platform-specific file observer when a new file appears.
   */
  async onFileCreated(
    filePath: string,
    fileBytes: ArrayBuffer,
    watchConfig: WatchConfig
  ): Promise<SealRecord | null> {
    // Check extension filter
    if (watchConfig.extensions.length > 0) {
      const ext = '.' + filePath.split('.').pop()?.toLowerCase();
      if (!watchConfig.extensions.includes(ext)) return null;
    }

    // Check file size
    if (fileBytes.byteLength > this.config.maxAutoSealSize) {
      this.state.errors.push(`File too large: ${filePath} (${fileBytes.byteLength} bytes)`);
      return null;
    }

    // Deduplicate (same file content)
    const contentHash = await hashFile(fileBytes);
    if (this.seenHashes.has(contentHash)) return null;
    this.seenHashes.add(contentHash);

    // Seal
    try {
      this.state.pendingCount++;
      const seal = await sealFile(
        fileBytes,
        this.operatorId,
        watchConfig.domain,
        watchConfig.defaultIntent,
        this.config,
      );

      this.state.sealCount++;
      this.state.lastSealTime = seal.timestamp;

      if (seal.status === 'sealed') {
        this.state.pendingCount--;
      }

      this.onSeal?.(seal);
      return seal;
    } catch (err) {
      this.state.pendingCount--;
      const msg = err instanceof Error ? err.message : String(err);
      this.state.errors.push(`Seal failed for ${filePath}: ${msg}`);
      return null;
    }
  }

  /**
   * Get current watcher state.
   */
  getState(): WatcherState {
    return { ...this.state };
  }

  /**
   * Platform-specific watcher registration.
   * Override in platform implementation.
   */
  protected async registerWatcher(config: WatchConfig): Promise<void> {
    // Stub: platform-specific implementation required
    // React Native: use react-native-fs.readDir + polling or native module
    // iOS: NSFilePresenter
    // Android: FileObserver
    console.log(`[CTP/IP] Watching: ${config.path} (${config.domain})`);
  }
}
