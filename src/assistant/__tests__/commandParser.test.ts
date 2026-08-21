import { parseCommand } from '../commandParser';
import type { AssistantCommand } from '../commandParser';

describe('parseCommand', () => {
  describe('OPEN_APP', () => {
    it('parses "Open Notes" into an OPEN_APP command', () => {
      const cmd: AssistantCommand = parseCommand('Open Notes');
      expect(cmd).toEqual({ type: 'OPEN_APP', appName: 'Notes' });
    });

    it('is case-insensitive for the verb and preserves app-name case', () => {
      expect(parseCommand('open PHOTOS')).toEqual({
        type: 'OPEN_APP',
        appName: 'PHOTOS',
      });
      expect(parseCommand('OPEN reminders')).toEqual({
        type: 'OPEN_APP',
        appName: 'reminders',
      });
    });

    it('tolerates trailing punctuation on the app name', () => {
      expect(parseCommand('Open Calculator.')).toEqual({
        type: 'OPEN_APP',
        appName: 'Calculator',
      });
    });

    it('returns UNRECOGNIZED when "Open" has no argument', () => {
      expect(parseCommand('Open')).toEqual({ type: 'UNRECOGNIZED', raw: 'Open' });
      expect(parseCommand('Open ')).toEqual({ type: 'UNRECOGNIZED', raw: 'Open ' });
    });
  });

  describe('CALL_CONTACT', () => {
    it('parses "Call Alice" into a CALL_CONTACT command', () => {
      expect(parseCommand('Call Alice')).toEqual({
        type: 'CALL_CONTACT',
        contactName: 'Alice',
      });
    });

    it('preserves multi-word contact names and tolerates trailing punctuation', () => {
      expect(parseCommand('Call Bob Smith!')).toEqual({
        type: 'CALL_CONTACT',
        contactName: 'Bob Smith',
      });
    });

    it('is case-insensitive', () => {
      expect(parseCommand('call alice')).toEqual({
        type: 'CALL_CONTACT',
        contactName: 'alice',
      });
    });
  });

  describe('SEND_MESSAGE', () => {
    it('parses "Send message to Alice" into a SEND_MESSAGE command', () => {
      expect(parseCommand('Send message to Alice')).toEqual({
        type: 'SEND_MESSAGE',
        contactName: 'Alice',
      });
    });

    it('also accepts the natural "send a message to" alias', () => {
      expect(parseCommand('send a message to Bob')).toEqual({
        type: 'SEND_MESSAGE',
        contactName: 'Bob',
      });
    });

    it('tolerates trailing punctuation and preserves contact name case', () => {
      expect(parseCommand('Send message to Carol.')).toEqual({
        type: 'SEND_MESSAGE',
        contactName: 'Carol',
      });
    });
  });

  describe('WHAT_TIME', () => {
    it('parses "What time is it" into a WHAT_TIME command', () => {
      expect(parseCommand('What time is it')).toEqual({ type: 'WHAT_TIME' });
    });

    it('is case-insensitive and tolerates trailing punctuation', () => {
      expect(parseCommand('what time is it?')).toEqual({ type: 'WHAT_TIME' });
      expect(parseCommand('WHAT TIME IS IT')).toEqual({ type: 'WHAT_TIME' });
    });
  });

  describe('SET_ALARM', () => {
    it('parses a 24-hour time without am/pm', () => {
      expect(parseCommand('Set alarm for 19:30')).toEqual({
        type: 'SET_ALARM',
        hour: 19,
        minute: 30,
      });
    });

    it('parses a 12-hour "pm" time with no minutes', () => {
      expect(parseCommand('Set alarm for 7pm')).toEqual({
        type: 'SET_ALARM',
        hour: 19,
        minute: 0,
      });
    });

    it('parses a 12-hour "pm" time with minutes and spaced meridian', () => {
      expect(parseCommand('Set alarm for 7:30 pm')).toEqual({
        type: 'SET_ALARM',
        hour: 19,
        minute: 30,
      });
    });

    it('parses a 12-hour "am" time', () => {
      expect(parseCommand('Set alarm for 9:15 am')).toEqual({
        type: 'SET_ALARM',
        hour: 9,
        minute: 15,
      });
    });

    it('treats 12 pm as noon and 12 am as midnight', () => {
      expect(parseCommand('Set alarm for 12 pm')).toEqual({
        type: 'SET_ALARM',
        hour: 12,
        minute: 0,
      });
      expect(parseCommand('Set alarm for 12 am')).toEqual({
        type: 'SET_ALARM',
        hour: 0,
        minute: 0,
      });
    });

    it('accepts "Set alarm" without the "for" connector', () => {
      expect(parseCommand('Set alarm 6:45 am')).toEqual({
        type: 'SET_ALARM',
        hour: 6,
        minute: 45,
      });
    });

    it('is case-insensitive on the verb and meridian', () => {
      expect(parseCommand('SET ALARM FOR 7 PM')).toEqual({
        type: 'SET_ALARM',
        hour: 19,
        minute: 0,
      });
    });

    it('returns UNRECOGNIZED for an hour out of range (>= 24)', () => {
      expect(parseCommand('Set alarm for 25:00')).toEqual({
        type: 'UNRECOGNIZED',
        raw: 'Set alarm for 25:00',
      });
    });

    it('returns UNRECOGNIZED for a minute out of range (>= 60)', () => {
      expect(parseCommand('Set alarm for 7:70 pm')).toEqual({
        type: 'UNRECOGNIZED',
        raw: 'Set alarm for 7:70 pm',
      });
    });

    it('returns UNRECOGNIZED when no time is supplied', () => {
      expect(parseCommand('Set alarm')).toEqual({
        type: 'UNRECOGNIZED',
        raw: 'Set alarm',
      });
    });
  });

  describe('wake-phrase stripping', () => {
    it('strips a leading "Hey Siri" wake phrase', () => {
      expect(parseCommand('Hey Siri open Maps')).toEqual({
        type: 'OPEN_APP',
        appName: 'Maps',
      });
      expect(parseCommand('Hey Siri call Dave')).toEqual({
        type: 'CALL_CONTACT',
        contactName: 'Dave',
      });
    });

    it('strips a bare "Siri" wake phrase', () => {
      expect(parseCommand('Siri what time is it')).toEqual({ type: 'WHAT_TIME' });
      expect(parseCommand('siri set alarm for 8 am')).toEqual({
        type: 'SET_ALARM',
        hour: 8,
        minute: 0,
      });
    });

    it('strips the wake phrase case-insensitively with trailing separator', () => {
      expect(parseCommand('HEY SIRI, call Eve')).toEqual({
        type: 'CALL_CONTACT',
        contactName: 'Eve',
      });
    });
  });

  describe('UNRECOGNIZED', () => {
    it('returns UNRECOGNIZED for an empty string', () => {
      expect(parseCommand('')).toEqual({ type: 'UNRECOGNIZED', raw: '' });
    });

    it('returns UNRECOGNIZED for whitespace-only input', () => {
      expect(parseCommand('   ')).toEqual({ type: 'UNRECOGNIZED', raw: '   ' });
    });

    it('returns UNRECOGNIZED for gibberish', () => {
      expect(parseCommand('flibber wobber')).toEqual({
        type: 'UNRECOGNIZED',
        raw: 'flibber wobber',
      });
    });

    it('returns UNRECOGNIZED for an unsupported intent', () => {
      expect(parseCommand('Play music')).toEqual({
        type: 'UNRECOGNIZED',
        raw: 'Play music',
      });
    });
  });
});
