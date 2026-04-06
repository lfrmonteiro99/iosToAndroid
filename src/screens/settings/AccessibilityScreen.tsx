import React from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../theme/ThemeContext';
import { useSettings } from '../../store/SettingsStore';
import {
  CupertinoNavigationBar,
  CupertinoListSection,
  CupertinoListTile,
  CupertinoSwitch,
} from '../../components';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function AccessibilityScreen({ navigation }: { navigation: any }) {
  const { theme, typography, spacing } = useTheme();
  const { colors } = theme;
  const insets = useSafeAreaInsets();
  const { settings, update } = useSettings();

  return (
    <View style={[styles.container, { backgroundColor: colors.systemGroupedBackground }]}>
      <CupertinoNavigationBar
        title="Accessibility"
        leftButton={
          <Text
            style={[typography.body, { color: colors.systemBlue }]}
            onPress={() => navigation.goBack()}
          >
            Settings
          </Text>
        }
      />
      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 90 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Vision */}
        <View style={{ paddingHorizontal: spacing.md }}>
          <CupertinoListSection header="Vision">
            <CupertinoListTile
              title="VoiceOver"
              trailing={
                <Text style={[typography.body, { color: colors.secondaryLabel }]}>Off</Text>
              }
              showChevron
              onPress={() => {}}
            />
            <CupertinoListTile
              title="Zoom"
              trailing={
                <Text style={[typography.body, { color: colors.secondaryLabel }]}>Off</Text>
              }
              showChevron
              onPress={() => {}}
            />
            <CupertinoListTile
              title="Display & Text Size"
              showChevron
              onPress={() => {}}
            />
            <CupertinoListTile
              title="Bold Text"
              trailing={
                <CupertinoSwitch
                  value={settings.boldText}
                  onValueChange={(v) => update('boldText', v)}
                />
              }
              showChevron={false}
            />
          </CupertinoListSection>
        </View>

        {/* Physical and Motor */}
        <View style={{ paddingHorizontal: spacing.md }}>
          <CupertinoListSection header="Physical and Motor">
            <CupertinoListTile
              title="Touch"
              showChevron
              onPress={() => {}}
            />
            <CupertinoListTile
              title="Face ID & Attention"
              showChevron
              onPress={() => {}}
            />
            <CupertinoListTile
              title="Switch Control"
              trailing={
                <Text style={[typography.body, { color: colors.secondaryLabel }]}>Off</Text>
              }
              showChevron
              onPress={() => {}}
            />
          </CupertinoListSection>
        </View>

        {/* Hearing */}
        <View style={{ paddingHorizontal: spacing.md }}>
          <CupertinoListSection header="Hearing">
            <CupertinoListTile
              title="Hearing Devices"
              showChevron
              onPress={() => {}}
            />
            <CupertinoListTile
              title="Sound Recognition"
              trailing={
                <Text style={[typography.body, { color: colors.secondaryLabel }]}>Off</Text>
              }
              showChevron
              onPress={() => {}}
            />
            <CupertinoListTile
              title="Subtitles & Captioning"
              showChevron
              onPress={() => {}}
            />
          </CupertinoListSection>
        </View>

        {/* General */}
        <View style={{ paddingHorizontal: spacing.md }}>
          <CupertinoListSection header="General">
            <CupertinoListTile
              title="Reduce Motion"
              trailing={
                <CupertinoSwitch
                  value={settings.reduceMotion}
                  onValueChange={(v) => update('reduceMotion', v)}
                />
              }
              showChevron={false}
            />
            <CupertinoListTile
              title="Per-App Settings"
              showChevron
              onPress={() => {}}
            />
          </CupertinoListSection>
        </View>

        {/* Footer */}
        <Text style={[typography.footnote, styles.footer, { color: colors.secondaryLabel }]}>
          Accessibility features help you customize your device.
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  footer: {
    marginHorizontal: 32,
    marginTop: 8,
    marginBottom: 16,
    textAlign: 'center',
  },
});
