/**
 * The assistant spoken to in Portuguese.
 *
 * The reported defect was that speaking to Siri only ever produced "that isn't
 * supported" — because the recognizer transcribed the phone's language and the
 * parser only knew English verbs, so every utterance became UNRECOGNIZED. These
 * are the phrasings a Portuguese speaker actually uses, as the recognizer emits
 * them: accented, lower-cased, no punctuation.
 */
import { parseCommand } from '../commandParser';

describe('abrir apps', () => {
  it.each([
    ['abre a calculadora', 'calculadora'],
    ['abre o whatsapp', 'whatsapp'],
    ['abrir notas', 'notas'],
    ['abre-me as definições', 'definições'],
    ['liga a app spotify', 'spotify'],
    ['abre a câmara', 'câmara'],
  ])('%s → OPEN_APP %s', (input, appName) => {
    expect(parseCommand(input)).toEqual({ type: 'OPEN_APP', appName });
  });

  it('keeps the accents in the captured name, since the app list has them', () => {
    const parsed = parseCommand('abre a câmara');
    expect(parsed).toEqual({ type: 'OPEN_APP', appName: 'câmara' });
  });
});

describe('ligar a contactos', () => {
  it.each([
    ['liga ao joão', 'joão'],
    ['liga à sofia', 'sofia'],
    ['ligar para a maria', 'maria'],
    ['telefona ao pedro', 'pedro'],
    ['chama a inês', 'inês'],
    ['liga 912345678', '912345678'],
  ])('%s → CALL_CONTACT %s', (input, contactName) => {
    expect(parseCommand(input)).toEqual({ type: 'CALL_CONTACT', contactName });
  });

  it('"liga a app X" is opening an app, not calling someone called app', () => {
    expect(parseCommand('liga a app spotify')).toEqual({ type: 'OPEN_APP', appName: 'spotify' });
  });
});

describe('mandar mensagens', () => {
  it.each([
    ['manda uma mensagem ao joão', 'joão'],
    ['manda mensagem à sofia', 'sofia'],
    ['envia uma sms para o pedro', 'pedro'],
    ['escreve à maria', undefined],
  ])('%s', (input, contactName) => {
    const parsed = parseCommand(input);
    if (contactName) {
      expect(parsed).toEqual({ type: 'SEND_MESSAGE', contactName });
    } else {
      // "escreve à maria" has no noun ("mensagem"), so it stays unrecognized
      // rather than guessing: writing to someone could as easily be a note.
      expect(parsed.type).toBe('UNRECOGNIZED');
    }
  });
});

describe('as horas', () => {
  it.each([
    'que horas são',
    'que horas é',
    'sabes que horas são',
    'diz-me as horas',
    'que horas temos',
    // English, including the phrasings the old parser rejected
    'what time is it',
    "what's the time",
    'what is the time',
  ])('%s → WHAT_TIME', (input) => {
    expect(parseCommand(input)).toEqual({ type: 'WHAT_TIME' });
  });
});

describe('alarmes', () => {
  it.each([
    ['põe um alarme para as 7', 7, 0],
    ['põe um alarme para as 7h30', 7, 30],
    ['define um alarme para as 19:30', 19, 30],
    ['marca um alarme para as 7 da manhã', 7, 0],
    ['põe um alarme para as 7 da tarde', 19, 0],
    ['põe um alarme para as 7 e meia', 7, 30],
    ['acorda-me às 6h45', 6, 45],
    ['põe um despertador para as 8', 8, 0],
    ['põe um alarme para o meio-dia', 12, 0],
    ['põe um alarme para a meia-noite', 0, 0],
  ])('%s → %s:%s', (input, hour, minute) => {
    expect(parseCommand(input)).toEqual({ type: 'SET_ALARM', hour, minute });
  });

  it('an hour past 23 is not an alarm', () => {
    expect(parseCommand('põe um alarme para as 30h').type).toBe('UNRECOGNIZED');
  });

  it('"7 da noite" is the evening, not seven in the morning', () => {
    expect(parseCommand('põe um alarme para as 7 da noite')).toEqual({
      type: 'SET_ALARM', hour: 19, minute: 0,
    });
  });
});

describe('wake phrase', () => {
  it.each(['ó siri, abre as notas', 'siri abre as notas', 'hey siri open notes'])(
    '%s still reaches the command',
    (input) => {
      expect(parseCommand(input).type).toBe('OPEN_APP');
    },
  );
});

describe('what stays unrecognized', () => {
  it.each([
    'como está o tempo amanhã em lisboa',
    'conta-me uma piada',
    'quanto é 15% de 240',
    '',
    '   ',
  ])('%s', (input) => {
    expect(parseCommand(input).type).toBe('UNRECOGNIZED');
  });

  it('keeps the raw text so the screen can show what it heard', () => {
    expect(parseCommand('conta-me uma piada')).toEqual({
      type: 'UNRECOGNIZED', raw: 'conta-me uma piada',
    });
  });
});
