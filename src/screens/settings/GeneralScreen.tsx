import React from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../theme/ThemeContext';
import {
  CupertinoNavigationBar,
  CupertinoListSection,
  CupertinoListTile,
} from '../../components';

export function GeneralScreen({ navigation }: { navigation: any }) {
  const { theme, typography, spacing } = useTheme();
  const { colors } = theme;
  const insets = useSafeAreaInsets();

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
              onPress={() => {}}
            />
          </CupertinoListSection>
        </View>

        <View style={{ paddingHorizontal: spacing.md }}>
          <CupertinoListSection>
            <CupertinoListTile
              title="AirDrop"
              trailing={
                <Text style={[typography.body, { color: colors.secondaryLabel }]}>
                  Contacts Only
                </Text>
              }
              onPress={() => {}}
            />
            <CupertinoListTile
              title="AirPlay & Handoff"
              onPress={() => {}}
            />
            <CupertinoListTile title="CarPlay" onPress={() => {}} />
          </CupertinoListSection>
        </View>

        <View style={{ paddingHorizontal: spacing.md }}>
          <CupertinoListSection>
            <CupertinoListTile title="iPhone Storage" onPress={() => {}} />
            <CupertinoListTile
              title="Background App Refresh"
              trailing={
                <Text style={[typography.body, { color: colors.secondaryLabel }]}>Wi-Fi</Text>
              }
              onPress={() => {}}
            />
          </CupertinoListSection>
        </View>

        <View style={{ paddingHorizontal: spacing.md }}>
          <CupertinoListSection>
            <CupertinoListTile title="Date & Time" onPress={() => {}} />
            <CupertinoListTile title="Keyboard" onPress={() => {}} />
            <CupertinoListTile
              title="Language & Region"
              trailing={
                <Text style={[typography.body, { color: colors.secondaryLabel }]}>English</Text>
              }
              onPress={() => {}}
            />
            <CupertinoListTile title="Dictionary" onPress={() => {}} />
          </CupertinoListSection>
        </View>

        <View style={{ paddingHorizontal: spacing.md }}>
          <CupertinoListSection>
            <CupertinoListTile title="VPN & Device Management" onPress={() => {}} />
            <CupertinoListTile title="Legal & Regulatory" onPress={() => {}} />
          </CupertinoListSection>
        </View>

        <View style={{ paddingHorizontal: spacing.md }}>
          <CupertinoListSection>
            <CupertinoListTile title="Transfer or Reset iPhone" onPress={() => {}} />
            <CupertinoListTile title="Shut Down" onPress={() => {}} />
          </CupertinoListSection>
        </View>
      </ScrollView>
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
