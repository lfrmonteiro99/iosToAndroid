# Auditoria de Delegações para Android

Inventário completo de TODOS os pontos onde a app abre painéis do sistema Android ou lança intents externos. Cada item é classificado como:

- **🟢 EVITÁVEL** — Pode ser implementado totalmente in-app (iOS-style). **Vamos remover a delegação.**
- **🟡 PARCIAL** — A leitura pode ser in-app, mas a escrita/controle real requer permissão Android. Manter delegação só para a ação específica.
- **🔴 INEVITÁVEL** — Android impede mudanças fora das Settings (segurança/licença). Não há alternativa.

---

## 🟢 EVITÁVEL — Deve ser Removido

### 1. `GeneralScreen:108` — "Dictionary" abre locale
- **Motivo para evitar**: Dictionary no iOS é substituição de texto per-user (atalhos tipo "omw" → "on my way"). Não precisa de Android.
- **Fix**: Criar `DictionaryScreen` in-app com AsyncStorage para atalhos.

### 2. `GeneralScreen:121` — "Transfer or Reset Device"
- **Motivo para evitar**: No contexto desta app "Reset" significa limpar dados da app, não do dispositivo.
- **Fix**: Remover a opção OU redirecionar para `BackupRestoreScreen` (já existe reset in-app).

### 3. `NotificationsScreen:108,119` — "Scheduled Summary" + "Open Notification Settings"
- **Motivo para evitar**: As preferências (Show Previews, Sounds, Badges) JÁ são in-app. O "Scheduled Summary" pode ser uma feature fake-iOS guardada no SettingsStore.
- **Fix**: Remover botão "Open Notification Settings" e implementar Scheduled Summary com action sheet in-app.

### 4. `SoundsHapticsScreen:65,74,121` — Ringtone / Text Tone / "Open Sound Settings"
- **Motivo para evitar**: Lista de ringtones pode ser mostrada in-app com `CupertinoActionSheet`. Não é preciso abrir Android.
- **Fix**: Action sheet com lista de tons (os valores guardam-se em `settings.ringtone` já). Remover botão "Open Sound Settings".

### 5. `LanguageRegionScreen:64,69,74,79,84,100` — Todos os itens delegam
- **Motivo para evitar**: Language/Region/Calendar/Temperature/Measurement podem ser preferências in-app que mudam a formatação da app sem tocar no sistema Android.
- **Fix**: Action sheets in-app com opções.

### 6. `KeyboardScreen:107` — "Open Keyboard Settings"
- **Motivo para evitar**: Os toggles (Auto-Correct, Auto-Cap, Predictive) já são in-app. O botão de abrir Android é redundante.
- **Fix**: Remover botão.

### 7. `DateTimeScreen:133` — "Change Timezone"
- **Motivo para evitar**: Podemos mostrar o timezone detectado (já mostramos) e permitir override in-app para formatação da app (como world clock faz).
- **Fix**: Remover botão OU trocar por picker de timezone in-app (reutilizar COMMON_CITIES do ClockScreen).

### 8. `AccessibilityScreen:90,98,106,117,122,130,141,149,154` — Maioria das opções
- **Motivo para evitar**: Display Size pode ser in-app (já temos `textScale`). Hearing/Subtitles não se aplicam a uma launcher replica.
- **Fix**: Remover secções que delegam. Expandir in-app com Color Filters (tint preview), Reduce Transparency, etc.

### 9. `GeneralScreen:134` — "Shut Down"
- **Motivo para evitar**: Não se pode desligar um Android por app. Esta opção é enganosa.
- **Fix**: Remover "Shut Down" ou substituir por "Restart App" (remount da navegação).

### 10. `StorageScreen:217` — "Manage Storage"
- **Motivo para evitar**: Já mostramos breakdown e top apps in-app. O botão é redundante.
- **Fix**: Remover.

### 11. `BatteryScreen:104` — "Battery Usage"
- **Motivo para evitar**: Já mostramos nível + charging + health. O botão é redundante.
- **Fix**: Remover ou mostrar histórico simulado de carga in-app.

