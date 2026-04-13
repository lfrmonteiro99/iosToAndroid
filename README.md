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
│   ├── hooks/                      # e.g. useScaledFontSize
│   ├── utils/                      # contacts, haptics, wallpapers
│   └── __mocks__/                  # Test mocks
├── docs/                           # Gap analyses, background actions plan, delegation audit
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

---

## Contributing

1. Branch from `main`.
2. `npm run lint` and `npm test` must pass.
3. Label the PR (or linked issue) with `feature` / `enhancement` for a minor bump, or `breaking` / `major` for a major bump; otherwise release automation defaults to a patch.
4. Keep the native module surface (`modules/launcher-module/src/index.ts`) in sync with the Kotlin implementation.

See `docs/` for ongoing gap analyses and the background‑actions plan.

---

## License

Private project. All rights reserved unless a license file is added.
