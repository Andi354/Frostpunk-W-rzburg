import '../src/sim/index';
import { describe, expect, it } from 'vitest';
import { advance } from '../src/sim/sim';
import { newGame } from '../src/sim/state';
import { decodeSave, encodeSave, readSave } from '../src/ui/persist';

describe('save format', () => {
  it('round-trips the whole state', () => {
    const s = newGame(7);
    advance(s, 5);
    expect(decodeSave(encodeSave(s))).toEqual(s);
  });

  it('rejects missing, broken and foreign data', () => {
    const s = newGame(7);
    expect(decodeSave(null)).toBeNull();
    expect(decodeSave('')).toBeNull();
    expect(decodeSave('{not json')).toBeNull();
    expect(decodeSave(JSON.stringify({ version: 1 }))).toBeNull();
    expect(decodeSave(encodeSave({ ...s, version: 2 } as unknown as typeof s))).toBeNull();
  });

  it('reads nothing and does not throw when there is no localStorage', () => {
    expect(readSave()).toBeNull();
  });
});
