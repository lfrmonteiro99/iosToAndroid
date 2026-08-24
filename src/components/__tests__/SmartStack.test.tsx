import React from 'react';
import { Text } from 'react-native';
import { act, render } from '../../test-utils';

// jest.setup.js mocks react-native-gesture-handler with a Gesture API that
// discards every callback passed to it, so a real swipe could never be
// simulated. Re-mock it here (same technique as AssistiveTouch.test.tsx /
// LauncherHomeScreen.todayViewGesture.test.tsx) to capture the Pan gesture's
// callbacks and fire them directly.
const mockPanRecords: Array<{
  enabled?: unknown;
  onBegin?: () => void;
  onUpdate?: (e: { translationY: number }) => void;
  onEnd?: (e: { translationY: number }) => void;
  onFinalize?: () => void;
}> = [];

jest.mock('react-native-gesture-handler', () => {
  const chain = (record: Record<string, unknown>) => {
    const g: Record<string, unknown> = {};
    [
      'minDistance', 'simultaneousWithExternalGesture', 'withRef', 'onChange', 'onStart',
      'onTouchesBegan', 'onTouchesMove', 'onTouchesUp', 'onTouchesCancelled', 'hitSlop',
      'maxPointers', 'minPointers', 'averageTouches', 'activeOffsetX', 'activeOffsetY',
      'failOffsetX', 'failOffsetY',
    ].forEach((m) => { g[m] = () => g; });
    g.enabled = (v: unknown) => { record.enabled = v; return g; };
    g.onBegin = (fn: unknown) => { record.onBegin = fn; return g; };
    g.onUpdate = (fn: unknown) => { record.onUpdate = fn; return g; };
    g.onEnd = (fn: unknown) => { record.onEnd = fn; return g; };
    g.onFinalize = (fn: unknown) => { record.onFinalize = fn; return g; };
    return g;
  };
  return {
    GestureHandlerRootView: 'View',
    GestureDetector: 'View',
    Gesture: {
      Pan: () => {
        const record: Record<string, unknown> = { enabled: true };
        mockPanRecords.push(record as never);
        return chain(record);
      },
      Tap: () => chain({}),
      LongPress: () => chain({}),
      Fling: () => chain({}),
      Exclusive: (...gs: unknown[]) => gs[0],
      Simultaneous: (...gs: unknown[]) => gs[0],
      Race: (...gs: unknown[]) => gs[0],
    },
    Swipeable: 'View',
    DrawerLayout: 'View',
    State: {},
    PanGestureHandler: 'View',
    TapGestureHandler: 'View',
    FlatList: 'FlatList',
    ScrollView: 'ScrollView',
  };
});

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { SmartStack, rotateForward, rotateBackward } = require('../SmartStack');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { gestureConfig } = require('../../utils/gestureConfig');

function lastPan() {
  const record = mockPanRecords[mockPanRecords.length - 1];
  if (!record) throw new Error('no Gesture.Pan() captured');
  return record;
}

function threeItems() {
  return [
    { key: 'a', node: <Text>Widget A</Text> },
    { key: 'b', node: <Text>Widget B</Text> },
    { key: 'c', node: <Text>Widget C</Text> },
  ];
}

beforeEach(() => {
  mockPanRecords.length = 0;
});

describe('rotateForward / rotateBackward (pure order helpers)', () => {
  it('rotateForward moves the first key to the back', () => {
    expect(rotateForward(['a', 'b', 'c'])).toEqual(['b', 'c', 'a']);
  });

  it('rotateBackward moves the last key to the front', () => {
    expect(rotateBackward(['a', 'b', 'c'])).toEqual(['c', 'a', 'b']);
  });

  it('rotateForward is a no-op for an empty stack', () => {
    expect(rotateForward([])).toEqual([]);
  });

  it('rotateForward is a no-op for a single-item stack', () => {
    expect(rotateForward(['a'])).toEqual(['a']);
  });

  it('rotateBackward is a no-op for an empty stack', () => {
    expect(rotateBackward([])).toEqual([]);
  });

  it('rotateBackward is a no-op for a single-item stack', () => {
    expect(rotateBackward(['a'])).toEqual(['a']);
  });

  it('rotateBackward undoes rotateForward for any length', () => {
    const order = ['a', 'b', 'c', 'd', 'e'];
    expect(rotateBackward(rotateForward(order))).toEqual(order);
  });
});

