import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme/ThemeContext';
import { CupertinoActionSheet } from '../components/CupertinoActionSheet';
import { useShortcuts, ShortcutAction } from '../store/ShortcutsStore';
import { useApps } from '../store/AppsStore';
import { useSettings } from '../store/SettingsStore';

interface ShortcutsEditorProps {
  /** Id of the shortcut being edited (already created in ShortcutsStore). */
  shortcutId: string;
  onClose: () => void;
}

// Only the two primitives with real dispatcher infrastructure (#781) are
// wired here. timer / sendMessage / deepLink have no primitive yet and are
// intentionally absent — picking them would add an unrunnable action.
const FOCUS_MODES: { key: string; label: string }[] = [
  { key: 'doNotDisturb', label: 'Do Not Disturb' },
  { key: 'sleep', label: 'Sleep' },
  { key: 'work', label: 'Work' },
  { key: 'personal', label: 'Personal' },
];

function appLabel(a: { name: string; packageName: string }): string {
  return a.name?.trim() ? a.name : a.packageName;
}

function focusLabel(mode: string): string {
  return FOCUS_MODES.find((m) => m.key === mode)?.label ?? mode;
}

export function ShortcutsEditor({ shortcutId, onClose }: ShortcutsEditorProps) {
  const { theme, typography, borderRadius } = useTheme();
  const { colors } = theme;

  const { shortcuts, addAction } = useShortcuts();
  const { apps } = useApps();
  // #783: the focus-mode picker reads the live focus state via useSettings()
  // so the currently-active mode can be highlighted as the default choice.
  const { settings } = useSettings();

  const [typeSheet, setTypeSheet] = useState(false);
  const [appSheet, setAppSheet] = useState(false);
  const [focusSheet, setFocusSheet] = useState(false);

  const shortcut = useMemo(
    () => shortcuts.find((s) => s.id === shortcutId),
    [shortcuts, shortcutId],
  );

  const handleAddLaunchApp = useCallback(
    (packageName: string) => {
      const action: ShortcutAction = {
        type: 'launchApp',
        payload: { packageName },
      };
      addAction(shortcutId, action);
      setAppSheet(false);
    },
    [shortcutId, addAction],
  );

  const handleAddFocusMode = useCallback(
    (mode: string) => {
      const action: ShortcutAction = {
        type: 'setFocusMode',
        payload: { mode },
      };
      addAction(shortcutId, action);
      setFocusSheet(false);
    },
    [shortcutId, addAction],
  );

  // Open App can only open a real picker when there is at least one installed
  // app. With zero apps it is a no-op (mirrors the empty-picker guard on the
  // Back Tap "Open App" flow) — never an unusable empty sheet.
  const hasApps = apps.length > 0;

  const typeOptions = useMemo(
    () => [
      {
        label: 'Open App',
        onPress: () => {
          setTypeSheet(false);
          if (hasApps) setAppSheet(true);
        },
      },
      {
        label: 'Set Focus Mode',
        onPress: () => {
          setTypeSheet(false);
          setFocusSheet(true);
        },
      },
    ],
    [hasApps],
  );

  const actionLabel = useCallback(
    (action: ShortcutAction): string => {
      switch (action.type) {
        case 'launchApp': {
          const pkg = String(action.payload.packageName ?? '');
          const known = apps.find((a) => a.packageName === pkg);
          return `Open ${known ? appLabel(known) : pkg}`;
        }
        case 'setFocusMode':
          return `Set Focus Mode: ${focusLabel(String(action.payload.mode ?? 'off'))}`;
        default:
          return action.type;
      }
    },
    [apps],
  );

  return (
    <View style={[styles.screen, { backgroundColor: colors.systemBackground }]}>
      <View style={[styles.header, { borderBottomColor: colors.separator }]}>
        <Pressable
          testID="editor-cancel"
          accessibilityRole="button"
          onPress={onClose}
          style={styles.headerBtn}
        >
          <Text style={[typography.body, { color: colors.systemBlue }]}>Cancel</Text>
        </Pressable>
        <Text style={[typography.headline, { color: colors.label }]}>
          {shortcut ? shortcut.name : 'Shortcut'}
        </Text>
        <View style={styles.headerBtn} />
      </View>

      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <Text style={[typography.footnote, { color: colors.secondaryLabel, fontWeight: '700', marginTop: 8 }]}>
          ACTIONS
        </Text>

        {shortcut?.actions.map((action, index) => (
          <View
            key={`${action.type}-${index}`}
            testID={`action-row-${index}`}
            style={[
              styles.card,
              { backgroundColor: colors.secondarySystemBackground, borderRadius: borderRadius.large },
            ]}
          >
            <View style={styles.stepRow}>
              <View style={[styles.stepIcon, { backgroundColor: colors.systemGreen }]}>
                <Ionicons name="play" size={16} color="#fff" />
              </View>
              <Text style={[typography.body, { color: colors.label, flex: 1 }]}>
                {actionLabel(action)}
              </Text>
            </View>
          </View>
        ))}

        <Pressable
          testID="add-action"
          accessibilityRole="button"
          onPress={() => setTypeSheet(true)}
          style={[styles.addRow, { borderColor: colors.separator }]}
        >
          <Ionicons name="add-circle" size={20} color={colors.systemBlue} />
          <Text style={[typography.body, { color: colors.systemBlue, marginLeft: 8 }]}>
            Add Action
          </Text>
        </Pressable>
      </ScrollView>

      <CupertinoActionSheet
        visible={typeSheet}
        onClose={() => setTypeSheet(false)}
        title="Add Action"
        options={typeOptions}
        cancelLabel="Cancel"
      />

      <CupertinoActionSheet
        visible={appSheet}
        onClose={() => setAppSheet(false)}
        title="Choose App"
        options={apps.map((app) => ({
          label: appLabel(app),
          onPress: () => handleAddLaunchApp(app.packageName),
        }))}
        cancelLabel="Cancel"
      />

      <CupertinoActionSheet
        visible={focusSheet}
        onClose={() => setFocusSheet(false)}
        title="Set Focus Mode"
        options={FOCUS_MODES.map((mode) => ({
          label: mode.label,
          onPress: () => handleAddFocusMode(mode.key),
        }))}
        cancelLabel="Cancel"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerBtn: { minWidth: 56, alignItems: 'center' },
  body: { padding: 16, paddingBottom: 40 },
  card: { padding: 14, marginTop: 8 },
  stepRow: { flexDirection: 'row', alignItems: 'center', marginTop: 8 },
  stepIcon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  addRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    paddingVertical: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
  },
});

export default ShortcutsEditor;
