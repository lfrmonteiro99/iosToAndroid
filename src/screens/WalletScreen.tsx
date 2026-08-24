import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from '../theme/ThemeContext';
import { useWallet, PassType } from '../store/WalletStore';
import { useCard, WalletCard } from '../store/CardStore';
import { BRAND_LABELS } from './CardEditScreen';
import {
  CupertinoNavigationBar,
  CupertinoEmptyState,
  CupertinoListSection,
  CupertinoListTile,
  CupertinoTextField,
  CupertinoSegmentedControl,
} from '../components';
import type { AppNavigationProp } from '../navigation/types';

const PASS_TYPE_VALUES: PassType[] = ['boarding', 'ticket', 'loyalty', 'other'];
const PASS_TYPE_LABELS: Record<PassType, string> = {
  boarding: 'Boarding',
  ticket: 'Ticket',
  loyalty: 'Loyalty',
  other: 'Other',
};

// Default palette for the free-text colour picker. Plain, non-sensitive JSON —
// see issue #125: no payment data, so a colour swatch is enough.
const COLOR_SWATCHES = [
  '#007AFF', '#34C759', '#FF9500', '#FF3B30',
  '#AF52DE', '#5AC8FA', '#FF2D55', '#5856D6',
];

function PassRow({
  pass,
  onPress,
}: {
  pass: ReturnType<typeof useWallet>['passes'][number];
  onPress: () => void;
}) {
  const { theme, typography } = useTheme();
  const { colors } = theme;
  return (
    <CupertinoListTile
      title={pass.title}
      subtitle={pass.subtitle || PASS_TYPE_LABELS[pass.type]}
      leading={{ name: 'ticket', color: '#FFFFFF', backgroundColor: pass.color }}
      onPress={onPress}
      trailing={
        <View style={styles.codeBadge}>
          <Text style={[typography.caption2, { color: colors.secondaryLabel }]} numberOfLines={1}>
            {pass.code}
          </Text>
        </View>
      }
    />
  );
}

const BRAND_ICON_COLOR: Record<WalletCard['brand'], string> = {
  visa: '#1A1F71',
  mastercard: '#EB001B',
  amex: '#2E77BC',
  other: '#8E8E93',
};

function CardRow({ card }: { card: WalletCard }) {
  const { theme, typography } = useTheme();
  const { colors } = theme;
  return (
    <CupertinoListTile
      title={card.label}
      subtitle={BRAND_LABELS[card.brand]}
      showChevron={false}
      leading={{ name: 'card', color: '#FFFFFF', backgroundColor: BRAND_ICON_COLOR[card.brand] }}
      trailing={
        <Text style={[typography.body, { color: colors.secondaryLabel }]}>
          {`•••• ${card.last4}`}
        </Text>
      }
    />
  );
}

