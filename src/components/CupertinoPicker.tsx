import React, { useRef, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, ViewStyle } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { hapticSelection } from '../utils/haptics';

interface CupertinoPickerProps {
  items: string[];
  selectedIndex: number;
  onIndexChange: (index: number) => void;
  itemHeight?: number;
  visibleItems?: number;
  style?: ViewStyle;
}

const DEFAULT_ITEM_HEIGHT = 40;
const DEFAULT_VISIBLE_ITEMS = 5;

export function CupertinoPicker({
  items,
  selectedIndex,
  onIndexChange,
  itemHeight = DEFAULT_ITEM_HEIGHT,
  visibleItems = DEFAULT_VISIBLE_ITEMS,
  style,
}: CupertinoPickerProps) {
  const { theme, typography } = useTheme();
  const { colors } = theme;
  const flatListRef = useRef<FlatList>(null);
  const lastSelectedRef = useRef(selectedIndex);

  const containerHeight = itemHeight * visibleItems;
  const paddingItems = Math.floor(visibleItems / 2);

  // Add padding items at top and bottom
  const paddedItems = [
    ...Array(paddingItems).fill(''),
    ...items,
    ...Array(paddingItems).fill(''),
  ];

  const handleMomentumEnd = useCallback(
    (event: { nativeEvent: { contentOffset: { y: number } } }) => {
      const y = event.nativeEvent.contentOffset.y;
      const index = Math.round(y / itemHeight);
      const clampedIndex = Math.max(0, Math.min(index, items.length - 1));
      if (clampedIndex !== lastSelectedRef.current) {
        lastSelectedRef.current = clampedIndex;
        hapticSelection();
        onIndexChange(clampedIndex);
      }
    },
    [itemHeight, items.length, onIndexChange],
  );

  const renderItem = useCallback(
    ({ item, index: paddedIndex }: { item: string; index: number }) => {
      const realIndex = paddedIndex - paddingItems;
      const isSelected = realIndex === selectedIndex;
      const isEmpty = item === '';

      return (
        <View style={[styles.item, { height: itemHeight }]}>
          {!isEmpty && (
            <Text
              style={[
                typography.body,
                {
                  color: isSelected ? colors.label : colors.tertiaryLabel,
                  fontSize: isSelected ? 21 : 19,
                  fontWeight: isSelected ? '500' : '400',
                },
              ]}
            >
              {item}
            </Text>
          )}
        </View>
      );
    },
    [paddingItems, selectedIndex, itemHeight, typography, colors],
  );

  return (
    <View style={[styles.container, { height: containerHeight }, style]}>
      {/* Selection indicator */}
      <View
        style={[
          styles.selectionIndicator,
          {
            top: paddingItems * itemHeight,
            height: itemHeight,
            backgroundColor: theme.dark
              ? 'rgba(120, 120, 128, 0.24)'
              : 'rgba(120, 120, 128, 0.12)',
          },
        ]}
      />

      <FlatList
        ref={flatListRef}
        data={paddedItems}
        renderItem={renderItem}
        keyExtractor={(_, i) => `picker-${i}`}
        showsVerticalScrollIndicator={false}
        snapToInterval={itemHeight}
        decelerationRate="fast"
        onMomentumScrollEnd={handleMomentumEnd}
        getItemLayout={(_, index) => ({
          length: itemHeight,
          offset: itemHeight * index,
          index,
        })}
        initialScrollIndex={selectedIndex}
        contentContainerStyle={{ paddingVertical: 0 }}
      />

      {/* Top/bottom fade gradients */}
      <View style={[styles.fadeTop, { height: paddingItems * itemHeight }]} pointerEvents="none" />
      <View style={[styles.fadeBottom, { height: paddingItems * itemHeight }]} pointerEvents="none" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
    position: 'relative',
  },
  item: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectionIndicator: {
    position: 'absolute',
    left: 0,
    right: 0,
    borderRadius: 8,
    zIndex: 0,
  },
  fadeTop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
  },
  fadeBottom: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
  },
});
