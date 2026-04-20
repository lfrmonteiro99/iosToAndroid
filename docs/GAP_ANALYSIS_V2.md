# Gap Analysis V2: iosToAndroid — Audit Completo (v1.8.13)

## Contexto

**iosToAndroid** (v1.8.13) é uma aplicação React Native (Expo) que replica a UI/UX do iOS em dispositivos Android. Possui 61 ecrãs registados, um sistema de design Cupertino (19+ componentes), um módulo nativo Android em Kotlin, e 7 React Context stores. Esta análise atualiza a GAP_ANALYSIS.md original (v1.8.5) com o estado real do código em v1.8.13.

---

## Resumo Executivo: Progresso v1.8.5 → v1.8.13

### Gaps RESOLVIDOS (anteriormente críticos)
| # | Gap | Estado Anterior | Estado Atual |
|---|-----|----------------|--------------|
| 1 | Camera sem preview ao vivo | Placeholder estático | ✅ expo-camera com preview, flip, flash, video |
| 2 | Photos — tabs vazios | Shells sem funcionalidade | ✅ Library, For You, Albums totalmente funcionais |
| 3 | Clock — alarmes hardcoded | 2 alarmes fixos | ✅ Criação de alarmes com expo-notifications, persistência |
| 4 | World Clock — cidades fixas | 5 cidades hardcoded | ✅ Pesquisa de cidades, IANA timezones, DST-aware |
| 5 | SMS deletion não persistida | useState perdido ao recarregar | ✅ Persistência via AsyncStorage |
| 6 | Phone matching inconsistente | 9 vs 10 dígitos | ✅ findContactByPhone() centralizado (10 dígitos) |
| 7 | PIN inseguro (AsyncStorage) | Plain text, default '1234' | ✅ expo-secure-store, sem PIN default |
| 8 | Hotspot password hardcoded | 'password123' | ✅ String vazia por defeito |
| 9 | Weather icons hardcoded | Sempre 'partly-sunny' | ✅ Mapeamento dinâmico de weather codes |
| 10 | Lock screen clock 30s stale | Intervalo não alinhado | ✅ Alinhado a limites de minuto |
| 11 | ErrorBoundary sem tema | Cores hardcoded light | ✅ Theme-aware (light/dark) |
| 12 | Favorites de contactos não persistidos | Podiam ficar órfãos | ✅ Persistência com cleanup de órfãos |
| 13 | ScreenTime sem dados reais | Apenas toggles | ✅ Dados reais via isUsageAccessGranted() |
| 14 | Cellular "Not Available" | Info hardcoded | ✅ Carrier/network info real |
| 15 | Notes — placeholder | Ecrã vazio | ✅ App completa com CRUD, auto-save, pesquisa |
| 16 | Reminders — placeholder | Ecrã vazio | ✅ App completa com listas, flags, datas |
| 17 | Calendar — read-only | Sem criação de eventos | ✅ Modal de criação de eventos implementado |

### Gaps AINDA ABERTOS
17 gaps resolvidos, **13 gaps permanecem** (4 críticos, 4 médios, 5 baixos) + **6 novos** gaps identificados.

---

## CRÍTICO: Funcionalidades Não Funcionais

### 1. ControlCenter — Media Controls Não Verificados (CRÍTICO)
- **Ficheiro**: `src/screens/ControlCenterScreen.tsx:410-447`
- **Problema**: Os botões mediaPrev(), mediaPlayPause(), mediaNext() são chamados mas **NÃO estão definidos na interface `LauncherModuleType`** em `modules/launcher-module/src/index.ts`. O código usa `(mod as any)` com optional chaining — falham silenciosamente sem feedback ao utilizador.
- **Impacto**: Controlos de música no Control Center não funcionam. Utilizador toca nos botões sem efeito.
- **Fix**: Adicionar métodos à interface TypeScript e verificar implementação no LauncherModule.kt, ou remover os controlos.

### 2. MailScreen — Emails Demo Hardcoded (CRÍTICO)
- **Ficheiro**: `src/screens/MailScreen.tsx:41-50`
- **Problema**: Array `DEMO_EMAILS` com emails falsos de "Tim Cook", "App Store", "GitHub", "Netflix". Não há integração IMAP/SMTP. Utilizador vê sempre os mesmos emails demo.
- **Impacto**: App de Mail é uma fachada — não funciona como email real.
- **Fix**: Integrar com API de email, ou redesignar como launcher para apps de email instaladas.

