// react-native ships this test double as untyped JS (see
// node_modules/react-native/jest/MockNativeMethods.js) — it's the shared
// jest.fn() every host component's measure*/focus/blur/setNativeProps resolve
// to under jest-expo, which tests override to simulate real measurement
// (e.g. AppIcon's measureInWindow for #509).
declare module 'react-native/jest/MockNativeMethods' {
  const MockNativeMethods: {
    measure: jest.Mock;
    measureInWindow: jest.Mock;
    measureLayout: jest.Mock;
    setNativeProps: jest.Mock;
    focus: jest.Mock;
    blur: jest.Mock;
  };
  export default MockNativeMethods;
}
