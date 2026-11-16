import test from 'node:test';
import assert from 'node:assert/strict';
import { readSync, writeSync, markPending, clearPending, decideStartup, SYNC_KEY } from '../dist/sync.js';

function memoryStorage() {
  const values = new Map();
  return {
    getItem: key => (values.has(key) ? values.get(key) : null),
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: key => values.delete(key),
    value: key => values.get(key)
  };
}

test('同步元数据可以往返保存版本号和 pending 状态', () => {
  const storage = memoryStorage();
  markPending(storage, 4, 3);
  assert.deepEqual(readSync(storage), { version: 4, pending: { dirty: true, baseVersion: 3 } });
  clearPending(storage, 5);
  assert.deepEqual(readSync(storage), { version: 5, pending: null });
  assert.match(storage.value(SYNC_KEY), /"version":5/);
});

test('损坏或缺失的同步元数据按无 pending 处理', () => {
  const storage = memoryStorage();
  assert.deepEqual(readSync(storage), { version: 0, pending: null });
  storage.setItem(SYNC_KEY, '{bad json');
  assert.deepEqual(readSync(storage), { version: 0, pending: null });
  writeSync(storage, { version: 2, pending: { dirty: false, baseVersion: 1 } });
  assert.deepEqual(readSync(storage), { version: 2, pending: null });
});

test('启动时根据 pending 基础版本决定读取云端、补传本地或提示冲突', () => {
  assert.equal(decideStartup({ pending: null, remoteVersion: 5 }), 'server');
  assert.equal(decideStartup({ pending: { dirty: true, baseVersion: 5 }, remoteVersion: 5 }), 'sync-local');
  assert.equal(decideStartup({ pending: { dirty: true, baseVersion: 0 }, remoteVersion: 0 }), 'sync-local');
  assert.equal(decideStartup({ pending: { dirty: true, baseVersion: 4 }, remoteVersion: 5 }), 'conflict');
});
