import React from 'react';
import { Text } from 'react-native';
import { Linking } from 'react-native';
import { render, fireEvent, waitFor } from '../../../test-utils';
import { AlertProvider } from '../../../components/AlertProvider';
import { useSettings } from '../../../store/SettingsStore';
import { BackTapSettingsScreen } from '../BackTapSettingsScreen';
import launcherModule from '../../../../modules/launcher-module/src';

/**
 * Back Tap (#773) — as acções novas na UI: Open Camera, Screenshot / Screen
 * Recording (consentimento) e Send Message (destinatário configurável).
 * Monta o ecrã real e dispara os eventos verdadeiros.
 */

const mockNavigation = { navigate: jest.fn(), goBack: jest.fn(), push: jest.fn() };

function BackTapReader() {
  const { settings } = useSettings();
  const bt = settings.backTap;
  return (
    <Text testID="backtap-value">
      {`${bt.enabled}|${bt.double.action}|${bt.double.smsAddress ?? ''}|${bt.double.smsBody ?? ''}|${bt.triple.action}`}
    </Text>
  );
}

function renderScreen() {
  return render(
    <AlertProvider>
      <BackTapSettingsScreen navigation={mockNavigation as never} />
      <BackTapReader />
    </AlertProvider>,
  );
}

let openURLSpy: jest.SpyInstance;

beforeEach(() => {
  jest.clearAllMocks();
  (launcherModule.getInstalledApps as jest.Mock).mockResolvedValue([]);
  (launcherModule.isFlashlightOn as jest.Mock).mockResolvedValue(false);
  (launcherModule.setFlashlight as jest.Mock).mockResolvedValue(true);
  openURLSpy = jest.spyOn(Linking, 'openURL').mockResolvedValue(true as never);
});

afterEach(() => {
  openURLSpy.mockRestore();
});

function enable(screen: ReturnType<typeof renderScreen>) {
  fireEvent.press(screen.getAllByRole('switch')[0]);
}

