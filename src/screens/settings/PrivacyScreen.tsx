import React, { useState } from 'react';
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

const APP_PRIVACY_ITEMS = [
  { title: 'Contacts', count: '3 Apps', icon: 'people', color: '#34C759', bg: '#34C759' },
  { title: 'Calendars', count: '2 Apps', icon: 'calendar', color: '#FF3B30', bg: '#FF3B30' },
  { title: 'Photos', count: '5 Apps', icon: 'images', color: '#FF9500', bg: '#FF9500' },
  { title: 'Camera', count: '4 Apps', icon: 'camera', color: '#1C1C1E', bg: '#1C1C1E' },
  { title: 'Microphone', count: '2 Apps', icon: 'mic', color: '#FF3B30', bg: '#FF3B30' },
];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function PrivacyScreen({ navigation }: { navigation: any }) {
  const { theme, typography, spacing } = useTheme();
  const { colors } = theme;
  const insets = useSafeAreaInsets();
  const { settings, update } = useSettings();

  const [allowTracking, setAllowTracking] = useState(false);

  return (
    <View style={[styles.container, { backgroundColor: colors.systemGroupedBackground }]}>
      <CupertinoNavigationBar
        title="Privacy & Security"
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
        {/* Location Services */}
        <View style={{ paddingHorizontal: spacing.md }}>
          <CupertinoListSection>
            <CupertinoListTile
              title="Location Services"
              leading={{ name: 'location', color: '#FFFFFF', backgroundColor: '#007AFF' }}
              trailing={
                <CupertinoSwitch
                  value={settings.locationServices}
                  onValueChange={(v) => update('locationServices', v)}
                />
              }
              showChevron={false}
            />
          </CupertinoListSection>
        </View>

        {/* Tracking */}
        <View style={{ paddingHorizontal: spacing.md }}>
          <CupertinoListSection header="Tracking">
            <CupertinoListTile
              title="Allow Apps to Request to Track"
              trailing={
                <CupertinoSwitch
                  value={allowTracking}
                  onValueChange={setAllowTracking}
                />
              }
              showChevron={false}
            />
          </CupertinoListSection>
        </View>

        {/* App Privacy */}
        <View style={{ paddingHorizontal: spacing.md }}>
          <CupertinoListSection header="App Privacy">
            {APP_PRIVACY_ITEMS.map((item) => (
              <CupertinoListTile
                key={item.title}
                title={item.title}
                leading={{
                  name: item.icon as 'people',
                  color: '#FFFFFF',
                  backgroundColor: item.bg,
                }}
                trailing={
                  <Text style={[typography.body, { color: colors.secondaryLabel }]}>
                    {item.count}
                  </Text>
                }
                showChevron
                onPress={() => {}}
              />
            ))}
          </CupertinoListSection>
        </View>

        {/* Analytics & Improvements */}
        <View style={{ paddingHorizontal: spacing.md }}>
          <CupertinoListSection header="Analytics & Improvements">
            <CupertinoListTile
              title="Share Analytics"
              trailing={
                <CupertinoSwitch
                  value={settings.analyticsEnabled}
                  onValueChange={(v) => update('analyticsEnabled', v)}
                />
              }
              showChevron={false}
            />
            <CupertinoListTile
              title="Personalized Ads"
              trailing={
                <CupertinoSwitch
                  value={settings.personalizedAds}
                  onValueChange={(v) => update('personalizedAds', v)}
                />
              }
              showChevron={false}
            />
          </CupertinoListSection>
        </View>

        {/* Footer */}
        <Text style={[typography.footnote, styles.footer, { color: colors.secondaryLabel }]}>
          Privacy settings control which apps can access your data.
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
