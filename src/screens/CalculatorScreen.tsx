import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  StatusBar,
  SafeAreaView,
  ScrollView,
  useWindowDimensions,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '../theme/ThemeContext';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const HISTORY_KEY = 'calculator_history';
const MAX_HISTORY = 20;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ButtonDef = {
  label: string;
  type: 'number' | 'operator' | 'function' | 'memory' | 'scientific';
  wide?: boolean;
  accessibilityLabel?: string;
};

type HistoryEntry = {
  expression: string;
  result: string;
};

// ---------------------------------------------------------------------------
// Accessibility label map
// ---------------------------------------------------------------------------

const ACCESSIBILITY_LABELS: Record<string, string> = {
  AC: 'clear',
  '+/-': 'toggle sign',
  '%': 'percent',
  '÷': 'divide',
  '×': 'multiply',
  '-': 'minus',
  '+': 'plus',
  '=': 'equals',
  '.': 'decimal point',
  MC: 'memory clear',
  MR: 'memory recall',
  'M+': 'memory add',
  'M-': 'memory subtract',
  sin: 'sine',
  cos: 'cosine',
  tan: 'tangent',
  log: 'logarithm base 10',
  ln: 'natural logarithm',
  '√': 'square root',
  'x²': 'square',
  'x³': 'cube',
  π: 'pi',
  e: "euler's number",
  '1/x': 'reciprocal',
  '|x|': 'absolute value',
  '(': 'open parenthesis',
  ')': 'close parenthesis',
};

function getAccessibilityLabel(def: ButtonDef): string {
  return def.accessibilityLabel ?? ACCESSIBILITY_LABELS[def.label] ?? def.label;
}

// ---------------------------------------------------------------------------
// Button grid definitions
// ---------------------------------------------------------------------------

const MEMORY_ROW: ButtonDef[] = [
  { label: 'MC', type: 'memory' },
  { label: 'MR', type: 'memory' },
  { label: 'M+', type: 'memory' },
  { label: 'M-', type: 'memory' },
];

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

