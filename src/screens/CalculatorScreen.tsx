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
import { useTheme } from '../theme/ThemeContext';

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

// ---------------------------------------------------------------------------
// Accessibility label map
// ---------------------------------------------------------------------------

const ACCESSIBILITY_LABELS: Record<string, string> = {
  'AC': 'clear',
  '+/-': 'toggle sign',
  '%': 'percent',
  '÷': 'divide',
  '×': 'multiply',
  '-': 'minus',
  '+': 'plus',
  '=': 'equals',
  '.': 'decimal point',
};

function getAccessibilityLabel(def: ButtonDef): string {
  return def.accessibilityLabel ?? ACCESSIBILITY_LABELS[def.label] ?? def.label;
}

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
      accessibilityLabel={getAccessibilityLabel(def)}
      accessibilityRole="button"
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
  const { typography } = useTheme();
  const [display, setDisplay] = useState('0');
  const [previousValue, setPreviousValue] = useState<number | null>(null);
  const [operation, setOperation] = useState<string | null>(null);
  const [resetOnNext, setResetOnNext] = useState(false);
  const [memory, setMemory] = useState(0);
  const [history, setHistory] = useState<string[]>([]);
  const [isError, setIsError] = useState(false);

  const handleNumber = (num: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (isError) {
      setIsError(false);
      setDisplay(num);
      setPreviousValue(null);
      setOperation(null);
      setResetOnNext(false);
      return;
    }
    if (resetOnNext) {
      setDisplay(num);
      setResetOnNext(false);
      return;
    }
    setDisplay(prev => (prev === '0' ? num : prev + num));
  };

  const compute = (prev: number, op: string, current: number): number | 'Error' => {
    switch (op) {
      case '+': return prev + current;
      case '-': return prev - current;
      case '×': return prev * current;
      case '÷': return current !== 0 ? prev / current : 'Error';
      default: return current;
    }
  };

  const handleOperator = (op: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (isError) return;
    const current = parseFloat(display);

    if (op === '=') {
      if (previousValue === null || !operation) return;
      const result = compute(previousValue, operation, current);
      if (result === 'Error') {
        const expr = `${formatNumber(previousValue)} ${operation} ${formatNumber(current)}`;
        setHistory(prev => [...prev.slice(-9), `${expr} = Error`]);
        setDisplay('Error');
        setIsError(true);
        setPreviousValue(null);
        setOperation(null);
        setResetOnNext(true);
        return;
      }
      const expr = `${formatNumber(previousValue)} ${operation} ${formatNumber(current)}`;
      setHistory(prev => [...prev.slice(-9), `${expr} = ${formatNumber(result)}`]);
      setDisplay(formatNumber(result));
      setPreviousValue(null);
      setOperation(null);
      setResetOnNext(true);
      return;
    }

    // Chain: if we already have a pending operation and a new value was entered, resolve first
    if (previousValue !== null && operation && !resetOnNext) {
      const result = compute(previousValue, operation, current);
      if (result === 'Error') {
        setDisplay('Error');
        setIsError(true);
        setPreviousValue(null);
        setOperation(null);
        setResetOnNext(true);
        return;
      }
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
    setIsError(false);
  };

  const handleMemoryClear = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setMemory(0);
  };

  const handleMemoryRecall = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setDisplay(formatNumber(memory));
    setResetOnNext(true);
  };

  const handleMemoryAdd = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (isError) return;
    setMemory(prev => prev + parseFloat(display));
  };

  const handleMemorySubtract = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (isError) return;
    setMemory(prev => prev - parseFloat(display));
  };

  const handlePercent = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (isError) return;
    const current = parseFloat(display);
    if (previousValue !== null && operation) {
      // Contextual: percentage of first operand (e.g. 100 + 10% => 100 + 10)
      setDisplay(String(previousValue * (current / 100)));
    } else {
      setDisplay(String(current / 100));
    }
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
        {memory !== 0 && (
          <Text style={styles.memoryIndicator}>M</Text>
        )}
        {history.length > 0 && (
          <Text style={styles.historyText}>{history[history.length - 1]}</Text>
        )}
        <Text
          style={[styles.displayText, { fontSize: displayFontSize }]}
          numberOfLines={1}
          adjustsFontSizeToFit
        >
          {display}
        </Text>
      </View>

      {/* Memory buttons */}
      <View style={styles.memoryRow}>
        {(['MC', 'MR', 'M+', 'M-'] as const).map((label) => (
          <Pressable
            key={label}
            onPress={() => {
              switch (label) {
                case 'MC': handleMemoryClear(); break;
                case 'MR': handleMemoryRecall(); break;
                case 'M+': handleMemoryAdd(); break;
                case 'M-': handleMemorySubtract(); break;
              }
            }}
            accessibilityLabel={`memory ${label.toLowerCase()}`}
            accessibilityRole="button"
            style={({ pressed }) => [
              styles.memoryButton,
              { opacity: pressed ? 0.5 : 1 },
            ]}
          >
            <Text style={styles.memoryButtonText}>{label}</Text>
          </Pressable>
        ))}
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

  memoryIndicator: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '500',
    alignSelf: 'flex-start',
    marginBottom: 2,
  },

  historyText: {
    color: '#888888',
    fontSize: 16,
    fontWeight: '300',
    marginBottom: 4,
  },

  displayText: {
    color: '#FFFFFF',
    fontWeight: '200',
    letterSpacing: -2,
  },

  memoryRow: {
    flexDirection: 'row',
    justifyContent: 'space-evenly',
    paddingHorizontal: GAP,
    paddingBottom: 8,
  },

  memoryButton: {
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 16,
    backgroundColor: '#1C1C1E',
  },

  memoryButtonText: {
    color: '#FF9F0A',
    fontSize: 16,
    fontWeight: '500',
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
    elevation: 2,
  },

  buttonText: {
    fontSize: 32,
    fontWeight: '400',
  },
});
