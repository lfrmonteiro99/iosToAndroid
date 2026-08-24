import React, { useState } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme/ThemeContext';
import { useWallet, PassType } from '../store/WalletStore';
import {
  CupertinoNavigationBar,
  CupertinoListSection,
  CupertinoTextField,
  CupertinoSegmentedControl,
} from '../components';
import type { AppNavigationProp, AppRouteProp } from '../navigation/types';

const PASS_TYPE_VALUES: PassType[] = ['boarding', 'ticket', 'loyalty', 'other'];
const PASS_TYPE_LABELS: Record<PassType, string> = {
  boarding: 'Boarding',
  ticket: 'Ticket',
  loyalty: 'Loyalty',
  other: 'Other',
};

// Wallet's own palette (separate from FoldersStore.FOLDER_COLORS — different
// feature, no shared dependency intended).
const PASS_COLORS = [
  '#007AFF', '#34C759', '#FF9500', '#FF3B30',
  '#AF52DE', '#5AC8FA', '#FF2D55', '#5856D6',
];

interface PassEditScreenProps {
  navigation: AppNavigationProp;
  route: AppRouteProp<'PassEdit'>;
}

export function PassEditScreen({ navigation, route }: PassEditScreenProps) {
  const { passId, prefillCode } = route.params ?? {};
  const isEditMode = Boolean(passId);

  const { theme, typography, spacing } = useTheme();
  const { colors } = theme;
  const { getPass, addPass, updatePass, deletePass } = useWallet();
  const insets = useSafeAreaInsets();

  const existing = passId ? getPass(passId) : undefined;

  const [title, setTitle] = useState(existing?.title ?? '');
  const [subtitle, setSubtitle] = useState(existing?.subtitle ?? '');
  // A scanned code (PassScanScreen) only pre-fills the field — the user still
  // has to review/edit the title and tap Done before anything is persisted.
  const [code, setCode] = useState(existing?.code ?? prefillCode ?? '');
  const [typeIndex, setTypeIndex] = useState(() => {
    if (existing) return Math.max(0, PASS_TYPE_VALUES.indexOf(existing.type));
    if (prefillCode) return Math.max(0, PASS_TYPE_VALUES.indexOf('other'));
    return 0;
  });
  const [color, setColor] = useState(existing?.color ?? PASS_COLORS[0]);

  const type = PASS_TYPE_VALUES[typeIndex];
  const canSave = title.trim().length > 0 && code.trim().length > 0;

  function handleDone() {
    if (!canSave) return;
    if (isEditMode && passId) {
      updatePass(passId, {
        title: title.trim(),
        subtitle: subtitle.trim() || undefined,
        code: code.trim(),
        type,
        color,
      });
    } else {
      addPass({
        title: title.trim(),
        subtitle: subtitle.trim() || undefined,
        code: code.trim(),
        type,
        color,
      });
    }
    navigation.goBack();
  }

  function handleDelete() {
    if (!passId) return;
    deletePass(passId);
    navigation.goBack();
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.systemGroupedBackground }]}>
      <CupertinoNavigationBar
        title={isEditMode ? 'Edit Pass' : 'New Pass'}
        largeTitle={false}
        leftButton={
          <Pressable onPress={() => navigation.goBack()} hitSlop={8} accessibilityLabel="Cancel" accessibilityRole="button">
            <Text style={[typography.body, { color: colors.systemBlue }]}>Cancel</Text>
          </Pressable>
        }
        rightButton={
          <Pressable onPress={handleDone} disabled={!canSave} hitSlop={8} accessibilityLabel="Done" accessibilityRole="button">
            <Text
              style={[
                typography.headline,
                { color: canSave ? colors.systemBlue : colors.secondaryLabel },
              ]}
            >
              Done
            </Text>
          </Pressable>
        }
      />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={{
          paddingTop: spacing.lg,
          paddingBottom: insets.bottom + 90,
          paddingHorizontal: 16,
        }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <CupertinoListSection>
          <CupertinoTextField
            value={title}
            onChangeText={setTitle}
            placeholder="Title"
            autoCorrect={false}
            containerStyle={styles.fieldContainer}
          />
          <CupertinoTextField
            value={subtitle}
            onChangeText={setSubtitle}
            placeholder="Subtitle (optional)"
            autoCorrect={false}
            containerStyle={styles.fieldContainer}
          />
        </CupertinoListSection>

        <CupertinoListSection>
          <CupertinoTextField
            value={code}
            onChangeText={setCode}
            placeholder="Code / value"
            autoCapitalize="none"
            autoCorrect={false}
            containerStyle={styles.fieldContainer}
          />
        </CupertinoListSection>

        <Text style={[typography.footnote, { color: colors.secondaryLabel, marginBottom: 6, marginTop: 8 }]}>
          TYPE
        </Text>
        <CupertinoSegmentedControl
          values={PASS_TYPE_VALUES.map((t) => PASS_TYPE_LABELS[t])}
          selectedIndex={typeIndex}
          onChange={setTypeIndex}
          testID="pass-edit-type-segment"
        />

        <Text style={[typography.footnote, { color: colors.secondaryLabel, marginBottom: 6, marginTop: 20 }]}>
          COLOUR
        </Text>
        <View style={styles.colorRow}>
          {PASS_COLORS.map((c) => {
            const selected = c === color;
            return (
              <Pressable
                key={c}
                onPress={() => setColor(c)}
                accessibilityRole="button"
                accessibilityLabel={`Colour ${c}`}
                style={[
                  styles.colorSwatch,
                  { backgroundColor: c },
                  selected && { borderColor: colors.label, borderWidth: 3 },
                ]}
              >
                {selected && <Ionicons name="checkmark" size={16} color="#FFFFFF" />}
              </Pressable>
            );
          })}
        </View>

        {isEditMode && (
          <Pressable
            onPress={handleDelete}
            accessibilityRole="button"
            accessibilityLabel="Delete pass"
            style={[styles.deleteRow, { backgroundColor: colors.secondarySystemGroupedBackground }]}
          >
            <Text style={[typography.body, { color: colors.systemRed }]}>Delete Pass</Text>
          </Pressable>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  fieldContainer: {
    marginBottom: 1,
  },
  colorRow: { flexDirection: 'row', flexWrap: 'wrap' },
  colorSwatch: {
    width: 36,
    height: 36,
    borderRadius: 18,
    marginRight: 12,
    marginBottom: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteRow: {
    alignItems: 'center',
    minHeight: 44,
    justifyContent: 'center',
    borderRadius: 10,
    marginTop: 24,
  },
});