const SCIENTIFIC_ROWS: ButtonDef[][] = [
  [
    { label: '(', type: 'scientific', accessibilityLabel: 'open parenthesis' },
    { label: ')', type: 'scientific', accessibilityLabel: 'close parenthesis' },
    { label: 'x²', type: 'scientific' },
  ],
  [
    { label: 'sin', type: 'scientific' },
    { label: 'cos', type: 'scientific' },
    { label: 'x³', type: 'scientific' },
  ],
  [
    { label: 'tan', type: 'scientific' },
    { label: 'log', type: 'scientific' },
    { label: '√', type: 'scientific' },
  ],
  [
    { label: 'ln', type: 'scientific' },
    { label: 'π', type: 'scientific' },
    { label: 'e', type: 'scientific' },
  ],
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const formatNumber = (n: number): string => {
  if (!isFinite(n) || isNaN(n)) return 'Error';
  if (Number.isInteger(n) && Math.abs(n) < 1e15) return n.toString();
  return parseFloat(n.toPrecision(10)).toString();
};

const isError = (val: string): boolean => val === 'Error';

// ---------------------------------------------------------------------------
// Calculator button component
// ---------------------------------------------------------------------------

interface CalcButtonProps {
  def: ButtonDef;
  isActiveOp: boolean;
  onPress: () => void;
  size?: number;
  gap?: number;
  isScientific?: boolean;
  isLandscape?: boolean;
}

function CalcButton({
  def,
  isActiveOp,
  onPress,
  size = 80,
  gap = 12,
  isScientific: _isScientific = false,
  isLandscape = false,
}: CalcButtonProps) {
  const btnSize = isLandscape ? Math.min(size, 56) : size;

  let bgColor: string;
  let textColor: string;
  let fontSize: number;

  if (def.type === 'memory') {
    bgColor = 'transparent';
    textColor = '#A5A5A5';
    fontSize = isLandscape ? 14 : 16;
  } else if (def.type === 'scientific') {
    bgColor = '#1C1C1E';
    textColor = '#FFFFFF';
    fontSize = isLandscape ? 16 : 18;
  } else if (def.type === 'operator') {
    bgColor = isActiveOp ? '#FFFFFF' : '#FF9F0A';
    textColor = isActiveOp ? '#FF9F0A' : '#FFFFFF';
    fontSize = isLandscape ? 24 : 32;
  } else if (def.type === 'function') {
    bgColor = '#A5A5A5';
    textColor = '#000000';
    fontSize = isLandscape ? 24 : 32;
  } else {
    bgColor = '#333333';
    textColor = '#FFFFFF';
    fontSize = isLandscape ? 24 : 32;
  }

  if (def.type === 'memory') {
    return (
      <Pressable
        onPress={onPress}
        accessibilityLabel={getAccessibilityLabel(def)}
        accessibilityRole="button"
        style={({ pressed }) => [
          {
            flex: 1,
            height: isLandscape ? 32 : 40,
            alignItems: 'center',
            justifyContent: 'center',
            opacity: pressed ? 0.5 : 1,
          },
        ]}
      >
        <Text style={{ color: textColor, fontSize, fontWeight: '500' }}>
          {def.label}
        </Text>
      </Pressable>
    );
  }

  return (
    <Pressable
      onPress={onPress}
      accessibilityLabel={getAccessibilityLabel(def)}
      accessibilityRole="button"
      style={({ pressed }) => [
        {
          width: def.wide ? btnSize * 2 + gap : btnSize,
          height: btnSize,
          borderRadius: btnSize / 2,
          alignItems: def.wide ? ('flex-start' as const) : ('center' as const),
          paddingLeft: def.wide ? btnSize / 2 - 10 : 0,
          justifyContent: 'center' as const,
          backgroundColor: bgColor,
          opacity: pressed ? 0.75 : 1,
          elevation: 2,
        },
        !def.wide && { alignItems: 'center' as const },
      ]}
    >
      <Text style={{ color: textColor, fontSize, fontWeight: '400' }}>
        {def.label}
      </Text>
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// Main Screen
// ---------------------------------------------------------------------------

export function CalculatorScreen() {
  useTheme();
  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;

  // Core calculator state
  const [display, setDisplay] = useState('0');
  const [previousValue, setPreviousValue] = useState<number | null>(null);
  const [operation, setOperation] = useState<string | null>(null);
  const [resetOnNext, setResetOnNext] = useState(false);

  // Memory state
  const [memory, setMemory] = useState(0);
  const [hasMemory, setHasMemory] = useState(false);

  // Scientific state
  const [isDeg, setIsDeg] = useState(true);

  // Parentheses state
  const [parenStack, setParenStack] = useState<Array<{ prev: number | null; op: string | null }>>([]);
  const [parenDepth, setParenDepth] = useState(0);

  // History state
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [showHistory, setShowHistory] = useState(false);

  // Load history from AsyncStorage on mount
  useEffect(() => {
    AsyncStorage.getItem(HISTORY_KEY).then(raw => {
      if (raw) {
        try {
          setHistory(JSON.parse(raw));
        } catch {
          // ignore corrupt data
        }
      }
    });
  }, []);

  const persistHistory = useCallback((entries: HistoryEntry[]) => {
    AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(entries));
  }, []);

  // ------- Error handling helper -------
  const resetIfError = (): boolean => {
    if (isError(display)) {
      setDisplay('0');
      setPreviousValue(null);
      setOperation(null);
      setResetOnNext(false);
      return true;
    }
    return false;
  };

  // ------- Core handlers -------

  const handleNumber = (num: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (resetIfError()) {
      setDisplay(num);
      return;
    }
    if (resetOnNext) {
      setDisplay(num);
      setResetOnNext(false);
      return;
    }
    setDisplay(prev => (prev === '0' ? num : prev + num));
  };

  const compute = (prev: number, op: string, current: number): number => {
    switch (op) {
      case '+':
        return prev + current;
      case '-':
        return prev - current;
      case '×':
        return prev * current;
      case '÷':
        return current !== 0 ? prev / current : NaN;
      default:
        return current;
    }
  };

  const addToHistory = useCallback(
    (expression: string, result: string) => {
      const entry: HistoryEntry = { expression, result };
      const updated = [entry, ...history].slice(0, MAX_HISTORY);
      setHistory(updated);
      persistHistory(updated);
    },
    [history, persistHistory],
  );

  const handleOperator = (op: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (resetIfError() && op !== '=') {
      return;
    }

    const current = parseFloat(display);

    if (op === '=') {
      if (previousValue === null || !operation) return;
      const result = compute(previousValue, operation, current);
      const resultStr = formatNumber(result);

      // Build expression string for history
      const opSymbol = operation;
      const expression = `${formatNumber(previousValue)} ${opSymbol} ${formatNumber(current)}`;
      if (!isError(resultStr)) {
        addToHistory(expression, resultStr);
      }

      setDisplay(resultStr);
      setPreviousValue(null);
      setOperation(null);
      setResetOnNext(true);
      return;
    }

    // Chain: if we already have a pending operation and a new value was entered, resolve first
    if (previousValue !== null && operation && !resetOnNext) {
      const result = compute(previousValue, operation, current);
      const resultStr = formatNumber(result);
      setDisplay(resultStr);
      if (isError(resultStr)) {
        setPreviousValue(null);
        setOperation(null);
        setResetOnNext(true);
        return;
      }
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
    setParenStack([]);
    setParenDepth(0);
  };

  const handlePercent = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (resetIfError()) return;
    const current = parseFloat(display);
    if (previousValue !== null && operation) {
      // Contextual: e.g. 100 + 10% → 100 + (100 * 0.10)
      const percentValue = previousValue * (current / 100);
      setDisplay(formatNumber(percentValue));
    } else {
      // Standalone: divide by 100
      setDisplay(formatNumber(current / 100));
    }
  };

  const handleToggleSign = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (resetIfError()) return;
    setDisplay(String(-parseFloat(display)));
  };

  const handleDecimal = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (resetIfError()) {
      setDisplay('0.');
      return;
    }
    if (resetOnNext) {
      setDisplay('0.');
      setResetOnNext(false);
      return;
    }
    if (!display.includes('.')) setDisplay(display + '.');
  };

  // ------- Memory handlers -------

  const handleMemory = (action: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const current = isError(display) ? 0 : parseFloat(display);
    switch (action) {
      case 'MC':
        setMemory(0);
        setHasMemory(false);
        break;
      case 'MR':
        setDisplay(formatNumber(memory));
        setResetOnNext(true);
        break;
      case 'M+':
        setMemory(prev => prev + current);
        setHasMemory(true);
        setResetOnNext(true);
        break;
      case 'M-':
        setMemory(prev => prev - current);
        setHasMemory(true);
        setResetOnNext(true);
        break;
    }
  };

  // ------- Scientific handlers -------

  const handleScientific = (label: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (resetIfError()) return;
    const current = parseFloat(display);
    let result: number;

    const toRad = (deg: number) => deg * (Math.PI / 180);

    switch (label) {
      case 'sin':
        result = isDeg ? Math.sin(toRad(current)) : Math.sin(current);
        break;
      case 'cos':
        result = isDeg ? Math.cos(toRad(current)) : Math.cos(current);
        break;
      case 'tan':
        result = isDeg ? Math.tan(toRad(current)) : Math.tan(current);
        break;
      case 'log':
        result = Math.log10(current);
        break;
      case 'ln':
        result = Math.log(current);
        break;
      case '√':
        result = Math.sqrt(current);
        break;
      case 'x²':
        result = Math.pow(current, 2);
        break;
      case 'x³':
        result = Math.pow(current, 3);
        break;
      case 'π':
        setDisplay(formatNumber(Math.PI));
        setResetOnNext(true);
        return;
      case 'e':
        setDisplay(formatNumber(Math.E));
        setResetOnNext(true);
        return;
      case '1/x':
        if (current === 0) { setDisplay('Error'); setResetOnNext(true); return; }
        result = 1 / current;
        break;
      case '|x|':
        result = Math.abs(current);
        break;
      default:
        return;
    }

    setDisplay(formatNumber(result));
    setResetOnNext(true);
  };

  // ------- Main press dispatcher -------

  const handlePress = (def: ButtonDef) => {
    if (def.type === 'memory') {
      handleMemory(def.label);
      return;
    }
    if (def.type === 'scientific') {
      handleScientific(def.label);
      return;
    }
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

  // ------- History handlers -------

  const clearHistory = useCallback(() => {
    setHistory([]);
    AsyncStorage.removeItem(HISTORY_KEY);
  }, []);

  const selectHistory = useCallback((entry: HistoryEntry) => {
    setDisplay(entry.result);
    setResetOnNext(true);
    setShowHistory(false);
  }, []);

  // ------- Layout calculations -------

  const landscapeBtnSize = Math.min(
    Math.floor((width - 12 * (isLandscape ? 8 : 5)) / (isLandscape ? 7 : 4)),
    56,
  );
  const portraitBtnSize = 80;
  const btnSize = isLandscape ? landscapeBtnSize : portraitBtnSize;
  const gap = isLandscape ? 8 : 12;

  // Shrink display font for long numbers
  const displayLen = display.length;
  const displayFontSize = isLandscape
    ? displayLen > 12
      ? 28
      : displayLen > 8
        ? 34
        : 42
    : displayLen > 9
      ? 44
      : displayLen > 6
        ? 54
        : 70;

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor="#000000" />

      {/* History panel overlay */}
      {showHistory && (
        <View style={styles.historyOverlay}>
          <View style={styles.historyPanel}>
            <View style={styles.historyHeader}>
              <Text style={styles.historyTitle}>History</Text>
              <Pressable onPress={() => setShowHistory(false)}>
                <Text style={styles.historyClose}>✕</Text>
              </Pressable>
            </View>
            <ScrollView style={styles.historyScroll}>
              {history.length === 0 ? (
                <Text style={styles.historyEmpty}>No calculations yet</Text>
              ) : (
                history.map((entry, idx) => (
                  <Pressable
                    key={idx}
                    onPress={() => selectHistory(entry)}
                    style={({ pressed }) => [
                      styles.historyItem,
                      pressed && { backgroundColor: '#2C2C2E' },
                    ]}
                  >
                    <Text style={styles.historyExpression}>
                      {entry.expression}
                    </Text>
                    <Text style={styles.historyResult}>= {entry.result}</Text>
                  </Pressable>
                ))
              )}
            </ScrollView>
            {history.length > 0 && (
              <Pressable onPress={clearHistory} style={styles.clearHistoryBtn}>
                <Text style={styles.clearHistoryText}>Clear History</Text>
              </Pressable>
            )}
          </View>
        </View>
      )}

      {/* Top bar with memory indicator and history toggle */}
      <View style={styles.topBar}>
        <View style={styles.topBarLeft}>
          {hasMemory && <Text style={styles.memoryIndicator}>M</Text>}
          {isLandscape && (
            <Pressable
              onPress={() => setIsDeg(!isDeg)}
              style={styles.degRadToggle}
            >
              <Text style={styles.degRadText}>{isDeg ? 'DEG' : 'RAD'}</Text>
            </Pressable>
          )}
        </View>
        <Pressable
          onPress={() => setShowHistory(!showHistory)}
          accessibilityLabel="toggle history"
          accessibilityRole="button"
          style={styles.historyToggle}
        >
          <Text style={styles.historyIcon}>🕐</Text>
        </Pressable>
      </View>

      {/* Display */}
      <View style={[styles.displayArea, isLandscape && { paddingBottom: 8 }]}>
        <Text
          style={[styles.displayText, { fontSize: displayFontSize }]}
          numberOfLines={1}
          adjustsFontSizeToFit
        >
          {display}
        </Text>
      </View>

      {/* Memory buttons row */}
      <View style={[styles.memoryRow, { paddingHorizontal: gap }]}>
        {MEMORY_ROW.map(def => (
          <CalcButton
            key={def.label}
            def={def}
            isActiveOp={false}
            onPress={() => handlePress(def)}
            size={btnSize}
            gap={gap}
            isLandscape={isLandscape}
          />
        ))}
      </View>

      {/* Button grid */}
      <View
        style={[
          styles.grid,
          { paddingHorizontal: gap, paddingBottom: gap, gap },
          isLandscape && { flexDirection: 'row' },
        ]}
      >
        {/* Scientific columns (landscape only) */}
        {isLandscape && (
          <View style={{ gap }}>
            {SCIENTIFIC_ROWS.map((row, rowIdx) => (
              <View key={`sci-${rowIdx}`} style={[styles.row, { gap }]}>
                {row.map(def => (
                  <CalcButton
                    key={def.label}
                    def={def}
                    isActiveOp={false}
                    onPress={() => handlePress(def)}
                    size={btnSize}
                    gap={gap}
                    isScientific
                    isLandscape
                  />
                ))}
              </View>
            ))}
          </View>
        )}

        {/* Standard grid */}
        <View style={{ gap, flex: isLandscape ? 1 : undefined }}>
          {ROWS.map((row, rowIdx) => (
            <View key={rowIdx} style={[styles.row, { gap }]}>
              {row.map(def => (
                <CalcButton
                  key={def.label}
                  def={def}
                  isActiveOp={operation === def.label && resetOnNext}
                  onPress={() => handlePress(def)}
                  size={btnSize}
                  gap={gap}
                  isLandscape={isLandscape}
                />
              ))}
            </View>
          ))}
        </View>
      </View>
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#000000',
    justifyContent: 'flex-end',
  },

  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 4,
  },

  topBarLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },

  memoryIndicator: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
    opacity: 0.7,
  },

  degRadToggle: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: '#1C1C1E',
  },

  degRadText: {
    color: '#FF9F0A',
    fontSize: 13,
    fontWeight: '600',
  },

  historyToggle: {
    padding: 8,
  },

  historyIcon: {
    fontSize: 20,
  },

  displayArea: {
    paddingHorizontal: 24,
    paddingBottom: 16,
    alignItems: 'flex-end',
  },

  displayText: {
    color: '#FFFFFF',
    fontWeight: '200',
    letterSpacing: -2,
  },

  memoryRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingBottom: 4,
  },

  grid: {
    paddingHorizontal: 12,
    paddingBottom: 12,
    gap: 12,
  },

  row: {
    flexDirection: 'row',
    gap: 12,
  },

  // History overlay styles
  historyOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.85)',
    zIndex: 100,
    justifyContent: 'center',
    alignItems: 'center',
  },

  historyPanel: {
    width: '85%',
    maxHeight: '70%',
    backgroundColor: '#1C1C1E',
    borderRadius: 16,
    padding: 16,
  },

  historyHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },

  historyTitle: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '600',
  },

  historyClose: {
    color: '#A5A5A5',
    fontSize: 20,
    padding: 4,
  },

  historyScroll: {
    maxHeight: 300,
  },

  historyEmpty: {
    color: '#A5A5A5',
    fontSize: 16,
    textAlign: 'center',
    paddingVertical: 24,
  },

  historyItem: {
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#3A3A3C',
  },

  historyExpression: {
    color: '#A5A5A5',
    fontSize: 14,
  },

  historyResult: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '500',
    marginTop: 2,
  },

  clearHistoryBtn: {
    marginTop: 12,
    alignItems: 'center',
    paddingVertical: 10,
    backgroundColor: '#2C2C2E',
    borderRadius: 8,
  },

  clearHistoryText: {
    color: '#FF453A',
    fontSize: 16,
    fontWeight: '500',
  },
});
