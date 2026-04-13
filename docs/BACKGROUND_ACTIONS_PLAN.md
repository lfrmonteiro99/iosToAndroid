# Plano: Eliminação Total de UI Android Visível

## Princípio orientador
**O utilizador nunca deve ver UI Android quando está dentro do launcher.** Tudo deve acontecer em background. Se a ação requer um adapter/API nativo, construímos esse adapter no LauncherModule.kt.

Casos excecionalmente inevitáveis (por design de segurança Android): documentados com justificação clara e reduzidos ao mínimo absoluto.

---

## Inventário Completo (por origem)

### A) Navegação in-app (FIX IMEDIATO — JS only)

| # | Ficheiro:linha | Ação actual | Fix |
|---|----------------|-------------|-----|
| 1 | `LockScreen.tsx:361-362` | `launchApp('com.android.camera2')` | Navegar para `Camera` in-app |
| 2 | `LockScreen.tsx:364,369` | `Linking.openURL('content://media/internal/images/media')` | Navegar para `Photos` in-app |
| 3 | `ControlCenterScreen.tsx:198-199` | `launchApp('com.android.camera2')` | Navegar para `Camera` in-app |
| 4 | `CameraScreen.tsx:120` | `launchApp('com.android.camera2')` | Remover fallback; mostrar erro in-app |
| 5 | `ContactDetailScreen.tsx:107,218` | `Linking.openURL('mailto:...')` | Navegar para `Mail` in-app com draft pré-preenchido |
| 6 | `ContactDetailScreen.tsx:97` | `Linking.openURL('tel:...')` fallback | Já usa `makeCall()` primeiro — ok |
| 7 | `ContactsScreen.tsx:241` | `Linking.openURL('tel:...')` fallback | Já usa `makeCall()` primeiro — ok |
| 8 | `ConversationScreen.tsx:419` | `Linking.openURL('tel:...')` fallback | Já usa `makeCall()` primeiro — ok |
| 9 | `MapsScreen.tsx:218,254,269,303,311` | `Linking.openURL('geo:...')` | Implementar WebView com OpenStreetMap in-app |

### B) Novos métodos nativos (requer adicionar Kotlin — entra no próximo build APK)

| # | Método a adicionar | O que faz | API Android |
|---|---------------------|-----------|-------------|
| 1 | `joinWifiNetwork(ssid, password, security)` | Adiciona rede sem abrir painel | `WifiNetworkSuggestion` (Android 10+) ou `WifiConfiguration` (pre-10) |
| 2 | `forgetWifiNetwork(ssid)` | Remove rede guardada | `WifiManager.removeNetworkSuggestions` |
| 3 | `startBluetoothDiscovery()` | Inicia scan de dispositivos | `BluetoothAdapter.startDiscovery()` |
| 4 | `stopBluetoothDiscovery()` | Para scan | `BluetoothAdapter.cancelDiscovery()` |
| 5 | `getDiscoveredBluetoothDevices()` | Lista dispositivos descobertos (eventos) | BroadcastReceiver `ACTION_FOUND` |
| 6 | `pairBluetoothDevice(address)` | Inicia pairing direto | `BluetoothDevice.createBond()` |
| 7 | `unpairBluetoothDevice(address)` | Remove pairing | reflexão `removeBond` |
| 8 | `setAirplaneModeCosmetic(enabled)` | Marca estado in-app | Apenas settings store (não mexe no sistema) |
| 9 | `sendEmail(to, subject, body)` | Enviar via SMTP config pelo utilizador | JavaMail (futuro) — por agora falhar gracefully |
| 10 | Fix `setWifiEnabled()` | Usar `WifiManager.setWifiEnabled()` direto (pre-10) ou retornar erro no 10+ | API direct, não panel |
| 11 | Fix `setBluetoothEnabled()` | Usar `BluetoothAdapter.enable()` direto | API direct, não panel |

