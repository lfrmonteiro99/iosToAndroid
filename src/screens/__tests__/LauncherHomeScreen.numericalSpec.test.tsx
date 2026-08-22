import { readFileSync } from 'fs';
import { resolve } from 'path';

/**
 * Spec conformance tests for LauncherHomeScreen numerical values per ESPECIFICACAO.md §2
 *
 * These tests verify that the style constants in LauncherHomeScreen.tsx match
 * the numerical spec:
 * - Page dots: 7x7px, gap 9px, inactive opacity 0.30
 * - App icon labels: marginTop 5px, shadow alpha 0.55, shadow offset {0, 0}
 */
describe('LauncherHomeScreen numerical spec (§2 conformance)', () => {
  const sourceFile = readFileSync(resolve(__dirname, '../LauncherHomeScreen.tsx'), 'utf8');

  it('page dot dimensions: width 7, height 7, borderRadius 3.5', () => {
    // Verify pageDot style has width: 7, height: 7, borderRadius: 3.5
    expect(sourceFile).toMatch(/pageDot:\s*\{[\s\S]*?\n\s*width:\s*7,/);
    expect(sourceFile).toMatch(/pageDot:\s*\{[\s\S]*?\n\s*height:\s*7,/);
    expect(sourceFile).toMatch(/pageDot:\s*\{[\s\S]*?borderRadius:\s*3\.5,/);
  });

  it('page dots gap: 9', () => {
    // Verify pageDotsRow style has gap: 9
    expect(sourceFile).toMatch(/pageDotsRow:\s*\{[\s\S]*?gap:\s*9,/);
  });

  it('inactive page dot opacity: 0.30', () => {
    // Verify pageDotEmpty style has rgba(255,255,255,0.30)
    expect(sourceFile).toMatch(/pageDotEmpty:\s*\{[\s\S]*?backgroundColor:\s*'rgba\(255,255,255,0\.30\)'/);
  });

  it('app icon label marginTop: 5', () => {
    // Verify appIconLabel style has marginTop: 5
    expect(sourceFile).toMatch(/appIconLabel:\s*\{[\s\S]*?marginTop:\s*5,/);
  });

  it('app icon label text shadow alpha: 0.55', () => {
    // Verify appIconLabel style has textShadowColor with 0.55 alpha
    expect(sourceFile).toMatch(/appIconLabel:\s*\{[\s\S]*?textShadowColor:\s*'rgba\(0,0,0,0\.55\)'/);
  });

  it('app icon label text shadow offset: {width: 0, height: 0}', () => {
    // Verify appIconLabel style has textShadowOffset: { width: 0, height: 0 }
    expect(sourceFile).toMatch(/appIconLabel:\s*\{[\s\S]*?textShadowOffset:\s*\{\s*width:\s*0,\s*height:\s*0\s*\}/);
  });
});
