import React, { useState } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../theme/ThemeContext';
import {
  CupertinoNavigationBar,
  CupertinoListSection,
  CupertinoListTile,
  CupertinoSwitch,
  CupertinoSegmentedControl,
} from '../../components';

export function DisplayBrightnessScreen({ navigation }: { navigation: any }) {
  const { theme, typography, spacing, isDark, toggleTheme } = useTheme();
  const { colors } = theme;
  const insets = useSafeAreaInsets();

  const [trueTone, setTrueTone] = useState(true);
  const [autoLock] = useState('5 Minutes');
  const [textSizeIndex, setTextSizeIndex] = useState(1);

  return (
    <View style={[styles.container, { backgroundColor: colors.systemGroupedBackground }]}>
      <CupertinoNavigationBar
        title="Display & Brightness"
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
        {/* Appearance */}
        <View style={{ paddingHorizontal: spacing.md }}>
          <CupertinoListSection header="Appearance">
            <View style={{ padding: spacing.md }}>
              <View style={styles.appearanceRow}>
                <View style={styles.appearanceOption}>
                  <View style={[
                    styles.phoneMock,
                    { backgroundColor: '#FFFFFF', borderColor: !isDark ? colors.systemBlue : colors.systemGray4 },
                  ]}>
                    <View style={[styles.mockLine, { backgroundColor: '#E5E5EA' }]} />
                    <View style={[styles.mockLine, { backgroundColor: '#E5E5EA', width: '60%' }]} />
                    <View style={[styles.mockLine, { backgroundColor: '#E5E5EA', width: '80%' }]} />
                  </View>
                  <Text style={[typography.caption1, { color: colors.label, marginTop: 8 }]}>Light</Text>
                </View>
                <View style={styles.appearanceOption}>
                  <View style={[
                    styles.phoneMock,
                    { backgroundColor: '#1C1C1E', borderColor: isDark ? colors.systemBlue : colors.systemGray4 },
                  ]}>
                    <View style={[styles.mockLine, { backgroundColor: '#38383A' }]} />
                    <View style={[styles.mockLine, { backgroundColor: '#38383A', width: '60%' }]} />
                    <View style={[styles.mockLine, { backgroundColor: '#38383A', width: '80%' }]} />
                  </View>
                  <Text style={[typography.caption1, { color: colors.label, marginTop: 8 }]}>Dark</Text>
                </View>
              </View>
            </View>
            <CupertinoListTile
              title="Dark Mode"
              trailing={<CupertinoSwitch value={isDark} onValueChange={toggleTheme} />}
              showChevron={false}
            />
          </CupertinoListSection>
        </View>

        {/* Text Size */}
        <View style={{ paddingHorizontal: spacing.md }}>
          <CupertinoListSection header="Text Size">
            <View style={{ padding: spacing.md }}>
              <CupertinoSegmentedControl
                values={['Small', 'Default', 'Large']}
                selectedIndex={textSizeIndex}
                onChange={setTextSizeIndex}
              />
            </View>
          </CupertinoListSection>
        </View>

        <View style={{ paddingHorizontal: spacing.md }}>
          <CupertinoListSection>
            <CupertinoListTile
              title="True Tone"
              trailing={<CupertinoSwitch value={trueTone} onValueChange={setTrueTone} />}
              showChevron={false}
            />
          </CupertinoListSection>
        </View>

        <View style={{ paddingHorizontal: spacing.md }}>
          <CupertinoListSection>
            <CupertinoListTile
              title="Auto-Lock"
              trailing={
                <Text style={[typography.body, { color: colors.secondaryLabel }]}>
                  {autoLock}
                </Text>
              }
              onPress={() => {}}
            />
            <CupertinoListTile
              title="Raise to Wake"
              trailing={<CupertinoSwitch value={true} onValueChange={() => {}} />}
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
  appearanceRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 8,
  },
  appearanceOption: {
    alignItems: 'center',
  },
  phoneMock: {
    width: 70,
    height: 120,
    borderRadius: 12,
    borderWidth: 2.5,
    padding: 10,
    justifyContent: 'center',
    gap: 6,
  },
  mockLine: {
    height: 6,
    borderRadius: 3,
    width: '100%',
  },
});
