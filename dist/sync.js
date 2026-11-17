export const SYNC_KEY = 'paper-and-ring.sync.v1';

export function readSync(storage) {
  try {
    const raw = storage.getItem(SYNC_KEY);
    if (!raw) return { version: 0, pending: null };
    const value = JSON.parse(raw);
    const version = Math.max(0, Number(value?.version) || 0);
    const pending = value?.pending?.dirty
      ? { dirty: true, baseVersion: Math.max(0, Number(value.pending.baseVersion) || 0) }
      : null;
    return { version, pending };
  } catch {
    return { version: 0, pending: null };
  }
}

export function writeSync(storage, { version = 0, pending = null } = {}) {
  const value = {
    version: Math.max(0, Number(version) || 0),
    pending: pending?.dirty
      ? { dirty: true, baseVersion: Math.max(0, Number(pending.baseVersion) || 0) }
      : null
  };
  storage.setItem(SYNC_KEY, JSON.stringify(value));
  return value;
}

export function markPending(storage, version, baseVersion) {
  return writeSync(storage, { version, pending: { dirty: true, baseVersion } });
}

export function clearPending(storage, version) {
  return writeSync(storage, { version, pending: null });
}

export function decideStartup({ pending, remoteVersion } = {}) {
  if (!pending?.dirty) return 'server';
  if (Number(pending.baseVersion) === Number(remoteVersion)) return 'sync-local';
  return 'conflict';
}

export function baseVersionForSave({ syncConflict = false, pending = null, serverVersion = 0 } = {}) {
  if (syncConflict && pending?.dirty) return Math.max(0, Number(pending.baseVersion) || 0);
  return Math.max(0, Number(serverVersion) || 0);
}
