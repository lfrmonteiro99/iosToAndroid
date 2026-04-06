import React from 'react';
import { View, Text, Pressable, StyleSheet, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme/ThemeContext';

// ─── ListTile ────────────────────────────────────────────────

interface ListTileIcon {
  name: keyof typeof Ionicons.glyphMap;
  color: string;
  backgroundColor: string;
}

interface CupertinoListTileProps {
  title: string;
  subtitle?: string;
  leading?: ListTileIcon;
  trailing?: React.ReactNode;
  showChevron?: boolean;
  onPress?: () => void;
  isLast?: boolean;
}

export const CupertinoListTile = React.memo(function CupertinoListTile({
  title,
  subtitle,
  leading,
  trailing,
  showChevron = true,
  onPress,
  isLast = false,
}: CupertinoListTileProps) {
  const { theme, typography } = useTheme();
  const { colors } = theme;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={subtitle ? `${title}, ${subtitle}` : title}
      style={({ pressed }) => [
        styles.tile,
        {
          backgroundColor: pressed && onPress
            ? colors.systemGray5
            : 'transparent',
        },
      ]}
    >
      {leading && (
        <View
          style={[
            styles.iconContainer,
            { backgroundColor: leading.backgroundColor },
          ]}
        >
          <Ionicons name={leading.name} size={20} color={leading.color} />
        </View>
      )}
      <View
        style={[
          styles.tileContent,
          !isLast && {
            borderBottomWidth: StyleSheet.hairlineWidth,
            borderBottomColor: colors.separator,
          },
        ]}
      >
        <View style={styles.titleContainer}>
          <Text
            style={[typography.body, { color: colors.label }]}
            numberOfLines={1}
          >
            {title}
          </Text>
          {subtitle && (
            <Text
              style={[
                typography.caption1,
                { color: colors.secondaryLabel, marginTop: 2 },
              ]}
              numberOfLines={1}
            >
              {subtitle}
            </Text>
          )}
        </View>
        <View style={styles.trailingContainer}>
          {trailing}
          {showChevron && onPress && (
            <Ionicons
              name="chevron-forward"
              size={20}
              color={colors.systemGray3}
              style={trailing ? { marginLeft: 4 } : undefined}
            />
          )}
        </View>
      </View>
    </Pressable>
  );
});

// ─── ListSection ─────────────────────────────────────────────

interface CupertinoListSectionProps {
  header?: string;
  footer?: string;
  children: React.ReactNode;
  style?: ViewStyle;
}

export function CupertinoListSection({
  header,
  footer,
  children,
  style,
}: CupertinoListSectionProps) {
  const { theme, typography, borderRadius } = useTheme();
  const { colors } = theme;

  const childArray = React.Children.toArray(children);

  return (
    <View style={[styles.section, style]}>
      {header && (
        <Text
          style={[
            typography.footnote,
            styles.sectionHeader,
            { color: colors.secondaryLabel },
          ]}
        >
          {header.toUpperCase()}
        </Text>
      )}
      <View
        style={[
          styles.sectionContent,
          {
            backgroundColor: colors.secondarySystemGroupedBackground,
            borderRadius: borderRadius.medium,
          },
        ]}
      >
        {React.Children.map(childArray, (child, index) => {
          if (React.isValidElement<CupertinoListTileProps>(child)) {
            return React.cloneElement(child, {
              isLast: index === childArray.length - 1,
            });
          }
          return child;
        })}
      </View>
      {footer && (
        <Text
          style={[
            typography.footnote,
            styles.sectionFooter,
            { color: colors.secondaryLabel },
          ]}
        >
          {footer}
        </Text>
      )}
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────

const styles = StyleSheet.create({
  tile: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 44,
    paddingLeft: 16,
  },
  iconContainer: {
    width: 29,
    height: 29,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  tileContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 44,
    paddingRight: 16,
    paddingVertical: 8,
  },
  titleContainer: {
    flex: 1,
    marginRight: 8,
  },
  trailingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  section: {
    marginBottom: 20,
  },
  sectionHeader: {
    paddingHorizontal: 16,
    marginBottom: 6,
  },
  sectionContent: {
    overflow: 'hidden',
  },
  sectionFooter: {
    paddingHorizontal: 16,
    marginTop: 6,
  },
});