describe('<SmartStack /> gesture-driven rotation', () => {
  it('renders the first item on top initially', () => {
    const { getByText } = render(<SmartStack items={threeItems()} testID="stack" />);
    expect(getByText('Widget A')).toBeTruthy();
  });

  it('swiping up past the commit threshold rotates forward and reports the new order', () => {
    const onOrderChange = jest.fn();
    const { getByText } = render(
      <SmartStack items={threeItems()} onOrderChange={onOrderChange} testID="stack" />,
    );
    const pan = lastPan();
    act(() => {
      pan.onEnd!({ translationY: -gestureConfig.smartStackCommitDp });
    });
    expect(getByText('Widget B')).toBeTruthy();
    expect(onOrderChange).toHaveBeenCalledWith(['b', 'c', 'a']);
  });

  it('swiping down past the commit threshold rotates backward', () => {
    const onOrderChange = jest.fn();
    const { getByText } = render(
      <SmartStack items={threeItems()} onOrderChange={onOrderChange} testID="stack" />,
    );
    const pan = lastPan();
    act(() => {
      pan.onEnd!({ translationY: gestureConfig.smartStackCommitDp });
    });
    expect(getByText('Widget C')).toBeTruthy();
    expect(onOrderChange).toHaveBeenCalledWith(['c', 'a', 'b']);
  });

  it('a swipe short of the commit threshold does not rotate', () => {
    const onOrderChange = jest.fn();
    const { getByText } = render(
      <SmartStack items={threeItems()} onOrderChange={onOrderChange} testID="stack" />,
    );
    const pan = lastPan();
    act(() => {
      pan.onEnd!({ translationY: -(gestureConfig.smartStackCommitDp - 1) });
    });
    expect(getByText('Widget A')).toBeTruthy();
    expect(onOrderChange).not.toHaveBeenCalled();
  });

  it('a swipe with no movement at all does not rotate', () => {
    const onOrderChange = jest.fn();
    render(<SmartStack items={threeItems()} onOrderChange={onOrderChange} testID="stack" />);
    const pan = lastPan();
    act(() => {
      pan.onEnd!({ translationY: 0 });
    });
    expect(onOrderChange).not.toHaveBeenCalled();
  });

  it('two swipes up in a row rotate twice, not once (double-swipe is a recurring defect shape in this repo)', () => {
    const onOrderChange = jest.fn();
    const { getByText } = render(
      <SmartStack items={threeItems()} onOrderChange={onOrderChange} testID="stack" />,
    );
    const pan = lastPan();
    act(() => {
      pan.onEnd!({ translationY: -gestureConfig.smartStackCommitDp });
      pan.onEnd!({ translationY: -gestureConfig.smartStackCommitDp });
    });
    expect(getByText('Widget C')).toBeTruthy();
    expect(onOrderChange).toHaveBeenCalledTimes(2);
    expect(onOrderChange).toHaveBeenNthCalledWith(2, ['c', 'a', 'b']);
  });

  it('disables the gesture when the stack has a single widget', () => {
    render(
      <SmartStack items={[{ key: 'a', node: <Text>Widget A</Text> }]} testID="stack" />,
    );
    expect(lastPan().enabled).toBe(false);
  });

  it('disables the gesture for an empty stack', () => {
    render(<SmartStack items={[]} testID="stack" />);
    expect(lastPan().enabled).toBe(false);
  });
});

describe('<SmartStack /> automatic rotation', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('rotates forward every autoRotateIntervalMs while idle', () => {
    const onOrderChange = jest.fn();
    const { getByText } = render(
      <SmartStack items={threeItems()} autoRotateIntervalMs={1000} onOrderChange={onOrderChange} testID="stack" />,
    );
    act(() => {
      jest.advanceTimersByTime(1000);
    });
    expect(getByText('Widget B')).toBeTruthy();
    act(() => {
      jest.advanceTimersByTime(1000);
    });
    expect(getByText('Widget C')).toBeTruthy();
    expect(onOrderChange).toHaveBeenCalledTimes(2);
  });

  it('does not auto-rotate when autoRotateIntervalMs is omitted', () => {
    const onOrderChange = jest.fn();
    render(<SmartStack items={threeItems()} onOrderChange={onOrderChange} testID="stack" />);
    act(() => {
      jest.advanceTimersByTime(60_000);
    });
    expect(onOrderChange).not.toHaveBeenCalled();
  });

  it('does not auto-rotate a single-widget stack', () => {
    const onOrderChange = jest.fn();
    render(
      <SmartStack
        items={[{ key: 'a', node: <Text>Widget A</Text> }]}
        autoRotateIntervalMs={1000}
        onOrderChange={onOrderChange}
        testID="stack"
      />,
    );
    act(() => {
      jest.advanceTimersByTime(5000);
    });
    expect(onOrderChange).not.toHaveBeenCalled();
  });

  it('pauses automatic rotation while a swipe gesture is in flight', () => {
    const onOrderChange = jest.fn();
    render(
      <SmartStack items={threeItems()} autoRotateIntervalMs={1000} onOrderChange={onOrderChange} testID="stack" />,
    );
    const pan = lastPan();
    act(() => {
      pan.onBegin!();
      jest.advanceTimersByTime(3000);
    });
    expect(onOrderChange).not.toHaveBeenCalled();

    act(() => {
      pan.onFinalize!();
      jest.advanceTimersByTime(1000);
    });
    expect(onOrderChange).toHaveBeenCalledTimes(1);
  });
});

describe('<SmartStack /> reconciling the item set', () => {
  it('keeps the current top widget on top when a different widget is removed', () => {
    const onOrderChange = jest.fn();
    const { getByText, rerender } = render(
      <SmartStack items={threeItems()} onOrderChange={onOrderChange} testID="stack" />,
    );
    rerender(
      <SmartStack
        items={[
          { key: 'a', node: <Text>Widget A</Text> },
          { key: 'c', node: <Text>Widget C</Text> },
        ]}
        onOrderChange={onOrderChange}
        testID="stack"
      />,
    );
    expect(getByText('Widget A')).toBeTruthy();
  });

  it('appends a newly-added widget to the back instead of disturbing the current top', () => {
    const { getByText, rerender } = render(
      <SmartStack
        items={[
          { key: 'a', node: <Text>Widget A</Text> },
          { key: 'b', node: <Text>Widget B</Text> },
        ]}
        testID="stack"
      />,
    );
    rerender(
      <SmartStack
        items={[
          { key: 'a', node: <Text>Widget A</Text> },
          { key: 'b', node: <Text>Widget B</Text> },
          { key: 'd', node: <Text>Widget D</Text> },
        ]}
        testID="stack"
      />,
    );
    expect(getByText('Widget A')).toBeTruthy();
  });
});
