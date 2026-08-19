# Bundle Size Notes

Nota de acompanhamento ao GAP_ANALYSIS_V2.md — impacto de dependências no tamanho do bundle JS.

## N6. Delta de bundle size da dependência `decimal.js` (issue #337, AC5 de #212)

- **Commit medido**: `1f2c2c9` (branch `qa/issue-337`, `main` na data abaixo)
- **Data**: 2026-08-19
- **Versão de `decimal.js`**: `10.6.0` (declarada como `^10.4.3` em `package.json:17`)

### Metodologia

`npx expo export` produz por omissão bytecode Hermes (`.hbc`), que não é legível
por ferramentas de análise de bundle. Para medir a contribuição real de
`decimal.js`, foi gerado também um bundle JS plano (não-Hermes) com source map,
e analisado com `source-map-explorer`, que atribui bytes do bundle final a cada
ficheiro-fonte via o source map — não é uma estimativa, é medição directa do
artefacto gerado neste repositório.

```bash
# Bundle de produção real (Hermes bytecode, o que é embutido no APK)
npx expo export --platform android --output-dir /tmp/expo-export-test

# Bundle JS plano + source map, só para análise (mesmo grafo de módulos)
npx expo export --platform android --output-dir /tmp/expo-export-nobc \
  --no-bytecode --source-maps

npx source-map-explorer \
  _expo/static/js/android/index-*.js \
  _expo/static/js/android/index-*.js.map \
  --json analysis.json --no-border-checks
```

### Resultados medidos

| Artefacto | Tamanho |
|---|---|
| Bundle Android — Hermes bytecode (`.hbc`, o que entra no APK) | **5.300.335 bytes** (5,1 MiB / 5,3 MB) |
| Bundle Android — JS minificado plano (usado só para análise) | 3.742.658 bytes (3,6 MiB) |
| Contribuição de `decimal.js/decimal.mjs` no JS minificado (via source map) | **31.962 bytes** (≈31,2 KB), **0,85%** do bundle JS |
| `node_modules/decimal.js` em disco (fonte não empacotada) | 300 KB (`decimal.js` principal: 136.673 bytes não minificado) |
| `decimal.mjs` gzip -9 isolado (referência cruzada, não é o número do bundle real) | 31.643 bytes |

### Conclusão

`decimal.js` acrescenta **~32 KB minificados (~0,85% do bundle JS)** ao bundle
Android desta app — negligível face aos ~3,6 MB do bundle JS total (ou aos
5,3 MB do `.hbc` final). Não há impacto material no tempo de arranque ou no
tamanho do APK que justifique reconsiderar a dependência introduzida em
`77d58ad` (PR #237) e usada em `295fb97` (#340) para rotear operações
aritméticas (`sin`/`cos`/`tan`/`log`/`ln`/`√`/`x²`/`x³`/`1÷x`/`|x|`) por
`decimal.js` em vez de `Math.*` nativo.