describe('BackTapSettingsScreen — acções de #773', () => {
  it('o picker oferece as 8 acções do issue', () => {
    const screen = renderScreen();
    enable(screen);
    fireEvent.press(screen.getByText('Double Tap'));
    ['Flashlight', 'Toggle Wi-Fi', 'Open App', 'Open Camera', 'Shortcut', 'Screenshot', 'Screen Recording', 'Send Message']
      .forEach((label) => expect(screen.getByText(label)).toBeTruthy());
  });

  it('documenta o limite do Wi-Fi em Android 10+ junto às gestures', () => {
    const screen = renderScreen();
    enable(screen);
    expect(screen.getByText(/Android 10 and later/)).toBeTruthy();
  });

  it('Open Camera persiste e, ao testar, navega para o ecrã de câmara in-app', async () => {
    const screen = renderScreen();
    enable(screen);
    fireEvent.press(screen.getByText('Double Tap'));
    fireEvent.press(screen.getByText('Open Camera'));
    expect(screen.getByTestId('backtap-value').props.children).toBe('true|openCamera|||none');

    fireEvent.press(screen.getByText('Test Double Tap'));
    await waitFor(() => expect(mockNavigation.navigate).toHaveBeenCalledWith('Camera'));
  });

  it('Screenshot avisa que a captura não está disponível em vez de fingir sucesso', async () => {
    const screen = renderScreen();
    enable(screen);
    fireEvent.press(screen.getByText('Double Tap'));
    fireEvent.press(screen.getByText('Screenshot'));
    fireEvent.press(screen.getByText('Test Double Tap'));
    await waitFor(() => expect(screen.getByText('Not Available')).toBeTruthy());
  });

  it('Screen Recording usa o mesmo caminho de consentimento e avisa', async () => {
    const screen = renderScreen();
    enable(screen);
    fireEvent.press(screen.getByText('Triple Tap'));
    fireEvent.press(screen.getByText('Screen Recording'));
    fireEvent.press(screen.getByText('Test Triple Tap'));
    await waitFor(() => expect(screen.getByText(/Screen recording needs screen-capture consent/)).toBeTruthy());
  });

  it('Send Message revela os campos de destinatário e texto', () => {
    const screen = renderScreen();
    enable(screen);
    expect(screen.queryByTestId('backtap-double-address')).toBeNull();
    fireEvent.press(screen.getByText('Double Tap'));
    fireEvent.press(screen.getByText('Send Message'));
    expect(screen.getByTestId('backtap-double-address')).toBeTruthy();
    expect(screen.getByTestId('backtap-double-body')).toBeTruthy();
  });

  it('Send Message sem destinatário avisa e não abre o compositor', async () => {
    const screen = renderScreen();
    enable(screen);
    fireEvent.press(screen.getByText('Double Tap'));
    fireEvent.press(screen.getByText('Send Message'));
    fireEvent.press(screen.getByText('Test Double Tap'));
    expect(screen.getByText('No Recipient')).toBeTruthy();
    expect(openURLSpy).not.toHaveBeenCalled();
  });

  it('Send Message com destinatário e texto abre um smsto: com body (sem SEND_SMS)', async () => {
    const screen = renderScreen();
    enable(screen);
    fireEvent.press(screen.getByText('Double Tap'));
    fireEvent.press(screen.getByText('Send Message'));
    fireEvent.changeText(screen.getByTestId('backtap-double-address'), '+351911111111');
    fireEvent.changeText(screen.getByTestId('backtap-double-body'), 'A caminho');
    expect(screen.getByTestId('backtap-value').props.children).toBe(
      'true|sendMessage|+351911111111|A caminho|none',
    );

    fireEvent.press(screen.getByText('Test Double Tap'));
    await waitFor(() =>
      expect(openURLSpy).toHaveBeenCalledWith(
        `smsto:${encodeURIComponent('+351911111111')}?body=${encodeURIComponent('A caminho')}`,
      ),
    );
    expect(launcherModule.sendSms).not.toHaveBeenCalled();
  });

  it('mudar de Send Message para outra acção esconde os campos (inverso do fix)', () => {
    const screen = renderScreen();
    enable(screen);
    fireEvent.press(screen.getByText('Double Tap'));
    fireEvent.press(screen.getByText('Send Message'));
    fireEvent.changeText(screen.getByTestId('backtap-double-address'), '911');
    fireEvent.press(screen.getByText('Double Tap'));
    fireEvent.press(screen.getByText('Flashlight'));
    expect(screen.queryByTestId('backtap-double-address')).toBeNull();
    expect(screen.getByTestId('backtap-value').props.children).toBe('true|flash|||none');
  });

  it('reescolher Send Message preserva o destinatário já configurado', () => {
    const screen = renderScreen();
    enable(screen);
    fireEvent.press(screen.getByText('Double Tap'));
    fireEvent.press(screen.getByText('Send Message'));
    fireEvent.changeText(screen.getByTestId('backtap-double-address'), '911');
    fireEvent.press(screen.getByText('Double Tap'));
    fireEvent.press(screen.getByText('Send Message'));
    expect(screen.getByTestId('backtap-double-address').props.value).toBe('911');
  });

  it('os dois gestos têm campos de mensagem independentes', () => {
    const screen = renderScreen();
    enable(screen);
    fireEvent.press(screen.getByText('Double Tap'));
    fireEvent.press(screen.getByText('Send Message'));
    fireEvent.press(screen.getByText('Triple Tap'));
    // 'Send Message' também rotula o resumo do Double Tap já configurado; a
    // opção do picker é a última a ser montada.
    const options = screen.getAllByText('Send Message');
    fireEvent.press(options[options.length - 1]);
    fireEvent.changeText(screen.getByTestId('backtap-double-address'), '111');
    fireEvent.changeText(screen.getByTestId('backtap-triple-address'), '222');
    expect(screen.getByTestId('backtap-double-address').props.value).toBe('111');
    expect(screen.getByTestId('backtap-triple-address').props.value).toBe('222');
  });
});
