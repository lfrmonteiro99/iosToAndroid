import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme/ThemeContext';
import { CupertinoButton } from '../components/CupertinoButton';
import { CupertinoActionSheet } from '../components/CupertinoActionSheet';
import { ACTION_CATALOG } from './templates';
import { Automation, AutomationAction } from './types';
import {
  addAction,
  removeAction,
  reorderAction,
  setEnabled,
  renameAutomation,
  updateAction,
  summaryLine,
  isValid,
} from './editorLogic';

interface AutomationEditorScreenProps {
  automation: Automation;
  onClose: (next: Automation) => void;
}

// The Shortcuts-style editor: a "When" trigger card followed by a stack of "Do"
// action cards, plus an Add-action Sheet. Editing is local state; "Done" hands
// the mutated Automation back via onClose. All logic lives in editorLogic.ts so
// it is unit-tested independently of rendering.

export function AutomationEditorScreen({ automation, onClose }: AutomationEditorScreenProps) {
  const { theme, typography, borderRadius } = useTheme();
  const { colors } = theme;

  const [draft, setDraft] = useState<Automation>(automation);
  const [sheetVisible, setSheetVisible] = useState(false);

  const valid = useMemo(() => isValid(draft), [draft]);
  const summary = useMemo(() => summaryLine(draft), [draft]);

  const handleAdd = useCallback((type: AutomationAction['type']) => {
    setDraft((prev) => addAction(prev, type));
    setSheetVisible(false);
  }, []);

  const handleRemove = useCallback((id: string) => {
    setDraft((prev) => removeAction(prev, id));
  }, []);

  const handleMove = useCallback((id: string, dir: 'up' | 'down') => {
    setDraft((prev) => reorderAction(prev, id, dir));
  }, []);

  const handleLabelChange = useCallback((id: string, text: string) => {
    setDraft((prev) => updateAction(prev, id, { label: text }));
  }, []);

  const handleDone = useCallback(() => {
    if (!isValid(draft)) return;
    onClose(draft);
  }, [draft, onClose]);

  const sheetOptions = useMemo(
    () =>
      ACTION_CATALOG.map((entry) => ({
        label: entry.label,
        onPress: () => handleAdd(entry.type),
      })),
    [handleAdd],
  );

  return (
    <View style={[styles.screen, { backgroundColor: colors.systemBackground }]}>
      <View style={[styles.header, { borderBottomColor: colors.separator }]}>
        <Pressable
          testID="editor-cancel"
          accessibilityRole="button"
          onPress={() => onClose(draft)}
          style={styles.headerBtn}
        >
          <Text style={[typography.body, { color: colors.systemBlue }]}>Cancel</Text>
        </Pressable>
        <Text style={[typography.headline, { color: colors.label }]}>{draft.name}</Text>
        <Pressable
          testID="editor-done"
          accessibilityRole="button"
          disabled={!valid}
          accessibilityState={{ disabled: !valid }}
          onPress={handleDone}
          style={styles.headerBtn}
        >
          <Text
            style={[
              typography.body,
              { color: valid ? colors.systemBlue : colors.tertiaryLabel, fontWeight: '600' },
            ]}
          >
            Done
          </Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        {/* Name */}
        <TextInput
          testID="editor-name"
          style={[
            typography.title3,
            styles.nameInput,
            { color: colors.label },
          ]}
          value={draft.name}
          placeholder="Automation name"
          placeholderTextColor={colors.tertiaryLabel}
          onChangeText={(t) => setDraft((prev) => renameAutomation(prev, t))}
        />

        {/* WHEN card */}
        <View style={[styles.card, { backgroundColor: colors.secondarySystemBackground, borderRadius: borderRadius.large }]}>
          <Text style={[typography.footnote, { color: colors.secondaryLabel, fontWeight: '700' }]}>
            WHEN
          </Text>
          <View style={styles.stepRow}>
            <View style={[styles.stepIcon, { backgroundColor: colors.systemBlue }]}>
              <Ionicons name="time" size={18} color="#fff" />
            </View>
            <Text style={[typography.body, { color: colors.label, flex: 1 }]}>
              {draft.trigger.label}
            </Text>
          </View>
        </View>

        {/* Summary line */}
        <Text style={[typography.footnote, { color: colors.secondaryLabel, marginTop: 4, marginBottom: 8 }]}>
          {summary}
        </Text>

        {/* DO header */}
        <Text style={[typography.footnote, { color: colors.secondaryLabel, fontWeight: '700', marginTop: 8 }]}>
          DO
        </Text>

        {draft.actions.map((actionItem, index) => (
          <View
            key={actionItem.id}
            testID={`action-card-${actionItem.id}`}
            style={[
              styles.card,
              styles.actionCard,
              { backgroundColor: colors.secondarySystemBackground, borderRadius: borderRadius.large },
            ]}
          >
            <View style={styles.stepRow}>
              <View style={[styles.stepIcon, { backgroundColor: colors.systemGreen }]}>
                <Ionicons name="play" size={16} color="#fff" />
              </View>
              <TextInput
                style={[typography.body, { color: colors.label, flex: 1 }]}
                value={actionItem.label}
                placeholder="Action"
                placeholderTextColor={colors.tertiaryLabel}
                onChangeText={(t) => handleLabelChange(actionItem.id, t)}
              />
              <Pressable
                testID={`move-up-action-${actionItem.id}`}
                accessibilityRole="button"
                disabled={index === 0}
                onPress={() => handleMove(actionItem.id, 'up')}
                style={styles.iconBtn}
              >
                <Ionicons name="chevron-up" size={18} color={index === 0 ? colors.tertiaryLabel : colors.systemBlue} />
              </Pressable>
              <Pressable
                testID={`move-down-action-${actionItem.id}`}
                accessibilityRole="button"
                disabled={index === draft.actions.length - 1}
                onPress={() => handleMove(actionItem.id, 'down')}
                style={styles.iconBtn}
              >
                <Ionicons name="chevron-down" size={18} color={index === draft.actions.length - 1 ? colors.tertiaryLabel : colors.systemBlue} />
              </Pressable>
              <Pressable
                testID={`remove-action-${actionItem.id}`}
                accessibilityRole="button"
                onPress={() => handleRemove(actionItem.id)}
                style={styles.iconBtn}
              >
                <Ionicons name="trash-outline" size={18} color={colors.systemRed} />
              </Pressable>
            </View>
          </View>
        ))}

        {/* Add action */}
        <Pressable
          testID="add-action"
          accessibilityRole="button"
          onPress={() => setSheetVisible(true)}
          style={[styles.addRow, { borderColor: colors.separator }]}
        >
          <Ionicons name="add-circle" size={20} color={colors.systemBlue} />
          <Text style={[typography.body, { color: colors.systemBlue, marginLeft: 8 }]}>
            Add Action
          </Text>
        </Pressable>

        {/* Enabled toggle */}
        <Pressable
          testID="editor-enabled"
          accessibilityRole="switch"
          accessibilityState={{ checked: draft.enabled }}
          onPress={() => setDraft((prev) => setEnabled(prev, !prev.enabled))}
          style={[styles.enabledRow, { borderTopColor: colors.separator }]}
        >
          <Text style={[typography.body, { color: colors.label }]}>Enabled</Text>
          <View style={[styles.togglePill, { backgroundColor: draft.enabled ? colors.systemGreen : colors.systemGray4 }]}>
            <View style={[styles.toggleKnob, { marginLeft: draft.enabled ? 18 : 2 }]} />
          </View>
        </Pressable>
      </ScrollView>

      <CupertinoActionSheet
        visible={sheetVisible}
        onClose={() => setSheetVisible(false)}
        title="Add Action"
        options={sheetOptions}
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
  nameInput: { fontWeight: '600', marginBottom: 12 },
  card: { padding: 14, marginTop: 8 },
  actionCard: { marginTop: 8 },
  stepRow: { flexDirection: 'row', alignItems: 'center', marginTop: 8 },
  stepIcon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  iconBtn: { paddingHorizontal: 6, paddingVertical: 4 },
  addRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    paddingVertical: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
  },
  enabledRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 20,
    paddingTop: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  togglePill: {
    width: 51,
    height: 31,
    borderRadius: 16,
    padding: 2,
    justifyContent: 'center',
  },
  toggleKnob: {
    width: 27,
    height: 27,
    borderRadius: 14,
    backgroundColor: '#fff',
  },
});

export default AutomationEditorScreen;
