// Durations are authored for the default, deliberately unhurried table pace.
// Reduced motion changes movement, never the time available to read a result.
const speeds = {slow:1, slower:1.4, quick:0.7};
let pace = 'slow';

export function setPace(value) {
  pace = Object.hasOwn(speeds, value) ? value : 'slow';
  return pace;
}
export const getPace = () => pace;
export const paceTime = milliseconds => Math.round(milliseconds * speeds[pace]);
export const pause = milliseconds => new Promise(resolve => setTimeout(resolve, paceTime(milliseconds)));
