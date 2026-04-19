import React, { useCallback, useMemo } from 'react';
import { View, Text, ScrollView, StyleSheet, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme/ThemeContext';
import {
  CupertinoNavigationBar,
  CupertinoListSection,
  CupertinoListTile,
  CupertinoSwitch,
  CupertinoSlider,
  useAlert,
} from '../../components';
import {
  useAssistiveTouch,
  AssistiveAction,
  MenuItemId,
} from '../../store/AssistiveTouchStore';
import type { AppNavigationProp } from '../../navigation/types';

// ─── Action catalog (for tap mapping) ────────────────────────────────────────
const ACTION_OPTIONS: { id: AssistiveAction; label: string }[] = [
  { id: 'openMenu',         label: 'Open Menu' },
  { id: 'home',             label: 'Home' },
  { id: 'multitask',        label: 'App Switcher' },
  { id: 'notifications',    label: 'Notifications' },
  { id: 'controlCenter',    label: 'Control Centre' },
  { id: 'spotlight',        label: 'Spotlight' },
  { id: 'settings',         label: 'Settings' },
  { id: 'reachability',     label: 'Reachability' },
  { id: 'hideTemporarily',  label: 'Hide Temporarily' },
  { id: 'screenshot',       label: 'Screenshot' },
  { id: 'lock',             label: 'Lock Screen' },
  { id: 'siri',             label: 'Siri' },
  { id: 'none',             label: 'None' },
];

const ALL_MENU_ITEMS: { id: MenuItemId; label: string }[] = [
  { id: 'home',             label: 'Home' },
  { id: 'multitask',        label: 'App Switcher' },
  { id: 'notifications',    label: 'Notifications' },
  { id: 'controlCenter',    label: 'Control Centre' },
  { id: 'spotlight',        label: 'Spotlight' },
  { id: 'settings',         label: 'Settings' },
  { id: 'siri',             label: 'Siri' },
  { id: 'screenshot',       label: 'Screenshot' },
  { id: 'lock',             label: 'Lock Screen' },
  { id: 'reachability',     label: 'Reachability' },
  { id: 'hideTemporarily',  label: 'Hide Temporarily' },
];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function AssistiveTouchSettingsScreen({ navigation }: { navigation: AppNavigationProp }) {
  const { theme, typography, spacing } = useTheme();
  const { colors } = theme;
  const insets = useSafeAreaInsets();
  const alert = useAlert();
  const assistive = useAssistiveTouch();

  const labelFor = useCallback(
    (action: AssistiveAction) => ACTION_OPTIONS.find((o) => o.id === action)?.label ?? 'None',
    [],
  );

  const pickAction = useCallback(
    (current: AssistiveAction, apply: (a: AssistiveAction) => void) => {
      alert(
        'Choose Action',
        undefined,
        ACTION_OPTIONS.map((opt) => ({
          text: opt.label + (opt.id === current ? '  ✓' : ''),
          onPress: () => apply(opt.id),
        })),
      );
    },
    [alert],
  );

  const moveItem = useCallback(
    (index: number, direction: -1 | 1) => {
      const target = index + direction;
      if (target < 0 || target >= assistive.menuItems.length) return;
      const next = assistive.menuItems.slice();
      [next[index], next[target]] = [next[target], next[index]];
      assistive.update({ menuItems: next });
    },
    [assistive],
  );

  const removeItem = useCallback(
    (id: MenuItemId) => {
      if (assistive.menuItems.length <= 1) return;
      assistive.update({ menuItems: assistive.menuItems.filter((i) => i !== id) });
    },
    [assistive],
  );

  const addItem = useCallback(() => {
    const missing = ALL_MENU_ITEMS.filter((i) => !assistive.menuItems.includes(i.id));
    if (missing.length === 0) {
      alert('Menu Full', 'All available items are already in your menu.');
      return;
    }
    alert(
      'Add to Menu',
      undefined,
      missing.slice(0, 6).map((item) => ({
        text: item.label,
        onPress: () => {
          if (assistive.menuItems.length >= 6) {
            alert('Limit Reached', 'A menu can hold at most 6 items. Remove one first.');
            return;
          }
          assistive.update({ menuItems: [...assistive.menuItems, item.id] });
        },
      })),
    );
  }, [assistive, alert]);

  const resetAll = useCallback(() => {
    alert('Reset AssistiveTouch?', 'This will restore the default layout, actions, and menu.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Reset',
        style: 'destructive',
        onPress: () =>
          assistive.update({
            idleOpacity: 0.5,
            size: 46,
            singleTapAction: 'openMenu',
            doubleTapAction: 'multitask',
            longPressAction: 'hideTemporarily',
            menuItems: ['home', 'multitask', 'notifications', 'controlCenter', 'spotlight', 'settings'],
            autoHideFullscreen: true,
            contextAwareMenu: true,
            reachabilityOnDoubleTap: false,
            hapticFeedback: true,
          }),
      },
    ]);
  }, [alert, assistive]);

  // Pretty label for menu item ids
  const menuItemLabel = useMemo(() => {
    const map: Record<MenuItemId, string> = {} as Record<MenuItemId, string>;
    ALL_MENU_ITEMS.forEach((i) => { map[i.id] = i.label; });
    return map;
  }, []);

  return (
    <View style={[styles.container, { backgroundColor: colors.systemGroupedBackground }]}>
      <CupertinoNavigationBar
        title="AssistiveTouch"
        leftButton={
          <Text
            style={[typography.body, { color: colors.systemBlue }]}
            onPress={() => navigation.goBack()}
          >
            Accessibility
          </Text>
        }
      />
      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 90 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Master switch */}
        <View style={{ paddingHorizontal: spacing.md }}>
          <CupertinoListSection
            footer="Shows a floating button that can replace home navigation, open menus, and perform custom actions."
          >
            <CupertinoListTile
              title="AssistiveTouch"
              trailing={
                <CupertinoSwitch
                  value={assistive.enabled}
                  onValueChange={(v) => assistive.update({ enabled: v })}
                />
              }
              showChevron={false}
            />
          </CupertinoListSection>
        </View>

        {assistive.enabled && (
          <>
            {/* Appearance */}
            <View style={{ paddingHorizontal: spacing.md }}>
              <CupertinoListSection header="Appearance" footer="Idle opacity dims the button after a few seconds of inactivity.">
                <View style={styles.sliderBlock}>
                  <Text style={[typography.caption1, { color: colors.secondaryLabel }]}>
                    Idle Opacity ({Math.round(assistive.idleOpacity * 100)}%)
                  </Text>
                  <CupertinoSlider
                    value={assistive.idleOpacity}
                    onValueChange={(v) => assistive.update({ idleOpacity: Math.max(0.15, Math.min(1, v)) })}
                    minimumValue={0.15}
                    maximumValue={1}
                  />
                </View>
                <View style={styles.sliderBlock}>
                  <Text style={[typography.caption1, { color: colors.secondaryLabel }]}>
                    Button Size ({Math.round(assistive.size)}pt)
                  </Text>
                  <CupertinoSlider
                    value={assistive.size}
                    onValueChange={(v) => assistive.update({ size: Math.round(Math.max(40, Math.min(60, v))) })}
                    minimumValue={40}
                    maximumValue={60}
                  />
                </View>
              </CupertinoListSection>
            </View>

            {/* Custom actions */}
            <View style={{ paddingHorizontal: spacing.md }}>
              <CupertinoListSection
                header="Custom Actions"
                footer="Actions run directly without opening the menu."
              >
                <CupertinoListTile
                  title="Single-Tap"
                  trailing={
                    <Text style={[typography.body, { color: colors.secondaryLabel }]}>
                      {labelFor(assistive.singleTapAction)}
                    </Text>
                  }
                  onPress={() => pickAction(assistive.singleTapAction, (a) => assistive.update({ singleTapAction: a }))}
                />
                <CupertinoListTile
                  title="Double-Tap"
                  trailing={
                    <Text style={[typography.body, { color: colors.secondaryLabel }]}>
                      {labelFor(assistive.doubleTapAction)}
                    </Text>
                  }
                  onPress={() => pickAction(assistive.doubleTapAction, (a) => assistive.update({ doubleTapAction: a }))}
                />
                <CupertinoListTile
                  title="Long Press"
                  trailing={
                    <Text style={[typography.body, { color: colors.secondaryLabel }]}>
                      {labelFor(assistive.longPressAction)}
                    </Text>
                  }
                  onPress={() => pickAction(assistive.longPressAction, (a) => assistive.update({ longPressAction: a }))}
                />
              </CupertinoListSection>
            </View>

            {/* Top-Level Menu */}
            <View style={{ paddingHorizontal: spacing.md }}>
              <CupertinoListSection
                header="Customise Top Level Menu"
                footer="Up to 6 items. Reorder with the arrows, tap the minus to remove."
              >
                {assistive.menuItems.map((id, i) => (
                  <View
                    key={id}
                    style={[styles.menuRow, { borderBottomColor: colors.separator }]}
                  >
                    <Pressable
                      onPress={() => removeItem(id)}
                      hitSlop={8}
                      disabled={assistive.menuItems.length <= 1}
                      style={{ opacity: assistive.menuItems.length <= 1 ? 0.3 : 1 }}
                    >
                      <Ionicons name="remove-circle" size={22} color={colors.systemRed} />
                    </Pressable>
                    <Text style={[typography.body, { color: colors.label, flex: 1, marginLeft: 10 }]}>
                      {menuItemLabel[id]}
                    </Text>
                    <Pressable onPress={() => moveItem(i, -1)} hitSlop={8} disabled={i === 0}>
                      <Ionicons name="chevron-up" size={20} color={i === 0 ? colors.tertiaryLabel : colors.systemBlue} />
                    </Pressable>
                    <View style={{ width: 10 }} />
                    <Pressable
                      onPress={() => moveItem(i, 1)}
                      hitSlop={8}
                      disabled={i === assistive.menuItems.length - 1}
                    >
                      <Ionicons
                        name="chevron-down"
                        size={20}
                        color={i === assistive.menuItems.length - 1 ? colors.tertiaryLabel : colors.systemBlue}
                      />
                    </Pressable>
                  </View>
                ))}
                <CupertinoListTile
                  title="Add Item"
                  trailing={<Ionicons name="add-circle" size={22} color={colors.systemGreen} />}
                  showChevron={false}
                  onPress={addItem}
                />
              </CupertinoListSection>
            </View>

            {/* Enhancements beyond iOS */}
            <View style={{ paddingHorizontal: spacing.md }}>
              <CupertinoListSection
                header="Enhancements"
                footer="Improvements beyond what AssistiveTouch offers on iOS."
              >
                <CupertinoListTile
                  title="Auto-hide in Full-Screen"
                  subtitle="Hides the button in Camera and Call screens"
                  trailing={
                    <CupertinoSwitch
                      value={assistive.autoHideFullscreen}
                      onValueChange={(v) => assistive.update({ autoHideFullscreen: v })}
                    />
                  }
                  showChevron={false}
                />
                <CupertinoListTile
                  title="Context-Aware Menu"
                  subtitle="First menu slot adapts to the current screen"
                  trailing={
                    <CupertinoSwitch
                      value={assistive.contextAwareMenu}
                      onValueChange={(v) => assistive.update({ contextAwareMenu: v })}
                    />
                  }
                  showChevron={false}
                />
                <CupertinoListTile
                  title="Reachability on Double-Tap"
                  subtitle="Slides the screen down for one-handed use"
                  trailing={
                    <CupertinoSwitch
                      value={assistive.reachabilityOnDoubleTap}
                      onValueChange={(v) => assistive.update({ reachabilityOnDoubleTap: v })}
                    />
                  }
                  showChevron={false}
                />
                <CupertinoListTile
                  title="Haptic Feedback"
                  trailing={
                    <CupertinoSwitch
                      value={assistive.hapticFeedback}
                      onValueChange={(v) => assistive.update({ hapticFeedback: v })}
                    />
                  }
                  showChevron={false}
                />
              </CupertinoListSection>
            </View>

            {/* Reset */}
            <View style={{ paddingHorizontal: spacing.md }}>
              <CupertinoListSection>
                <CupertinoListTile
                  title="Reset to Defaults"
                  onPress={resetAll}
                  showChevron={false}
                  trailing={<Ionicons name="refresh" size={18} color={colors.systemRed} />}
                />
              </CupertinoListSection>
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  sliderBlock: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 4,
  },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
});