### 3. MapsScreen — Sem Mapa Real (CRÍTICO)
- **Ficheiro**: `src/screens/MapsScreen.tsx`
- **Problema**: Não existe vista de mapa. Apenas lista de "localizações recentes" com botões que abrem Google Maps via `Linking.openURL('geo:...')`. Localização fixa como "Location unavailable" — sem geolocalização.
- **Impacto**: App de Maps é um placeholder sem mapa renderizado.
- **Fix**: Integrar `react-native-maps` ou `expo-map-view` com `expo-location`.

### 4. CallScreen — UI Cosmética (MÉDIO-ALTO)
- **Ficheiro**: `src/screens/CallScreen.tsx:118-127`
- **Problema**: Ao montar, `makeCall()` abre o dialer Android, depois sai do ecrã após 1.5s. Botões Mute/Speaker/Hold são apenas visuais — não controlam o áudio da chamada real. Comentário no código: "native Android dialer handles actual call audio routing".
- **Impacto**: Utilizador vê UI de chamada que não corresponde à chamada real.
- **Fix**: Documentar como launcher para dialer, ou integrar com Android Telecom API.

---

## ALTO: Funcionalidade Incompleta

### 5. Silent Error Handling no Native Bridge (ALTO)
- **Ficheiro**: `modules/launcher-module/src/index.ts:189-312`
- **Problema**: **42 chamadas nativas** envolvidas em try-catch com `console.warn()`. O plugin `transform-remove-console` em `babel.config.js:7` remove TODOS os console.warn em produção.
- **Resultado**: Falhas em produção são **completamente invisíveis** — WiFi vazio, carrier "Unknown", apps em falta, calendário sem eventos — sem nenhuma indicação de erro ao utilizador.
- **Fix**: Substituir console.warn por sistema de error reporting (toast notifications, Sentry, ou `onBridgeError()` listener).

### 6. VPN Toggle Cosmético (ALTO)
- **Ficheiro**: `src/screens/settings/VpnScreen.tsx:49-56`
- **Problema**: Toggle muda estado visual mas não cria/gere nenhuma conexão VPN. "Add VPN Configuration" abre Android settings via `openSystemPanel('vpn')`.
- **Risco de Segurança**: Utilizador pode acreditar que VPN está ativa quando não está.
- **Fix**: Remover toggle ou mostrar aviso claro de que é apenas um atalho para as definições Android.

### 7. SoftwareUpdateScreen — Sempre "Up to Date" (ALTO)
- **Ficheiro**: `src/screens/settings/SoftwareUpdateScreen.tsx`
- **Problema**: Mostra sempre "Your software is up to date". Lê versão do app.json mas não verifica updates reais. "Last checked" mostra hora atual — timestamp falso.
- **Fix**: Integrar com Expo Updates, ou mostrar versão atual sem a falsa verificação.

### 8. BackupRestoreScreen — Apenas Clipboard (MÉDIO)
- **Ficheiro**: `src/screens/settings/BackupRestoreScreen.tsx:37-56`
- **Problema**: Export copia JSON para clipboard. Import requer colar JSON manualmente. Sem integração cloud (Google Drive/iCloud).
- **Risco de Segurança**: Estado completo da app exportado como texto simples para clipboard (acessível a qualquer app).
- **Fix**: Integrar com Google Drive API, ou usar expo-file-system para export/import de ficheiros.

---

## MÉDIO: Settings que Delegam para Android

Estes ecrãs mostram UI estilo iOS mas abrem painéis nativos Android para qualquer ação real, quebrando a imersão:

| Ecrã | Ficheiro | O que Funciona | O que Delega |
|------|----------|----------------|--------------|
| WiFi | `settings/WifiScreen.tsx` | Scan real, rede atual, RSSI | Conexão a novas redes |
| Bluetooth | `settings/BluetoothScreen.tsx` | Dispositivos paired, toggle | Pairing de dispositivos |
| Cellular | `settings/CellularScreen.tsx` | Info carrier/network real | Data roaming, SIM PIN |
| Accessibility | `settings/AccessibilityScreen.tsx` | Bold Text, Reduce Motion (in-app) | VoiceOver, Zoom, Touch Controls |
| Privacy | `settings/PrivacyScreen.tsx` | Status real das permissões | Gestão de permissões |
| Date & Time | `settings/DateTimeScreen.tsx` | Leitura de timezone | Timezone change, calendar format |
| Storage | `settings/StorageScreen.tsx` | Info armazenamento real, top apps | "Manage Storage" |
| Display | `settings/DisplayBrightnessScreen.tsx` | Brightness slider | Night Shift |

