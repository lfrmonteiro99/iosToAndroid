import React, { createContext, useContext, useState, useCallback } from 'react';
import { CupertinoAlertDialog } from './CupertinoAlertDialog';

interface AlertButton {
  text: string;
  onPress?: () => void;
  style?: 'default' | 'cancel' | 'destructive';
}

interface AlertState {
  visible: boolean;
  title: string;
  message?: string;
  actions: { label: string; onPress: () => void; style?: 'default' | 'cancel' | 'destructive' }[];
}

type AlertFn = (title: string, message?: string, buttons?: AlertButton[]) => void;

const AlertContext = createContext<AlertFn>(() => {});

export function useAlert(): AlertFn {
  return useContext(AlertContext);
}

export function AlertProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AlertState>({
    visible: false,
    title: '',
    message: undefined,
    actions: [],
  });

  const alert: AlertFn = useCallback((title, message, buttons) => {
    const btns = buttons && buttons.length > 0 ? buttons : [{ text: 'OK' }];
    setState({
      visible: true,
      title,
      message: message || undefined,
      actions: btns.map((b) => ({
        label: b.text,
        onPress: b.onPress ?? (() => {}),
        style: b.style,
      })),
    });
  }, []);

  const close = useCallback(() => {
    setState((s) => ({ ...s, visible: false }));
  }, []);

  return (
    <AlertContext.Provider value={alert}>
      {children}
      <CupertinoAlertDialog
        visible={state.visible}
        onClose={close}
        title={state.title}
        message={state.message}
        actions={state.actions}
      />
    </AlertContext.Provider>
  );
}
