import { useUI } from '../state/uiStore';

export function Toast() {
  const toast = useUI((s) => s.toast);
  if (!toast) return null;
  return <div className="toast">{toast}</div>;
}
