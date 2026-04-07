import React from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../theme/ThemeContext';
import { useDevice } from '../../store/DeviceStore';
import {
  CupertinoNavigationBar,
  CupertinoListSection,
  CupertinoListTile,
} from '../../components';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function StorageScreen({ navigation }: { navigation: any }) {
  const { theme, typography, spacing } = useTheme();
  const { colors } = theme;
  const insets = useSafeAreaInsets();
  const { storage, openSystemPanel } = useDevice();

  const usedFraction = storage.usedPercentage / 100;
  const freeFraction = 1 - usedFraction;

  return (
    <View style={[styles.container, { backgroundColor: colors.systemGroupedBackground }]}>
      <CupertinoNavigationBar
        title="Device Storage"
        largeTitle={false}
        leftButton={
          <Text
            style={[typography.body, { color: colors.systemBlue }]}
            onPress={() => navigation.goBack()}
          >
            General
          </Text>
        }
      />
      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 90 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Storage bar */}
        <View style={{ paddingHorizontal: spacing.md, paddingTop: spacing.md }}>
          <View style={styles.storageBarRow}>
            <View
              style={{
                flex: usedFraction,
                height: 24,
                backgroundColor: colors.accent,
              }}
            />
            <View
              style={{
                flex: freeFraction,
                height: 24,
                backgroundColor: colors.systemGray5,
              }}
            />
          </View>

          <Text style={[typography.footnote, { color: colors.secondaryLabel, marginTop: spacing.sm }]}>
            {storage.usedGB} GB of {storage.totalGB} GB Used
          </Text>
        </View>

        {/* Storage summary */}
        <View style={{ paddingHorizontal: spacing.md, marginTop: spacing.md }}>
          <CupertinoListSection header="Storage">
            <CupertinoListTile
              title="Used"
              trailing={
                <View style={styles.trailingRow}>
                  <View style={[styles.dot, { backgroundColor: colors.accent }]} />
                  <Text style={[typography.body, { color: colors.secondaryLabel }]}>
                    {storage.usedGB} GB
                  </Text>
                </View>
              }
              showChevron={false}
            />
            <CupertinoListTile
              title="Available"
              trailing={
                <View style={styles.trailingRow}>
                  <View style={[styles.dot, { backgroundColor: colors.systemGray5 }]} />
                  <Text style={[typography.body, { color: colors.secondaryLabel }]}>
                    {storage.freeGB} GB
                  </Text>
                </View>
              }
              showChevron={false}
            />
            <CupertinoListTile
              title="Total"
              trailing={
                <Text style={[typography.body, { color: colors.secondaryLabel }]}>
                  {storage.totalGB} GB
                </Text>
              }
              showChevron={false}
            />
          </CupertinoListSection>
        </View>

        {/* Manage Storage */}
        <View style={{ paddingHorizontal: spacing.md }}>
          <CupertinoListSection header="Storage Management">
            <CupertinoListTile
              title="Manage Storage"
              leading={{
                name: 'folder-open-outline',
                color: '#FFFFFF',
                backgroundColor: colors.systemBlue,
              }}
              onPress={() => openSystemPanel('storage')}
            />
          </CupertinoListSection>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  storageBarRow: {
    flexDirection: 'row',
    height: 24,
    borderRadius: 6,
    overflow: 'hidden',
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 6,
  },
  trailingRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
});
