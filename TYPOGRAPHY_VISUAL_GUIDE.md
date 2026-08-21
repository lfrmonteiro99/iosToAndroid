# Typography Fix #476 — Visual Guide

## Alterações de Tracking nos Títulos

### Antes (❌ Errado)
```
title2 (22pt):  letterSpacing: +0.35  ← sinal INVERTIDO
title3 (20pt):  letterSpacing: +0.38  ← sinal INVERTIDO
```

### Depois (✅ Correcto)
```
title2 (22pt):  letterSpacing: -0.26  ← valor negativo Apple SF Pro
title3 (20pt):  letterSpacing: -0.45  ← valor negativo Apple SF Pro
```

---

## Efeito Visual

O `letterSpacing` controla o espaçamento entre caracteres. A Apple usa valores **negativos** para títulos médios (22-20pt) para melhorar a legibilidade — contrai o texto de forma imperceptível mas eficaz.

### Comparação Lado-a-Lado

**Antes (com +0.35, +0.38):** O texto fica artificialmente espaçado, com um efeito de "breathing room" excessivo — não-Apple.

```
TITLE WITH EXTRA SPACE  ← tracking positivo (largo demais)
```

**Depois (com -0.26, -0.45):** O texto segue a métrica Apple — mais compacto, hierarquicamente apropriado.

```
TITLE WITH PROPER SPACE  ← tracking negativo (conforme Apple)
```

---

## Confirmação dos Valores

| Token    | Tamanho (pt) | Tracking Antes | Tracking Depois | Apple SF Pro | Status  |
|----------|:-------------|:---------------|:----------------|:-------------|---------|
| title2   | 22           | +0.35          | **-0.26**       | -0.26        | ✅ Fix  |
| title3   | 20           | +0.38          | **-0.45**       | -0.45        | ✅ Fix  |

**Fonte primária:** Apple Human Interface Guidelines, Typography — SF Pro tracking table
**Referência:** Issue #476, secção «Contexto»

---

## Ecrãs Afectados

Os seguintes ecrãs usam `title2` ou `title3` (via `typography.title2` ou `typography.title3`):

- **title2 (22pt):**  RemindersScreen, ProfileScreen, CalculatorScreen, NotesScreen
- **title3 (20pt):**  AppLibraryScreen, CalculatorScreen, MailScreen, SpotlightSearchScreen

Todas estas telas exibem uma **melhoria imperceptível mas mensurável** na legibilidade — o texto fica visualmente mais alinhado com o iOS original.

---

## Verificação

- ✅ Red step: teste falha com `letterSpacing: 0.35 | 0.38` (antes do fix)
- ✅ Green step: teste passa com `letterSpacing: -0.26 | -0.45` (depois do fix)
- ✅ Baseline: sem regressão (8 testes pré-existentes, zero novos falhos)
- ✅ Type safety: `tsc --noEmit` limpo
- ✅ Lint: `npm run lint` sem erros novos
