import React, { useState } from 'react';
import { View, Text, ScrollView, StyleSheet, Alert } from 'react-native';
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

        {/* Update card */}
        <View style={{ paddingHorizontal: spacing.md }}>
          <CupertinoListSection header="Available Update">
            <View style={[styles.updateCard, { backgroundColor: colors.secondarySystemGroupedBackground }]}>
              <Text style={[typography.headline, { color: colors.label }]}>iosToAndroid 2.0</Text>
              <Text style={[typography.subhead, { color: colors.secondaryLabel, marginTop: 2 }]}>
                182.4 MB
              </Text>
              <Text
                style={[
                  typography.footnote,
                  { color: colors.secondaryLabel, marginTop: spacing.sm, lineHeight: 18 },
                ]}
              >
                This update includes performance improvements, bug fixes, and new features.
              </Text>
              <CupertinoButton
                title="Download and Install"
                variant="filled"
                onPress={() => Alert.alert('Software Update', 'This is a demo app. No actual update is available.')}
                style={{ marginTop: spacing.md }}
              />
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
