# @ctpip/mobile

CTP/IP Mobile SDK - Seal digital artifacts at the moment of creation.

Hash on device. Seal on ledger. Files never leave the device.

Source: R11 Sealed Unified Corpus (DOI: 10.5281/zenodo.19362640)

## What This Does

Every photo, video, document, and voice memo is optionally sealed at the moment of creation. The file stays on the device. Only the hash goes to the ledger. When the operator uploads anywhere, the provenance travels with it.

This is not a social media platform. It is a provenance service that makes every existing platform accountable to the creator.

## Architecture

```
Device                          Ledger
+------------------+           +----------------+
| Camera / Files   |           | Fractal Fabric |
|       |          |           |                |
|   SHA-256 hash   | -------> | Seal record    |
|   dHash (images) |   HTTPS  | (evidence_hash |
|       |          |           |  intent_hash   |
|   Local storage  |           |  operator_id)  |
|   (offline buf)  |           |                |
+------------------+           +----------------+
        |
        v
  Upload anywhere
  (Instagram, Twitter, etc.)
        |
        v
  Provenance survives via:
    1. Exact match: SHA-256 of original
    2. Fuzzy match: dHash of re-encoded copy
```

## Install

```bash
npm install @ctpip/mobile
```

## Quick Start

### Seal a photo on capture

```typescript
import { useCameraSeal } from '@ctpip/mobile';

function CameraScreen({ operatorId }) {
  const { sealCapture, lastSeal, sealing } = useCameraSeal(operatorId);

  const handleCapture = async (photoBytes: ArrayBuffer) => {
    const seal = await sealCapture(photoBytes, 'Beach sunset', 'Creation');
    console.log('Sealed:', seal.sealHash);
    // Photo stays on device. Hash is on the ledger.
  };

  return (
    <View>
      <Camera onCapture={handleCapture} />
      {sealing && <Text>Sealing...</Text>}
      {lastSeal && <Text>Sealed: {lastSeal.sealHash.slice(0, 8)}...</Text>}
    </View>
  );
}
```

### Auto-seal new files

```typescript
import { FileWatcherService } from '@ctpip/mobile';

const watcher = new FileWatcherService(operatorId, {}, (seal) => {
  console.log('Auto-sealed:', seal.evidenceHash);
});

// Watch camera roll and documents
await watcher.start(['camera', 'documents']);
```

### Verify a file

```typescript
import { verifyFile, generateVerificationLink } from '@ctpip/mobile';

const result = await verifyFile(fileBytes);
if (result.exactMatch) {
  console.log('Original file verified on Fractal Fabric');
  console.log('Verify:', generateVerificationLink(result.sealRecord.sealHash));
} else if (result.perceptualMatch) {
  console.log('Re-encoded copy matched (distance:', result.perceptualDistance, ')');
}
```

## Two Verification Paths

### 1. Exact Match (SHA-256)
For original, unmodified files. The hash of the file matches the hash on the ledger exactly. This works when you have the original file.

### 2. Perceptual Match (dHash)
For re-encoded copies. Platforms strip EXIF and re-encode uploads. The bytes change. SHA-256 no longer matches. But the perceptual hash (dHash) produces the same fingerprint for visually identical images regardless of compression. Hamming distance <= 10 = match.

## Watch Presets

| Preset | Path | Extensions | Domain |
|:-------|:-----|:-----------|:-------|
| `camera` | DCIM/Camera | jpg, png, heic, mp4, mov | Creation |
| `screenshots` | Pictures/Screenshots | png, jpg | Record |
| `documents` | Documents | pdf, docx, xlsx, txt, md | Work |
| `downloads` | Download | all | Record |

## Offline Support

Seals are buffered locally when offline. Call `retryPendingSeals()` when connectivity is restored. The seal timestamp reflects creation time, not submission time.

## Privacy

- Files NEVER leave the device
- Only the SHA-256 hash goes to the ledger
- No raw content is transmitted
- No biometric data in Phase 0
- Operator controls what is sealed and what is shared

## Files

```
src/
  services/
    seal-service.ts      # Core sealing logic + perceptual hashing
    camera-hook.ts       # React hook for camera integration
    file-watcher.ts      # Background file monitoring service
    verification.ts      # Verify files against Fractal Fabric
    crypto.ts            # Portable SHA-256 utilities
  types.ts               # TypeScript type definitions
  index.ts               # Barrel export
```

## License

Apache 2.0

designledger.co | sealed.energy | time.foundation
