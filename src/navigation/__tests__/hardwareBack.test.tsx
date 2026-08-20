import React from 'react';
import { BackHandler, Text, Pressable } from 'react-native';
import { render, act, fireEvent } from '@testing-library/react-native';
import { NavigationContainer, useNavigation } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

// jest.setup.js mocks @react-navigation/native and @react-navigation/native-stack
// as dumb passthroughs project-wide (no other test mounts a real stack). This
// file needs the REAL libraries to prove the Android hardware back button
// actually pops the real native-stack — so it un-mocks them locally.
jest.unmock('@react-navigation/native');
jest.unmock('@react-navigation/native-stack');
jest.unmock('react-native-safe-area-context');

type Params = {
  Home: undefined;
  Detail: undefined;
  Overlay: undefined;
};

const Stack = createNativeStackNavigator<Params>();

function HomeScreen() {
  const navigation = useNavigation();
  return (
    <>
      <Text>Home screen</Text>
      {/* @ts-expect-error -- test-only navigation helper */}
      <TestButton label="open-detail" onPress={() => navigation.navigate('Detail')} />
      {/* @ts-expect-error -- test-only navigation helper */}
      <TestButton label="open-overlay" onPress={() => navigation.navigate('Overlay')} />
    </>
  );
}

function DetailScreen() {
  return <Text>Detail screen</Text>;
}

function OverlayScreen() {
  return <Text>Overlay screen</Text>;
}

// Minimal pressable stand-in — avoids pulling in the app's real Pressable/theme stack.
function TestButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityLabel={label} onPress={onPress}>
      <Text>{label}</Text>
    </Pressable>
  );
}

function TestNavigator() {
  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="Home" component={HomeScreen} />
        <Stack.Screen name="Detail" component={DetailScreen} />
        <Stack.Screen name="Overlay" component={OverlayScreen} options={{ presentation: 'transparentModal' }} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

/** Captures the 'hardwareBackPress' handler NavigationContainer registers,
 *  so tests can simulate the physical/gesture back button firing. */
function captureHardwareBackHandler() {
  let handler: (() => boolean) | undefined;
  jest.spyOn(BackHandler, 'addEventListener').mockImplementation((eventName, cb) => {
    if (eventName === 'hardwareBackPress') handler = cb as () => boolean;
    return { remove: jest.fn() };
  });
  return () => handler;
}

describe('Android hardware back button (issue #437)', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('pops a normal pushed screen back to the previous one', async () => {
    const getHandler = captureHardwareBackHandler();
    const api = render(<TestNavigator />);

    await act(async () => {
      fireEvent.press(api.getByLabelText('open-detail'));
    });
    expect(api.queryByText('Detail screen')).toBeTruthy();
    expect(api.queryByText('Home screen')).toBeNull();

    let consumed: boolean | undefined;
    await act(async () => {
      consumed = getHandler()!();
    });

    expect(api.queryByText('Home screen')).toBeTruthy();
    expect(api.queryByText('Detail screen')).toBeNull();
    expect(consumed).toBe(true);
  });

  it('closes a transparentModal overlay and reveals the screen underneath', async () => {
    const getHandler = captureHardwareBackHandler();
    const api = render(<TestNavigator />);

    await act(async () => {
      fireEvent.press(api.getByLabelText('open-overlay'));
    });
    expect(api.queryByText('Overlay screen')).toBeTruthy();

    let consumed: boolean | undefined;
    await act(async () => {
      consumed = getHandler()!();
    });

    expect(api.queryByText('Overlay screen')).toBeNull();
    expect(api.queryByText('Home screen')).toBeTruthy();
    expect(consumed).toBe(true);
  });

  it('does nothing (deliberately) on the root screen — nothing to pop back to', async () => {
    const getHandler = captureHardwareBackHandler();
    const api = render(<TestNavigator />);

    let consumed: boolean | undefined;
    await act(async () => {
      consumed = getHandler()!();
    });

    // Not consumed: react-navigation reports canGoBack() === false at the
    // root and returns false, deliberately leaving the OS to decide (which,
    // for a HOME/launcher activity at its root, is a no-op).
    expect(consumed).toBe(false);
    expect(api.queryByText('Home screen')).toBeTruthy();
  });
});