**Nota**: WiFi, Bluetooth, Cellular e Storage agora mostram **dados reais** do dispositivo (melhoria desde v1.8.5). A delegação é para ações de escrita, não leitura.

---

## NOVO: Gaps Descobertos Nesta Auditoria (Não em v1.8.5)

### N1. Permissões Android em Falta no app.json
- **Ficheiro**: `app.json`
- **Em falta**:
  - `READ_PHONE_NUMBERS` — necessário para o PhoneScreen
  - `ACCESS_NETWORK_STATE` — necessário para status de rede fiável
  - `ACCESS_COARSE_LOCATION` — apenas FINE_LOCATION está declarado
  - Permissão de Bluetooth scanning não explícita
- **Fix**: Adicionar permissões em falta ao array de permissions.

### N2. Notification Polling — Resolvido com event-driven listener
- **Ficheiro**: `App.tsx`, `NotificationService.kt`, `modules/launcher-module/src/index.ts`
- **Problema**: Notificações eram verificadas a cada 30s via polling. Causava latência e consumo desnecessário de bateria.
- **Fix**: `NotificationService` agora emite eventos `onNotificationPosted`/`onNotificationRemoved` via `RCTDeviceEventEmitter`. `App.tsx` subscreve via `addNotificationListener()` (event-driven listener, was 30s polling). Lista inicial hidratada com `getNotifications()` para evitar banners duplicados.

### N3. ScreenTime Widget no TodayView é Placeholder
- **Ficheiro**: `src/screens/TodayViewScreen.tsx`
- **Problema**: O widget de Screen Time no Today View mostra dados estáticos, apesar de o ecrã ScreenTimeScreen já ter dados reais.
- **Fix**: Ligar o widget ao mesmo `getScreenTimeStats()` que o ecrã principal usa.

### N4. ProfileScreen — Sem Validação de Email
- **Ficheiro**: `src/screens/EditProfileScreen.tsx`
- **Problema**: Campo de email aceita qualquer texto sem validação de formato.
- **Fix**: Adicionar validação básica de formato de email.

### N5. Alert.alert() vs CupertinoAlertDialog
- **Múltiplos ficheiros**
- **Problema**: Ainda existem utilizações de `Alert.alert()` nativo que mostra UI Android em vez do `CupertinoAlertDialog` personalizado, quebrando a imersão iOS.
- **Fix**: Auditar e substituir Alert.alert() restantes por CupertinoAlertDialog.

### N6. Navigation Type Safety — 14 Ecrãs com `navigation: any`
- **Múltiplos ficheiros**
- **Problema**: 14 ecrãs usam `navigation: any` em vez de tipos próprios do React Navigation.
- **Impacto**: Perda de type safety, possíveis erros em runtime não detetados.
- **Fix**: Usar `NativeStackNavigationProp<RootStackParamList>` em todos os ecrãs.

---

## Cobertura de Testes

### Estado Atual: 18 ficheiros de teste (17.5% dos ecrãs testados)

| Categoria | Com Testes | Sem Testes |
|-----------|-----------|------------|
| **Componentes** (19) | 4 (Button, Card, ProgressBar, Switch) | 15 |
| **Ecrãs Principais** (28) | 10 (Calculator, Contacts, ControlCenter, Home, Lock, Messages, NotificationCenter, Onboarding, Phone, Settings) | 18 |
| **Settings** (20) | 0 | 20 |
| **Stores** (7) | 4 (Contacts, Folders, Profile, Settings) | 3 (Apps, Device, Alert) |

### Ecrãs Críticos Sem Testes
1. **CameraScreen** — complexo com expo-camera
2. **PhotosScreen** — 3 tabs com expo-media-library
3. **ClockScreen** — alarmes com expo-notifications
4. **SpotlightSearchScreen** — fuzzy matching algorithm
5. **LauncherHomeScreen** — ecrã principal com gestos complexos
6. **TodayViewScreen** — widgets dinâmicos
7. **MultitaskScreen** — gestos de swipe
8. **ConversationScreen** — SMS com reações

---

## Análise de Segurança

### Resolvido ✅
- PIN armazenado em expo-secure-store (não AsyncStorage)
- Sem PIN default hardcoded
- Password de hotspot removida
- Migração de legado AsyncStorage → SecureStore implementada

