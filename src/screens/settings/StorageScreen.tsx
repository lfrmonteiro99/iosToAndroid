import React from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../theme/ThemeContext';
import {
  CupertinoNavigationBar,
  CupertinoListSection,
  CupertinoListTile,
} from '../../components';

const TOTAL_GB = 128;

const CATEGORIES = [
  { name: 'Apps', gb: 34.2, color: '#007AFF' },
  { name: 'Photos', gb: 28.1, color: '#FF9500' },
  { name: 'Messages', gb: 12.4, color: '#34C759' },
  { name: 'Media', gb: 8.6, color: '#AF52DE' },
  { name: 'Other', gb: 6.0, color: '#8E8E93' },
];

const USED_GB = CATEGORIES.reduce((sum, c) => sum + c.gb, 0); // 89.3
const AVAILABLE_GB = +(TOTAL_GB - USED_GB).toFixed(1);

const RECOMMENDATIONS = [
  { name: 'Review Large Attachments', icon: 'attach-outline' as const },
  { name: 'Offload Unused Apps', icon: 'cloud-download-outline' as const },
];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function StorageScreen({ navigation }: { navigation: any }) {
  const { theme, typography, spacing } = useTheme();
  const { colors } = theme;
  const insets = useSafeAreaInsets();

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
            {CATEGORIES.map((cat) => (
              <View
                key={cat.name}
                style={{
                  flex: cat.gb / TOTAL_GB,
                  height: 24,
                  backgroundColor: cat.color,
                }}
              />
            ))}
            <View
              style={{
                flex: AVAILABLE_GB / TOTAL_GB,
                height: 24,
                backgroundColor: colors.systemGray5,
              }}
            />
          </View>

          <Text style={[typography.footnote, { color: colors.secondaryLabel, marginTop: spacing.sm }]}>
            {USED_GB} GB of {TOTAL_GB} GB Used
          </Text>
        </View>

        {/* Category list */}
        <View style={{ paddingHorizontal: spacing.md, marginTop: spacing.md }}>
          <CupertinoListSection header="Storage Usage">
            {CATEGORIES.map((cat) => (
              <CupertinoListTile
                key={cat.name}
                title={cat.name}
                trailing={
                  <View style={styles.trailingRow}>
                    <View style={[styles.dot, { backgroundColor: cat.color }]} />
                    <Text style={[typography.body, { color: colors.secondaryLabel }]}>
                      {cat.gb} GB
                    </Text>
                  </View>
                }
                showChevron={false}
              />
            ))}
            <CupertinoListTile
              title="Available"
              trailing={
                <View style={styles.trailingRow}>
                  <View style={[styles.dot, { backgroundColor: colors.systemGray5 }]} />
                  <Text style={[typography.body, { color: colors.secondaryLabel }]}>
                    {AVAILABLE_GB} GB
                  </Text>
                </View>
              }
              showChevron={false}
            />
          </CupertinoListSection>
        </View>

        {/* Recommendations */}
        <View style={{ paddingHorizontal: spacing.md }}>
          <CupertinoListSection header="Recommendations">
            {RECOMMENDATIONS.map((rec) => (
              <CupertinoListTile
                key={rec.name}
                title={rec.name}
                leading={{ name: rec.icon, color: '#FFFFFF', backgroundColor: colors.systemBlue }}
                onPress={() => {}}
              />
            ))}
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
