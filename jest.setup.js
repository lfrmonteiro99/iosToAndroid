// Mock native modules that don't exist in test environment

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  selectionAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy' },
}));

jest.mock('expo-blur', () => ({ BlurView: 'BlurView' }));

jest.mock('expo-linear-gradient', () => ({ LinearGradient: 'LinearGradient' }));

jest.mock('expo-brightness', () => ({
  getBrightnessAsync: jest.fn(() => Promise.resolve(0.5)),
  setBrightnessAsync: jest.fn(() => Promise.resolve()),
}));

jest.mock('expo-battery', () => ({
  getBatteryLevelAsync: jest.fn(() => Promise.resolve(0.72)),
  getBatteryStateAsync: jest.fn(() => Promise.resolve(1)),
  addBatteryLevelListener: jest.fn(() => ({ remove: jest.fn() })),
  BatteryState: { UNPLUGGED: 0, CHARGING: 1, FULL: 2 },
}));

jest.mock('expo-network', () => ({
  getNetworkStateAsync: jest.fn(() => Promise.resolve({ isConnected: true, type: 'WIFI' })),
  NetworkStateType: { WIFI: 'WIFI', CELLULAR: 'CELLULAR' },
}));

jest.mock('expo-contacts', () => ({
  getPermissionsAsync: jest.fn(() => Promise.resolve({ status: 'granted' })),
  requestPermissionsAsync: jest.fn(() => Promise.resolve({ status: 'granted' })),
  getContactsAsync: jest.fn(() => Promise.resolve({ data: [] })),
  Fields: { FirstName: 'firstName', LastName: 'lastName', PhoneNumbers: 'phoneNumbers', Emails: 'emails', Company: 'company', Image: 'image' },
  SortTypes: { LastName: 'lastName' },
}));

jest.mock('expo-image-picker', () => ({
  launchImageLibraryAsync: jest.fn(() => Promise.resolve({ canceled: true })),
  launchCameraAsync: jest.fn(() => Promise.resolve({ canceled: true })),
}));

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(() => Promise.resolve(null)),
    setItem: jest.fn(() => Promise.resolve()),
    removeItem: jest.fn(() => Promise.resolve()),
  },
}));

jest.mock('react-native-worklets', () => ({
  createSerializable: jest.fn(),
  createSharedValue: jest.fn(),
  createRunOnJS: jest.fn(),
  createRunOnUIImmediately: jest.fn(),
  createWorkletRuntime: jest.fn(),
}));

jest.mock('react-native-reanimated', () => {
  const stub = () => 0;
  const noop = () => {};
  const identity = (v) => v;
  const StyleSheet = { create: (s) => s };

  // Minimal Animated.Value stub
  function Value(val) { this._value = val; }
  Value.prototype.setValue = noop;
  Value.prototype.addListener = () => ({ remove: noop });
  Value.prototype.removeListener = noop;

  // Minimal host component stubs (plain functions, no RN import)
  const ViewStub = 'View';
  const TextStub = 'Text';
  const ScrollViewStub = 'ScrollView';
  const FlatListStub = 'FlatList';
  const ImageStub = 'Image';

  const useSharedValue = (init) => ({ value: init, addListener: stub, removeListener: stub, modify: noop });
  const useAnimatedStyle = (fn) => { try { return fn() || {}; } catch { return {}; } };
  const useDerivedValue = (fn) => { try { return { value: fn() }; } catch { return { value: undefined }; } };
  const useAnimatedRef = () => ({ current: null });
  const useAnimatedScrollHandler = () => stub;
  const useAnimatedGestureHandler = () => stub;
  const useAnimatedProps = (fn) => { try { return fn() || {}; } catch { return {}; } };
  const useReducedMotion = () => false;

  const Easing = { linear: identity, ease: identity, quad: identity, cubic: identity, poly: identity, sin: identity, circle: identity, exp: identity, elastic: identity, bounce: identity, back: identity, bezier: () => identity, bezierFn: () => identity, steps: () => identity, in: identity, out: identity, inOut: identity };
  const Extrapolation = { CLAMP: 'clamp', EXTEND: 'extend', IDENTITY: 'identity' };
  const ReduceMotion = { System: 'system', Always: 'always', Never: 'never' };
  const KeyboardState = { UNKNOWN: 0, OPENING: 1, OPEN: 2, CLOSING: 3, CLOSED: 4 };
  const ColorSpace = { HSVA: 0, RGBA: 1 };

  const mod = {
    __esModule: true,
    default: {
      call: noop,
      View: 'View',
      Text: 'Text',
      ScrollView: 'ScrollView',
      FlatList: 'FlatList',
      Image: 'Image',
      createAnimatedComponent: identity,
      Value,
      ValueXY: function() {},
    },
    useSharedValue,
    useAnimatedStyle,
    useAnimatedRef,
    useAnimatedScrollHandler,
    useAnimatedGestureHandler,
    useDerivedValue,
    useReducedMotion,
    useAnimatedProps,
    useAnimatedReaction: noop,
    useFrameCallback: noop,
    useScrollViewOffset: () => ({ value: 0 }),
    useWorkletCallback: identity,
    useComposedEventHandlers: () => stub,
    useEvent: () => stub,
    useHandler: () => ({ handlers: {}, context: {} }),
    withSpring: identity,
    withTiming: identity,
    withDecay: identity,
    withRepeat: identity,
    withSequence: (...args) => args[0],
    withDelay: (_, v) => v,
    interpolate: (v) => v,
    interpolateColor: (v) => v,
    runOnJS: identity,
    runOnUI: identity,
    cancelAnimation: noop,
    measure: noop,
    scrollTo: noop,
    makeMutable: (v) => ({ value: v, addListener: stub, removeListener: stub, modify: noop }),
    makeShareableCloneRecursive: identity,
    makeRemote: identity,
    isSharedValue: () => false,
    enableLayoutAnimations: noop,
    setGestureState: noop,
    clamp: identity,
    shuffle: noop,
    getAnimatedStyle: noop,
    advanceAnimationByFrame: noop,
    advanceAnimationByTime: noop,
    addWhitelistedNativeProps: noop,
    addWhitelistedUIProps: noop,
    reanimatedVersion: '4.0.0',
    Easing,
    Extrapolation,
    ReduceMotion,
    KeyboardState,
    ColorSpace,
    InterfaceOrientation: {},
    IOSReferenceFrame: {},
    Animated: {
      Value,
      ValueXY: function() {},
      View: ViewStub,
      Text: TextStub,
      ScrollView: ScrollViewStub,
      FlatList: FlatListStub,
      Image: ImageStub,
      createAnimatedComponent: identity,
    },
    createAnimatedComponent: identity,
    View: ViewStub,
    Text: TextStub,
    ScrollView: ScrollViewStub,
    FlatList: FlatListStub,
    Image: ImageStub,
  };
  return mod;
});