### Ainda em Risco ⚠️
| Risco | Severidade | Ficheiro |
|-------|-----------|----------|
| VPN toggle cosmético — falsa sensação de segurança | ALTO | VpnScreen.tsx |
| Backup exporta estado completo para clipboard | MÉDIO | BackupRestoreScreen.tsx |
| 42 erros silenciosos em produção (console.warn stripped) | ALTO | launcher-module/src/index.ts |
| Sem rate limiting no PIN do LockScreen | BAIXO | LockScreen.tsx |

---

## Tabela Resumo: Estado de Todos os Ecrãs

### Ecrãs Principais
| Ecrã | Estado | Notas |
|------|--------|-------|
| LauncherHomeScreen | ✅ Funcional | Grid, dock, pastas, long-press, jiggle mode, wallpaper |
| LockScreen | ✅ Funcional | PIN seguro, biometria, relógio alinhado |
| ControlCenterScreen | ⚠️ Parcial | Toggles OK, **music controls não funcionam** |
| NotificationCenterScreen | ✅ Funcional | Notificações agrupadas |
| SpotlightSearchScreen | ✅ Funcional | Fuzzy matching, histórico, apps+contactos+settings |
| TodayViewScreen | ✅ Funcional | Widgets reais (exceto ScreenTime) |
| MultitaskScreen | ✅ Funcional | Carousel horizontal, swipe-to-dismiss |
| OnboardingScreen | ✅ Funcional | 6 permissões, resultados |
| AppLibraryScreen | ✅ Funcional | 5 categorias auto-detetadas, apps reais |

### Apps
| Ecrã | Estado | Notas |
|------|--------|-------|
| PhoneScreen | ✅ Funcional | Favoritos, recentes, teclado |
| CallScreen | ⚠️ Cosmético | Abre dialer Android, UI decorativa |
| MessagesScreen | ✅ Funcional | SMS real, eliminação persistida |
| ConversationScreen | ✅ Funcional | Reações, typing indicator |
| ContactsScreen | ✅ Funcional | Pesquisa, favoritos |
| ContactDetailScreen | ✅ Funcional | Chamadas, mensagens, edição |
| ContactEditScreen | ✅ Funcional | Edição de nome/telefone |
| CameraScreen | ✅ Funcional | Preview ao vivo, foto, vídeo, flip, flash |
| PhotosScreen | ✅ Funcional | Library, For You, Albums, partilha |
| CalendarScreen | ✅ Funcional | Grid, eventos, criação |
| ClockScreen | ✅ Funcional | World clocks, alarmes, stopwatch, timer |
| CalculatorScreen | ✅ Funcional | Básico + científico + memória + histórico |
| WeatherScreen | ✅ Funcional | API wttr.in, icons dinâmicos, forecast |
| NotesScreen | ✅ Funcional | CRUD completo, auto-save, pesquisa |
| RemindersScreen | ✅ Funcional | Listas, flags, datas, CRUD |
| MapsScreen | ❌ Placeholder | Sem mapa, apenas lista + Google Maps externo |
| MailScreen | ❌ Demo | Emails falsos hardcoded, sem backend |
| ProfileScreen | ✅ Funcional | Avatar, stats, partilha |
| EditProfileScreen | ⚠️ Parcial | Sem validação de email |

### Settings (20 ecrãs)
| Ecrã | Estado | Notas |
|------|--------|-------|
| GeneralScreen | ✅ Funcional | Nome dispositivo, versão |
| AboutScreen | ✅ Funcional | Legal, versão |
| DisplayBrightnessScreen | ⚠️ Híbrido | Brightness real, Night Shift delega |
| BluetoothScreen | ⚠️ Híbrido | Info real, pairing delega |
| WifiScreen | ⚠️ Híbrido | Scan real, conexão delega |
| CellularScreen | ⚠️ Híbrido | Info carrier real, config delega |
| HotspotScreen | ⚠️ Parcial | Toggle cosmético, password corrigida |
| NotificationsScreen | ✅ Funcional | Preferências de som |
| SoundsHapticsScreen | ✅ Funcional | Settings de áudio |
| FocusScreen | ✅ Funcional | Modos de foco |
| ScreenTimeScreen | ✅ Funcional | Dados reais com permissão |
| StorageScreen | ✅ Funcional | Dados reais, top apps |
| SoftwareUpdateScreen | ❌ Falso | Sempre "up to date", timestamp falso |
| DateTimeScreen | ⚠️ Híbrido | Leitura real, escrita delega |
| KeyboardScreen | ⚠️ Híbrido | Delega para Android |
| LanguageRegionScreen | ⚠️ Parcial | Seleção de idioma |
| VpnScreen | ❌ Cosmético | Toggle falso — risco de segurança |
| BatteryScreen | ✅ Funcional | Dados reais via expo-battery |
| PrivacyScreen | ⚠️ Híbrido | Status real, gestão delega |
| WallpaperScreen | ✅ Funcional | Presets + custom, persistência |
| AccessibilityScreen | ⚠️ Híbrido | Bold/Reduce Motion in-app, resto delega |
| BackupRestoreScreen | ⚠️ Limitado | Apenas clipboard, sem cloud |

