import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, Pressable, Modal, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  CupertinoNavigationBar,
  CupertinoSwipeableRow,
  CupertinoEmptyState,
} from '../components';
import { useTheme } from '../theme/ThemeContext';
import { useSettings } from '../store/SettingsStore';
import { useShortcuts } from '../store/ShortcutsStore';
import { executeShortcut, type Shortcut } from '../utils/shortcutsDispatch';
import type { AppNavigationProp } from '../navigation/types';

// ─── Templates fixos embutidos (#782, parte de #629) ───────────────────────
//
// "Start Work" liga o Focus mode 'work'; "Going Home" desliga-o ('off'). O
// Focus mode já existe em SettingsStore (settings.focusMode / setFocusMode) —
// estes templates reutilizam-no via o dispatcher em vez de criar um estado de
// modo paralelo.
const SHORTCUT_TEMPLATES: Shortcut[] = [
  {
    id: 'template-start-work',
    name: 'Start Work',
    actions: [
      {
        id: 'action-start-work-focus',
        type: 'setFocusMode',
        label: 'Set Focus mode to Work',
        payload: { mode: 'work' },
      },
    ],
  },
  {
    id: 'template-going-home',
    name: 'Going Home',
    actions: [
      {
        id: 'action-going-home-focus',
        type: 'setFocusMode',
        label: 'Turn Focus mode off',
        payload: { mode: 'off' },
      },
    ],
  },
];

export function ShortcutsScreen({ navigation }: { navigation: AppNavigationProp }) {
  const { theme, typography } = useTheme();
  const { colors } = theme;
  const { setFocusMode } = useSettings();
  const { shortcuts, addShortcut, removeShortcut } = useShortcuts();
  const [openRowId, setOpenRowId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Shortcut | null>(null);

  const runShortcut = useCallback(
    (shortcut: Shortcut) => {
      executeShortcut(shortcut, { setFocusMode });
    },
    [setFocusMode],
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.systemGroupedBackground }]}>
      <CupertinoNavigationBar
        title="Shortcuts"
        leftButton={
          <Pressable
            onPress={() => navigation.goBack()}
            hitSlop={8}
            accessibilityLabel="Go back"
            accessibilityRole="button"
          >
            <Ionicons name="chevron-back" size={28} color={colors.systemBlue} />
          </Pressable>
        }
      >
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <Text
            style={[typography.footnote, styles.sectionHeader, { color: colors.secondaryLabel }]}
          >
            MY SHORTCUTS
          </Text>
          {shortcuts.length === 0 ? (
            <CupertinoEmptyState
              icon="flash-outline"
              title="No Shortcuts"
              message="Add a template below to get started."
            />
          ) : (
            <View
              style={[
                styles.section,
                { backgroundColor: colors.secondarySystemGroupedBackground },
              ]}
            >
              {shortcuts.map((shortcut) => (
                <CupertinoSwipeableRow
                  key={shortcut.id}
                  isOpen={openRowId === shortcut.id}
                  onOpen={() => setOpenRowId(shortcut.id)}
                  trailingActions={[
                    {
                      label: `Delete ${shortcut.name}`,
                      color: colors.systemRed,
                      onPress: () => removeShortcut(shortcut.id),
                    },
                  ]}
                >
                  <Pressable
                    onPress={() => setDetail(shortcut)}
                    style={[styles.row, { borderBottomColor: colors.separator }]}
                    accessibilityRole="button"
                    accessibilityLabel={shortcut.name}
                  >
                    <Text style={[typography.body, { color: colors.label }]}>{shortcut.name}</Text>
                    <Pressable
                      onPress={() => runShortcut(shortcut)}
                      hitSlop={8}
                      accessibilityLabel={`Run ${shortcut.name}`}
                      accessibilityRole="button"
                    >
                      <Ionicons name="play-circle" size={28} color={colors.systemBlue} />
                    </Pressable>
                  </Pressable>
                </CupertinoSwipeableRow>
              ))}
            </View>
          )}

          <Text
            style={[typography.footnote, styles.sectionHeader, { color: colors.secondaryLabel }]}
          >
            TEMPLATES
          </Text>
          <View
            style={[styles.section, { backgroundColor: colors.secondarySystemGroupedBackground }]}
          >
            {SHORTCUT_TEMPLATES.map((template) => (
              <View key={template.id} style={[styles.row, { borderBottomColor: colors.separator }]}>
                <Text style={[typography.body, { color: colors.label }]}>{template.name}</Text>
                <View style={styles.templateActions}>
                  <Pressable
                    onPress={() => addShortcut(template)}
                    hitSlop={8}
                    accessibilityLabel={`Add ${template.name}`}
                    accessibilityRole="button"
                    style={styles.templateAction}
                  >
                    <Ionicons name="add-circle-outline" size={26} color={colors.systemBlue} />
                  </Pressable>
                  <Pressable
                    onPress={() => runShortcut(template)}
                    hitSlop={8}
                    accessibilityLabel={`Run ${template.name}`}
                    accessibilityRole="button"
                    style={styles.templateAction}
                  >
                    <Ionicons name="play-circle" size={26} color={colors.systemBlue} />
                  </Pressable>
                </View>
              </View>
            ))}
          </View>
        </ScrollView>
      </CupertinoNavigationBar>

      <Modal
        visible={detail !== null}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setDetail(null)}
      >
        <View style={[styles.modalContainer, { backgroundColor: colors.systemGroupedBackground }]}>
          <View style={styles.modalHeader}>
            <Text style={[typography.headline, { color: colors.label }]}>{detail?.name}</Text>
            <Pressable onPress={() => setDetail(null)} accessibilityLabel="Close" accessibilityRole="button">
              <Text style={[typography.body, { color: colors.systemBlue }]}>Done</Text>
            </Pressable>
          </View>
          {detail?.actions.map((action) => (
            <Text
              key={action.id}
              style={[typography.body, styles.modalActionLabel, { color: colors.secondaryLabel }]}
            >
              {action.label}
            </Text>
          ))}
          {detail ? (
            <Pressable
              onPress={() => {
                runShortcut(detail);
                setDetail(null);
              }}
              accessibilityLabel={`Run ${detail.name}`}
              accessibilityRole="button"
              style={styles.modalRunButton}
            >
              <Text style={[typography.body, { color: colors.systemBlue }]}>Run</Text>
            </Pressable>
          ) : null}
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 40,
  },
  sectionHeader: {
    marginHorizontal: 16,
    marginTop: 24,
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  section: {
    marginHorizontal: 16,
    borderRadius: 10,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  templateActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  templateAction: {
    padding: 2,
  },
  modalContainer: {
    flex: 1,
    paddingTop: 24,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  modalActionLabel: {
    marginHorizontal: 16,
    marginTop: 8,
  },
  modalRunButton: {
    marginTop: 24,
    marginHorizontal: 16,
    alignItems: 'center',
    paddingVertical: 12,
  },
});
