# iosToAndroid

An iOS‑style launcher and system replica for Android, built with **React Native (Expo)** and a custom native **Kotlin** module. It replaces the Android home screen with a Cupertino UI — Lock Screen, Home Screen, Spotlight, Control Center, Notification Center, and a suite of Apple‑style stock apps (Phone, Messages, Contacts, Photos, Camera, Clock, Calendar, Weather, Maps, Notes, Reminders, Calculator, Mail, Settings, …).

> Current version: see `app.json` / `package.json`.
> Package id: `com.iostoandroid.app`

---

## Features

- **Installable as the default Android launcher** — a config plugin adds the `CATEGORY_HOME` / `CATEGORY_DEFAULT` intent filters to `MainActivity` (`plugins/withLauncherIntent.js`).
- **Cupertino design system** — 19+ reusable components in `src/components/` (buttons, action sheets, alert dialogs, pickers, segmented controls, sliders, switches, skeletons, swipeable rows, tab bar, nav bar, etc.).
- **iOS‑style flows** — onboarding, lock screen with biometric unlock, Today View, Spotlight search, Multitask switcher, iOS‑style notification banner overlay.
- **30+ screens** replicating stock iOS apps plus Android launcher essentials (app library, folders, home pages).
- **Native Android bridge (`modules/launcher-module`)** — a custom Expo module written in Kotlin exposing system capabilities that aren't available through standard Expo APIs:
  - Apps: list / launch / icon / uninstall / default‑launcher check
  - Wi‑Fi, Bluetooth (+ discovery, pair/unpair), Network, Carrier info
  - Storage + per‑app storage stats
  - SMS (read / send), Call log, dialer
  - Notifications listener (read active notifications)
  - Calendar events
  - Flashlight, Volume, Screen brightness
  - System settings panels, Now Playing, Screen Time
- **Theme** — light / dark with `ThemeProvider` and a central `CupertinoTheme`.
- **State** — seven React Context stores: `SettingsStore`, `ContactsStore`, `ProfileStore`, `AppsStore`, `DeviceStore`, `FoldersStore`, and theme.
- **Persistence** — `@react-native-async-storage/async-storage` (v3 KMP build wired via `plugins/withAsyncStorageRepo.js`) and `expo-secure-store`.
- **Immersive mode** — hides the Android status and navigation bars edge‑to‑edge.
- **Tests** — Jest + `@testing-library/react-native` with comprehensive mocks (`jest.setup.js`).
- **CI/CD** — GitHub Actions build release APKs and auto‑publish GitHub Releases with semver bumping driven by PR/issue labels.

---

## Tech stack

| Area            | Stack                                                                     |
|-----------------|---------------------------------------------------------------------------|
| Framework       | Expo SDK 54, React Native 0.81, React 19                                  |
| Language        | TypeScript 5.9                                                            |
| Navigation      | `@react-navigation/native` + bottom‑tabs + native‑stack (v7)              |
| Native module   | Expo Modules API, Kotlin (Android)                                        |
| Animations      | `react-native-reanimated` v4, `react-native-gesture-handler`              |
| Storage         | AsyncStorage v3 (KMP), SecureStore                                        |
| Tooling         | ESLint 8, Prettier 3, Jest 29, jest‑expo                                  |

Key Expo modules in use: `expo-battery`, `expo-blur`, `expo-brightness`, `expo-camera`, `expo-clipboard`, `expo-contacts`, `expo-haptics`, `expo-image-picker`, `expo-linear-gradient`, `expo-linking`, `expo-local-authentication`, `expo-media-library`, `expo-navigation-bar`, `expo-network`, `expo-notifications`, `expo-secure-store`, `expo-sharing`, `expo-status-bar`.

---

## Project structure

```
.
├── App.tsx                         # App root: providers, lock/onboarding gate, banners
├── app.json                        # Expo config (permissions, plugins, android package)
├── index.ts                        # Entry point
├── assets/                         # Icons, splash, favicon
├── plugins/
│   ├── withLauncherIntent.js       # Adds HOME intent filter to AndroidManifest
│   └── withAsyncStorageRepo.js     # Wires AsyncStorage KMP maven repo
├── modules/launcher-module/        # Native Expo module (Kotlin + TS typings)
│   ├── android/                    # Kotlin source + build.gradle
│   ├── src/index.ts                # JS/TS bridge + type definitions
│   └── expo-module.config.json
├── src/
│   ├── components/                 # Cupertino* components, ErrorBoundary, AlertProvider, NotificationBanner
│   ├── screens/                    # All screens (+ contacts/, profile/, settings/ subfolders)
│   ├── navigation/                 # TabNavigator + route typings
│   ├── store/                      # React Context stores
│   ├── theme/                      # ThemeContext + CupertinoTheme
│   ├── hooks/                      # custom React hooks
│   ├── utils/                      # contacts, haptics, wallpapers
│   └── __mocks__/                  # Test mocks
├── docs/                           # Background actions plan; archived gap analyses and delegation audit
├── .github/workflows/              # build-apk.yml, auto-release.yml
├── jest.config.js / jest.setup.js
├── tsconfig.json / babel.config.js
├── .eslintrc.js / .prettierrc
```

