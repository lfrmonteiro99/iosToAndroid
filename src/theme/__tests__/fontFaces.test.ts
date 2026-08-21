import * as fs from 'fs';
import * as path from 'path';
import { Typography, FontFamilies } from '../CupertinoTheme';

/**
 * Guarda do contrato entre os tokens de `Typography` e as faces que o Android
 * tem realmente registadas.
 *
 * No Android, uma família custom só resolve pesos se for declarada como
 * font-family XML (`res/font/*.xml`) e registada com
 * `ReactFontManager.addCustomFont` — é isso que o plugin `expo-font` gera a
 * partir de `expo.plugins["expo-font"].android.fonts` no `app.json`. Sem uma
 * face por peso, `fontWeight: '600'` cai no ficheiro Regular e `'700'` cai fora
 * da família (Roboto). Estes testes falham se um token pedir um peso que não
 * tem ficheiro, ou se um ficheiro declarado não for de facto desse peso.
 */

const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..');
const APP_JSON = path.join(PROJECT_ROOT, 'app.json');

type FontDefinition = { path: string; weight: number; style?: 'normal' | 'italic' };
type FontObject = { fontFamily: string; fontDefinitions: FontDefinition[] };
type PluginEntry = string | [string, { android?: { fonts?: FontObject[] } }];
type AppJson = { expo: { plugins: PluginEntry[] } };

function androidFontFamilies(): FontObject[] {
  const appJson = JSON.parse(fs.readFileSync(APP_JSON, 'utf8')) as AppJson;
  const entry = appJson.expo.plugins.find(
    (p): p is [string, { android?: { fonts?: FontObject[] } }] =>
      Array.isArray(p) && p[0] === 'expo-font',
  );
  return entry?.[1]?.android?.fonts ?? [];
}

/** Peso declarado pelo próprio ficheiro (OS/2.usWeightClass), lido do binário. */
function usWeightClass(ttfPath: string): number {
  const buf = fs.readFileSync(ttfPath);
  const sfnt = buf.readUInt32BE(0);
  // 0x00010000 = TrueType, 'OTTO' = CFF
  expect([0x00010000, 0x4f54544f]).toContain(sfnt);
  const numTables = buf.readUInt16BE(4);
  for (let i = 0; i < numTables; i++) {
    const rec = 12 + i * 16;
    if (buf.toString('latin1', rec, rec + 4) === 'OS/2') {
      return buf.readUInt16BE(buf.readUInt32BE(rec + 8) + 4);
    }
  }
  throw new Error(`${path.basename(ttfPath)}: sem tabela OS/2`);
}

/** Pares (família, peso) que os tokens pedem ao Android. */
const tokenFaces = Object.entries(Typography).map(([token, style]) => ({
  token,
  family: style.fontFamily as string,
  weight: Number(style.fontWeight),
}));

describe('faces de peso registadas no Android (app.json → expo-font)', () => {
  it('declara uma família XML para cada família usada pelos tokens', () => {
    const declared = androidFontFamilies().map((f) => f.fontFamily);
    const used = [...new Set(tokenFaces.map((f) => f.family))].sort();

    expect(used).toEqual([FontFamilies.display, FontFamilies.text].sort());
    used.forEach((family) => expect(declared).toContain(family));
  });

  it('declara uma face com o peso exacto de cada token', () => {
    const declared = androidFontFamilies();

    const missing = tokenFaces.filter(({ family, weight }) => {
      const fam = declared.find((f) => f.fontFamily === family);
      return !fam?.fontDefinitions.some((d) => d.weight === weight);
    });

    expect(missing.map((m) => `${m.token}: ${m.family} ${m.weight}`)).toEqual([]);
  });

  it('declara o peso 400 (base) em todas as famílias', () => {
    androidFontFamilies().forEach((family) => {
      expect(family.fontDefinitions.map((d) => d.weight)).toContain(400);
    });
  });

  it('não declara o mesmo peso duas vezes na mesma família', () => {
    androidFontFamilies().forEach((family) => {
      const weights = family.fontDefinitions.map((d) => d.weight);
      expect(weights).toEqual([...new Set(weights)]);
    });
  });

  it('não declara famílias que os tokens não usam', () => {
    const used = new Set(tokenFaces.map((f) => f.family));
    androidFontFamilies().forEach((family) => {
      expect(used.has(family.fontFamily)).toBe(true);
    });
  });

  it('cada ficheiro declarado existe e é mesmo do peso declarado', () => {
    const declared = androidFontFamilies();
    expect(declared.length).toBeGreaterThan(0);

    declared.forEach((family) => {
      family.fontDefinitions.forEach((definition) => {
        const file = path.resolve(PROJECT_ROOT, definition.path);
        expect(fs.existsSync(file)).toBe(true);
        // É este o teste que separa um SemiBold verdadeiro de um bold
        // sintetizado: o ficheiro tem de trazer o peso que dizemos que traz.
        expect({
          face: `${family.fontFamily} ${definition.weight}`,
          weight: usWeightClass(file),
        }).toEqual({
          face: `${family.fontFamily} ${definition.weight}`,
          weight: definition.weight,
        });
      });
    });
  });
});
