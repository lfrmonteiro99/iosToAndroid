/**
 * The assistant on a Portuguese phone.
 *
 * Reported: speaking to Siri only ever answered that the feature was not
 * implemented, and there was no way to talk to it. Three separate causes, all
 * covered here: the recognizer was started with no language, the parser only
 * knew English verbs, and every reply — including the one it almost always
 * gave — was a hardcoded English string.
 */
import React from 'react';
import { NativeModules } from 'react-native';
import { render, fireEvent, waitFor, act } from '../../test-utils';
import { SiriScreen } from '../SiriScreen';
import type { AppNavigationProp } from '../../navigation/types';
import * as Speech from 'expo-speech';

jest.mock('expo-speech', () => ({
  speak: jest.fn(),
  stop: jest.fn(() => Promise.resolve()),
}));

jest.mock('../../utils/alarmScheduling', () => ({
  createQuickAlarm: jest.fn((hour: number, minute: number) =>
    Promise.resolve({
      id: 'quick-1', hour, minute, label: 'Alarme', days: [], enabled: true, notificationIds: [],
    }),
  ),
}));

const launcher = jest.requireMock('../../../modules/launcher-module/src').default;

function makeNav() {
  return { navigate: jest.fn(), goBack: jest.fn(), push: jest.fn() } as unknown as AppNavigationProp;
}

const originalI18n = NativeModules.I18nManager;

function setDeviceLocale(identifier: string) {
  Object.defineProperty(NativeModules, 'I18nManager', {
    value: { localeIdentifier: identifier }, configurable: true, writable: true,
  });
}

beforeEach(() => {
  (Speech.speak as jest.Mock).mockClear();
  launcher.startSpeechRecognition.mockClear();
  launcher.isSpeechRecognitionAvailable.mockResolvedValue(true);
  setDeviceLocale('pt_PT');
});

afterEach(() => {
  Object.defineProperty(NativeModules, 'I18nManager', {
    value: originalI18n, configurable: true, writable: true,
  });
});

function submit(input: string, nav: AppNavigationProp = makeNav()) {
  const utils = render(<SiriScreen navigation={nav} />);
  const field = utils.getByLabelText('Ask Siri');
  fireEvent.changeText(field, input);
  fireEvent(field, 'submitEditing');
  return { ...utils, nav, field };
}

describe('SiriScreen em português', () => {
  it('greets in the phone\'s language', () => {
    const { getByText } = render(<SiriScreen navigation={makeNav()} />);
    expect(getByText('Em que posso ajudar?')).toBeTruthy();
  });

  it('answers the time in Portuguese, and speaks it with a Portuguese voice', async () => {
    const { getByText } = submit('que horas são');
    await waitFor(() => expect(getByText(/^São /)).toBeTruthy());
    expect(Speech.speak).toHaveBeenCalledWith(
      expect.stringMatching(/^São /),
      { language: 'pt-PT' },
    );
  });

  it('opens a built-in app from a Portuguese phrasing', () => {
    const { nav } = submit('abre a calculadora');
    expect(nav.navigate).toHaveBeenCalledWith('Calculator');
  });

  it('tells the user what it CAN do when it does not understand', async () => {
    const { getByText } = submit('conta-me uma piada');
    await waitFor(() => expect(getByText(/Isso ainda não sei fazer/)).toBeTruthy());
    // The point of the change: the reply names the capabilities instead of only
    // saying no, which is all the old "That's not supported yet." did.
    expect(getByText(/abrir apps/)).toBeTruthy();
    expect(getByText(/alarme/)).toBeTruthy();
  });

  it('starts the recognizer in the phone\'s language, so the parser gets Portuguese', async () => {
    const { getByLabelText } = render(<SiriScreen navigation={makeNav()} />);
    await act(async () => {});
    fireEvent.press(getByLabelText('Start voice input'));
    await waitFor(() => expect(launcher.startSpeechRecognition).toHaveBeenCalledWith('pt-PT'));
  });

  it('an English phone still gets English', async () => {
    setDeviceLocale('en_GB');
    const { getByText } = submit('what time is it');
    await waitFor(() => expect(getByText(/^It's /)).toBeTruthy());
    expect(Speech.speak).toHaveBeenCalledWith(
      expect.stringMatching(/^It's /),
      { language: 'en-GB' },
    );
  });
});