jest.mock('react-native-gesture-handler', () => {
  return {
    GestureHandlerRootView: 'View',
    GestureDetector: 'View',
    Gesture: {
      Pan: () => {
        const gesture = {};
        const chainable = (obj) => new Proxy(obj, { get: (t, p) => typeof t[p] === 'function' ? t[p] : () => chainable(obj) });
        return chainable(gesture);
      },
      Tap: () => {
        const gesture = {};
        const chainable = (obj) => new Proxy(obj, { get: (t, p) => typeof t[p] === 'function' ? t[p] : () => chainable(obj) });
        return chainable(gesture);
      },
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

jest.mock('react-native-safe-area-context', () => {
  const insets = { top: 44, right: 0, bottom: 34, left: 0 };
  return {
    SafeAreaProvider: ({ children }) => children,
    SafeAreaView: ({ children }) => children,
    useSafeAreaInsets: () => insets,
  };
});

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: jest.fn(), goBack: jest.fn(), getParent: () => ({ navigate: jest.fn() }) }),
  useRoute: () => ({ params: {} }),
  NavigationContainer: ({ children }) => children,
}));

jest.mock('@react-navigation/bottom-tabs', () => ({
  createBottomTabNavigator: () => ({
    Navigator: ({ children }) => children,
    Screen: ({ children }) => children,
  }),
}));

jest.mock('@react-navigation/native-stack', () => ({
  createNativeStackNavigator: () => ({
    Navigator: ({ children }) => children,
    Screen: ({ children }) => children,
  }),
}));

// Mock the launcher native module
jest.mock('./modules/launcher-module/src', () => ({
  __esModule: true,
  default: {
    getInstalledApps: jest.fn(() => Promise.resolve([])),
    launchApp: jest.fn(() => Promise.resolve(true)),
    getAppIcon: jest.fn(() => Promise.resolve('')),
    isDefaultLauncher: jest.fn(() => Promise.resolve(false)),
    openLauncherSettings: jest.fn(() => Promise.resolve(true)),
    getWifiInfo: jest.fn(() => Promise.resolve({ enabled: true, ssid: 'TestWiFi', rssi: -50, ip: '192.168.1.100' })),
    setWifiEnabled: jest.fn(() => Promise.resolve(true)),
    getWifiNetworks: jest.fn(() => Promise.resolve([{ ssid: 'TestWiFi', level: -50, isSecure: true }])),
    getBluetoothInfo: jest.fn(() => Promise.resolve({ enabled: true, name: 'TestDevice', address: '', pairedDevices: [] })),
    setBluetoothEnabled: jest.fn(() => Promise.resolve(true)),
    getStorageInfo: jest.fn(() => Promise.resolve({ totalGB: '128.0', usedGB: '89.3', freeGB: '38.7', usedPercentage: 70 })),
    getRecentMessages: jest.fn(() => Promise.resolve([])),
    openSystemSettings: jest.fn(() => Promise.resolve(true)),
    getNetworkInfo: jest.fn(() => Promise.resolve({ isConnected: true, isWifi: true, isCellular: false, isVpn: false })),
    setFlashlight: jest.fn(() => Promise.resolve(true)),
    isFlashlightOn: jest.fn(() => Promise.resolve(false)),
    getCallLog: jest.fn(() => Promise.resolve([])),
    makeCall: jest.fn(() => Promise.resolve(true)),
    getNotifications: jest.fn(() => Promise.resolve([])),
    isNotificationAccessGranted: jest.fn(() => Promise.resolve(false)),
    openNotificationAccessSettings: jest.fn(() => Promise.resolve(true)),
  },
}));