### C) UI in-app que substitui painéis Android

| Ecrã | UI actual | UI nova |
|------|-----------|---------|
| WifiScreen | Botão "Other Networks" → Android panel | Modal iOS-style com "Network Name" + "Password" + "Security" → `joinWifiNetwork()` |
| BluetoothScreen | Tap em dispositivo → Android panel | Ecrã "Pair Device" in-app → `pairBluetoothDevice()` |
| PrivacyScreen | Tap em permissão → Android panel | Modal in-app a explicar a permissão + "Grant" que dispara dialog OS (o dialog em si é inevitável mas a navegação é in-app) |
| CellularScreen SIM PIN | Abre Security settings | Modal explicativo: "SIM PIN é gerido pelo sistema Android por razões de segurança. Toca em Abrir para aceder." |
| HotspotScreen | Abre tethering settings | Toggle in-app para `LocalOnlyHotspot` (real hotspot privado, sem sharing de dados móveis) |
| VpnScreen | Abre VPN settings | Modal in-app com config + aviso: "Primeira vez requer autorização do sistema Android" |

### D) Verdadeiramente inevitáveis (documentadas com justificação)

| # | Caso | Porque não dá |
|---|------|---------------|
| 1 | Bluetooth PIN confirmation durante pairing | Android exige confirmação user-side por segurança (ambos os lados) |
| 2 | Primeiro grant de runtime permission | Android design — user must see explicit grant |
| 3 | VPN initial approval dialog | VpnService requer user approval OS-level da primeira vez |
| 4 | SIM PIN change | Não há API pública — é tecnologicamente impossível |
| 5 | Full tethering (partilhar dados móveis) | `setWifiApEnabled` é hidden API desde Android 8; `TetheringManager` requer TETHER_PRIVILEGED |
| 6 | Change default launcher | User deve escolher no picker OS-level |
| 7 | Notification listener permission | User deve aceitar na lista de accessibility services |
| 8 | Usage stats permission | Mesmo que notification listener |
| 9 | Uninstall de app | Android exige confirmação user-side |

Estes 9 casos são os ÚNICOS onde o utilizador verá UI Android, e só na primeira vez / momento específico da acção crítica.

---

## Estratégia de implementação

### Fase A: Fixes JS (funcionam no APK actual — entram já)
1. LockScreen: camera → navigate CameraScreen; photos → navigate PhotosScreen
2. ControlCenter: camera → navigate CameraScreen
3. CameraScreen: remover fallback `launchApp`
4. ContactDetail: mailto → navigate MailScreen com draft
5. MapsScreen: WebView com OpenStreetMap (in-app, não sai da app)

### Fase B: Kotlin (entra no próximo build APK)
6. Adicionar `joinWifiNetwork` usando `WifiNetworkSuggestion`
7. Adicionar `pairBluetoothDevice` + `startBluetoothDiscovery` + `getDiscoveredBluetoothDevices` + listener
8. Fix `setWifiEnabled` / `setBluetoothEnabled` para API direta
9. Adicionar `startLocalOnlyHotspot` / `stopLocalOnlyHotspot`
10. Atualizar TS interface

### Fase C: UI in-app (funciona após Fase B)
11. WifiScreen: modal de join in-app
12. BluetoothScreen: lista de devices descobertos + pair in-app
13. HotspotScreen: toggle real para LocalOnlyHotspot
14. PrivacyScreen: modal explicativo antes de grant
15. CellularScreen: modal explicativo para SIM PIN

### Fase D: Documentação clara
16. Atualizar `DELEGATION_AUDIT.md` com os 9 casos inevitáveis

---

## Status de implementação (esta sessão)

- ✅ Plano escrito
- 🔄 Fase A (JS) — em progresso
- 🔄 Fase B (Kotlin) — em progresso (entra no próximo build)
- 🔄 Fase C (UI) — em progresso (entra com Fase B)
- ⏸️ Fase D (docs) — final
