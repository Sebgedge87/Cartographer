/**
 * Whether this browser can render 3D at all. Checked before a roll is shown rather
 * than discovered when the roller fails to start, so the fallback is a decision
 * rather than an error path.
 */
export function webglAvailable(): boolean {
  try {
    const canvas = document.createElement('canvas');
    return !!(canvas.getContext('webgl2') ?? canvas.getContext('webgl'));
  } catch {
    return false;
  }
}