### 12. `PrivacyScreen:187,226` — Delegações de detalhes de permissão
- **Motivo para evitar**: Podemos mostrar uma lista in-app de cada permissão com estado + explicação. O grant é inevitável (inevitável #4 abaixo) mas a visualização é in-app.
- **Fix**: Remover botões de "open privacy". Manter só o pedido de grant específico quando necessário.

### 13. `CellularScreen:241` — "Data Roaming"
- **Motivo para evitar**: É um toggle. Pode ser persistido in-app.
- **Fix**: Converter para CupertinoSwitch in-app.

### 14. `ControlCenterScreen:245` — "Focus / DND"
- **Motivo para evitar**: Podemos implementar um modo Focus in-app que silencia notificações dentro da app, sem precisar de DND do Android.
- **Fix**: Focus mode in-app (já existe no SettingsStore). Remover `openSystemPanel('notification_policy')`.

### 15. `ControlCenterScreen:355` — "Airplane Mode"
- **Motivo para evitar**: Podemos mostrar estado + toggle cosmético que desliga visualmente WiFi/Bluetooth/Cellular on-screen.
- **Fix**: Toggle cosmético que afeta apenas a UI da app. Remover openSystemPanel.

### 16. `FocusScreen:84` — Focus modes
- **Motivo para evitar**: Mesma razão do #14.
- **Fix**: Implementar modo de foco totalmente in-app.

### 17. `SettingsScreen:114` — "Airplane" row
- **Motivo para evitar**: Mesma razão do #15.
- **Fix**: Toggle in-app cosmético.

---

## 🟡 PARCIAL — Delegação Apenas para Ação Específica

### 1. `WifiScreen:110,295` — Join Network
- **Leitura**: ✅ in-app (scan, current network, RSSI, IP) — já funciona
- **Escrita**: 🔴 Android 10+ exige o painel do sistema para credenciais WPA (segurança)
- **Fix**: Manter só o botão "Join" que abre painel. Tudo o resto fica in-app.

### 2. `BluetoothScreen:134` — Pair New Device
- **Leitura**: ✅ in-app (paired devices, nome, endereço)
- **Escrita**: 🔴 Pairing com PIN/passkey é OS-only por segurança
- **Fix**: Manter só "Pair new device" que abre painel.

### 3. `HotspotScreen:69,85,114` — Toggle tethering
- **Leitura**: ✅ in-app (nome, estado, password guardada)
- **Escrita**: 🔴 `setWifiApEnabled` é hidden API desde Android 8 (requer root)
- **Fix**: Manter delegação só para enable/disable, com aviso claro.

### 4. `CellularScreen:264` — SIM PIN
- **Leitura**: ✅ in-app (carrier, network)
- **Escrita**: 🔴 SIM PIN é 100% OS-only por segurança
- **Fix**: Manter delegação apenas para "Change SIM PIN".

### 5. `VpnScreen:61,72` — VPN config
- **Leitura**: ⚠️ Não temos API para listar VPNs
- **Escrita**: 🔴 VPN requires system-level VPNService
- **Fix**: Remover toggle cosmético (já planeado em GAP_ANALYSIS_V2). Manter só "Add VPN Configuration".

### 6. `PrivacyScreen` (granting permissions)
- **Leitura**: ✅ in-app (status de cada permissão)
- **Escrita**: 🔴 Grant/revoke é OS-only
- **Fix**: Mostrar lista in-app. Delegar apenas quando utilizador clica "Grant" numa permissão específica.

---

## 🔴 INEVITÁVEL — Android não permite alternativa

### 1. `WifiScreen` — Join network com credenciais WPA3
- Android 10+ restringe API de conexão para apps normais (segurança).

### 2. `BluetoothScreen` — Pairing com PIN
- Pairing exige confirmação OS-level (ambos os lados precisam aprovar).

### 3. `HotspotScreen` — Toggle tether
- `setWifiApEnabled` é hidden API (requer system app ou root).

### 4. `VpnScreen` — Add VPN
- VPNService exige permissão privilegiada do Android.

### 5. `CellularScreen` — SIM PIN, Data Roaming
- SIM config é OS-only.

### 6. Airplane Mode (real, não cosmético)
- Desde Android 4.2 só system apps podem mudar.

### 7. `AccessibilityScreen` — TalkBack enable
- Activar serviço de acessibilidade exige Settings do sistema.

### 8. Notification Listener Access
- A permissão para ler notificações é concedida em Settings de sistema, por design (segurança).

### 9. Usage Access Permission (ScreenTime)
- Semelhante a notification listener — concedida em Settings.

### 10. Default Launcher status
- Mudar o launcher default exige o picker do sistema.

### 11. System shutdown / reboot
- Impossível sem privilégios root ou app de sistema.

### 12. `Linking.openURL('tel:')`, `sms:`, `mailto:`, `geo:` — Intents por URL
- **Nota**: Estes abrem apps externas (dialer, SMS app, email app, mapas). Também "quebram" a imersão iOS.
- **Decisão**:
  - `tel:` → Podemos fazer a chamada via `LauncherModule.makeCall()` (já existe) → **🟢 EVITÁVEL**
  - `sms:` → Temos o MessagesScreen in-app → **🟢 EVITÁVEL** (navegar para Conversation em vez)
  - `mailto:` → Não temos Mail real. **🔴 INEVITÁVEL** (ou mostrar aviso)
  - `geo:` → MapsScreen é placeholder, é OK delegar por enquanto → **🟡 PARCIAL**

---

## Resumo Quantitativo

| Categoria | Count | Ação |
|-----------|-------|------|
| 🟢 Evitável | 17 | Implementar in-app e remover delegação |
| 🟡 Parcial | 6 | Manter delegação só para ação específica que não tem API |
| 🔴 Inevitável | 12 | Aceitar, mostrar aviso claro quando aplicável |

---

## Plano de Implementação — Batch 1 (Prioritário)

### Fase 1 — Remover botões "Open Settings" redundantes (10 min)
- NotificationsScreen: remover "Open Notification Settings"
- SoundsHapticsScreen: remover "Open Sound Settings"
- KeyboardScreen: remover "Open Keyboard Settings"
- LanguageRegionScreen: remover "Open Language Settings"
- StorageScreen: remover "Manage Storage"
- BatteryScreen: remover "Battery Usage" delegation
- GeneralScreen: remover "Shut Down" OU converter em "Restart App"

### Fase 2 — Substituir por action sheets in-app (30 min)
- SoundsHapticsScreen: Ringtone/Text Tone com action sheet
- LanguageRegionScreen: Language/Region/Temperature/Measurement com action sheets
- DateTimeScreen: Timezone picker in-app (reutilizar COMMON_CITIES)

### Fase 3 — Converter toggles cosméticos em estado in-app (20 min)
- ControlCenterScreen: Airplane + Focus modes in-app (persistidos em SettingsStore)
- FocusScreen: Focus mode totalmente in-app
- CellularScreen: Data Roaming in-app toggle (cosmético, com aviso)
- SettingsScreen: Airplane row in-app

### Fase 4 — Fixes específicos (20 min)
- `tel:` → usar `LauncherModule.makeCall()` em ContactDetailScreen e ConversationScreen
- `sms:` → navegar para ConversationScreen em vez de abrir app externa
- AccessibilityScreen: remover secções delegadas, expandir in-app
- PrivacyScreen: mostrar lista in-app, delegar só quando utilizador clica "Grant"
- GeneralScreen: remover "Dictionary" ou criar DictionaryScreen
- NotificationsScreen: Scheduled Summary com action sheet in-app

### Fase 5 — Atualizar AccessibilityScreen (15 min)
- Remover "System Accessibility", "Physical and Motor", "Hearing"
- Adicionar "Color Filters" (tint), "Reduce Transparency", "Smart Invert" (todos in-app)
