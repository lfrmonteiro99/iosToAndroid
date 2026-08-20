/**
 * Back na RAIZ da stack.
 *
 * O #445 desligou o `predictiveBackGestureEnabled` e com isso o back voltou a
 * chegar ao React Navigation — os ecrãs de detalhe já voltam ao anterior. Mas no
 * `HomeMain`, que é a raiz, ninguém consumia o evento: caía na Activity, esta
 * terminava, e o utilizador saía do launcher. Notava-se sobretudo logo depois de
 * desbloquear.
 *
 * A regra está isolada aqui em vez de ser testada através do App inteiro porque é
 * lógica pura de decisão: três entradas, um booleano de saída. Testá-la pelo
 * render obrigaria a montar navegação, providers e o bridge nativo para verificar
 * um `if`.
 */

/** Devolve true quando o evento é consumido (a app NÃO fecha). */
export function shouldConsumeBack(opts: {
  isLocked: boolean;
  canGoBack: boolean;
  isDefaultLauncher: boolean;
}): boolean {
  if (opts.isLocked) return true;
  if (opts.canGoBack) return false;
  return opts.isDefaultLauncher;
}

describe('back na raiz da stack', () => {
  it('consome o back com o ecrã bloqueado — o back nunca contorna o bloqueio', () => {
    expect(shouldConsumeBack({ isLocked: true, canGoBack: false, isDefaultLauncher: false })).toBe(true);
    expect(shouldConsumeBack({ isLocked: true, canGoBack: true, isDefaultLauncher: true })).toBe(true);
  });

  it('deixa o React Navigation tratar quando há para onde voltar (não regride o #445)', () => {
    expect(shouldConsumeBack({ isLocked: false, canGoBack: true, isDefaultLauncher: true })).toBe(false);
    expect(shouldConsumeBack({ isLocked: false, canGoBack: true, isDefaultLauncher: false })).toBe(false);
  });

  it('NÃO fecha o launcher no ecrã inicial quando é o launcher por defeito', () => {
    // O defeito reportado: aqui devolvia false, o evento caía na Activity e a app fechava.
    expect(shouldConsumeBack({ isLocked: false, canGoBack: false, isDefaultLauncher: true })).toBe(true);
  });

  it('deixa fechar no ecrã inicial quando NÃO é o launcher por defeito', () => {
    // Numa app normal, sair no back é o comportamento correcto do Android.
    expect(shouldConsumeBack({ isLocked: false, canGoBack: false, isDefaultLauncher: false })).toBe(false);
  });
});
