import React, { useCallback, useMemo } from 'react';
import { View, Text, ScrollView, StyleSheet, Linking } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../theme/ThemeContext';
import {
  CupertinoNavigationBar,
  CupertinoListSection,
  CupertinoListTile,
  CupertinoSwitch,
  CupertinoTextField,
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
  type BackTapResult,
  resolveBackTap,
  executeBackTap,
} from '../../utils/backTap';
import type { AppNavigationProp } from '../../navigation/types';

const ACTION_OPTIONS: { id: BackTapAction; label: string }[] = [
  { id: 'none', label: 'None' },
  { id: 'flash', label: 'Flashlight' },
  { id: 'toggleWifi', label: 'Toggle Wi-Fi' },
  { id: 'openApp', label: 'Open App' },
  { id: 'openCamera', label: 'Open Camera' },
  { id: 'shortcut', label: 'Shortcut' },
  { id: 'screenshot', label: 'Screenshot' },
  { id: 'startRecording', label: 'Screen Recording' },
  { id: 'sendMessage', label: 'Send Message' },
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
  if (assignment.action === 'sendMessage' && assignment.smsAddress) {
    return assignment.smsAddress;
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
            if (opt.id === 'sendMessage') {
              // Precisa de destinatário: mantém o que já estivesse configurado
              // e revela o formulário abaixo (a acção só dispara com address).
              const previous = backTap[gesture];
              setAssignment(gesture, {
                action: 'sendMessage',
                smsAddress: previous.action === 'sendMessage' ? (previous.smsAddress ?? '') : '',
                smsBody: previous.action === 'sendMessage' ? (previous.smsBody ?? '') : '',
              });
              return;
            }
            setAssignment(gesture, { action: opt.id });
          },
        })),
      );
    },
    [alert, backTap, pickApp, pickShortcut, setAssignment],
  );

  const deps: BackTapDeps = useMemo(() => ({
    launchApp: (packageName: string) => LauncherModule.launchApp(packageName),
    setFlashlight: (on: boolean) => LauncherModule.setFlashlight(on),
    isFlashlightOn: () => LauncherModule.isFlashlightOn(),
    getWifiEnabled: async () => (await LauncherModule.getWifiInfo())?.enabled ?? false,
    setWifiEnabled: (on: boolean) => LauncherModule.setWifiEnabled(on),
    // A câmara é in-app (CameraScreen), como no LockScreen — o launcher não
    // salta para a app de câmara do sistema.
    openCamera: () => { navigation.navigate('Camera' as never); },
    // Screenshot e gravação de ecrã exigem MediaProjection, com consentimento
    // explícito por sessão (impossível silenciosamente desde Android 5.0). Não
    // existe bridge de MediaProjection em modules/launcher-module e android/
    // está fora do alcance deste issue, por isso o executor reporta
    // 'unavailable' e a UI diz o porquê, em vez de fingir sucesso.
    screenshot: async () => 'unavailable' as const,
    startRecording: async () => 'unavailable' as const,
    // ACTION_SENDTO (smsto:) abre o compositor da app de mensagens com
    // destinatário e texto — não precisa da permissão SEND_SMS.
    sendMessage: async (address: string, body: string) => {
      const url = `smsto:${encodeURIComponent(address)}${body ? `?body=${encodeURIComponent(body)}` : ''}`;
      await Linking.openURL(url);
    },
    openShortcut: (id: string) => {
      const opt = SHORTCUT_OPTIONS.find((o) => o.id === id);
      if (opt) navigation.navigate(opt.route as never);
    },
  }), [navigation]);

  const reportResult = useCallback(
    (result: BackTapResult) => {
      if (result.status === 'ok' || result.status === 'noop') return;
      if (result.status === 'unavailable') {
        alert(
          'Not Available',
          result.action === 'startRecording'
            ? 'Screen recording needs screen-capture consent, which this device build does not provide.'
            : 'Screenshots need screen-capture consent, which this device build does not provide.',
        );
        return;
      }
      if (result.status === 'denied') {
        alert('Permission Denied', 'Screen capture was not allowed, so nothing was captured.');
        return;
      }
      alert('Action Failed', 'The assigned action could not be completed.');
    },
    [alert],
  );

  const testGesture = useCallback(
    (gesture: BackTapGesture) => {
      const assignment = resolveBackTap(gesture, backTap);
      if (assignment.action === 'none') {
        alert('Nothing to Test', 'This gesture has no action assigned.');
        return;
      }
      if (assignment.action === 'sendMessage' && !assignment.smsAddress?.trim()) {
        alert('No Recipient', 'Add a recipient before testing Send Message.');
        return;
      }
      executeBackTap(assignment, deps).then(reportResult);
    },
    [backTap, deps, alert, reportResult],
  );

  const renderMessageFields = (gesture: BackTapGesture) => {
    const assignment = backTap[gesture];
    if (assignment.action !== 'sendMessage') return null;
    const title = gesture === 'double' ? 'Double Tap Message' : 'Triple Tap Message';
    return (
      <View style={{ paddingHorizontal: spacing.md }}>
        <CupertinoListSection
          header={title}
          footer="The message app opens with the recipient and text filled in; you still press send."
        >
          <CupertinoListTile
            title="To"
            showChevron={false}
            trailing={
              <CupertinoTextField
                testID={`backtap-${gesture}-address`}
                value={assignment.smsAddress ?? ''}
                placeholder="Phone number"
                keyboardType="phone-pad"
                onChangeText={(text) =>
                  setAssignment(gesture, { ...assignment, smsAddress: text })
                }
                containerStyle={styles.field}
              />
            }
          />
          <CupertinoListTile
            title="Message"
            showChevron={false}
            isLast
            trailing={
              <CupertinoTextField
                testID={`backtap-${gesture}-body`}
                value={assignment.smsBody ?? ''}
                placeholder="On my way"
                onChangeText={(text) => setAssignment(gesture, { ...assignment, smsBody: text })}
                containerStyle={styles.field}
              />
            }
          />
        </CupertinoListSection>
      </View>
    );
  };

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
              <CupertinoListSection
                header="Gestures"
                footer="On Android 10 and later, Toggle Wi-Fi opens the system Wi-Fi panel instead of switching Wi-Fi directly — Android no longer lets apps do it silently."
              >
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

            {renderMessageFields('double')}
            {renderMessageFields('triple')}

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
  field: { minWidth: 180, marginVertical: 0 },
});