function AddPassSheet({ onClose }: { onClose: () => void }) {
  const { theme, typography, spacing } = useTheme();
  const safeInsets = useSafeAreaInsets();
  const { colors } = theme;
  const { addPass } = useWallet();

  const [title, setTitle] = useState('');
  const [subtitle, setSubtitle] = useState('');
  const [code, setCode] = useState('');
  const [typeIndex, setTypeIndex] = useState(0);
  const [color, setColor] = useState(COLOR_SWATCHES[0]);

  const type = PASS_TYPE_VALUES[typeIndex];
  const canSave = title.trim().length > 0 && code.trim().length > 0;

  const handleSave = useCallback(() => {
    if (!canSave) return;
    addPass({
      type,
      title: title.trim(),
      subtitle: subtitle.trim() || undefined,
      code: code.trim(),
      color,
    });
    onClose();
  }, [addPass, canSave, type, title, subtitle, code, color, onClose]);

  return (
    <View style={[styles.sheet, { backgroundColor: colors.systemGroupedBackground }]}>
      <View style={[styles.sheetHandle, { backgroundColor: colors.systemGray4 }]} />
      <View style={styles.sheetHeader}>
        <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Cancel">
          <Text style={[typography.body, { color: colors.systemBlue }]}>Cancel</Text>
        </Pressable>
        <Text style={[typography.headline, { color: colors.label }]}>New Pass</Text>
        <Pressable
          onPress={handleSave}
          disabled={!canSave}
          accessibilityRole="button"
          accessibilityLabel="Save pass"
        >
          <Text style={[typography.body, { color: canSave ? colors.systemBlue : colors.systemGray3 }]}>
            Add
          </Text>
        </Pressable>
      </View>

      <ScrollView
        style={styles.sheetBody}
        contentContainerStyle={{ paddingHorizontal: spacing.md, paddingBottom: safeInsets.bottom + 24 }}
        keyboardShouldPersistTaps="handled"
      >
        <CupertinoTextField
          value={title}
          onChangeText={setTitle}
          placeholder="Title"
        />
        <View style={styles.fieldSpacer} />
        <CupertinoTextField
          value={subtitle}
          onChangeText={setSubtitle}
          placeholder="Subtitle (optional)"
        />
        <View style={styles.fieldSpacer} />
        <CupertinoTextField
          value={code}
          onChangeText={setCode}
          placeholder="Code / value"
        />
        <View style={styles.fieldSpacer} />

        <Text style={[typography.footnote, { color: colors.secondaryLabel, marginBottom: 6 }]}>
          TYPE
        </Text>
        <CupertinoSegmentedControl
          values={PASS_TYPE_VALUES.map((t) => PASS_TYPE_LABELS[t])}
          selectedIndex={typeIndex}
          onChange={setTypeIndex}
          testID="wallet-pass-type-segment"
        />
        <View style={styles.fieldSpacer} />

        <Text style={[typography.footnote, { color: colors.secondaryLabel, marginBottom: 6 }]}>
          COLOUR
        </Text>
        <View style={styles.colorRow}>
          {COLOR_SWATCHES.map((c) => {
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
                {selected && (
                  <Ionicons name="checkmark" size={16} color="#FFFFFF" />
                )}
              </Pressable>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}

export function WalletScreen() {
  const navigation = useNavigation<AppNavigationProp>();
  const { theme, typography, spacing } = useTheme();
  const { colors } = theme;
  const insets = useSafeAreaInsets();
  const { passes, isReady: walletReady } = useWallet();
  const { cards, isReady: cardsReady } = useCard();
  const [adding, setAdding] = useState(false);

  const isReady = walletReady && cardsReady;

  const handleAddPressed = useCallback(() => setAdding(true), []);
  const handleCloseSheet = useCallback(() => setAdding(false), []);
  const handleAddCardPressed = useCallback(() => navigation.navigate('CardEdit'), [navigation]);

  return (
    <View style={[styles.container, { backgroundColor: colors.systemGroupedBackground }]}>
      <StatusBar style={theme.dark ? 'light' : 'dark'} />
      <CupertinoNavigationBar
        title="Wallet"
        largeTitle={false}
        rightButton={
          <Pressable
            onPress={handleAddPressed}
            accessibilityRole="button"
            accessibilityLabel="Add pass"
            style={{ flexDirection: 'row', alignItems: 'center' }}
          >
            <Ionicons name="add" size={26} color={colors.systemBlue} />
          </Pressable>
        }
      />

      {!isReady ? (
        <View style={styles.body} />
      ) : passes.length === 0 && cards.length === 0 ? (
        <CupertinoEmptyState
          icon="wallet-outline"
          title="No Passes"
          message="Add a boarding pass, ticket or loyalty card to get started."
          actionLabel="Add Pass"
          onAction={handleAddPressed}
        />
      ) : (
        <ScrollView
          style={styles.body}
          contentContainerStyle={{ paddingHorizontal: spacing.md, paddingBottom: insets.bottom + 24 }}
        >
          {passes.length > 0 && (
            <CupertinoListSection header="Passes">
              {passes.map((pass) => (
                <PassRow
                  key={pass.id}
                  pass={pass}
                  onPress={() => {
                    // Editing is out of scope for #125 — tapping selects nothing
                    // destructive. The long-press delete path lives on the tile
                    // trailing action via the share sheet below.
                  }}
                />
              ))}
            </CupertinoListSection>
          )}

          <Pressable
            onPress={handleAddPressed}
            accessibilityRole="button"
            accessibilityLabel="Add pass"
            style={[styles.addRow, { backgroundColor: colors.secondarySystemGroupedBackground }]}
          >
            <Ionicons name="add" size={20} color={colors.systemBlue} />
            <Text style={[typography.body, { color: colors.systemBlue, marginLeft: 12 }]}>
              Add Pass
            </Text>
          </Pressable>

          {cards.length > 0 && (
            <CupertinoListSection header="Cards">
              {cards.map((card) => (
                <CardRow key={card.id} card={card} />
              ))}
            </CupertinoListSection>
          )}

          <Pressable
            onPress={handleAddCardPressed}
            accessibilityRole="button"
            accessibilityLabel="Add card"
            style={[styles.addRow, { backgroundColor: colors.secondarySystemGroupedBackground }]}
          >
            <Ionicons name="add" size={20} color={colors.systemBlue} />
            <Text style={[typography.body, { color: colors.systemBlue, marginLeft: 12 }]}>
              Add Card
            </Text>
          </Pressable>
        </ScrollView>
      )}

      {adding && <AddPassSheet onClose={handleCloseSheet} />}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  body: { flex: 1 },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    top: 0,
  },
  sheetHandle: {
    width: 36,
    height: 5,
    borderRadius: 3,
    alignSelf: 'center',
    marginTop: 8,
    marginBottom: 8,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  sheetBody: { flex: 1, paddingTop: 8 },
  fieldSpacer: { height: 12 },
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
  codeBadge: { maxWidth: 120 },
  addRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 44,
    paddingLeft: 16,
    paddingVertical: 8,
    borderRadius: 10,
    marginTop: 16,
  },
});
