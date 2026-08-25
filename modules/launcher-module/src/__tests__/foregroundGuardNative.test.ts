import * as fs from 'fs';
import * as path from 'path';

/**
 * Regressão do #627 (retrabalho no PR #805): `ForegroundGuardActivity` só
 * anexa um `BiometricPrompt` (DialogFragment) em `onCreate` — nunca chama
 * `finish()` nem `startActivity()` antes do fim de `onResume()`. Um tema cujo
 * parent seja `android:Theme.*.NoDisplay` (ou que declare
 * `android:windowNoDisplay` como `true`) obriga a Activity a fazê-lo, ou o
 * sistema derruba-a com `IllegalStateException` antes do prompt aparecer —
 * o gate nunca é mostrado.
 */

const ANDROID_ROOT = path.resolve(__dirname, '..', '..', 'android');
const STYLES_XML = path.join(
  ANDROID_ROOT,
  'src/main/res/values/foreground_monitor_styles.xml',
);
const MANIFEST_XML = path.join(ANDROID_ROOT, 'src/main/AndroidManifest.xml');

function readStyle(name: string): string {
  const xml = fs.readFileSync(STYLES_XML, 'utf8');
  const match = xml.match(
    new RegExp(`<style name="${name}"[^>]*>[\\s\\S]*?</style>`),
  );
  if (!match) throw new Error(`style "${name}" não encontrado em ${STYLES_XML}`);
  return match[0];
}

describe('Theme.TransparentGuard (ForegroundGuardActivity) não pode ser NoDisplay', () => {
  it('o parent do tema não é um tema NoDisplay', () => {
    const style = readStyle('Theme.TransparentGuard');
    const parentMatch = style.match(/parent="([^"]+)"/);
    expect(parentMatch).not.toBeNull();
    expect(parentMatch![1]).not.toMatch(/NoDisplay/i);
  });

  it('o tema não define android:windowNoDisplay como true', () => {
    const style = readStyle('Theme.TransparentGuard');
    const itemMatch = style.match(
      /<item name="android:windowNoDisplay">([^<]+)<\/item>/,
    );
    if (itemMatch) {
      expect(itemMatch[1].trim()).not.toBe('true');
    }
  });
});

describe('AndroidManifest do launcher-module (#627)', () => {
  it('não pede BIND_ACCESSIBILITY_SERVICE como uses-permission (é permissão de sistema, só válida em android:permission de <service>)', () => {
    const manifest = fs.readFileSync(MANIFEST_XML, 'utf8');
    expect(manifest).not.toMatch(
      /<uses-permission\s+android:name="android\.permission\.BIND_ACCESSIBILITY_SERVICE"/,
    );
  });

  it('o serviço ForegroundMonitorService continua protegido por android:permission=BIND_ACCESSIBILITY_SERVICE', () => {
    const manifest = fs.readFileSync(MANIFEST_XML, 'utf8');
    const serviceMatch = manifest.match(
      /<service\s+android:name="\.ForegroundMonitorService"[\s\S]*?\/>/,
    );
    expect(serviceMatch).not.toBeNull();
    expect(serviceMatch![0]).toMatch(
      /android:permission="android\.permission\.BIND_ACCESSIBILITY_SERVICE"/,
    );
  });
});
