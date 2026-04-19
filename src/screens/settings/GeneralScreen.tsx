import React, { useState } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../theme/ThemeContext';
import { useSettings } from '../../store/SettingsStore';
import {
  CupertinoNavigationBar,
  CupertinoListSection,
  CupertinoListTile,
  CupertinoActionSheet,
  useAlert,
} from '../../components';
import type { AppNavigationProp } from '../../navigation/types';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function GeneralScreen({ navigation }: { navigation: AppNavigationProp }) {
  const { theme, typography, spacing } = useTheme();
  const { colors } = theme;
  const insets = useSafeAreaInsets();
  const { settings, update } = useSettings();
  const [showAirdropPicker, setShowAirdropPicker] = useState(false);
  const [showBgRefreshPicker, setShowBgRefreshPicker] = useState(false);
  const alert = useAlert();

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
              onPress={() => setShowAirdropPicker(true)}
            />
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
              onPress={() => setShowBgRefreshPicker(true)}
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
          </CupertinoListSection>
        </View>

        <View style={{ paddingHorizontal: spacing.md }}>
          <CupertinoListSection>
            <CupertinoListTile title="VPN & Device Management" onPress={() => navigation.navigate('Vpn')} />
            <CupertinoListTile title="Legal & Regulatory" onPress={() => alert('Legal', 'iOS Theme Launcher v1.0\n\nThis app is not affiliated with Apple Inc.')} />
          </CupertinoListSection>
        </View>

        <View style={{ paddingHorizontal: spacing.md }}>
          <CupertinoListSection>
            <CupertinoListTile title="Backup & Restore" onPress={() => navigation.navigate('BackupRestore')} />
          </CupertinoListSection>
        </View>
      </ScrollView>

      <CupertinoActionSheet
        visible={showAirdropPicker}
        onClose={() => setShowAirdropPicker(false)}
        title="AirDrop"
        options={[
          { label: 'Receiving Off', onPress: () => { update('airdrop', 'off'); setShowAirdropPicker(false); } },
          { label: 'Contacts Only', onPress: () => { update('airdrop', 'contactsOnly'); setShowAirdropPicker(false); } },
          { label: 'Everyone', onPress: () => { update('airdrop', 'everyone'); setShowAirdropPicker(false); } },
        ]}
        cancelLabel="Cancel"
      />

      <CupertinoActionSheet
        visible={showBgRefreshPicker}
        onClose={() => setShowBgRefreshPicker(false)}
        title="Background App Refresh"
        options={[
          { label: 'Off', onPress: () => { update('backgroundAppRefresh', 'off'); setShowBgRefreshPicker(false); } },
          { label: 'Wi-Fi', onPress: () => { update('backgroundAppRefresh', 'wifi'); setShowBgRefreshPicker(false); } },
          { label: 'Wi-Fi & Cellular Data', onPress: () => { update('backgroundAppRefresh', 'wifiAndCellular'); setShowBgRefreshPicker(false); } },
        ]}
        cancelLabel="Cancel"
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
