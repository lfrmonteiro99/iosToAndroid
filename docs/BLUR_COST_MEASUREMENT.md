# Custo real do blur no Android — medição (#507)

> Sub-issue de #470. Filho de #470 (epic). Origem: auditoria de 2026-08-21 contra
> `ESPECIFICACAO.md` §5 / §7. Verificado contra `main` (1.14.14).
>
> **Resultado: NÃO CONCLUSIVO (por incapacidade de medição no ambiente de agente).**
> Justificado numericamente onde possível; o que falta medir está listado no fim.
> **Zero alterações de comportamento** neste PR — este documento é a entrega.

## 1. Porque não há números

Os critérios de aceitação exigem frame time, frames perdidos, memória em repouso
e em pico, e curva de custo por número de superfícies, obtidos via:

```
adb shell dumpsys gfxinfo com.iostoandroid.app framestats
adb shell dumpsys meminfo com.iostoandroid.app
```

Estas métricas **não são produzíveis num ambiente de agente headless e sem
dispositivo**. Verificado no worktree `qa/issue-507` (Linux):

- `which adb` → `comando não encontrado` (sem Android SDK no PATH)
- `ANDROID_HOME` / `ANDROID_SDK_ROOT` → vazios
- `which emulator` → ausente
- `~/Android` → inexistente
- Não há APK pré-construído (`android/`/`ios/` são gerados pelo `expo prebuild`;
  não existem neste worktree), logo não há app para `adb shell` inspecionar.
- `grep` por `adb|dumpsys|gfxinfo|meminfo|benchmark` em todo o repo → 0 scripts
  de medição existentes.

Isto é consistente com a restrição do pipeline: **não há CI em PRs, nem dispositivo
físico ligado a este agente**. Uma execução `adb` real exigiria (1) Android SDK
instalado, (2) `expo prebuild` + `assembleRelease`/`build` para gerar o APK,
(3) um dispositivo ou emulador Android com `com.iostoandroid.app` instalado e em
execução, e (4) interação manual nos ecrãs. Nenhuma dessas condições existe aqui.

O issue antecipa este caso: «Um resultado 'não conclusivo' é resultado válido e
deve ser reportado como tal. O que não é aceitável é uma recomendação sem números.»
Reporto, portanto, o não-conclusivo com o inventário verificável e o protocolo
exacto para fechá-lo — não fabrico números.

## 2. Inventário verificado do código (o que SE pode afirmar hoje)

### 2.1 Superfícies de blur
- **26** call sites de produção usam `<GlassSurface>` (contagem por grep de
  `<GlassSurface` em `src`, excluindo o ficheiro de teste).
- **Todos** os 26 passam por `src/components/GlassSurface.tsx` — é o único módulo
  que importa `expo-blur` (`import { BlurView, BlurTint } from 'expo-blur';`).
- `GlassSurface` aplica **sempre** `experimentalBlurMethod="dimezisBlurView"`
  (linha 31). O issue diz «26 de 27 com `dimezisBlurView`»; o 27.º não é um
  `GlassSurface` — é o `<BlurView>` nativo dentro do `jest.setup.js` mock
  (`jest.mock('expo-blur', ...)`), que só existe em testes. Na árvore de
  produção, os 26 reais são 100% `dimezisBlurView`.
- Distribuição dos 26 por ficheiro (grep `<GlassSurface`):

  | Ficheiro | # |
  |---|---|
  | `src/components/AssistiveTouch.tsx` | 2 |
  | `src/components/CupertinoActionSheet.tsx` | 1 |
  | `src/screens/ControlCenterScreen.tsx` | 3 |
  | `src/screens/MultitaskScreen.tsx` | 1 |
  | `src/screens/LauncherHomeScreen.tsx` | 2 |
  | `src/screens/TodayViewScreen.tsx` | 3 |
  | `src/screens/PhoneScreen.tsx` | 1 |
  | `src/components/NotificationBanner.tsx` | 1 |
  | `src/screens/ConversationScreen.tsx` | 1 |
  | `src/screens/OnboardingScreen.tsx` | 2 |
  | `src/screens/LockScreen.tsx` | 4 |
  | `src/components/CupertinoTabBar.tsx` | 1 |
  | `src/components/CupertinoShareSheet.tsx` | 1 |
  | `src/components/CupertinoNavigationBar.tsx` | 2 |
  | `src/screens/NotificationCenterScreen.tsx` | 1 |

