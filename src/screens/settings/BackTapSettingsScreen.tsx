import React, { useCallback, useMemo } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../theme/ThemeContext';
import {
  CupertinoNavigationBar,
  CupertinoListSection,
  CupertinoListTile,
  CupertinoSwitch,
  useAlert,
} from '../../components';
import { useSettings } from '../../store/SettingsStore';
import { useApps } from '../../store/AppsStore';
import LauncherModule from '../../../modules/launcher-module/src';
import {
  type BackTapAction,
  type BackTapAssignment,
  type BackTapGesture,
  type BackTapDeps,
  resolveBackTap,
  executeBackTap,
} from '../../utils/backTap';
import type { AppNavigationProp } from '../../navigation/types';

const ACTION_OPTIONS: { id: BackTapAction; label: string }[] = [
  { id: 'none', label: 'None' },
  { id: 'flash', label: 'Flashlight' },
  { id: 'toggleWifi', label: 'Toggle Wi-Fi' },
  { id: 'openApp', label: 'Open App' },
  { id: 'shortcut', label: 'Shortcut' },
  { id: 'screenshot', label: 'Screenshot' },
];

/**
 * O repositório não tem uma app "Shortcuts" própria (ver o cabeçalho de
 * src/utils/backTap.ts) — este catálogo fechado de destinos in-app é o que a
 * acção 'shortcut' abre, à semelhança dos itens de menu do AssistiveTouch.
 */
const SHORTCUT_OPTIONS: { id: string; label: string; route: string }[] = [
  { id: 'spotlight', label: 'Spotlight Search', route: 'SpotlightSearch' },
  { id: 'notifications', label: 'Notification Centre', route: 'NotificationCenter' },
  { id: 'controlCenter', label: 'Control Centre', route: 'ControlCenter' },
  { id: 'siri', label: 'Siri', route: 'Siri' },
];

function labelForAction(action: BackTapAction): string {
  return ACTION_OPTIONS.find((o) => o.id === action)?.label ?? 'None';
}

function summaryFor(assignment: BackTapAssignment, apps: { packageName: string; name: string }[]): string {
  if (assignment.action === 'openApp' && assignment.packageName) {
    return apps.find((a) => a.packageName === assignment.packageName)?.name ?? assignment.packageName;
  }
  if (assignment.action === 'shortcut' && assignment.shortcutId) {
    return SHORTCUT_OPTIONS.find((o) => o.id === assignment.shortcutId)?.label ?? 'Shortcut';
  }
  return labelForAction(assignment.action);
}

export function BackTapSettingsScreen({ navigation }: { navigation: AppNavigationProp }) {
  const { theme, typography, spacing } = useTheme();
  const { colors } = theme;
  const insets = useSafeAreaInsets();
  const alert = useAlert();
  const { settings, update } = useSettings();
  const { apps } = useApps();
  const backTap = settings.backTap;

  const setAssignment = useCallback(
    (gesture: BackTapGesture, assignment: BackTapAssignment) => {
      update('backTap', { ...backTap, [gesture]: assignment });
    },
    [backTap, update],
  );

  const pickApp = useCallback(
    (gesture: BackTapGesture) => {
      if (apps.length === 0) {
        alert('No Apps Found', 'No installed apps are available to assign.');
        return;
      }
      alert(
        'Choose App',
        undefined,
        apps.map((app) => ({
          text: app.name,
          onPress: () => setAssignment(gesture, { action: 'openApp', packageName: app.packageName }),
        })),
      );
    },
    [apps, alert, setAssignment],
  );

  const pickShortcut = useCallback(
    (gesture: BackTapGesture) => {
      alert(
        'Choose Shortcut',
        undefined,
        SHORTCUT_OPTIONS.map((opt) => ({
          text: opt.label,
          onPress: () => setAssignment(gesture, { action: 'shortcut', shortcutId: opt.id }),
        })),
      );
    },
    [alert, setAssignment],
  );

  const pickAction = useCallback(
    (gesture: BackTapGesture) => {
      alert(
        'Choose Action',
        undefined,
        ACTION_OPTIONS.map((opt) => ({
          text: opt.label,
          onPress: () => {
            if (opt.id === 'openApp') { pickApp(gesture); return; }
            if (opt.id === 'shortcut') { pickShortcut(gesture); return; }
            setAssignment(gesture, { action: opt.id });
          },
        })),
      );
    },
    [alert, pickApp, pickShortcut, setAssignment],
  );

  const deps: BackTapDeps = useMemo(() => ({
    launchApp: (packageName: string) => LauncherModule.launchApp(packageName),
    setFlashlight: (on: boolean) => LauncherModule.setFlashlight(on),
    isFlashlightOn: () => LauncherModule.isFlashlightOn(),
    getWifiEnabled: async () => (await LauncherModule.getWifiInfo())?.enabled ?? false,
    setWifiEnabled: (on: boolean) => LauncherModule.setWifiEnabled(on),
    // Sem API de captura de ecrã fiável — mesmo placeholder que
    // components/AssistiveTouch.tsx usa para a mesma acção.
    screenshot: async () => {},
    openShortcut: (id: string) => {
      const opt = SHORTCUT_OPTIONS.find((o) => o.id === id);
      if (opt) navigation.navigate(opt.route as never);
    },
  }), [navigation]);

  const testGesture = useCallback(
    (gesture: BackTapGesture) => {
      const assignment = resolveBackTap(gesture, backTap);
      if (assignment.action === 'none') {
        alert('Nothing to Test', 'This gesture has no action assigned.');
        return;
      }
      executeBackTap(assignment, deps);
    },
    [backTap, deps, alert],
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.systemGroupedBackground }]}>
      <CupertinoNavigationBar
        title="Back Tap"
        leftButton={
          <Text
            style={[typography.body, { color: colors.systemBlue }]}
            onPress={() => navigation.goBack()}
          >
            Accessibility
          </Text>
        }
      />
      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 90 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={{ paddingHorizontal: spacing.md }}>
          <CupertinoListSection footer="Double or triple tap the back of your device to trigger an action.">
            <CupertinoListTile
              title="Back Tap"
              trailing={
                <CupertinoSwitch
                  value={backTap.enabled}
                  onValueChange={(v) => update('backTap', { ...backTap, enabled: v })}
                />
              }
              showChevron={false}
              isLast
            />
          </CupertinoListSection>
        </View>

        {backTap.enabled && (
          <>
            <View style={{ paddingHorizontal: spacing.md }}>
              <CupertinoListSection header="Gestures">
                <CupertinoListTile
                  title="Double Tap"
                  trailing={
                    <Text style={[typography.body, { color: colors.secondaryLabel }]}>
                      {summaryFor(backTap.double, apps)}
                    </Text>
                  }
                  onPress={() => pickAction('double')}
                />
                <CupertinoListTile
                  title="Triple Tap"
                  trailing={
                    <Text style={[typography.body, { color: colors.secondaryLabel }]}>
                      {summaryFor(backTap.triple, apps)}
                    </Text>
                  }
                  onPress={() => pickAction('triple')}
                  isLast
                />
              </CupertinoListSection>
            </View>

            <View style={{ paddingHorizontal: spacing.md }}>
              <CupertinoListSection footer="Runs the assigned action once, the same way an actual back tap would.">
                <CupertinoListTile title="Test Double Tap" onPress={() => testGesture('double')} showChevron={false} />
                <CupertinoListTile title="Test Triple Tap" onPress={() => testGesture('triple')} showChevron={false} isLast />
              </CupertinoListSection>
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
});
