import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  StatusBar,
  SafeAreaView,
} from 'react-native';
import * as Haptics from 'expo-haptics';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ButtonDef = {
  label: string;
  type: 'number' | 'operator' | 'function';
  wide?: boolean;
  accessibilityLabel?: string;
};

// ---------------------------------------------------------------------------
// Button grid definition
// ---------------------------------------------------------------------------

const ROWS: ButtonDef[][] = [
  [
    { label: 'AC', type: 'function' },
    { label: '+/-', type: 'function' },
    { label: '%', type: 'function' },
    { label: '÷', type: 'operator' },
  ],
  [
    { label: '7', type: 'number' },
    { label: '8', type: 'number' },
    { label: '9', type: 'number' },
    { label: '×', type: 'operator' },
  ],
  [
    { label: '4', type: 'number' },
    { label: '5', type: 'number' },
    { label: '6', type: 'number' },
    { label: '-', type: 'operator' },
  ],
  [
    { label: '1', type: 'number' },
    { label: '2', type: 'number' },
    { label: '3', type: 'number' },
    { label: '+', type: 'operator' },
  ],
  [
    { label: '0', type: 'number', wide: true, accessibilityLabel: '0' },
    { label: '.', type: 'number' },
    { label: '=', type: 'operator' },
  ],
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const formatNumber = (n: number): string => {
  if (Number.isInteger(n) && Math.abs(n) < 1e15) return n.toString();
  return parseFloat(n.toPrecision(10)).toString();
};

// ---------------------------------------------------------------------------
// Calculator button component
// ---------------------------------------------------------------------------

interface CalcButtonProps {
  def: ButtonDef;
  isActiveOp: boolean;
  onPress: () => void;
}

function CalcButton({ def, isActiveOp, onPress }: CalcButtonProps) {
  const bgColor =
    def.type === 'operator'
      ? isActiveOp
        ? '#FFFFFF'
        : '#FF9F0A'
      : def.type === 'function'
      ? '#A5A5A5'
      : '#333333';

  const textColor =
    def.type === 'operator'
      ? isActiveOp
        ? '#FF9F0A'
        : '#FFFFFF'
      : def.type === 'function'
      ? '#000000'
      : '#FFFFFF';

  return (
    <Pressable
      onPress={onPress}
      accessibilityLabel={def.accessibilityLabel ?? def.label}
      style={({ pressed }) => [
        styles.button,
        def.wide ? styles.buttonWide : styles.buttonNormal,
        { backgroundColor: bgColor, opacity: pressed ? 0.75 : 1 },
      ]}
    >
      <Text style={[styles.buttonText, { color: textColor }]}>{def.label}</Text>
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// Main Screen
// ---------------------------------------------------------------------------

export function CalculatorScreen() {
  const [display, setDisplay] = useState('0');
  const [previousValue, setPreviousValue] = useState<number | null>(null);
  const [operation, setOperation] = useState<string | null>(null);
  const [resetOnNext, setResetOnNext] = useState(false);

  const handleNumber = (num: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (resetOnNext) {
      setDisplay(num);
      setResetOnNext(false);
      return;
    }
    setDisplay(prev => (prev === '0' ? num : prev + num));
  };

  const compute = (prev: number, op: string, current: number): number => {
    switch (op) {
      case '+': return prev + current;
      case '-': return prev - current;
      case '×': return prev * current;
      case '÷': return current !== 0 ? prev / current : 0;
      default: return current;
    }
  };

  const handleOperator = (op: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const current = parseFloat(display);

    if (op === '=') {
      if (previousValue === null || !operation) return;
      const result = compute(previousValue, operation, current);
      setDisplay(formatNumber(result));
      setPreviousValue(null);
      setOperation(null);
      setResetOnNext(true);
      return;
    }

    // Chain: if we already have a pending operation and a new value was entered, resolve first
    if (previousValue !== null && operation && !resetOnNext) {
      const result = compute(previousValue, operation, current);
      setDisplay(formatNumber(result));
      setPreviousValue(result);
    } else {
      setPreviousValue(current);
    }

    setOperation(op);
    setResetOnNext(true);
  };

  const handleClear = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setDisplay('0');
    setPreviousValue(null);
    setOperation(null);
    setResetOnNext(false);
  };

  const handlePercent = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setDisplay(String(parseFloat(display) / 100));
  };

  const handleToggleSign = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setDisplay(String(-parseFloat(display)));
  };

  const handleDecimal = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (!display.includes('.')) setDisplay(display + '.');
  };

  const handlePress = (def: ButtonDef) => {
    switch (def.label) {
      case 'AC':
        handleClear();
        break;
      case '+/-':
        handleToggleSign();
        break;
      case '%':
        handlePercent();
        break;
      case '.':
        handleDecimal();
        break;
      case '÷':
      case '×':
      case '-':
      case '+':
      case '=':
        handleOperator(def.label);
        break;
      default:
        handleNumber(def.label);
    }
  };

  // Shrink display font for long numbers
  const displayFontSize = display.length > 9 ? 44 : display.length > 6 ? 54 : 70;

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor="#000000" />

      {/* Display */}
      <View style={styles.displayArea}>
        <Text
          style={[styles.displayText, { fontSize: displayFontSize }]}
          numberOfLines={1}
          adjustsFontSizeToFit
        >
          {display}
        </Text>
      </View>

      {/* Button grid */}
      <View style={styles.grid}>
        {ROWS.map((row, rowIdx) => (
          <View key={rowIdx} style={styles.row}>
            {row.map((def) => (
              <CalcButton
                key={def.label}
                def={def}
                isActiveOp={operation === def.label && resetOnNext}
                onPress={() => handlePress(def)}
              />
            ))}
          </View>
        ))}
      </View>
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const BTN = 80;
const GAP = 12;

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#000000',
    justifyContent: 'flex-end',
  },

  displayArea: {
    paddingHorizontal: 24,
    paddingBottom: 16,
    alignItems: 'flex-end',
  },

  displayText: {
    color: '#FFFFFF',
    fontWeight: '300',
    letterSpacing: -2,
  },

  grid: {
    paddingHorizontal: GAP,
    paddingBottom: GAP,
    gap: GAP,
  },

  row: {
    flexDirection: 'row',
    gap: GAP,
  },

  buttonNormal: {
    width: BTN,
    height: BTN,
    borderRadius: BTN / 2,
  },

  buttonWide: {
    width: BTN * 2 + GAP,
    height: BTN,
    borderRadius: BTN / 2,
    alignItems: 'flex-start',
    paddingLeft: BTN / 2 - 10,
  },

  button: {
    alignItems: 'center',
    justifyContent: 'center',
  },

  buttonText: {
    fontSize: 32,
    fontWeight: '400',
  },
});
