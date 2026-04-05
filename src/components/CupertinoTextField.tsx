import React, { useState } from 'react';
import {
  View,
  TextInput,
  Pressable,
  StyleSheet,
  TextInputProps,
  ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme/ThemeContext';

interface CupertinoTextFieldProps extends TextInputProps {
  clearButton?: boolean;
  prefix?: React.ReactNode;
  containerStyle?: ViewStyle;
}

export function CupertinoTextField({
  clearButton = true,
  prefix,
  containerStyle,
  value,
  onChangeText,
  placeholder,
  ...rest
}: CupertinoTextFieldProps) {
  const { theme, typography } = useTheme();
  const { colors } = theme;
  const [isFocused, setIsFocused] = useState(false);

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: colors.systemGray6,
          borderColor: isFocused ? colors.systemBlue : 'transparent',
          borderWidth: isFocused ? 1 : 0,
        },
        containerStyle,
      ]}
    >
      {prefix && <View style={styles.prefix}>{prefix}</View>}
      <TextInput
        style={[
          styles.input,
          typography.body,
          { color: colors.label },
        ]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.tertiaryLabel}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
        {...rest}
      />
      {clearButton && value && value.length > 0 && (
        <Pressable
          onPress={() => onChangeText?.('')}
          style={styles.clearButton}
          hitSlop={8}
        >
          <Ionicons
            name="close-circle"
            size={18}
            color={colors.systemGray3}
          />
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 10,
    paddingHorizontal: 12,
    minHeight: 44,
  },
  prefix: {
    marginRight: 8,
  },
  input: {
    flex: 1,
    paddingVertical: 10,
  },
  clearButton: {
    marginLeft: 8,
  },
});
