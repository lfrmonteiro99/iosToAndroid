# Gap Issues Index — 2026-04-18

Cross-reference between the gaps documented in `GAP_ANALYSIS_V2.md` (plus additional gaps discovered during this audit) and the GitHub issues tracking them. Issues created on 2026-04-18 are #135–#179.

## Critical

| # | Issue | Summary |
|---|-------|---------|
| 1 | [#137](https://github.com/lfrmonteiro99/iosToAndroid/issues/137) | 47 native-bridge `console.warn` calls stripped in production — make errors visible |
| 2 | [#135](https://github.com/lfrmonteiro99/iosToAndroid/issues/135) | MailScreen ships with hardcoded DEMO_EMAILS |
| 3 | [#136](https://github.com/lfrmonteiro99/iosToAndroid/issues/136) | MapsScreen has no real map — integrate react-native-maps + expo-location |
| 4 | #95 (existing) | CallScreen is entirely fake |
| 5 | #96 (existing) | Music controls in ControlCenter are non-functional |

## High

| # | Issue | Summary |
|---|-------|---------|
| 6 | [#138](https://github.com/lfrmonteiro99/iosToAndroid/issues/138) | VpnScreen must clarify it is a system-settings shortcut |
| 7 | [#139](https://github.com/lfrmonteiro99/iosToAndroid/issues/139) | Notification banner polls every 10 s — migrate to event-driven |
| 8 | [#140](https://github.com/lfrmonteiro99/iosToAndroid/issues/140) | EditProfileScreen accepts invalid emails |
| 9 | [#141](https://github.com/lfrmonteiro99/iosToAndroid/issues/141) | LockScreen PIN has no rate limiting |
| 10 | [#142](https://github.com/lfrmonteiro99/iosToAndroid/issues/142) | AppsStore uses Alert.alert instead of Cupertino |
| 11 | #127 (existing) | Fake software update |
| 12 | #126 (existing) | Clipboard-only backup |

## Medium

| # | Issue | Summary |
|---|-------|---------|
| 13 | [#143](https://github.com/lfrmonteiro99/iosToAndroid/issues/143) | Missing Android permissions in app.json |
| 14 | [#144](https://github.com/lfrmonteiro99/iosToAndroid/issues/144) | 37 screens use `navigation: any` |
| 15 | [#145](https://github.com/lfrmonteiro99/iosToAndroid/issues/145) | ContactEditScreen accepts empty name + invalid phone |
| 16 | [#146](https://github.com/lfrmonteiro99/iosToAndroid/issues/146) | RemindersScreen doesn't schedule notifications |
| 17 | [#147](https://github.com/lfrmonteiro99/iosToAndroid/issues/147) | WifiScreen: in-app connect flow |
| 18 | [#148](https://github.com/lfrmonteiro99/iosToAndroid/issues/148) | BluetoothScreen: in-app discovery + pair |
| 19 | [#149](https://github.com/lfrmonteiro99/iosToAndroid/issues/149) | Night Shift overlay (in-app) |
| 20 | [#157](https://github.com/lfrmonteiro99/iosToAndroid/issues/157) | StorageScreen "Manage Storage" delegation |
| 21 | [#158](https://github.com/lfrmonteiro99/iosToAndroid/issues/158) | Keyboard in-app preferences |
| 22 | [#159](https://github.com/lfrmonteiro99/iosToAndroid/issues/159) | DateTimeScreen display-timezone override |
| 23 | [#160](https://github.com/lfrmonteiro99/iosToAndroid/issues/160) | In-app accessibility features |
| 24 | [#161](https://github.com/lfrmonteiro99/iosToAndroid/issues/161) | PrivacyScreen: request permissions in-app |
| 25 | [#162](https://github.com/lfrmonteiro99/iosToAndroid/issues/162) | CellularScreen: separate info from delegated rows |

## Low

| # | Issue | Summary |
|---|-------|---------|
| 26 | [#150](https://github.com/lfrmonteiro99/iosToAndroid/issues/150) | Notes debounced auto-save |
| 27 | [#151](https://github.com/lfrmonteiro99/iosToAndroid/issues/151) | Weather widget error state |
| 28 | [#152](https://github.com/lfrmonteiro99/iosToAndroid/issues/152) | CallScreen 1.5 s timer — use telephony state |
| 29 | [#153](https://github.com/lfrmonteiro99/iosToAndroid/issues/153) | LockScreen biometric failure feedback |
| 30 | [#154](https://github.com/lfrmonteiro99/iosToAndroid/issues/154) | Long-press quick actions on home icons |
| 31 | [#155](https://github.com/lfrmonteiro99/iosToAndroid/issues/155) | Skeleton/shimmer loading states |
| 32 | [#156](https://github.com/lfrmonteiro99/iosToAndroid/issues/156) | Haptic feedback audit + helper |
| 33 | [#163](https://github.com/lfrmonteiro99/iosToAndroid/issues/163) | Spotlight: notes / reminders / events / web |
| 34 | [#164](https://github.com/lfrmonteiro99/iosToAndroid/issues/164) | Conversation attachment picker |
| 35 | [#165](https://github.com/lfrmonteiro99/iosToAndroid/issues/165) | Calculator parentheses parser |
| 36 | [#166](https://github.com/lfrmonteiro99/iosToAndroid/issues/166) | NotificationCenter inline reply |
| 37 | [#167](https://github.com/lfrmonteiro99/iosToAndroid/issues/167) | Nearby Share tile in ControlCenter |
| 38 | [#168](https://github.com/lfrmonteiro99/iosToAndroid/issues/168) | TodayView drag-to-reorder widgets |
| 39 | [#169](https://github.com/lfrmonteiro99/iosToAndroid/issues/169) | Photos Memories collections |
| 40 | [#170](https://github.com/lfrmonteiro99/iosToAndroid/issues/170) | Calendar edit + delete + recurrence |
| 41 | [#171](https://github.com/lfrmonteiro99/iosToAndroid/issues/171) | Paginated home-screen grid |
| 42 | [#172](https://github.com/lfrmonteiro99/iosToAndroid/issues/172) | Tests for 9 critical untested screens |
| 43 | [#173](https://github.com/lfrmonteiro99/iosToAndroid/issues/173) | AppLibrary search bar |
| 44 | [#174](https://github.com/lfrmonteiro99/iosToAndroid/issues/174) | Multitask killBackgroundProcesses + honesty |
| 45 | [#175](https://github.com/lfrmonteiro99/iosToAndroid/issues/175) | Cupertino Share Sheet |
| 46 | [#176](https://github.com/lfrmonteiro99/iosToAndroid/issues/176) | LockScreen notification gestures |
| 47 | [#177](https://github.com/lfrmonteiro99/iosToAndroid/issues/177) | In-app language picker (i18n) |
| 48 | [#178](https://github.com/lfrmonteiro99/iosToAndroid/issues/178) | Real ringtone picker + preview |
| 49 | [#179](https://github.com/lfrmonteiro99/iosToAndroid/issues/179) | Focus modes wired to DND policy |

## Notes

- All issues contain file + line references, concrete code snippets, acceptance criteria, and complexity estimates so they can be handed to Sonnet for implementation without further research.
- Issues are tagged with `bug`, `enhancement`, `critical`, `security`, `performance`, `tech-debt`, `typescript`, `accessibility`, `ux`, `testing` as appropriate.
- Existing issues that already cover a gap (e.g. #95, #96, #126, #127) are referenced rather than duplicated.
