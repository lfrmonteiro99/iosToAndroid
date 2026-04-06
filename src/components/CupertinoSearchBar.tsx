import React, { useState, useRef } from 'react';
import { View, TextInput, Text, Pressable, StyleSheet, TextInputProps } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
} from 'react-native-reanimated';
import { useTheme } from '../theme/ThemeContext';

interface CupertinoSearchBarProps extends Omit<TextInputProps, 'style'> {
  value: string;
  onChangeText: (text: string) => void;
  onCancel?: () => void;
}

export function CupertinoSearchBar({
  value,
  onChangeText,
  onCancel,
  placeholder = 'Search',
  ...rest
}: CupertinoSearchBarProps) {
  const { theme, typography } = useTheme();
  const { colors } = theme;
  const [, setIsFocused] = useState(false);
  const inputRef = useRef<TextInput>(null);

  const cancelWidth = useSharedValue(0);
  const cancelOpacity = useSharedValue(0);

  const handleFocus = () => {
    setIsFocused(true);
    cancelWidth.value = withTiming(60, { duration: 200 });
    cancelOpacity.value = withTiming(1, { duration: 200 });
  };

  const handleCancel = () => {
    onChangeText('');
    inputRef.current?.blur();
    setIsFocused(false);
    cancelWidth.value = withTiming(0, { duration: 200 });
    cancelOpacity.value = withTiming(0, { duration: 150 });
    onCancel?.();
  };

  const cancelStyle = useAnimatedStyle(() => ({
    width: cancelWidth.value,
    opacity: cancelOpacity.value,
  }));

  return (
    <View style={styles.container}>
      <View
        style={[
          styles.inputContainer,
          {
            backgroundColor: theme.dark
              ? colors.systemGray5
              : colors.systemGray6,
          },
        ]}
      >
        <Ionicons
          name="search"
          size={16}
          color={colors.systemGray}
          style={styles.searchIcon}
        />
        <TextInput
          ref={inputRef}
          style={[
            typography.body,
            styles.input,
            { color: colors.label },
          ]}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={colors.systemGray}
          onFocus={handleFocus}
          returnKeyType="search"
          clearButtonMode="while-editing"
          {...rest}
        />
        {value.length > 0 && (
          <Pressable
            onPress={() => onChangeText('')}
            hitSlop={8}
            style={styles.clearButton}
          >
            <View style={[styles.clearIcon, { backgroundColor: colors.systemGray3 }]}>
              <Ionicons name="close" size={12} color={colors.systemGray6} />
            </View>
          </Pressable>
        )}
      </View>

      <Animated.View style={[styles.cancelContainer, cancelStyle]}>
        <Pressable onPress={handleCancel}>
          <Text style={[typography.body, { color: colors.systemBlue }]}>
            Cancel
          </Text>
        </Pressable>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  inputContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 10,
    height: 36,
    paddingHorizontal: 8,
  },
  searchIcon: {
    marginRight: 4,
  },
  input: {
    flex: 1,
    height: 36,
    padding: 0,
  },
  clearButton: {
    marginLeft: 4,
  },
  clearIcon: {
    width: 16,
    height: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelContainer: {
    overflow: 'hidden',
    alignItems: 'flex-end',
    justifyContent: 'center',
    marginLeft: 8,
  },
});
