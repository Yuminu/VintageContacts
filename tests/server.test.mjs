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

function make(overrides = {}) {
  return {
    name: '测试联系人',
    group: '朋友',
    speedCode: '001',
    phones: ['13800000001'],
    emails: ['one@example.com'],
    socials: [{ platform: '微信', value: 'test-user' }],
    address: '福州',
    notes: '测试备注',
    favorite: true,
    ...overrides
  };
}

async function getList(ctx) {
  return (await (await fetch(`${ctx.base}/api/contacts`)).json()).data;
}

async function sendJson(ctx, method, url, body) {
  return fetch(`${ctx.base}${url}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
}

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

  const createdResponse = await sendJson(ctx, 'POST', '/api/contacts', make());
  assert.equal(createdResponse.status, 201);
  const createdBody = await createdResponse.json();
  const created = createdBody.data;
  assert.ok(created.id);
  assert.ok(createdBody.version >= 2);
  assert.equal(created.name, '测试联系人');
  assert.deepEqual(created.phones, ['13800000001']);
  assert.deepEqual(created.emails, ['one@example.com']);
  assert.deepEqual(created.socials, [{ platform: '微信', value: 'test-user' }]);
  assert.equal(created.favorite, true);

  const list = await getList(ctx);
  assert.equal(list.contacts.length, 1);
  assert.ok(list.version >= 2);
  assert.ok(Array.isArray(list.groups));

  const detailResponse = await fetch(`${ctx.base}/api/contacts/${created.id}`);
  assert.equal((await detailResponse.json()).data.name, '测试联系人');

  const updateResponse = await sendJson(ctx, 'PUT', `/api/contacts/${created.id}`, make({
    name: '改名后',
    phones: ['13900000000'],
    speedCode: '009'
  }));
  const updated = (await updateResponse.json()).data;
  assert.equal(updated.name, '改名后');
  assert.deepEqual(updated.phones, ['13900000000']);
  assert.equal(updated.speedCode, '009');
  assert.equal(updated.createdAt, created.createdAt);

  const favoriteResponse = await sendJson(ctx, 'PATCH', `/api/contacts/${created.id}/favorite`, { isFavorite: false });
  assert.equal((await favoriteResponse.json()).data.favorite, false);

  const deleteResponse = await fetch(`${ctx.base}/api/contacts/${created.id}`, { method: 'DELETE' });
  assert.equal(deleteResponse.status, 200);
  const afterDelete = await fetch(`${ctx.base}/api/contacts/${created.id}`);
  assert.equal(afterDelete.status, 404);
});

test('批量同步联系人和分组，并递增版本号', async t => {
  const ctx = await start();
  t.after(() => close(ctx));
  const before = await getList(ctx);
  const response = await sendJson(ctx, 'PUT', '/api/contacts', {
    contacts: [
      make(),
      make({
        id: 'second',
        name: '第二个人',
        phones: ['13700000000'],
        emails: ['two@example.com'],
        speedCode: '002'
      })
    ],
    groups: ['朋友', '同事'],
    baseVersion: before.version
  });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.data.count, 2);
  assert.equal(body.data.version, before.version + 1);
  const list = await getList(ctx);
  assert.equal(list.contacts.length, 2);
  assert.deepEqual(list.groups, ['朋友', '同事']);
  assert.equal(list.version, before.version + 1);
});

test('旧版本批量同步返回 409，不删除其他客户端的新联系人', async t => {
  const ctx = await start();
  t.after(() => close(ctx));
  await sendJson(ctx, 'POST', '/api/contacts', make());
  await sendJson(ctx, 'POST', '/api/contacts', make({
    name: '第二个人',
    phones: ['13700000000'],
    emails: ['two@example.com'],
    speedCode: '002'
  }));
  const list = await getList(ctx);
  assert.equal(list.contacts.length, 2);
  assert.equal(list.version, 3);

  const stale = await sendJson(ctx, 'PUT', '/api/contacts', {
    contacts: [make()],
    groups: list.groups,
    baseVersion: list.version - 1
  });
  assert.equal(stale.status, 409);
  const staleBody = await stale.json();
  assert.equal(staleBody.error.code, 'VERSION_CONFLICT');
  assert.equal(staleBody.error.details[0].currentVersion, list.version);

  const afterStale = await getList(ctx);
  assert.equal(afterStale.contacts.length, 2);
  assert.equal(afterStale.version, list.version);

  const accepted = await sendJson(ctx, 'PUT', '/api/contacts', {
    contacts: list.contacts,
    groups: list.groups,
    baseVersion: list.version
  });
  assert.equal(accepted.status, 200);
  assert.equal((await accepted.json()).data.version, list.version + 1);
});

test('手机号、短码跨联系人唯一，非法格式返回 400/409', async t => {
  const ctx = await start();
  t.after(() => close(ctx));
  const first = await sendJson(ctx, 'POST', '/api/contacts', make());
  assert.equal(first.status, 201);

  const samePhone = await sendJson(ctx, 'POST', '/api/contacts', make({
    name: '号码冲突',
    speedCode: '002',
    emails: ['two@example.com']
  }));
  assert.equal(samePhone.status, 409);
  assert.equal((await samePhone.json()).error.code, 'DUPLICATE_PHONE');

  const sameCode = await sendJson(ctx, 'POST', '/api/contacts', make({
    name: '短码冲突',
    phones: ['13700000000'],
    emails: ['three@example.com']
  }));
  assert.equal(sameCode.status, 409);
  assert.equal((await sameCode.json()).error.code, 'DUPLICATE_SPEED_CODE');

  const sameEmail = await sendJson(ctx, 'POST', '/api/contacts', make({
    name: '邮箱冲突',
    phones: ['13600000001'],
    emails: ['one@example.com'],
    speedCode: ''
  }));
  assert.equal(sameEmail.status, 409);
  assert.equal((await sameEmail.json()).error.code, 'DUPLICATE_EMAIL');

  const badSpeedCode = await sendJson(ctx, 'POST', '/api/contacts', make({
    name: '短码格式错误',
    phones: ['13600000000'],
    emails: ['four@example.com'],
    speedCode: '12'
  }));
  assert.equal(badSpeedCode.status, 400);
  assert.equal((await badSpeedCode.json()).error.code, 'INVALID_SPEED_CODE');

  const badPhone = await sendJson(ctx, 'POST', '/api/contacts', make({
    name: '电话号码错误',
    phones: ['abc'],
    emails: ['five@example.com'],
    speedCode: ''
  }));
  assert.equal(badPhone.status, 400);
  assert.equal((await badPhone.json()).error.code, 'INVALID_PHONE');

  const badEmail = await sendJson(ctx, 'POST', '/api/contacts', make({
    name: '邮箱错误',
    phones: ['13500000000'],
    emails: ['bad@'],
    speedCode: ''
  }));
  assert.equal(badEmail.status, 400);
  assert.equal((await badEmail.json()).error.code, 'INVALID_EMAIL');

  const second = await sendJson(ctx, 'POST', '/api/contacts', make({
    name: '第二个人',
    phones: ['13700000000'],
    emails: ['two@example.com'],
    speedCode: '002'
  }));
  assert.equal(second.status, 201);
  const secondContact = (await second.json()).data;

  const duplicateUpdate = await sendJson(ctx, 'PUT', `/api/contacts/${secondContact.id}`, make({
    id: secondContact.id,
    name: '第二个人',
    phones: ['13800000001'],
    emails: ['two@example.com'],
    speedCode: '002'
  }));
  assert.equal(duplicateUpdate.status, 409);
  assert.equal((await duplicateUpdate.json()).error.code, 'DUPLICATE_PHONE');

  const list = await getList(ctx);
  const duplicateBulk = await sendJson(ctx, 'PUT', '/api/contacts', {
    contacts: [
      make(),
      make({ id: 'dup', name: '批量重复', phones: ['13800000001'], speedCode: '', emails: ['dup@example.com'] })
    ],
    groups: list.groups,
    baseVersion: list.version
  });
  assert.equal(duplicateBulk.status, 409);
  assert.equal((await duplicateBulk.json()).error.code, 'DUPLICATE_PHONE');
  const afterBulk = await getList(ctx);
  assert.equal(afterBulk.contacts.length, 2);
  assert.equal(afterBulk.version, list.version);
});

test('非法数据返回 400，批量同步失败不会清空已有数据', async t => {
  const ctx = await start();
  t.after(() => close(ctx));
  await sendJson(ctx, 'POST', '/api/contacts', make());
  const list = await getList(ctx);
  const invalid = await sendJson(ctx, 'PUT', '/api/contacts', {
    contacts: [{ name: '' }],
    groups: [],
    baseVersion: list.version
  });
  assert.equal(invalid.status, 400);
  const body = await invalid.json();
  assert.equal(body.success, false);
  assert.ok(Array.isArray(body.error.details));
  const after = await getList(ctx);
  assert.equal(after.contacts.length, 1);
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
