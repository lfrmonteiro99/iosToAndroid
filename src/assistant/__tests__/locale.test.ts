/**
 * Which language the assistant runs in.
 *
 * This is the piece that decides whether the recognizer, the parser and the
 * voice agree. When they disagree the assistant answers "that isn't supported"
 * to everything, which is the reported defect.
 */
import { NativeModules, Platform } from 'react-native';
import { assistantLocale, deviceLanguageTag } from '../locale';

describe('assistantLocale', () => {
  it.each(['pt', 'pt-PT', 'pt_BR', 'PT-pt'])('%s is Portuguese', (tag) => {
    expect(assistantLocale(tag)).toBe('pt');
  });

  it.each(['en', 'en-US', 'fr-FR', 'de', '', 'nonsense'])('%s falls back to English', (tag) => {
    expect(assistantLocale(tag)).toBe('en');
  });
});

describe('deviceLanguageTag', () => {
  const original = NativeModules.I18nManager;

  afterEach(() => {
    Object.defineProperty(NativeModules, 'I18nManager', {
      value: original, configurable: true, writable: true,
    });
  });

  function setLocaleIdentifier(value: unknown) {
    Object.defineProperty(NativeModules, 'I18nManager', {
      value: { localeIdentifier: value }, configurable: true, writable: true,
    });
  }

  it('normalises the Android underscore form, which is not a valid BCP-47 tag', () => {
    setLocaleIdentifier('pt_PT');
    expect(deviceLanguageTag()).toBe('pt-PT');
  });

  it('passes a tag through unchanged', () => {
    setLocaleIdentifier('en-GB');
    expect(deviceLanguageTag()).toBe('en-GB');
  });

  it('falls back to the runtime locale when the platform reports nothing', () => {
    setLocaleIdentifier(undefined);
    expect(deviceLanguageTag()).toMatch(/^[a-z]{2}(-[A-Za-z0-9]+)*$/);
  });

  it('never throws, whatever the platform returns', () => {
    setLocaleIdentifier({ nested: 'not a string' });
    expect(() => deviceLanguageTag()).not.toThrow();
    expect(Platform.OS).toBe('android');
  });
});
