import React, { useCallback } from 'react';
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
import { useTheme } from '../theme/ThemeContext';
import { useWallet, PassType } from '../store/WalletStore';
import {
  CupertinoNavigationBar,
  CupertinoEmptyState,
  CupertinoListSection,
  CupertinoListTile,
} from '../components';
import type { AppNavigationProp } from '../navigation/types';

// Exported so CardDetailScreen can render the same brand-equivalent label for
// a pass without duplicating the mapping (#286 — see WalletCard/CardStore
// mismatch note in CardDetailScreen.tsx).
export const PASS_TYPE_LABELS: Record<PassType, string> = {
  boarding: 'Boarding',
  ticket: 'Ticket',
  loyalty: 'Loyalty',
  other: 'Other',
};

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

interface WalletScreenProps {
  navigation: AppNavigationProp;
}

export function WalletScreen({ navigation }: WalletScreenProps) {
  const { theme, typography, spacing } = useTheme();
  const { colors } = theme;
  const insets = useSafeAreaInsets();
  const { passes, isReady } = useWallet();

  const handleAddPressed = useCallback(() => {
    navigation.navigate('PassEdit', {});
  }, [navigation]);

  const handleScanPressed = useCallback(() => {
    navigation.navigate('PassScan');
  }, [navigation]);

  const handlePassPressed = useCallback(
    (passId: string) => {
      navigation.navigate('PassDetail', { passId });
    },
    [navigation],
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.systemGroupedBackground }]}>
      <StatusBar style={theme.dark ? 'light' : 'dark'} />
      <CupertinoNavigationBar
        title="Wallet"
        largeTitle={false}
        rightButton={
          <View style={styles.navBarActions}>
            <Pressable
              onPress={handleScanPressed}
              accessibilityRole="button"
              accessibilityLabel="Scan pass"
            >
              <Ionicons name="camera-outline" size={24} color={colors.systemBlue} />
            </Pressable>
            <Pressable
              onPress={handleAddPressed}
              accessibilityRole="button"
              accessibilityLabel="Add pass"
              style={{ flexDirection: 'row', alignItems: 'center' }}
            >
              <Ionicons name="add" size={26} color={colors.systemBlue} />
            </Pressable>
          </View>
        }
      />

      {!isReady ? (
        <View style={styles.body} />
      ) : passes.length === 0 ? (
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
          <CupertinoListSection header="Passes">
            {passes.map((pass) => (
              <PassRow
                key={pass.id}
                pass={pass}
                onPress={() => handlePassPressed(pass.id)}
              />
            ))}
          </CupertinoListSection>

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
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  body: { flex: 1 },
  navBarActions: { flexDirection: 'row', alignItems: 'center', gap: 16 },
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
