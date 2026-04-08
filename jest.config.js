module.exports = {
  preset: 'jest-expo/android',
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|react-native-reanimated|react-native-gesture-handler|react-native-screens|react-native-safe-area-context|@react-native-async-storage/async-storage)',
  ],
  setupFiles: ['./jest.setup.js'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx'],
  moduleNameMapper: {
    // Stub out Flow-typed RN internals that hermes-parser cannot handle
    'ViewConfigIgnore': '<rootDir>/src/__mocks__/ViewConfigIgnore.js',
    // Mock the launcher native module (used via dynamic import in AppsStore)
    '.*modules/launcher-module/src.*': '<rootDir>/src/__mocks__/launcherModule.js',
  },
};
