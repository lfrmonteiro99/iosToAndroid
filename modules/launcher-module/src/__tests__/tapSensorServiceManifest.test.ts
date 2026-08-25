/**
 * #770 / #636 Back Tap: regression guard for the AndroidManifest declaration of
 * the back-tap foreground sensor service (TapSensorService, the implementation
 * of the detector described in the issue).
 *
 * The issue's explicit acceptance criterion is "manifest declara o serviço"
 * with foreground service type TYPE_SENSOR. The detector (TapClassifier) and the
 * service wiring already exist in main (PR #794); what must be verifiable from
 * the manifest is that the service is declared AND typed as `sensor` — not some
 * unrelated type — and that the matching SENSOR foreground-service permission is
 * declared (Android 14 / API 34 requires the permission that matches the type).
 *
 * This is a pure read of the real AndroidManifest.xml (no android.* imports, no
 * emulator), so it runs under jest — unlike the sensor runtime itself which the
 * issue defers to manual device acceptance.
 */
import * as fs from 'fs';
import * as path from 'path';

const MANIFEST = path.resolve(
  __dirname,
  '../../android/src/main/AndroidManifest.xml',
);

function readManifest(): string {
  return fs.readFileSync(MANIFEST, 'utf8');
}

/** Extracts the <service ...>...</service> block for the given android:name. */
function serviceBlock(manifest: string, name: string): string | null {
  const re = new RegExp(
    `<service[^>]*android:name="${name}"[^>]*>([\\s\\S]*?)</service>`,
    'i',
  );
  const m = manifest.match(re);
  return m ? m[0] : null;
}

function attr(block: string, name: string): string | null {
  const m = block.match(new RegExp(`${name}="([^"]*)"`, 'i'));
  return m ? m[1] : null;
}

describe('TapSensorService manifest declaration (#770)', () => {
  const manifest = readManifest();
  const block = serviceBlock(manifest, '.TapSensorService');

  it('declares the TapSensorService in the manifest', () => {
    expect(block).not.toBeNull();
  });

  it('types the service as a SENSOR foreground service, not another type', () => {
    // The issue's acceptance criterion: foreground service TYPE_SENSOR.
    const type = block ? attr(block, 'android:foregroundServiceType') : null;
    expect(type).toBe('sensor');
  });

  it('declares the FOREGROUND_SERVICE_SENSOR permission', () => {
    expect(manifest).toMatch(
      /<uses-permission[^>]*android:name="android\.permission\.FOREGROUND_SERVICE_SENSOR"/,
    );
  });

  it('does not type the service as a non-sensor type (e.g. health)', () => {
    const type = block ? attr(block, 'android:foregroundServiceType') : null;
    expect(type).not.toBe('health');
    expect(manifest).not.toMatch(
      /<uses-permission[^>]*android:name="android\.permission\.FOREGROUND_SERVICE_HEALTH"/,
    );
  });
});
