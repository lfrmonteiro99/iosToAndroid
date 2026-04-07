import React, { useState } from 'react';
import { View, Text, ScrollView, StyleSheet, Platform, Alert } from 'react-native';
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
  CupertinoSlider,
  CupertinoProgressBar,
  CupertinoActivityIndicator,
  CupertinoPicker,
  CupertinoSwipeableRow,
} from '../components';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function SectionHeader({ title, typography, color }: { title: string; typography: any; color: string }) {
  return (
    <Text
      style={[
        typography.footnote,
        {
          color,
          textTransform: 'uppercase',
          marginBottom: 8,
          marginTop: 24,
        },
      ]}
    >
      {title}
    </Text>
  );
}

export function ComponentsGalleryScreen() {
  const { theme, typography, spacing } = useTheme();
  const { colors } = theme;
  const insets = useSafeAreaInsets();

  const [switchValue, setSwitchValue] = useState(true);
  const [textValue, setTextValue] = useState('');
  const [segmentIndex, setSegmentIndex] = useState(0);
  const [showActionSheet, setShowActionSheet] = useState(false);
  const [showAlert, setShowAlert] = useState(false);
  const [sliderValue, setSliderValue] = useState(0.5);
  const [progressValue, setProgressValue] = useState(0.65);
  const [pickerIndex, setPickerIndex] = useState(2);

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
        <SectionHeader typography={typography} color={colors.secondaryLabel} title="Buttons" />
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
        <SectionHeader typography={typography} color={colors.secondaryLabel} title="Switch" />
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

        {/* Slider */}
        <SectionHeader typography={typography} color={colors.secondaryLabel} title="Slider" />
        <CupertinoCard>
          <Text style={[typography.footnote, { color: colors.secondaryLabel, marginBottom: 8 }]}>
            Brightness: {Math.round(sliderValue * 100)}%
          </Text>
          <CupertinoSlider
            value={sliderValue}
            onValueChange={setSliderValue}
          />
        </CupertinoCard>

        {/* Progress Bar */}
        <SectionHeader typography={typography} color={colors.secondaryLabel} title="Progress Bar" />
        <CupertinoCard>
          <Text style={[typography.footnote, { color: colors.secondaryLabel, marginBottom: 12 }]}>
            Download: {Math.round(progressValue * 100)}%
          </Text>
          <CupertinoProgressBar progress={progressValue} />
          <View style={[styles.buttonRow, { marginTop: 12 }]}>
            <CupertinoButton
              title="Reset"
              variant="tinted"
              onPress={() => setProgressValue(0)}
            />
            <CupertinoButton
              title="50%"
              variant="tinted"
              onPress={() => setProgressValue(0.5)}
            />
            <CupertinoButton
              title="100%"
              variant="tinted"
              onPress={() => setProgressValue(1)}
            />
          </View>
        </CupertinoCard>

        {/* Activity Indicator */}
        <SectionHeader typography={typography} color={colors.secondaryLabel} title="Activity Indicator" />
        <CupertinoCard>
          <View style={styles.indicatorRow}>
            <View style={styles.indicatorItem}>
              <CupertinoActivityIndicator size="small" />
              <Text style={[typography.caption1, { color: colors.secondaryLabel, marginTop: 8 }]}>
                Small
              </Text>
            </View>
            <View style={styles.indicatorItem}>
              <CupertinoActivityIndicator size="large" />
              <Text style={[typography.caption1, { color: colors.secondaryLabel, marginTop: 8 }]}>
                Large
              </Text>
            </View>
            <View style={styles.indicatorItem}>
              <CupertinoActivityIndicator size="large" color={colors.systemBlue} />
              <Text style={[typography.caption1, { color: colors.secondaryLabel, marginTop: 8 }]}>
                Colored
              </Text>
            </View>
          </View>
        </CupertinoCard>

        {/* Picker */}
        <SectionHeader typography={typography} color={colors.secondaryLabel} title="Picker" />
        <CupertinoCard>
          <CupertinoPicker
            items={['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']}
            selectedIndex={pickerIndex}
            onIndexChange={setPickerIndex}
          />
          <Text style={[typography.footnote, { color: colors.secondaryLabel, textAlign: 'center', marginTop: 8 }]}>
            Selected: {['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'][pickerIndex]}
          </Text>
        </CupertinoCard>

        {/* Text Field */}
        <SectionHeader typography={typography} color={colors.secondaryLabel} title="Text Field" />
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
        <SectionHeader typography={typography} color={colors.secondaryLabel} title="Segmented Control" />
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
        <SectionHeader typography={typography} color={colors.secondaryLabel} title="Cards" />
        <CupertinoCard
          title="Cupertino Card"
          subtitle="With title and subtitle"
        >
          <Text style={[typography.body, { color: colors.label }]}>
            This card component uses iOS-style border radius, soft shadows, and
            the system background color. It adapts to dark mode automatically.
          </Text>
        </CupertinoCard>

        {/* Swipeable Row */}
        <SectionHeader typography={typography} color={colors.secondaryLabel} title="Swipeable Row" />
        <View style={{ borderRadius: 12, overflow: 'hidden' }}>
          <CupertinoSwipeableRow
            trailingActions={[
              { label: 'Delete', color: '#FF3B30', onPress: () => Alert.alert('Demo', 'Delete action triggered.') },
            ]}
            leadingActions={[
              { label: 'Pin', color: '#FF9500', onPress: () => Alert.alert('Demo', 'Pin action triggered.') },
            ]}
          >
            <View style={[
              styles.swipeRow,
              { backgroundColor: colors.secondarySystemGroupedBackground },
            ]}>
              <Text style={[typography.body, { color: colors.label }]}>
                Swipe me left or right
              </Text>
              <Text style={[typography.caption1, { color: colors.secondaryLabel }]}>
                ← Pin | Delete →
              </Text>
            </View>
          </CupertinoSwipeableRow>
        </View>

        {/* List Section */}
        <SectionHeader typography={typography} color={colors.secondaryLabel} title="List Section" />
        <CupertinoListSection header="Favorites" footer="These are your favorite items.">
          <CupertinoListTile
            title="Messages"
            leading={{ name: 'chatbubble-ellipses', color: '#FFF', backgroundColor: '#34C759' }}
            onPress={() => Alert.alert('Demo', 'Messages action triggered.')}
          />
          <CupertinoListTile
            title="FaceTime"
            leading={{ name: 'videocam', color: '#FFF', backgroundColor: '#34C759' }}
            onPress={() => Alert.alert('Demo', 'FaceTime action triggered.')}
          />
          <CupertinoListTile
            title="Mail"
            leading={{ name: 'mail', color: '#FFF', backgroundColor: '#007AFF' }}
            trailing={
              <View style={[styles.badgeCount, { backgroundColor: colors.systemRed }]}>
                <Text style={[typography.caption2, { color: '#FFF', fontWeight: '600' }]}>3</Text>
              </View>
            }
            onPress={() => Alert.alert('Demo', 'Mail action triggered.')}
          />
        </CupertinoListSection>

        {/* Modals */}
        <SectionHeader typography={typography} color={colors.secondaryLabel} title="Modals" />
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
            { label: 'Share', onPress: () => Alert.alert('Demo', 'Share action triggered.') },
            { label: 'Save to Photos', onPress: () => Alert.alert('Demo', 'Save to Photos action triggered.') },
            { label: 'Delete', onPress: () => Alert.alert('Demo', 'Delete action triggered.'), destructive: true },
          ]}
        />

        <CupertinoAlertDialog
          visible={showAlert}
          onClose={() => setShowAlert(false)}
          title="Delete Photo?"
          message="This action cannot be undone."
          actions={[
            { label: 'Cancel', onPress: () => setShowAlert(false), style: 'cancel' },
            { label: 'Delete', onPress: () => { setShowAlert(false); Alert.alert('Demo', 'Delete confirmed.'); }, style: 'destructive' },
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
  indicatorRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingVertical: 8,
  },
  indicatorItem: {
    alignItems: 'center',
  },
  swipeRow: {
    paddingHorizontal: 16,
    paddingVertical: 14,
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