---

## Getting started

### Prerequisites

- Node.js **22**
- npm (a `package-lock.json` is committed — prefer `npm ci`)
- For Android native builds: JDK **17**, Android SDK, and a physical device or emulator

### Install

```bash
npm ci
```

### Run

```bash
npm run android      # expo run:android  — builds and installs the dev APK
npm run ios          # expo run:ios      — iOS is not a target, but Expo start works
npm run start        # expo start        — Metro bundler
```

> The app uses several native Android permissions (SMS, call log, contacts, camera, location, Wi‑Fi, Bluetooth, notifications, calendar) — see `app.json`. Many features require a real device: the launcher intent filter, SMS, call log, installed apps, notification listener, and flashlight are Android‑only and cannot be exercised under Expo Go — use `expo run:android` (a custom dev client / prebuild).

### Scripts

| Script             | What it does                                      |
|--------------------|---------------------------------------------------|
| `npm run start`    | Start Metro / Expo dev server                     |
| `npm run android`  | Build & install on a connected Android device/emu |
| `npm run ios`      | Build & install on an iOS simulator               |
| `npm run web`      | Start Expo for web (limited functionality)        |
| `npm run lint`     | ESLint over `.ts` / `.tsx`                        |
| `npm run lint:fix` | ESLint with `--fix`                               |
| `npm run format`   | Prettier over `src/` and `App.tsx`                |
| `npm test`         | Jest (jest‑expo preset)                           |

---

## Using the app as a launcher

After installing:

1. Open Android **Settings → Apps → Default apps → Home app**, or long‑press Home and choose **Change launcher**.
2. Select **iosToAndroid**.
3. Grant the optional permissions the app requests for fuller functionality (SMS, call log, contacts, notification listener, etc.). The in‑app Onboarding and Settings screens walk you through this.

The lock screen is shown on cold start and whenever the app goes to the background; Face ID / fingerprint unlock is handled via `expo-local-authentication`.

---

## CI/CD

- **`build-apk.yml`** — on every GitHub Release (or manual dispatch): lints, type‑checks, runs `expo prebuild --platform android`, builds a release APK via Gradle, uploads it as an artifact and attaches it to the Release.
- **`auto-release.yml`** — when a PR is merged into `main`, infers a semver bump from PR/issue labels (`major|breaking` → major, `enhancement|feature|minor` → minor, everything else → patch), updates `app.json` and `package.json`, tags, and publishes a GitHub Release whose notes link the PR and closed issues.
- **`build-dev-apk.yml`** — on every push to `dev`: builds a release‑config APK and keeps it as a workflow artifact for 30 days. No tag, no Release.

### APK build times

`./gradlew assembleRelease` is ~94% of those jobs, so the three build workflows trim it:

| Lever | Where | Effect |
|-------|-------|--------|
| `-PreactNativeArchitectures` | workflow `gradlew` call | drops the `x86`/`x86_64` emulator ABIs (~⅓ of the CMake work). Released APKs are `arm64-v8a,armeabi-v7a`; dev APKs are `arm64-v8a` only, so **a dev APK will not install on an x86 emulator** |
| `org.gradle.caching` + `gradle/actions/setup-gradle` | `plugins/withFastReleaseBuilds.js`, workflows | reuses Kotlin/Java/jar task outputs across runs. CMake output is not Gradle‑cacheable, so the C++ work is not covered |
| `lintVital*` tasks disabled | `plugins/withFastReleaseBuilds.js` | skips AGP's per‑module release lint; JS/TS is still linted by eslint + tsc. Disabling the tasks rather than setting `checkReleaseBuilds` — AGP has already read that flag by the time a plugin callback runs |

Local `npm run android` is untouched by the ABI flag — it still builds all four ABIs from `gradle.properties`.

---

## Team orchestrator (`scripts/team/`)

Long-running pipeline that works GitHub issues labelled `qa:*` into PRs, driven by `orchestrator.sh` inside tmux (`start.sh`). Roles: PLAN/DESIGN and final review on Anthropic, implementation and overflow on whichever pool has quota.

### Provider pools

| Pool | Auth | Role in the ladder | Notes |
|------|------|--------------------|-------|
| **Claude** (Anthropic subscription) | OAuth login (`claude /login`) | primary rung | nothing to configure |
| **Alibaba** (Bailian Token Plan) | `ALIBABA_API_KEY` (`sk-sp-…` prefix) | overflow rung + dedicated slots | Anthropic-compatible endpoint |
| **Ollama Cloud** | its own config | last-resort fallback | unchanged |
| **hermes** | own binary | peer engine (opt-in) | unchanged |