### 2.2 O interruptor A/B já existe (pedido do issue: "Aterrar isso primeiro")
O issue pede para aterrar primeiro o interruptor de "Reduzir Transparência" que
torna a medição A/B trivial. **Esse interruptor já está aterrado** — não é trabalho
deste issue criá-lo:
- `src/store/SettingsStore.tsx:56` — campo `reduceTransparency: boolean;`
- `src/store/SettingsStore.tsx:113` — default `reduceTransparency: false`
- `src/components/GlassSurface.tsx:25-28` — quando `true`, renderiza um `<View>`
  sólido em vez do `BlurView` (fallback de legibilidade, com tier de opacidade).
- Coberto por testes: `src/components/__tests__/GlassSurface.test.tsx` e
  `src/components/__tests__/CupertinoNavigationBar.test.tsx` (verificam BlurView
  real vs View sólido conforme o setting).

Ou seja: ligar `reduceTransparency` dá instantaneamente o caminho "sem blur" para
A/B, exatamente como o issue descreve. A infraestrutura de medição A/B está pronta;
falta-lhe só o `adb`.

### 2.3 Pior caso conhecido já mitigado
O sub-issue citado de "blur em `.map()`" (Notification Center) já foi resolvido:
`src/screens/__tests__/NotificationCenterScreen.test.tsx` (issue #504) garante que
**zero** `BlurView` reais são montados por cartão de notificação, mesmo com 12
notificações (antes, um `BlurView` por cartão dentro do `.map()` estourava o teto
de §5 de 2 superfícies reais). O `GlassSurface` do Notification Center (1 call site
na tabela acima) é o do scrim raiz, não o do `.map()`.

## 3. Protocolo de medição (para quem tiver dispositivo)

Copiar para um post do PR ou para um CI futuro. `PACKAGE=com.iostoandroid.app`.

```bash
# Pré-requisitos: Android SDK + emulador/dispositivo com a app instalada e em foreground
export PACKAGE=com.iostoandroid.app
export ANDROID_SERIAL=<device-or-emulator>

# 0) A/B: ligar/desligar o blur via o setting já existente
#    (SettingsStore.reduceTransparency) — UI Accessibility ou AsyncStorage.

# 1) Frame stats (correr por cada um dos 3 ecrãs: Notification Center,
#    Control Center [ControlCenterScreen], Launcher Home + overlay de pasta)
adb shell dumpsys gfxinfo $PACKAGE framestats --reset
#    ... interagir ~10s no ecrã alvo ...
adb shell dumpsys gfxinfo $PACKAGE framestats > framestats_<ecra>_<blur|nobler>.txt

# 2) Memória
adb shell dumpsys meminfo $PACKAGE > meminfo_<ecra>_<blur|nobler>.txt

# 3) Curva por nº de superfícies (1,2,4,10): scaffolding de teste com N GlassSurface
#    no mesmo ecrã, repetir (1) e (2).

# 4) Dois dispositivos de gamas diferentes para validar "inconsistente entre fabricantes".
```

**Alvo §7:** memória < 180 MB. **Teto §5:** ≤ 2 superfícies de blur em runtime.
(Nota: o teto de §5 de "2 superfícies" é sobreposto pela contagem real de 26 —
esse conflito pertence ao epic #470, não a este issue de medição.)

## 4. Recomendação provisória (NÃO CONCLUSIVO)

Sem dados de `dumpsys`, **não se pode recomendar (a), (b) nem (c)**. O que o
código permite afirmar hoje:

- A arquitetura já isola o blur num único ponto (`GlassSurface`), e o fallback por
  `reduceTransparency` já existe e está testado → a opção **(b)** ("fallback sólido
  por omissão, blur como opção") é a mais barata de adotar *se* os números um dia
  a justificarem, porque o interruptor já está pronto. Mas isso continua a exigir
  os números para ser decidido.
- **Não se deve** (c) "remover o blur real" agora: seria fé, não engenharia — exato
  o que este issue foi criado para evitar.

**Decisão registada:** permanece o *status quo* (blur `dimezisBlurView` mantido,
com fallback via `reduceTransparency` já disponível para dispositivos fracos).
Isto é consistente com "zero alterações de comportamento neste PR".

## 5. O que falta medir (para fechar como conclusivo)

1. Frame time + frames perdidos (com/sem blur) em Notification Center, Control
   Center e Launcher Home+overlay — via `dumpsys gfxinfo framestats`.
2. Memória em repouso e em pico vs alvo 180 MB — via `dumpsys meminfo`.
3. Curva de custo para 1/2/4/10 `GlassSurface` no mesmo ecrã.
4. Pelo menos dois dispositivos de gamas diferentes (validar "inconsistente entre
   fabricantes"); se só um, declarar como limitação.
5. `expo prebuild` + build de release para gerar o APK testável.

Até (1)-(4) serem produzidos num ambiente com dispositivo, este issue fica
"não conclusivo" e a recomendação é manter o atual com o fallback já existente.
