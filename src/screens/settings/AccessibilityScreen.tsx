import React from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../theme/ThemeContext';
import { useSettings } from '../../store/SettingsStore';
import { useDevice } from '../../store/DeviceStore';
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
  const { openSystemPanel } = useDevice();

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
        {/* Vision — in-app controls */}
        <View style={{ paddingHorizontal: spacing.md }}>
          <CupertinoListSection header="Vision">
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
              title="Increase Contrast"
              trailing={
                <CupertinoSwitch
                  value={settings.boldText && settings.reduceMotion}
                  onValueChange={() => {
                    update('boldText', true);
                    update('reduceMotion', true);
                  }}
                />
              }
              showChevron={false}
            />
          </CupertinoListSection>
        </View>

        {/* Vision — requires system settings */}
        <View style={{ paddingHorizontal: spacing.md }}>
          <CupertinoListSection
            header="System Accessibility"
            footer="These features are managed by Android. Tapping opens system settings."
          >
            <CupertinoListTile
              title="TalkBack (VoiceOver)"
              trailing={
                <Text style={[typography.caption1, { color: colors.tertiaryLabel }]}>System</Text>
              }
              showChevron
              onPress={() => openSystemPanel('accessibility')}
            />
            <CupertinoListTile
              title="Magnification (Zoom)"
              trailing={
                <Text style={[typography.caption1, { color: colors.tertiaryLabel }]}>System</Text>
              }
              showChevron
              onPress={() => openSystemPanel('accessibility')}
            />
            <CupertinoListTile
              title="Display Size"
              trailing={
                <Text style={[typography.caption1, { color: colors.tertiaryLabel }]}>System</Text>
              }
              showChevron
              onPress={() => openSystemPanel('accessibility')}
            />
          </CupertinoListSection>
        </View>

        {/* Physical and Motor */}
        <View style={{ paddingHorizontal: spacing.md }}>
          <CupertinoListSection header="Physical and Motor">
            <CupertinoListTile
              title="Touch"
              showChevron
              onPress={() => openSystemPanel('accessibility')}
            />
            <CupertinoListTile
              title="Face ID & Attention"
              showChevron
              onPress={() => openSystemPanel('security')}
            />
            <CupertinoListTile
              title="Switch Control"
              trailing={
                <Text style={[typography.body, { color: colors.secondaryLabel }]}>Off</Text>
              }
              showChevron
              onPress={() => openSystemPanel('accessibility')}
            />
          </CupertinoListSection>
        </View>

        {/* Hearing */}
        <View style={{ paddingHorizontal: spacing.md }}>
          <CupertinoListSection header="Hearing">
            <CupertinoListTile
              title="Hearing Devices"
              showChevron
              onPress={() => openSystemPanel('accessibility')}
            />
            <CupertinoListTile
              title="Sound Recognition"
              trailing={
                <Text style={[typography.body, { color: colors.secondaryLabel }]}>Off</Text>
              }
              showChevron
              onPress={() => openSystemPanel('accessibility')}
            />
            <CupertinoListTile
              title="Subtitles & Captioning"
              showChevron
              onPress={() => openSystemPanel('accessibility')}
            />
          </CupertinoListSection>
        </View>

        {/* Footer */}
        <Text style={[typography.footnote, styles.footer, { color: colors.secondaryLabel }]}>
          {'In-app accessibility features apply to iosToAndroid. System features marked "System" are managed by Android.'}
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
