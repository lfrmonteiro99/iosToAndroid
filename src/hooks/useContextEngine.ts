import { useEffect, useRef } from 'react';
import { useSettings } from '../store/SettingsStore';
import { useDevice } from '../store/DeviceStore';
import { useLocation } from '../store/LocationStore';
import {
  pickActiveRule,
  type ContextSnapshot,
  type ContextTargetMode,
} from '../utils/contextTriggerEngine';

const CONTEXT_ENGINE_CHECK_MS = 30_000;

export interface ContextEngineHandle {
  /** Força uma reavaliação imediata (usado por testes com relógio injetado). */
  tick: () => void;
}

/**
 * Liga a Context Engine (#628) ao estado vivo da app.
 *
 * Mecanismo: a cada `CONTEXT_ENGINE_CHECK_MS`, monta um `ContextSnapshot` a
 * partir do DeviceStore (Wi-Fi/Bluetooth) e do LocationStore (localização), e
 * avalia `settings.contextRules` (engine pura em contextTriggerEngine.ts).
 * Se uma regra activada combina, o seu `targetMode` é aplicado via
 * `setFocusMode`.
 *
 * Diferença deliberada face a `useFocusSchedule` (Focus Schedule legado): ali
 * existe uma guarda de "não activar em falso no arranque" porque o único
 * sinal disponível é uma janela horária sem histórico de app anteriores. Aqui
 * as condições (Wi-Fi ligado, dispositivo emparelhado, dentro do raio) são
 * sinais de presença, não de "cruzamento de fronteira" — tal como as
 * automações reais do Android/iOS, activam-se logo que a condição já é
 * verdadeira, mesmo na primeira avaliação após o arranque.
 *
 * Posse do modo activo (`engineOwnedModeRef`): a engine só troca
 * automaticamente o FocusMode quando está "off" ou quando o modo actual foi
 * ela própria que o pôs — nunca sobrepõe um modo escolhido manualmente pelo
 * utilizador (mesmo princípio de useFocusSchedule, generalizado a qualquer
 * modo em vez de só 'work'). Assim que o utilizador volta a "off" manualmente
 * (ou a regra deixa de combinar), a engine reganha o controlo na avaliação
 * seguinte.
 */
export function useContextEngine(
  nowProvider: () => Date = () => new Date(),
): ContextEngineHandle {
  const { settings, setFocusMode } = useSettings();
  const device = useDevice();
  const location = useLocation();

  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const deviceRef = useRef(device);
  deviceRef.current = device;
  const locationRef = useRef(location);
  locationRef.current = location;
  const nowProviderRef = useRef(nowProvider);
  nowProviderRef.current = nowProvider;

  const engineOwnedModeRef = useRef<ContextTargetMode | null>(null);

  const evaluate = () => {
    const s = settingsRef.current;
    const enabledRules = s.contextRules.filter((r) => r.enabled);

    if (enabledRules.length === 0) {
      // Sem regras activas: nada a avaliar. Se uma execução anterior tinha
      // ligado um modo e as regras foram entretanto todas apagadas/desligadas,
      // desliga-o em vez de o deixar órfão.
      if (engineOwnedModeRef.current !== null && s.focusMode === engineOwnedModeRef.current) {
        setFocusMode('off');
      }
      engineOwnedModeRef.current = null;
      return;
    }

    const d = deviceRef.current;
    const loc = locationRef.current;
    const snapshot: ContextSnapshot = {
      wifiSsid: d.wifi.enabled && d.wifi.ssid ? d.wifi.ssid : null,
      bluetoothPairedAddresses: d.bluetooth.enabled
        ? d.bluetooth.pairedDevices.map((p) => p.address)
        : [],
      location: loc.currentLocation
        ? { latitude: loc.currentLocation.latitude, longitude: loc.currentLocation.longitude }
        : null,
      now: nowProviderRef.current(),
    };

    const activeRule = pickActiveRule(enabledRules, snapshot);
    const desiredMode = activeRule ? activeRule.targetMode : null;
    const engineOwnsCurrent = s.focusMode === 'off' || s.focusMode === engineOwnedModeRef.current;

    if (desiredMode !== null && engineOwnsCurrent) {
      if (s.focusMode !== desiredMode) setFocusMode(desiredMode);
      engineOwnedModeRef.current = desiredMode;
    } else if (desiredMode === null && engineOwnsCurrent && engineOwnedModeRef.current !== null) {
      setFocusMode('off');
      engineOwnedModeRef.current = null;
    } else if (!engineOwnsCurrent) {
      // O utilizador tem um modo manual diferente activo — não o sobrepomos,
      // e largamos a posse até ele voltar a 'off' (ou a igualar a regra).
      engineOwnedModeRef.current = null;
    }
  };

  // Só pede localização periodicamente quando existe pelo menos uma regra
  // activada com condição de localização — evita o pedido de permissão e o
  // consumo de GPS para quem nunca configurou esse tipo de gatilho.
  const hasLocationRule = settings.contextRules.some(
    (r) => r.enabled && r.conditions.some((c) => c.type === 'location'),
  );
  useEffect(() => {
    if (!hasLocationRule) return;
    location.refreshLocation().catch(() => {});
    const id = setInterval(() => {
      location.refreshLocation().catch(() => {});
    }, CONTEXT_ENGINE_CHECK_MS);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasLocationRule]);

  useEffect(() => {
    evaluate();
    const id = setInterval(evaluate, CONTEXT_ENGINE_CHECK_MS);
    return () => clearInterval(id);
    // Reavalia sempre que qualquer entrada do snapshot muda; `evaluate` é
    // estável porque só lê refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    settings.contextRules,
    device.wifi.ssid,
    device.wifi.enabled,
    device.bluetooth.enabled,
    device.bluetooth.pairedDevices,
    location.currentLocation,
    nowProvider,
  ]);

  return { tick: evaluate };
}
