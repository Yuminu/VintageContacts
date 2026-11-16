import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { initDb, getContacts } from '../server/db.js';
import { createApp } from '../server/app.js';

async function start({ seed = false } = {}) {
  const db = initDb({ filename: ':memory:', seed });
  const app = createApp({ db, rateLimitEnabled: false });
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const { port } = server.address();
  return { db, server, base: `http://127.0.0.1:${port}` };
}

function close(ctx) {
  return new Promise(resolve => {
    ctx.server.closeAllConnections?.();
    ctx.server.close(() => {
      ctx.db.close();
      resolve();
    });
  });
}

const sample = {
  name: '测试联系人',
  group: '朋友',
  speedCode: '001',
  phones: ['13800000001', '13800000002'],
  emails: ['one@example.com', 'two@example.com'],
  socials: [{ platform: '微信', value: 'test-user' }],
  address: '福州',
  notes: '测试备注',
  favorite: true
};

test('健康检查返回 ok', async t => {
  const ctx = await start();
  t.after(() => close(ctx));
  const response = await fetch(`${ctx.base}/api/health`);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.success, true);
  assert.equal(body.data.status, 'ok');
});

test('创建、读取、更新、收藏、删除联系人', async t => {
  const ctx = await start();
  t.after(() => close(ctx));

  const createdResponse = await fetch(`${ctx.base}/api/contacts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(sample)
  });
  assert.equal(createdResponse.status, 201);
  const created = (await createdResponse.json()).data;
  assert.ok(created.id);
  assert.equal(created.name, sample.name);
  assert.deepEqual(created.phones, sample.phones);
  assert.deepEqual(created.emails, sample.emails);
  assert.deepEqual(created.socials, sample.socials);
  assert.equal(created.favorite, true);

  const listResponse = await fetch(`${ctx.base}/api/contacts`);
  const list = (await listResponse.json()).data;
  assert.equal(list.contacts.length, 1);
  assert.ok(Array.isArray(list.groups));

  const detailResponse = await fetch(`${ctx.base}/api/contacts/${created.id}`);
  assert.equal((await detailResponse.json()).data.name, sample.name);

  const updateResponse = await fetch(`${ctx.base}/api/contacts/${created.id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...sample, name: '改名后', phones: ['13900000000'] })
  });
  const updated = (await updateResponse.json()).data;
  assert.equal(updated.name, '改名后');
  assert.deepEqual(updated.phones, ['13900000000']);
  assert.equal(updated.createdAt, created.createdAt);

  const favoriteResponse = await fetch(`${ctx.base}/api/contacts/${created.id}/favorite`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ isFavorite: false })
  });
  assert.equal((await favoriteResponse.json()).data.favorite, false);

  const deleteResponse = await fetch(`${ctx.base}/api/contacts/${created.id}`, { method: 'DELETE' });
  assert.equal(deleteResponse.status, 200);
  const afterDelete = await fetch(`${ctx.base}/api/contacts/${created.id}`);
  assert.equal(afterDelete.status, 404);
});

test('批量同步联系人和分组，并可查询', async t => {
  const ctx = await start();
  t.after(() => close(ctx));
  const response = await fetch(`${ctx.base}/api/contacts`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contacts: [sample, { ...sample, id: 'second', name: '第二个人', phones: ['13700000000'] }], groups: ['朋友', '同事'] })
  });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).data.count, 2);
  const list = (await (await fetch(`${ctx.base}/api/contacts`)).json()).data;
  assert.equal(list.contacts.length, 2);
  assert.deepEqual(list.groups, ['朋友', '同事']);
});

test('非法数据返回 400，批量同步失败不会清空已有数据', async t => {
  const ctx = await start();
  t.after(() => close(ctx));
  await fetch(`${ctx.base}/api/contacts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(sample)
  });
  const invalid = await fetch(`${ctx.base}/api/contacts`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contacts: [{ name: '' }], groups: [] })
  });
  assert.equal(invalid.status, 400);
  const body = await invalid.json();
  assert.equal(body.success, false);
  assert.ok(Array.isArray(body.error.details));
  const list = (await (await fetch(`${ctx.base}/api/contacts`)).json()).data;
  assert.equal(list.contacts.length, 1);
});

test('静态页面和 API 404 正常返回', async t => {
  const ctx = await start();
  t.after(() => close(ctx));
  const home = await fetch(`${ctx.base}/`);
  assert.equal(home.status, 200);
  assert.match(await home.text(), /纸间来电|通讯录/);
  const script = await fetch(`${ctx.base}/app.js`);
  assert.equal(script.status, 200);
  assert.match(script.headers.get('content-type') || '', /javascript/);
  const apiMissing = await fetch(`${ctx.base}/api/nope`);
  assert.equal(apiMissing.status, 404);
  assert.equal((await apiMissing.json()).error.code, 'NOT_FOUND');
  const pageMissing = await fetch(`${ctx.base}/nope`);
  assert.equal(pageMissing.status, 404);
});

test('SQLite 文件重启后联系人仍然存在', async t => {
  const dir = mkdtempSync(path.join(tmpdir(), 'vintagecontacts-'));
  const filename = path.join(dir, 'contacts.sqlite');
  const first = initDb({ filename, seed: false });
  first.prepare(`INSERT INTO contacts (id, name, grp, speed_code, address, notes, favorite, dial_count, search_count, last_contact_at, created_at, updated_at, is_demo)
    VALUES ('persisted', '持久化测试', '朋友', '', '', '', 0, 0, 0, 0, 1, 1, 0)`).run();
  first.close();
  const second = initDb({ filename, seed: false });
  assert.equal(getContacts(second).some(contact => contact.id === 'persisted'), true);
  second.close();
  rmSync(dir, { recursive: true, force: true });
});
