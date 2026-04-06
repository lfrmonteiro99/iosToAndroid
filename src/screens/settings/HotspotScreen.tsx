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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function HotspotScreen({ navigation }: { navigation: any }) {
  const { theme, typography, spacing } = useTheme();
  const { colors } = theme;
  const insets = useSafeAreaInsets();
  const { settings, update } = useSettings();

  const [maximizeCompatibility, setMaximizeCompatibility] = useState(false);

  return (
    <View style={[styles.container, { backgroundColor: colors.systemGroupedBackground }]}>
      <CupertinoNavigationBar
        title="Personal Hotspot"
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
        <View style={{ paddingHorizontal: spacing.md }}>
          <CupertinoListSection>
            <CupertinoListTile
              title="Personal Hotspot"
              trailing={
                <CupertinoSwitch
                  value={settings.hotspotEnabled}
                  onValueChange={(v) => update('hotspotEnabled', v)}
                />
              }
              showChevron={false}
            />
          </CupertinoListSection>
        </View>

        <View style={{ paddingHorizontal: spacing.md }}>
          <CupertinoListSection>
            <CupertinoListTile
              title="Wi-Fi Password"
              trailing={
                <Text style={[typography.body, { color: colors.secondaryLabel }]}>
                  {settings.hotspotPassword}
                </Text>
              }
              leading={{
                name: 'key-outline',
                color: '#FFFFFF',
                backgroundColor: colors.systemBlue,
              }}
              showChevron
              onPress={() => {}}
            />
          </CupertinoListSection>
        </View>

        {settings.hotspotEnabled && (
          <View style={{ paddingHorizontal: spacing.md }}>
            <CupertinoListSection header="Connected Devices">
              <CupertinoListTile
                title="1 Connection"
                leading={{
                  name: 'laptop-outline',
                  color: '#FFFFFF',
                  backgroundColor: colors.systemBlue,
                }}
                showChevron={false}
              />
            </CupertinoListSection>
          </View>
        )}

        <View style={{ paddingHorizontal: spacing.md }}>
          <CupertinoListSection
            header="Family Sharing"
            footer="Family members can use your hotspot without entering a password. Their devices will appear in Connected Devices when they join."
          >
            <CupertinoListTile
              title="Family Sharing"
              leading={{
                name: 'people-outline',
                color: '#FFFFFF',
                backgroundColor: colors.systemOrange,
              }}
              showChevron
              onPress={() => {}}
            />
          </CupertinoListSection>
        </View>

        <View style={{ paddingHorizontal: spacing.md }}>
          <CupertinoListSection
            footer="Maximize Compatibility allows older devices to connect. This may reduce Wi-Fi performance."
          >
            <CupertinoListTile
              title="Maximize Compatibility"
              trailing={
                <CupertinoSwitch
                  value={maximizeCompatibility}
                  onValueChange={setMaximizeCompatibility}
                />
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
});
