import React, { useState } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../theme/ThemeContext';
import { useSettings } from '../../store/SettingsStore';
import {
  CupertinoNavigationBar,
  CupertinoListSection,
  CupertinoListTile,
  CupertinoAlertDialog,
} from '../../components';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function GeneralScreen({ navigation }: { navigation: any }) {
  const { theme, typography, spacing } = useTheme();
  const { colors } = theme;
  const insets = useSafeAreaInsets();
  const { settings } = useSettings();
  const [showShutdown, setShowShutdown] = useState(false);

  const airdropLabel = settings.airdrop === 'off' ? 'Receiving Off' : settings.airdrop === 'contactsOnly' ? 'Contacts Only' : 'Everyone';
  const bgRefreshLabel = settings.backgroundAppRefresh === 'off' ? 'Off' : settings.backgroundAppRefresh === 'wifi' ? 'Wi-Fi' : 'Wi-Fi & Cellular';

  return (
    <View style={[styles.container, { backgroundColor: colors.systemGroupedBackground }]}>
      <CupertinoNavigationBar
        title="General"
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
            <CupertinoListTile title="About" onPress={() => navigation.navigate('About')} />
            <CupertinoListTile
              title="Software Update"
              trailing={
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>1</Text>
                </View>
              }
              onPress={() => navigation.navigate('SoftwareUpdate')}
            />
          </CupertinoListSection>
        </View>

        <View style={{ paddingHorizontal: spacing.md }}>
          <CupertinoListSection>
            <CupertinoListTile
              title="AirDrop"
              trailing={
                <Text style={[typography.body, { color: colors.secondaryLabel }]}>
                  {airdropLabel}
                </Text>
              }
              onPress={() => {}}
            />
            <CupertinoListTile title="AirPlay & Handoff" onPress={() => {}} />
            <CupertinoListTile title="CarPlay" onPress={() => {}} />
          </CupertinoListSection>
        </View>

        <View style={{ paddingHorizontal: spacing.md }}>
          <CupertinoListSection>
            <CupertinoListTile
              title="Device Storage"
              onPress={() => navigation.navigate('Storage')}
            />
            <CupertinoListTile
              title="Background App Refresh"
              trailing={
                <Text style={[typography.body, { color: colors.secondaryLabel }]}>
                  {bgRefreshLabel}
                </Text>
              }
              onPress={() => {}}
            />
          </CupertinoListSection>
        </View>

        <View style={{ paddingHorizontal: spacing.md }}>
          <CupertinoListSection>
            <CupertinoListTile title="Date & Time" onPress={() => navigation.navigate('DateTime')} />
            <CupertinoListTile title="Keyboard" onPress={() => navigation.navigate('Keyboard')} />
            <CupertinoListTile
              title="Language & Region"
              trailing={
                <Text style={[typography.body, { color: colors.secondaryLabel }]}>
                  {settings.language}
                </Text>
              }
              onPress={() => navigation.navigate('LanguageRegion')}
            />
            <CupertinoListTile title="Dictionary" onPress={() => {}} />
          </CupertinoListSection>
        </View>

        <View style={{ paddingHorizontal: spacing.md }}>
          <CupertinoListSection>
            <CupertinoListTile title="VPN & Device Management" onPress={() => navigation.navigate('Vpn')} />
            <CupertinoListTile title="Legal & Regulatory" onPress={() => {}} />
          </CupertinoListSection>
        </View>

        <View style={{ paddingHorizontal: spacing.md }}>
          <CupertinoListSection>
            <CupertinoListTile title="Transfer or Reset Device" onPress={() => {}} />
            <CupertinoListTile title="Shut Down" showChevron={false} onPress={() => setShowShutdown(true)} />
          </CupertinoListSection>
        </View>
      </ScrollView>

      <CupertinoAlertDialog
        visible={showShutdown}
        title="Shut Down"
        message="Are you sure you want to shut down? This is a demo app — nothing will actually happen."
        actions={[
          { label: 'Cancel', style: 'cancel', onPress: () => setShowShutdown(false) },
          { label: 'Shut Down', style: 'destructive', onPress: () => setShowShutdown(false) },
        ]}
        onClose={() => setShowShutdown(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  badge: {
    backgroundColor: '#FF3B30',
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
});
