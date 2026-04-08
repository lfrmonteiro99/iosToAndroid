import React, { useState } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../theme/ThemeContext';
import {
  CupertinoNavigationBar,
  CupertinoListSection,
  CupertinoListTile,
  CupertinoSwitch,
  CupertinoButton,
} from '../../components';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function SoftwareUpdateScreen({ navigation }: { navigation: any }) {
  const { theme, typography, spacing } = useTheme();
  const { colors } = theme;
  const insets = useSafeAreaInsets();
  const [autoUpdates, setAutoUpdates] = useState(true);

  const lastChecked = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  return (
    <View style={[styles.container, { backgroundColor: colors.systemGroupedBackground }]}>
      <CupertinoNavigationBar
        title="Software Update"
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
        {/* Current version */}
        <View style={{ paddingHorizontal: spacing.md, marginTop: spacing.md }}>
          <CupertinoListSection>
            <CupertinoListTile
              title="Current Version"
              trailing={
                <Text style={[typography.body, { color: colors.secondaryLabel }]}>1.0.0</Text>
              }
              showChevron={false}
            />
          </CupertinoListSection>
        </View>

        {/* Up to date */}
        <View style={{ paddingHorizontal: spacing.md }}>
          <CupertinoListSection>
            <View style={[styles.updateCard, { backgroundColor: colors.secondarySystemGroupedBackground }]}>
              <Text style={[typography.headline, { color: colors.label }]}>Your software is up to date.</Text>
              <Text style={[typography.footnote, { color: colors.secondaryLabel, marginTop: spacing.sm, lineHeight: 18 }]}>
                iosToAndroid 1.0.0 is the latest version.
              </Text>
            </View>
          </CupertinoListSection>
        </View>

        {/* Automatic updates */}
        <View style={{ paddingHorizontal: spacing.md }}>
          <CupertinoListSection
            footer={`Last checked: Today at ${lastChecked}`}
          >
            <CupertinoListTile
              title="Automatic Updates"
              trailing={
                <CupertinoSwitch value={autoUpdates} onValueChange={setAutoUpdates} />
              }
              showChevron={false}
            />
          </CupertinoListSection>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  updateCard: {
    padding: 16,
    borderRadius: 10,
  },
});
