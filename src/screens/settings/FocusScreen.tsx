import React, { useCallback, useMemo, useRef, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, Dimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme/ThemeContext';
import { useSettings } from '../../store/SettingsStore';
import { useApps } from '../../store/AppsStore';
import { useFolders } from '../../store/FoldersStore';
import { useDevice } from '../../store/DeviceStore';
import { useLocation } from '../../store/LocationStore';
import { computeLauncherGridGeometry } from '../../utils/launcherGridGeometry';
import {
  hiddenPageIndicesForMode,
  toggleHiddenPage,
  homePageCount,
} from '../../utils/focusPageVisibility';
import { dockOverrideForMode, toggleDockOverrideApp } from '../../utils/focusDockOverride';
import type {
  ContextRule,
  ContextCondition,
  ContextTargetMode,
  ContextCombinator,
} from '../../utils/contextTriggerEngine';
import {
  CupertinoNavigationBar,
  CupertinoListSection,
  CupertinoListTile,
  CupertinoSwitch,
  CupertinoActionSheet,
  useAlert,
} from '../../components';
import type { AppNavigationProp } from '../../navigation/types';
import { BUILT_IN_APPS } from '../LauncherHomeScreen';

type FocusMode = 'off' | 'doNotDisturb' | 'sleep' | 'work' | 'personal';

interface FocusModeOption {
  key: FocusMode;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  iconBg: string;
}

const FOCUS_MODES: FocusModeOption[] = [
  { key: 'off', label: 'Off', icon: 'close-circle', iconBg: '#8E8E93' },
  { key: 'doNotDisturb', label: 'Do Not Disturb', icon: 'moon', iconBg: '#5856D6' },
  { key: 'sleep', label: 'Sleep', icon: 'bed', iconBg: '#5856D6' },
  { key: 'work', label: 'Work', icon: 'briefcase', iconBg: '#34C759' },
  { key: 'personal', label: 'Personal', icon: 'person', iconBg: '#FF9500' },
];

/** Ícones virtuais que o launcher injecta sempre na grelha (ver LauncherHomeScreen.gridItems). */
const BUILT_IN_APP_COUNT = Object.keys(BUILT_IN_APPS).length;

/**
 * Context Engine (#628) — raio por omissão (metros) para uma regra de
 * localização criada a partir da posição actual. iOS usa raios variáveis por
 * geofence; sem uma UI de mapa nesta primeira versão, um raio fixo razoável
 * (equivalente a "estou neste edifício/quarteirão") evita pedir ao
 * utilizador um número que não tem como calibrar visualmente.
 */
const LOCATION_TRIGGER_RADIUS_METERS = 150;

function makeContextRuleId(): string {
  return `ctx-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Passo actual do assistente "Add Automation" (#628, estendido em #642 com
 * horário + AND/OR). null = fechado.
 */
type AddRuleStep =
  | 'type'
  | 'wifiValue'
  | 'bluetoothValue'
  | 'timeStart'
  | 'timeEnd'
  | 'more'
  | 'mode'
  | null;

/** Gera as opções de hora 'HH:MM' de 30 em 30 min (00:00 … 23:30). */
function buildHalfHourOptions(): string[] {
  const out: string[] = [];
  for (let h = 0; h < 24; h += 1) {
    for (const m of [0, 30]) {
      out.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
    }
  }
  return out;
}

export function FocusScreen({ navigation }: { navigation: AppNavigationProp }) {
  const { theme, typography, spacing } = useTheme();
  const { colors } = theme;
  const insets = useSafeAreaInsets();
  const { settings, update } = useSettings();
  const { apps, nonDockApps } = useApps();
  const { folders } = useFolders();
  const alert = useAlert();

  // Picker de hora para o agendamento (From/To). Opções de 30 em 30 min,
  // formato 'HH:MM' 24h — segue o padrão do ScreenTime (Start/End).
  const HOUR_OPTIONS = useMemo(() => buildHalfHourOptions(), []);
  const [pickerTarget, setPickerTarget] = useState<'start' | 'end' | null>(null);

  const isFocusActive = settings.focusMode !== 'off';
  const activeModeLabel = FOCUS_MODES.find((m) => m.key === settings.focusMode)?.label ?? '';

  // Hidden Pages (#618): o multiselect precisa de saber quantas páginas a home
  // tem. A contagem replica a do launcher — apps virtuais (BUILT_IN_APPS) +
  // pastas + apps reais fora do dock, em blocos de `cols * gridRows` — através
  // da mesma `computeLauncherGridGeometry`, para não divergir da paginação real.
  const [pagePickerMode, setPagePickerMode] = useState<FocusMode | null>(null);

  const pageCount = useMemo(() => {
    const geometry = computeLauncherGridGeometry(
      Dimensions.get('window').width,
      settings.gridColumns,
      settings.iconSizeScale,
    );
    const appsPerPage = geometry.cols * settings.gridRows;
    const appsInFolders = new Set(folders.flatMap((f) => f.apps));
    const realApps = nonDockApps.filter((a) => !appsInFolders.has(a.packageName)).length;
    const itemCount = BUILT_IN_APP_COUNT + folders.length + realApps;
    return homePageCount(itemCount, appsPerPage);
  }, [folders, nonDockApps, settings.gridColumns, settings.gridRows, settings.iconSizeScale]);

  const hiddenSummary = useCallback(
    (mode: FocusMode) => {
      const hidden = hiddenPageIndicesForMode(settings.focusPageVisibility, mode);
      if (mode === 'off') return 'All pages';
      return hidden.length === 0 ? 'None' : `${hidden.length} hidden`;
    },
    [settings.focusPageVisibility],
  );

  const handleToggleHiddenPage = useCallback(
    (mode: FocusMode, pageIndex: number) => {
      update('focusPageVisibility', toggleHiddenPage(settings.focusPageVisibility, mode, pageIndex));
    },
    [settings.focusPageVisibility, update],
  );

  const pagePickerOptions = useMemo(() => {
    if (!pagePickerMode) return [];
    const hidden = hiddenPageIndicesForMode(settings.focusPageVisibility, pagePickerMode);
    return Array.from({ length: pageCount }, (_, index) => ({
      label: `${hidden.includes(index) ? '✓ ' : ''}Page ${index + 1}`,
      onPress: () => handleToggleHiddenPage(pagePickerMode, index),
    }));
  }, [pagePickerMode, pageCount, settings.focusPageVisibility, handleToggleHiddenPage]);

  // Dock Apps per mode (#619, filho de #617): cada modo (exceto Off) pode
  // substituir os 4 ícones do dock. "Default" na linha-resumo cobre os dois
  // casos que significam "sem override" — dockOverrideForMode já trata chave
  // ausente e lista vazia da mesma forma.
  const [dockPickerMode, setDockPickerMode] = useState<FocusMode | null>(null);

  const dockSummary = useCallback(
    (mode: FocusMode) => {
      const override = dockOverrideForMode(settings.focusDockOverride, mode);
      return override ? `${override.length} app${override.length === 1 ? '' : 's'}` : 'Default';
    },
    [settings.focusDockOverride],
  );

  const handleToggleDockApp = useCallback(
    (mode: FocusMode, packageName: string) => {
      update('focusDockOverride', toggleDockOverrideApp(settings.focusDockOverride, mode, packageName));
    },
    [settings.focusDockOverride, update],
  );

  const dockPickerOptions = useMemo(() => {
    if (!dockPickerMode) return [];
    const current = settings.focusDockOverride[dockPickerMode] ?? [];
    return apps.map((app) => ({
      label: `${current.includes(app.packageName) ? '✓ ' : ''}${app.name}`,
      onPress: () => handleToggleDockApp(dockPickerMode, app.packageName),
    }));
  }, [dockPickerMode, apps, settings.focusDockOverride, handleToggleDockApp]);

  const handleSelectMode = useCallback((mode: FocusModeOption) => {
    const wasActive = settings.focusMode !== 'off';
    const willBeActive = mode.key !== 'off';

    // App.tsx's notification listener reads focusMode from a ref before showing
    // any banner, so banners are actually suppressed inside the launcher when
    // focus is active. System-level DND (NotificationManager.setInterruptionFilter)
    // is out of scope — we only gate the launcher's own banner UI.
    update('focusMode', mode.key);

    if (!wasActive && willBeActive) {
      alert(
        'Focus Mode Active',
        `${mode.label} is ON. Notifications are hidden inside the launcher.`,
      );
    } else if (wasActive && !willBeActive) {
      alert('Focus Mode Disabled', 'Focus mode disabled. Notifications restored.');
    }
  }, [settings.focusMode, update, alert]);

  // ── Automation / Context Engine (#628, AND/OR + horário em #642) ─────────
  //
  // Assistente "Add Automation": Wi-Fi/Bluetooth/Location/Time → Focus mode,
  // com N condições combinadas por AND ("têm de bater todas") ou OR ("basta
  // uma bater"). A engine (contextTriggerEngine.ts) já suportava isto desde
  // #628; este ecrã é que só deixava criar uma regra com uma única condição
  // (combinator 'AND' trivial, forçado no código) — este bloco é o editor
  // real sobre a engine já existente.
  //
  // Bug herdado corrigido aqui (não introduzido por #642): CupertinoActionSheet
  // chama sempre `onClose()` a seguir a `option.onPress()` (mesmo evento
  // síncrono) — ver src/components/CupertinoActionSheet.tsx:134-138. Quando um
  // passo do wizard tenta avançar para OUTRO passo através do mesmo estado
  // `addRuleStep` (ex.: 'type' → 'wifiValue'), a chamada a `onClose()` que se
  // segue reescreve esse estado para `null` no mesmo batch do React, fechando
  // o assistente por completo em vez de abrir o passo seguinte. Isto já
  // afetava o wizard de #628 (Wi-Fi/Bluetooth nunca avançavam de facto — só
  // "Current Location" escapava por acidente, porque a sua transição corre
  // dentro de um `.then()` de promise, um render React separado do batch
  // síncrono do `onClose()`). `goToStep` abaixo adia a transição para depois
  // desse batch (macrotask), o mesmo mecanismo que já "salvava" o caso da
  // localização, agora aplicado a todos os passos.
  const device = useDevice();
  const location = useLocation();
  const [addRuleStep, setAddRuleStep] = useState<AddRuleStep>(null);
  const pendingConditionsRef = useRef<ContextCondition[]>([]);
  const pendingCombinatorRef = useRef<ContextCombinator>('AND');
  const pendingNameRef = useRef('');
  const pendingTimeStartRef = useRef<string | null>(null);

  const goToStep = useCallback((step: AddRuleStep) => {
    setTimeout(() => setAddRuleStep(step), 0);
  }, []);

  const captureCondition = useCallback(
    (condition: ContextCondition, label: string) => {
      pendingConditionsRef.current = [...pendingConditionsRef.current, condition];
      pendingNameRef.current = pendingNameRef.current ? `${pendingNameRef.current} + ${label}` : label;
      goToStep('more');
    },
    [goToStep],
  );

  const finishAddRule = useCallback(
    (mode: ContextTargetMode) => {
      const conditions = pendingConditionsRef.current;
      setAddRuleStep(null);
      if (conditions.length === 0) return;
      const newRule: ContextRule = {
        id: makeContextRuleId(),
        name: pendingNameRef.current,
        enabled: true,
        combinator: pendingCombinatorRef.current,
        conditions,
        targetMode: mode,
      };
      update('contextRules', [...settings.contextRules, newRule]);
      pendingConditionsRef.current = [];
      pendingCombinatorRef.current = 'AND';
      pendingNameRef.current = '';
    },
    [settings.contextRules, update],
  );

  const modePickerOptions = useMemo(
    () =>
      FOCUS_MODES.filter((m) => m.key !== 'off').map((mode) => ({
        label: mode.label,
        onPress: () => finishAddRule(mode.key as ContextTargetMode),
      })),
    [finishAddRule],
  );

  const wifiValueOptions = useMemo(() => {
    if (addRuleStep !== 'wifiValue') return [];
    const ssids = new Set<string>();
    if (device.wifi.ssid) ssids.add(device.wifi.ssid);
    for (const net of device.wifi.networks) ssids.add(net.ssid);
    return Array.from(ssids).map((ssid) => ({
      label: ssid,
      onPress: () => captureCondition({ type: 'wifi', ssid }, `Wi-Fi: ${ssid}`),
    }));
  }, [addRuleStep, device.wifi.ssid, device.wifi.networks, captureCondition]);

  const bluetoothValueOptions = useMemo(() => {
    if (addRuleStep !== 'bluetoothValue') return [];
    return device.bluetooth.pairedDevices.map((d) => ({
      label: d.name || d.address,
      onPress: () => captureCondition(
        { type: 'bluetooth', address: d.address },
        `Bluetooth: ${d.name || d.address}`,
      ),
    }));
  }, [addRuleStep, device.bluetooth.pairedDevices, captureCondition]);

  const timeStartOptions = useMemo(() => {
    if (addRuleStep !== 'timeStart') return [];
    return HOUR_OPTIONS.map((opt) => ({
      label: opt,
      onPress: () => {
        pendingTimeStartRef.current = opt;
        goToStep('timeEnd');
      },
    }));
  }, [addRuleStep, HOUR_OPTIONS, goToStep]);

  const timeEndOptions = useMemo(() => {
    if (addRuleStep !== 'timeEnd') return [];
    return HOUR_OPTIONS.map((opt) => ({
      label: opt,
      onPress: () => {
        const start = pendingTimeStartRef.current ?? '00:00';
        captureCondition({ type: 'time', start, end: opt, weekdays: [] }, `Time: ${start}–${opt}`);
      },
    }));
  }, [addRuleStep, HOUR_OPTIONS, captureCondition]);

  const handlePickTriggerType = useCallback(
    (type: 'wifi' | 'bluetooth' | 'location' | 'time') => {
      if (type === 'wifi') {
        goToStep('wifiValue');
        return;
      }
      if (type === 'bluetooth') {
        goToStep('bluetoothValue');
        return;
      }
      if (type === 'time') {
        goToStep('timeStart');
        return;
      }
      // Location: sem lista de valores para escolher — captura a posição
      // actual diretamente, tal como as automações reais de "chegar a um
      // sítio" fazem ao serem criadas no local.
      location.refreshLocation().then(() => {
        const current = location.currentLocation;
        if (!current) {
          alert('Location Unavailable', 'Could not read the current location. Check Location permission and try again.');
          return;
        }
        captureCondition(
          {
            type: 'location',
            latitude: current.latitude,
            longitude: current.longitude,
            radiusMeters: LOCATION_TRIGGER_RADIUS_METERS,
          },
          `Location (${LOCATION_TRIGGER_RADIUS_METERS}m radius)`,
        );
      }).catch(() => {
        alert('Location Unavailable', 'Could not read the current location. Check Location permission and try again.');
      });
    },
    [location, alert, goToStep, captureCondition],
  );

  const triggerTypeOptions = useMemo(
    () => [
      { label: 'Wi-Fi Network', onPress: () => handlePickTriggerType('wifi') },
      { label: 'Bluetooth Device', onPress: () => handlePickTriggerType('bluetooth') },
      { label: 'Current Location', onPress: () => handlePickTriggerType('location') },
      { label: 'Time / Schedule', onPress: () => handlePickTriggerType('time') },
    ],
    [handlePickTriggerType],
  );

  // Passo "Add Another Condition?": o utilizador escolhe combinar com AND
  // (têm de bater todas) ou OR (basta uma), ou terminar já com as condições
  // acumuladas. O combinador escolhido aplica-se à regra toda (a engine não
  // suporta combinadores por par — ver ContextRule.combinator).
  const moreOptions = useMemo(
    () => [
      {
        label: 'Require ALL conditions (AND)',
        onPress: () => {
          pendingCombinatorRef.current = 'AND';
          goToStep('type');
        },
      },
      {
        label: 'Match ANY condition (OR)',
        onPress: () => {
          pendingCombinatorRef.current = 'OR';
          goToStep('type');
        },
      },
      { label: 'Continue', onPress: () => goToStep('mode') },
    ],
    [goToStep],
  );

  const handleToggleRule = useCallback(
    (ruleId: string, enabled: boolean) => {
      update(
        'contextRules',
        settings.contextRules.map((r) => (r.id === ruleId ? { ...r, enabled } : r)),
      );
    },
    [settings.contextRules, update],
  );

  const handleDeleteRule = useCallback(
    (ruleId: string) => {
      update('contextRules', settings.contextRules.filter((r) => r.id !== ruleId));
    },
    [settings.contextRules, update],
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.systemGroupedBackground }]}>
      <CupertinoNavigationBar
        title="Focus"
        leftButton={
          <Text
            style={[typography.body, { color: colors.systemBlue }]}
            onPress={() => navigation.goBack()}
          >
            Settings
          </Text>
        }
      />

      {/* Active focus mode banner */}
      {isFocusActive && (
        <View style={[styles.banner, { backgroundColor: colors.systemPurple ?? '#5856D6' }]}>
          <Ionicons name="moon-outline" size={16} color="#fff" style={{ marginRight: 8 }} />
          <Text style={[typography.footnote, { color: '#fff', flex: 1 }]}>
            Focus mode active – notifications are filtered
          </Text>
          <Text style={[typography.footnote, { color: 'rgba(255,255,255,0.8)', fontWeight: '600' }]}>
            {activeModeLabel}
          </Text>
        </View>
      )}

      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 90 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Focus Modes list */}
        <View style={{ paddingHorizontal: spacing.md, marginTop: spacing.md }}>
          <CupertinoListSection
            header="Focus Modes"
            footer="Focus lets you silence notifications and filter apps based on what you're doing."
          >
            {FOCUS_MODES.map((mode) => {
              const isActive = settings.focusMode === mode.key;
              return (
                <CupertinoListTile
                  key={mode.key}
                  title={mode.label}
                  leading={{
                    name: mode.icon,
                    color: '#FFFFFF',
                    backgroundColor: isActive ? mode.iconBg : colors.systemGray4 ?? '#8E8E93',
                  }}
                  trailing={
                    isActive ? (
                      <Text style={[typography.body, { color: colors.systemBlue, fontWeight: '700' }]}>✓</Text>
                    ) : undefined
                  }
                  showChevron={false}
                  onPress={() => handleSelectMode(mode)}
                />
              );
            })}
          </CupertinoListSection>
        </View>

        {/* Hidden Pages per mode (#618) */}
        <View style={{ paddingHorizontal: spacing.md }}>
          <CupertinoListSection
            header="Hidden Pages"
            footer="While a Focus mode is on, the home-screen pages you pick here are hidden. Off always shows every page."
          >
            {FOCUS_MODES.filter((mode) => mode.key !== 'off').map((mode) => (
              <CupertinoListTile
                key={`hidden-pages-${mode.key}`}
                title={`${mode.label} — Hidden Pages`}
                trailing={
                  <Text style={[typography.body, { color: colors.secondaryLabel }]}>
                    {hiddenSummary(mode.key)}
                  </Text>
                }
                onPress={() => setPagePickerMode(mode.key)}
              />
            ))}
          </CupertinoListSection>
        </View>

        {/* Dock Apps per mode (#619) */}
        <View style={{ paddingHorizontal: spacing.md }}>
          <CupertinoListSection
            header="Dock Apps"
            footer="While a Focus mode is on, the dock can show a different set of apps (up to 4). Off always shows your normal dock."
          >
            {FOCUS_MODES.filter((mode) => mode.key !== 'off').map((mode) => (
              <CupertinoListTile
                key={`dock-apps-${mode.key}`}
                title={`${mode.label} — Dock Apps`}
                trailing={
                  <Text style={[typography.body, { color: colors.secondaryLabel }]}>
                    {dockSummary(mode.key)}
                  </Text>
                }
                onPress={() => setDockPickerMode(mode.key)}
              />
            ))}
          </CupertinoListSection>
        </View>

        {/* Focus Schedule section */}
        <View style={{ paddingHorizontal: spacing.md }}>
          <CupertinoListSection header="Focus Schedule">
            <CupertinoListTile
              title="Focus Schedule"
              trailing={
                <CupertinoSwitch
                  value={settings.focusScheduleEnabled}
                  onValueChange={(v) => update('focusScheduleEnabled', v)}
                />
              }
              showChevron={false}
            />
            {settings.focusScheduleEnabled && (
              <>
                <CupertinoListTile
                  title="From"
                  trailing={
                    <Text style={[typography.body, { color: colors.secondaryLabel }]}>
                      {settings.focusScheduleStart}
                    </Text>
                  }
                  onPress={() => setPickerTarget('start')}
                  showChevron={false}
                />
                <CupertinoListTile
                  title="To"
                  trailing={
                    <Text style={[typography.body, { color: colors.secondaryLabel }]}>
                      {settings.focusScheduleEnd}
                    </Text>
                  }
                  onPress={() => setPickerTarget('end')}
                  showChevron={false}
                />
              </>
            )}
          </CupertinoListSection>
        </View>

        {/* Automation / Context Engine (#628, AND/OR + horário em #642):
            regras Wi-Fi/Bluetooth/localização/horário que ativam um Focus
            mode automaticamente, aditivas ao Focus Schedule acima. */}
        <View style={{ paddingHorizontal: spacing.md }}>
          <CupertinoListSection
            header="Automation"
            footer="Automatically turn on a Focus mode when Wi-Fi, Bluetooth, location, or time matches. Combine several conditions per automation, either requiring all of them or just one."
          >
            {settings.contextRules.map((rule) => {
              const modeLabel = FOCUS_MODES.find((m) => m.key === rule.targetMode)?.label ?? rule.targetMode;
              const subtitle = rule.conditions.length > 1
                ? `${rule.combinator} of ${rule.conditions.length} → ${modeLabel}`
                : `→ ${modeLabel}`;
              return (
                <CupertinoListTile
                  key={rule.id}
                  title={rule.name || 'Automation'}
                  subtitle={subtitle}
                  trailing={
                    <View style={styles.ruleTrailing}>
                      <CupertinoSwitch
                        value={rule.enabled}
                        onValueChange={(v) => handleToggleRule(rule.id, v)}
                      />
                      <Text
                        style={[typography.footnote, { color: colors.systemRed, marginLeft: 12 }]}
                        onPress={() => handleDeleteRule(rule.id)}
                        accessibilityLabel={`Delete automation: ${rule.name}`}
                        accessibilityRole="button"
                      >
                        Delete
                      </Text>
                    </View>
                  }
                  showChevron={false}
                />
              );
            })}
            <CupertinoListTile
              title="Add Automation"
              leading={{ name: 'add-circle', color: '#FFFFFF', backgroundColor: colors.systemGreen ?? '#34C759' }}
              onPress={() => {
                pendingConditionsRef.current = [];
                pendingCombinatorRef.current = 'AND';
                pendingNameRef.current = '';
                pendingTimeStartRef.current = null;
                setAddRuleStep('type');
              }}
              showChevron={false}
            />
          </CupertinoListSection>
        </View>

        <CupertinoActionSheet
          visible={pickerTarget !== null}
          onClose={() => setPickerTarget(null)}
          title={pickerTarget === 'start' ? 'From' : 'To'}
          options={HOUR_OPTIONS.map((opt) => ({
            label: opt,
            onPress: () => {
              if (pickerTarget === 'start') update('focusScheduleStart', opt);
              else if (pickerTarget === 'end') update('focusScheduleEnd', opt);
            },
          }))}
          cancelLabel="Cancel"
        />
      </ScrollView>

      {/* Multiselect das páginas ocultas (#618). O CupertinoActionSheet fecha
          após cada opção (chama sempre onClose depois do onPress), por isso a
          selecção múltipla faz-se um toque por página: cada linha mostra ✓
          quando a página já está oculta e o toque alterna esse estado. Padrão do
          LanguageRegionScreen; não se alterou o componente partilhado para não
          mexer nos outros ecrãs que dele dependem. */}
      <CupertinoActionSheet
        visible={pagePickerMode !== null}
        onClose={() => setPagePickerMode(null)}
        title="Hidden Pages"
        message="Pages hidden while this Focus mode is on."
        options={pagePickerOptions}
        cancelLabel="Done"
      />

      {/* Multiselect das apps do dock por modo (#619). Mesmo padrão do
          multiselect de páginas acima: cada toque alterna um app (✓
          adiciona/remove), até MAX_DOCK_APPS — o 5º toque é ignorado por
          toggleDockOverrideApp, tal como o dock normal (AppsStore#addToDock). */}
      <CupertinoActionSheet
        visible={dockPickerMode !== null}
        onClose={() => setDockPickerMode(null)}
        title="Dock Apps"
        message="Pick up to 4 apps for this mode's dock. Leave none selected to keep the normal dock."
        options={dockPickerOptions}
        cancelLabel="Done"
      />

      {/* Assistente "Add Automation" (#628, AND/OR + horário em #642): tipo de
          gatilho (Wi-Fi/Bluetooth/Location/Time) → valor do gatilho → "Add
          Another Condition?" (AND/OR ou terminar) → modo de destino. Location
          salta o passo de valor (ver handlePickTriggerType). Cada transição
          usa `goToStep`/`captureCondition`, não `setAddRuleStep` direto — ver
          o comentário sobre o bug herdado do onClose acima. */}
      <CupertinoActionSheet
        visible={addRuleStep === 'type'}
        onClose={() => setAddRuleStep(null)}
        title="Add Automation"
        message="Choose what should trigger this automation."
        options={triggerTypeOptions}
        cancelLabel="Cancel"
      />
      <CupertinoActionSheet
        visible={addRuleStep === 'wifiValue'}
        onClose={() => setAddRuleStep(null)}
        title="Wi-Fi Network"
        options={wifiValueOptions}
        cancelLabel="Cancel"
      />
      <CupertinoActionSheet
        visible={addRuleStep === 'bluetoothValue'}
        onClose={() => setAddRuleStep(null)}
        title="Bluetooth Device"
        options={bluetoothValueOptions}
        cancelLabel="Cancel"
      />
      <CupertinoActionSheet
        visible={addRuleStep === 'timeStart'}
        onClose={() => setAddRuleStep(null)}
        title="Start Time"
        options={timeStartOptions}
        cancelLabel="Cancel"
      />
      <CupertinoActionSheet
        visible={addRuleStep === 'timeEnd'}
        onClose={() => setAddRuleStep(null)}
        title="End Time"
        options={timeEndOptions}
        cancelLabel="Cancel"
      />
      <CupertinoActionSheet
        visible={addRuleStep === 'more'}
        onClose={() => setAddRuleStep(null)}
        title="Add Another Condition?"
        message="Add one more condition to this automation, or continue to pick the Focus mode."
        options={moreOptions}
        cancelLabel="Cancel"
      />
      <CupertinoActionSheet
        visible={addRuleStep === 'mode'}
        onClose={() => setAddRuleStep(null)}
        title="Turn On"
        message="Which Focus mode should this automation activate?"
        options={modePickerOptions}
        cancelLabel="Cancel"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  ruleTrailing: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
});