The dispatch ladder in `run-agent.sh`, top to bottom:

```
hermes   (AGENT_ENGINE=hermes → runs alone, exits inline — a peer, not a rung)
claude   (subscription OAuth — no env overrides)
alibaba  (RUNG: only reached when the claude rung was skipped or came up empty)
guards   (exit 77: nothing configured/available that could run)
ollama   (fallback of last resort)
```

Requirement the ladder is built around: **the pipeline keeps working when any single provider is out of quota.** Each rung that exhausts writes a cooldown file and falls through; a run that exhausts on every rung exits 77 (deliberately-did-not-run) instead of consuming the issue's attempt budget.

### Alibaba pool setup

1. Put the key in `~/.config/ios2android-team/env`:
   ```bash
   ALIBABA_API_KEY=sk-sp-…
   ```
   Only keys with the `sk-sp-` prefix are accepted — a normal pay-as-you-go `sk-` key hits a different endpoint shape and its 401s would not match the exhaustion detector, escaping as task failures instead of cooldowns.
2. Optional overrides (env, via `start.sh`, or in the same credentials file — the file is read at source time, so a key change needs no restart of anything but the orchestrator): `TEAM_ALIBABA_BASE_URL` (default: the Beijing Anthropic-compatible Token Plan endpoint; this machine's key is proven against `ap-southeast-1`, and that override lives next to the key), `TEAM_ALIBABA_MODEL_LOW/MED/STRONG` (default tiers `qwen3.6-flash` / `qwen3.7-plus` / `qwen3.8-max`), `TEAM_ALIBABA_COOLDOWN_H` (quota-window cooldown, default 6h), `TEAM_ALIBABA_RATE_COOLDOWN_M` (rate-limit cooldown, default 2min), `TEAM_USE_ALIBABA=0` to switch the pool off.
3. Dedicated implementation slots: include `alibaba` in `TEAM_IMPL_ENGINES` (e.g. `claude,claude,alibaba`). A peer alibaba slot does **not** fall through to claude — pool exhausted → exit 77, so quota separation holds.

> **⚠ Terms-of-service warning.** The personal Token Plan prohibits automated/batch/background calling; a non-stop orchestrator qualifies, and the penalty is suspension or ban of the key. The risk exists whenever this pipeline runs against a personal Token Plan key. Compliant alternatives: a pay-as-you-go `sk-` key (different base URL, outside this pool's prefix check) or an org/Team plan. Decide with eyes open.

> **⚠ Same-key warning.** If the `sk-sp-` key in `~/.config/ios2android-team/env` is the same key already used elsewhere on the machine, the claude rung and the alibaba rung draw on the same quota pool — you get explicit routing and dedicated cooldowns, but no real quota separation. Real separation requires a distinct key.

Other facts worth knowing:

- **Concurrency cap**: Standard Token Plan ≈ 3–4 concurrent agents. Count alibaba implementation slots + reviewers (`TEAM_REVIEW_ALIBABA=1`) + the curator (it dispatches without `AGENT_ENGINE`, so it walks the whole ladder). Keep alibaba entries in the roster at ~3 max.
- **`AGENT_FORCE_ALIBABA=1`**: mirrors `AGENT_FORCE_FALLBACK` — skips the claude rung and forces the alibaba rung. The only way to A/B the pool without removing the claude login.
- **Env-precedence gotcha (P0, verified 2026-08-23)**: a `settings.json` `env` block beats per-process env. Any `ANTHROPIC_BASE_URL`/`ANTHROPIC_AUTH_TOKEN` left in `~/.claude/settings.json` silently routes *every* claude process — including the subscription rung — to that endpoint. Keep the block absent (or PATH-only); the alibaba rung injects its env per invocation via `env VAR=… claude`, never `export`.
- **Client retry behaviour**: the Claude CLI retries aggressively (~7 attempts in ~20s) and hangs silently against a dead endpoint until its timeout. Exhaustion surfaces as the documented `429 Allocated quota exceeded` / `429 Requests rate limit exceeded`, both already matched by the detector.
- **Nocturnal discount** (22:00–08:00, `qwen3.8-max`): time-limited vendor pricing. Not encoded in the pipeline by design — do not build scheduling logic around it.

---

## Contributing

1. Branch from `main`.
2. `npm run lint` and `npm test` must pass.
3. Label the PR (or linked issue) with `feature` / `enhancement` for a minor bump, or `breaking` / `major` for a major bump; otherwise release automation defaults to a patch.
4. Keep the native module surface (`modules/launcher-module/src/index.ts`) in sync with the Kotlin implementation.

See `docs/` for the background‑actions plan. Active work is tracked in **#352** (GitHub Issues); the gap analysis and delegation audit files in `docs/` are historical archives.

---

## License

Private project. All rights reserved unless a license file is added.
