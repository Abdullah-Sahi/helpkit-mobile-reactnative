import { keyboardOverlap } from '../keyboard';

describe('how far the keyboard reaches over the sheet (Android)', () => {
  test('edge to edge: the window doesn’t shrink, so the sheet makes room', () => {
    // A sheet reaching the bottom of an 800-point screen; the keyboard's top at 480.
    expect(keyboardOverlap(800, 480)).toBe(320);
  });

  test('a window that shrank already: nothing is added twice', () => {
    expect(keyboardOverlap(480, 480)).toBe(0);
    expect(keyboardOverlap(470, 480)).toBe(0);
  });

  test('no keyboard, or a number that isn’t one', () => {
    expect(keyboardOverlap(800, null)).toBe(0);
    expect(keyboardOverlap(800, Number.NaN)).toBe(0);
    expect(keyboardOverlap(Number.POSITIVE_INFINITY, 400)).toBe(0);
  });

  test('whole points', () => {
    expect(keyboardOverlap(800.4, 480)).toBe(320);
  });
});
