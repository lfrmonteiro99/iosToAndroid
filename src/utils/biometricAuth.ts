/**
 * Gate de biometria reutilizável (#627 — Protected Apps). Extraído do padrão já
 * usado pelo LockScreen (ver src/screens/LockScreen.tsx `triggerBiometric`):
 * `require()`, não `await import(...)` — um import dinâmico compila para o
 * mesmo require no Metro, mas rebenta sob o ambiente CommonJS do Jest, o que
 * transformaria este gate num no-op silencioso em todos os testes.
 *
 * Fail-closed por desenho: qualquer falha (sem hardware, sem biometria
 * registada, prompt cancelado/falhado, excepção) devolve `false` — para um
 * "app protegida" isso significa não abrir, nunca abrir "por defeito".
 */
export async function authenticateWithBiometrics(promptMessage: string): Promise<boolean> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const LocalAuth = require('expo-local-authentication') as typeof import('expo-local-authentication');
    const hasHardware = await LocalAuth.hasHardwareAsync();
    const isEnrolled = await LocalAuth.isEnrolledAsync();
    if (!hasHardware || !isEnrolled) return false;

    const result = await LocalAuth.authenticateAsync({
      promptMessage,
      disableDeviceFallback: false,
    });
    return result.success;
  } catch {
    return false;
  }
}
