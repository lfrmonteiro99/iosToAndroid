import React, { useState } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../theme/ThemeContext';
import {
  CupertinoNavigationBar,
  CupertinoListSection,
  CupertinoListTile,
  CupertinoSwitch,
} from '../../components';

const NETWORKS = [
  { name: 'Home', signal: 'wifi', connected: true },
  { name: 'Neighbors_5G', signal: 'wifi', connected: false },
  { name: 'CoffeeShop_Free', signal: 'wifi', connected: false },
  { name: 'Office-Guest', signal: 'wifi', connected: false },
];

export function WifiScreen({ navigation }: { navigation: any }) {
  const { theme, typography, spacing } = useTheme();
  const { colors } = theme;
  const insets = useSafeAreaInsets();
  const [wifiEnabled, setWifiEnabled] = useState(true);

  return (
    <View style={[styles.container, { backgroundColor: colors.systemGroupedBackground }]}>
      <CupertinoNavigationBar
        title="Wi-Fi"
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
              title="Wi-Fi"
              trailing={
                <CupertinoSwitch value={wifiEnabled} onValueChange={setWifiEnabled} />
              }
              showChevron={false}
            />
          </CupertinoListSection>
        </View>

        {wifiEnabled && (
          <View style={{ paddingHorizontal: spacing.md }}>
            <CupertinoListSection header="My Networks">
              {NETWORKS.map((net) => (
                <CupertinoListTile
                  key={net.name}
                  title={net.name}
                  leading={{
                    name: 'wifi',
                    color: '#FFFFFF',
                    backgroundColor: net.connected ? '#007AFF' : colors.systemGray3,
                  }}
                  trailing={
                    net.connected ? (
                      <Text style={[typography.body, { color: colors.systemBlue }]}>✓</Text>
                    ) : undefined
                  }
                  showChevron={net.connected}
                  onPress={() => {}}
                />
              ))}
            </CupertinoListSection>
          </View>
        )}

        {wifiEnabled && (
          <View style={{ paddingHorizontal: spacing.md }}>
            <CupertinoListSection>
              <CupertinoListTile
                title="Ask to Join Networks"
                trailing={
                  <Text style={[typography.body, { color: colors.secondaryLabel }]}>Ask</Text>
                }
                onPress={() => {}}
              />
              <CupertinoListTile
                title="Auto-Join Hotspot"
                trailing={
                  <Text style={[typography.body, { color: colors.secondaryLabel }]}>Never</Text>
                }
                onPress={() => {}}
              />
            </CupertinoListSection>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
});
