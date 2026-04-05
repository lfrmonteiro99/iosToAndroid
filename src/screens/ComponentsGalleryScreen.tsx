import React, { useState } from 'react';
import { View, Text, ScrollView, StyleSheet, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme/ThemeContext';
import {
  CupertinoNavigationBar,
  CupertinoButton,
  CupertinoSwitch,
  CupertinoTextField,
  CupertinoCard,
  CupertinoSegmentedControl,
  CupertinoListSection,
  CupertinoListTile,
  CupertinoActionSheet,
  CupertinoAlertDialog,
} from '../components';

export function ComponentsGalleryScreen() {
  const { theme, typography, spacing } = useTheme();
  const { colors } = theme;
  const insets = useSafeAreaInsets();

  const [switchValue, setSwitchValue] = useState(true);
  const [textValue, setTextValue] = useState('');
  const [segmentIndex, setSegmentIndex] = useState(0);
  const [showActionSheet, setShowActionSheet] = useState(false);
  const [showAlert, setShowAlert] = useState(false);

  const SectionHeader = ({ title }: { title: string }) => (
    <Text
      style={[
        typography.footnote,
        {
          color: colors.secondaryLabel,
          textTransform: 'uppercase',
          marginBottom: 8,
          marginTop: 24,
        },
      ]}
    >
      {title}
    </Text>
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.systemGroupedBackground }]}>
      <CupertinoNavigationBar title="Components" />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={{
          paddingHorizontal: spacing.md,
          paddingBottom: insets.bottom + 90,
        }}
        showsVerticalScrollIndicator={false}
      >
        {/* Platform Badge */}
        <View style={[styles.badge, { backgroundColor: colors.systemBlue }]}>
          <Text style={[typography.caption1, { color: '#FFF', fontWeight: '600' }]}>
            Running on {Platform.OS.toUpperCase()} with iOS styling
          </Text>
        </View>

        {/* Buttons */}
        <SectionHeader title="Buttons" />
        <View style={styles.buttonRow}>
          <CupertinoButton title="Filled" variant="filled" />
          <CupertinoButton title="Tinted" variant="tinted" />
          <CupertinoButton title="Plain" variant="plain" />
        </View>
        <View style={[styles.buttonRow, { marginTop: 12 }]}>
          <CupertinoButton title="Destructive" variant="filled" destructive />
          <CupertinoButton title="Disabled" variant="filled" disabled />
        </View>

        {/* Switch */}
        <SectionHeader title="Switch" />
        <CupertinoCard>
          <View style={styles.switchRow}>
            <Text style={[typography.body, { color: colors.label }]}>
              iOS-style Toggle
            </Text>
            <CupertinoSwitch value={switchValue} onValueChange={setSwitchValue} />
          </View>
          <Text style={[typography.footnote, { color: colors.secondaryLabel, marginTop: 8 }]}>
            Value: {switchValue ? 'ON' : 'OFF'}
          </Text>
        </CupertinoCard>

        {/* Text Field */}
        <SectionHeader title="Text Field" />
        <CupertinoTextField
          placeholder="Search..."
          value={textValue}
          onChangeText={setTextValue}
          prefix={
            <Text style={{ color: colors.systemGray }}>
              {'\u{1F50D}'}
            </Text>
          }
        />

        {/* Segmented Control */}
        <SectionHeader title="Segmented Control" />
        <CupertinoSegmentedControl
          values={['First', 'Second', 'Third']}
          selectedIndex={segmentIndex}
          onChange={setSegmentIndex}
        />
        <Text
          style={[
            typography.footnote,
            { color: colors.secondaryLabel, marginTop: 8, textAlign: 'center' },
          ]}
        >
          Selected: {['First', 'Second', 'Third'][segmentIndex]}
        </Text>

        {/* Cards */}
        <SectionHeader title="Cards" />
        <CupertinoCard
          title="Cupertino Card"
          subtitle="With title and subtitle"
        >
          <Text style={[typography.body, { color: colors.label }]}>
            This card component uses iOS-style border radius, soft shadows, and
            the system background color. It adapts to dark mode automatically.
          </Text>
        </CupertinoCard>

        {/* List Section */}
        <SectionHeader title="List Section" />
        <CupertinoListSection header="Favorites" footer="These are your favorite items.">
          <CupertinoListTile
            title="Messages"
            leading={{ name: 'chatbubble-ellipses', color: '#FFF', backgroundColor: '#34C759' }}
            onPress={() => {}}
          />
          <CupertinoListTile
            title="FaceTime"
            leading={{ name: 'videocam', color: '#FFF', backgroundColor: '#34C759' }}
            onPress={() => {}}
          />
          <CupertinoListTile
            title="Mail"
            leading={{ name: 'mail', color: '#FFF', backgroundColor: '#007AFF' }}
            trailing={
              <View style={[styles.badgeCount, { backgroundColor: colors.systemRed }]}>
                <Text style={[typography.caption2, { color: '#FFF', fontWeight: '600' }]}>3</Text>
              </View>
            }
            onPress={() => {}}
          />
        </CupertinoListSection>

        {/* Modals */}
        <SectionHeader title="Modals" />
        <View style={styles.buttonRow}>
          <CupertinoButton
            title="Action Sheet"
            variant="tinted"
            onPress={() => setShowActionSheet(true)}
          />
          <CupertinoButton
            title="Alert Dialog"
            variant="tinted"
            onPress={() => setShowAlert(true)}
          />
        </View>

        <CupertinoActionSheet
          visible={showActionSheet}
          onClose={() => setShowActionSheet(false)}
          title="Choose Action"
          message="Select one of the options below"
          options={[
            { label: 'Share', onPress: () => {} },
            { label: 'Save to Photos', onPress: () => {} },
            { label: 'Delete', onPress: () => {}, destructive: true },
          ]}
        />

        <CupertinoAlertDialog
          visible={showAlert}
          onClose={() => setShowAlert(false)}
          title="Delete Photo?"
          message="This action cannot be undone."
          actions={[
            { label: 'Cancel', onPress: () => {}, style: 'cancel' },
            { label: 'Delete', onPress: () => {}, style: 'destructive' },
          ]}
        />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  badge: {
    alignSelf: 'center',
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 20,
    marginTop: 8,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
    flexWrap: 'wrap',
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  badgeCount: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
});
