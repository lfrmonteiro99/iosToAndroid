import * as Speech from 'expo-speech';
import { speak, stopSpeaking } from '../speech';
import { logger } from '../../utils/logger';

jest.mock('expo-speech', () => ({
  speak: jest.fn(),
  stop: jest.fn(),
}));

jest.mock('../../utils/logger', () => ({
  logger: { warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

describe('assistant/speech', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('speak() calls Speech.speak with the given text exactly once', () => {
    speak('Opening Calculator.');
    expect(Speech.speak).toHaveBeenCalledTimes(1);
    expect(Speech.speak).toHaveBeenCalledWith('Opening Calculator.');
  });

  it('speak() does not throw and logs when Speech.speak throws', () => {
    (Speech.speak as jest.Mock).mockImplementationOnce(() => {
      throw new Error('tts engine down');
    });
    expect(() => speak('hello')).not.toThrow();
    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(Speech.speak).toHaveBeenCalledTimes(1);
  });

  it('speak() handles empty and hostile input without throwing', () => {
    expect(() => speak('')).not.toThrow();
    expect(() => speak('  ')).not.toThrow();
    expect(Speech.speak).toHaveBeenCalledTimes(2);
    expect(Speech.speak).toHaveBeenNthCalledWith(1, '');
    expect(Speech.speak).toHaveBeenNthCalledWith(2, '  ');
  });

  it('stopSpeaking() calls Speech.stop exactly once', () => {
    stopSpeaking();
    expect(Speech.stop).toHaveBeenCalledTimes(1);
  });

  it('stopSpeaking() does not throw and logs when Speech.stop throws', () => {
    (Speech.stop as jest.Mock).mockImplementationOnce(() => {
      throw new Error('stop failed');
    });
    expect(() => stopSpeaking()).not.toThrow();
    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(Speech.stop).toHaveBeenCalledTimes(1);
  });

  it('stopSpeaking() swallows an async rejection from Speech.stop', async () => {
    (Speech.stop as jest.Mock).mockImplementationOnce(() =>
      Promise.reject(new Error('async stop failed')),
    );
    await expect(async () => stopSpeaking()).not.toThrow();
    expect(Speech.stop).toHaveBeenCalledTimes(1);
  });
});
