import { describe, expect, it, vi } from 'vitest';
import { PointerHolds } from './PointerHolds';

const controls = () => {
  const hold = vi.fn(),
    step = vi.fn();
  return { hold, step, input: new PointerHolds(hold, step) };
};

describe('independent touch hold ownership', () => {
  it('steps a short tap immediately once and releases its hold', () => {
    const { input, hold, step } = controls();
    input.start(1, 'angle-up');
    input.stop(1);
    input.stop(1);
    expect(step.mock.calls).toEqual([['angle-up']]);
    expect(hold.mock.calls).toEqual([
      ['angle-up', true],
      ['angle-up', false],
    ]);
  });
  it('does not restart the same pointer or switch its control accidentally', () => {
    const { input, hold, step } = controls();
    input.start(1, 'move-left');
    input.start(1, 'angle-up');
    input.stop(1);
    expect(step).toHaveBeenCalledTimes(1);
    expect(hold.mock.calls).toEqual([
      ['move-left', true],
      ['move-left', false],
    ]);
  });
  it('releasing aiming leaves a different finger moving', () => {
    const { input, hold } = controls();
    input.start(1, 'move-right');
    input.start(2, 'angle-up');
    input.stop(2);
    expect(hold.mock.calls).toEqual([
      ['move-right', true],
      ['angle-up', true],
      ['angle-up', false],
    ]);
    input.stop(1);
    expect(hold).toHaveBeenLastCalledWith('move-right', false);
  });
  it('releasing one of two fingers on the same control does not end the hold', () => {
    const { input, hold } = controls();
    input.start(1, 'power-up');
    input.start(2, 'power-up');
    input.stop(1);
    expect(hold.mock.calls).toEqual([['power-up', true]]);
    input.stop(2);
    expect(hold.mock.calls).toEqual([
      ['power-up', true],
      ['power-up', false],
    ]);
  });
  it('cancels all fingers for a disabled control without releasing unrelated input', () => {
    const { input, hold } = controls();
    input.start(1, 'angle-up');
    input.start(2, 'angle-up');
    input.start(3, 'move-left');
    input.cancelControl('angle-up');
    expect(hold).toHaveBeenLastCalledWith('angle-up', false);
    expect(hold.mock.calls).not.toContainEqual(['move-left', false]);
    input.stop(3);
    expect(hold).toHaveBeenLastCalledWith('move-left', false);
  });
  it('pause, resize or scene shutdown clears every finger idempotently', () => {
    const { input, hold } = controls();
    input.start(1, 'angle-down');
    input.start(2, 'move-right');
    input.clear();
    input.clear();
    expect(hold.mock.calls).toEqual([
      ['angle-down', true],
      ['move-right', true],
      ['angle-down', false],
      ['move-right', false],
    ]);
    input.start(1, 'power-down');
    expect(hold).toHaveBeenLastCalledWith('power-down', true);
  });
});