---

## Plano de Implementação Priorizado

### P0 — Crítico (features partidas que o utilizador nota imediatamente)
1. **Fix Music Controls**: Implementar mediaPrev/mediaPlayPause/mediaNext no módulo nativo ou remover controlos do ControlCenter
2. **Fix Silent Errors**: Substituir 42 console.warn por sistema de error reporting visível; remover ou configurar `transform-remove-console`
3. **Fix VPN toggle**: Mostrar aviso claro ou remover toggle cosmético

### P1 — Alto (gaps que reduzem a confiança do utilizador)
4. **Implementar MapsScreen real**: Integrar react-native-maps + expo-location
5. **Redesignar MailScreen**: Integrar com API de email ou redesignar como launcher para Gmail/Outlook
6. **Fix SoftwareUpdateScreen**: Integrar com Expo Updates ou remover verificação falsa
7. **Fix BackupRestore**: Integrar Google Drive ou file-based export
8. **Substituir Alert.alert()**: Usar CupertinoAlertDialog em todos os ecrãs

### P2 — Médio (melhorias de qualidade)
9. **Adicionar permissões Android em falta**: READ_PHONE_NUMBERS, ACCESS_NETWORK_STATE, ACCESS_COARSE_LOCATION
10. ~~**Fix notification polling**~~ **Resolvido**: migrado para event-driven listener (was 30s polling)
11. **Fix ScreenTime widget no TodayView**: Ligar a dados reais
12. **Adicionar validação de email** no EditProfileScreen
13. **Fix navigation types**: Remover `navigation: any` em 14 ecrãs
14. **Melhorar CallScreen**: Documentar limitação ou integrar Telecom API

### P3 — Baixo (polish e paridade)
15. Aumentar cobertura de testes (38 ecrãs sem testes)
16. Consistência de haptic feedback em todos os botões
17. Accessibility labels em elementos interativos
18. Skeleton/shimmer loading states
19. Long-press quick actions no home screen

---

## Métricas do Projeto

| Métrica | Valor |
|---------|-------|
| Ecrãs totais registados | 61 |
| Ecrãs ✅ totalmente funcionais | 35 (57%) |
| Ecrãs ⚠️ parcialmente funcionais | 18 (30%) |
| Ecrãs ❌ não funcionais / falsos | 4 (7%) |
| Ecrãs cosméticos (delegam para Android) | 4 (7%) |
| Ficheiros de teste | 18 |
| Cobertura de testes (ecrãs) | 17.5% |
| Métodos nativos no bridge | 30+ |
| Erros silenciosos em produção | 42 |
| Gaps resolvidos desde v1.8.5 | 17 |
| Gaps ainda abertos | 13 + 6 novos = 19 |

---

## Ficheiros-Chave a Modificar

| Prioridade | Ficheiro | Alteração |
|-----------|----------|-----------|
| P0 | `modules/launcher-module/src/index.ts` | Adicionar media methods à interface; fix silent errors |
| P0 | `modules/launcher-module/android/.../LauncherModule.kt` | Implementar mediaPrev/PlayPause/Next |
| P0 | `src/screens/ControlCenterScreen.tsx` | Remover `as any` casts nos media controls |
| P0 | `babel.config.js` | Configurar transform-remove-console para preservar warnings |
| P0 | `src/screens/settings/VpnScreen.tsx` | Adicionar aviso ou remover toggle |
| P1 | `src/screens/MapsScreen.tsx` | Integrar react-native-maps |
| P1 | `src/screens/MailScreen.tsx` | Substituir demo data por integração real |
| P1 | `src/screens/settings/SoftwareUpdateScreen.tsx` | Integrar Expo Updates |
| P1 | `src/screens/settings/BackupRestoreScreen.tsx` | Adicionar file export |
| P2 | `app.json` | Adicionar permissões em falta |
| P2 | `src/screens/TodayViewScreen.tsx` | Fix ScreenTime widget |
| P2 | `src/screens/EditProfileScreen.tsx` | Validação de email |
| P2 | 14 ecrãs diversos | Fix navigation: any types |
