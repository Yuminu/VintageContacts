import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { demoContacts } from '../dist/data.js';

export const DEFAULT_GROUPS = ['家人', '朋友', '大学同学', '同事', '老师'];
const VERSION_KEY = 'contacts_version';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS contacts (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  grp TEXT NOT NULL DEFAULT '未分组',
  speed_code TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  favorite INTEGER NOT NULL DEFAULT 0,
  dial_count INTEGER NOT NULL DEFAULT 0,
  search_count INTEGER NOT NULL DEFAULT 0,
  last_contact_at INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  is_demo INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS contact_methods (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  contact_id TEXT NOT NULL,
  type TEXT NOT NULL,
  label TEXT NOT NULL DEFAULT '',
  value TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_contact_methods_contact_id ON contact_methods(contact_id);
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`;

function httpError(status, message, details, code) {
  const error = new Error(message);
  error.status = status;
  error.code = code || (status === 409 ? 'CONFLICT' : 'VALIDATION_ERROR');
  error.details = Array.isArray(details) ? details : (details ? [details] : []);
  return error;
}

function uniqueValues(values) {
  return [...new Set(values)];
}

function normalizePhone(value) {
  return String(value ?? '').replace(/[\s()+-]/g, '');
}

function normalizeSocials(socials) {
  const result = [];
  for (const social of Array.isArray(socials) ? socials : []) {
    const platform = String(social?.platform || '其他').trim() || '其他';
    const value = String(social?.value ?? '').trim();
    if (value && !result.some(item => item.platform === platform && item.value === value)) {
      result.push({ platform, value });
    }
  }
  return result;
}

function methodRows(contact) {
  const rows = [];
  for (const value of contact.phones) rows.push(['phone', '', value, rows.length]);
  for (const value of contact.emails) rows.push(['email', '', value, rows.length]);
  for (const social of contact.socials) rows.push(['social', social.platform, social.value, rows.length]);
  return rows;
}

function normalize(contact) {
  const name = String(contact.name ?? '').trim();
  if (!name) throw httpError(400, '联系人姓名不能为空', { path: 'name' });
  const now = Date.now();
  const phones = uniqueValues((Array.isArray(contact.phones) ? contact.phones : [])
    .map(normalizePhone)
    .filter(Boolean));
  const emails = [];
  for (const value of Array.isArray(contact.emails) ? contact.emails : []) {
    const email = String(value ?? '').trim();
    if (email && !emails.some(item => item.toLowerCase() === email.toLowerCase())) emails.push(email);
  }
  const socials = normalizeSocials(contact.socials);
  return {
    id: String(contact.id || randomUUID()),
    name,
    group: String(contact.group || '未分组').trim() || '未分组',
    speedCode: String(contact.speedCode ?? '').trim(),
    phones,
    emails,
    socials,
    address: String(contact.address ?? ''),
    notes: String(contact.notes ?? ''),
    favorite: contact.favorite ? 1 : 0,
    dialCount: Math.max(0, Number(contact.dialCount) || 0),
    searchCount: Math.max(0, Number(contact.searchCount) || 0),
    lastContactAt: Math.max(0, Number(contact.lastContactAt) || 0),
    createdAt: Math.max(0, Number(contact.createdAt) || now),
    updatedAt: Math.max(0, Number(contact.updatedAt) || now),
    demo: contact.demo ? 1 : 0,
    methods: methodRows({ phones, emails, socials })
  };
}

function validateFormat(data) {
  if (data.speedCode && !/^\d{3}$/.test(data.speedCode)) {
    throw httpError(400, '键盘短码必须为 3 位数字', { path: 'speedCode', value: data.speedCode }, 'INVALID_SPEED_CODE');
  }
  for (const phone of data.phones) {
    if (!/^\d{3,20}$/.test(phone)) {
      throw httpError(400, '电话号码应为 3–20 位数字', { path: 'phones', value: phone }, 'INVALID_PHONE');
    }
  }
  for (const email of data.emails) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw httpError(400, '邮箱格式不正确', { path: 'emails', value: email }, 'INVALID_EMAIL');
    }
  }
}

function duplicatePhoneError(phone, owner) {
  return httpError(409, `电话号码 ${phone} 已被「${owner.name}」使用`, {
    path: 'phones',
    value: phone,
    contactId: owner.id,
    contactName: owner.name
  }, 'DUPLICATE_PHONE');
}

function duplicateCodeError(code, owner) {
  return httpError(409, `键盘短码 ${code} 已被「${owner.name}」使用`, {
    path: 'speedCode',
    value: code,
    contactId: owner.id,
    contactName: owner.name
  }, 'DUPLICATE_SPEED_CODE');
}

function duplicateEmailError(email, owner) {
  return httpError(409, `邮箱 ${email} 已被「${owner.name}」使用`, {
    path: 'emails',
    value: email,
    contactId: owner.id,
    contactName: owner.name
  }, 'DUPLICATE_EMAIL');
}

function validateUniqueSet(list) {
  const phoneOwners = new Map();
  const codeOwners = new Map();
  const emailOwners = new Map();
  const ids = new Set();
  for (const data of list) {
    validateFormat(data);
    if (ids.has(data.id)) {
      throw httpError(409, `批量数据中存在重复联系人 ID：${data.id}`, { path: 'id', value: data.id }, 'DUPLICATE_ID');
    }
    ids.add(data.id);
    for (const phone of data.phones) {
      if (phoneOwners.has(phone)) throw duplicatePhoneError(phone, phoneOwners.get(phone));
      phoneOwners.set(phone, data);
    }
    for (const email of data.emails) {
      const key = email.toLowerCase();
      if (emailOwners.has(key)) throw duplicateEmailError(email, emailOwners.get(key));
      emailOwners.set(key, data);
    }
    if (data.speedCode) {
      if (codeOwners.has(data.speedCode)) throw duplicateCodeError(data.speedCode, codeOwners.get(data.speedCode));
      codeOwners.set(data.speedCode, data);
    }
  }
}

function assertUnique(data, others) {
  for (const phone of data.phones) {
    const owner = others.find(contact => contact.phones.some(value => normalizePhone(value) === phone));
    if (owner) throw duplicatePhoneError(phone, owner);
  }
  for (const email of data.emails) {
    const key = email.toLowerCase();
    const owner = others.find(contact => contact.emails.some(value => String(value).trim().toLowerCase() === key));
    if (owner) throw duplicateEmailError(email, owner);
  }
  if (data.speedCode) {
    const owner = others.find(contact => contact.speedCode === data.speedCode);
    if (owner) throw duplicateCodeError(data.speedCode, owner);
  }
}

function rowToContact(row, methods) {
  const phones = [];
  const emails = [];
  const socials = [];
  for (const method of methods) {
    if (method.type === 'phone') phones.push(method.value);
    else if (method.type === 'email') emails.push(method.value);
    else if (method.type === 'social') socials.push({ platform: method.label || '其他', value: method.value });
  }
  return {
    id: row.id,
    name: row.name,
    group: row.grp,
    speedCode: row.speed_code,
    phones,
    emails,
    socials,
    address: row.address,
    notes: row.notes,
    favorite: !!row.favorite,
    dialCount: row.dial_count,
    searchCount: row.search_count,
    lastContactAt: row.last_contact_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    demo: !!row.is_demo
  };
}

export function getGroups(db) {
  const row = db.prepare("SELECT value FROM settings WHERE key = 'groups'").get();
  if (!row) return [];
  try {
    const value = JSON.parse(row.value);
    return Array.isArray(value) ? value.map(String).filter(Boolean) : [];
  } catch {
    return [];
  }
}

export function setGroups(db, groups) {
  const value = uniqueValues((Array.isArray(groups) ? groups : []).map(group => String(group).trim()).filter(Boolean));
  db.prepare("INSERT INTO settings (key, value) VALUES ('groups', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(JSON.stringify(value));
}

export function getVersion(db) {
  const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(VERSION_KEY);
  return row ? Math.max(1, Number(row.value) || 1) : 1;
}

function bumpVersion(db) {
  const next = getVersion(db) + 1;
  db.prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
    .run(VERSION_KEY, String(next));
  return next;
}

export function getContacts(db) {
  const rows = db.prepare('SELECT * FROM contacts ORDER BY created_at, name').all();
  const methods = db.prepare('SELECT contact_id, type, label, value FROM contact_methods ORDER BY contact_id, sort_order, id').all();
  const grouped = new Map();
  for (const method of methods) {
    if (!grouped.has(method.contact_id)) grouped.set(method.contact_id, []);
    grouped.get(method.contact_id).push(method);
  }
  return rows.map(row => rowToContact(row, grouped.get(row.id) || []));
}

export function getContact(db, id) {
  const row = db.prepare('SELECT * FROM contacts WHERE id = ?').get(id);
  if (!row) return null;
  const methods = db.prepare('SELECT type, label, value FROM contact_methods WHERE contact_id = ? ORDER BY sort_order, id').all(id);
  return rowToContact(row, methods);
}

function writeNormalizedContact(db, data) {
  db.prepare(`INSERT INTO contacts (id, name, grp, speed_code, address, notes, favorite, dial_count, search_count, last_contact_at, created_at, updated_at, is_demo)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      grp = excluded.grp,
      speed_code = excluded.speed_code,
      address = excluded.address,
      notes = excluded.notes,
      favorite = excluded.favorite,
      dial_count = excluded.dial_count,
      search_count = excluded.search_count,
      last_contact_at = excluded.last_contact_at,
      updated_at = excluded.updated_at,
      is_demo = excluded.is_demo`).run(
    data.id, data.name, data.group, data.speedCode, data.address, data.notes, data.favorite,
    data.dialCount, data.searchCount, data.lastContactAt, data.createdAt, data.updatedAt, data.demo
  );
  db.prepare('DELETE FROM contact_methods WHERE contact_id = ?').run(data.id);
  const insertMethod = db.prepare('INSERT INTO contact_methods (contact_id, type, label, value, sort_order) VALUES (?, ?, ?, ?, ?)');
  for (const row of data.methods) insertMethod.run(data.id, row[0], row[1], row[2], row[3]);
}

export function createContact(db, contact) {
  const data = normalize(contact);
  validateFormat(data);
  db.exec('BEGIN IMMEDIATE');
  try {
    if (getContact(db, data.id)) throw httpError(409, '联系人 ID 已存在', { path: 'id', value: data.id }, 'DUPLICATE_ID');
    assertUnique(data, getContacts(db));
    writeNormalizedContact(db, data);
    const version = bumpVersion(db);
    db.exec('COMMIT');
    return { contact: getContact(db, data.id), version };
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

export function updateContact(db, id, contact) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const existing = getContact(db, id);
    if (!existing) {
      db.exec('ROLLBACK');
      return null;
    }
    const data = normalize({ ...contact, id, createdAt: existing.createdAt, updatedAt: Date.now() });
    validateFormat(data);
    assertUnique(data, getContacts(db).filter(item => item.id !== id));
    writeNormalizedContact(db, data);
    const version = bumpVersion(db);
    db.exec('COMMIT');
    return { contact: getContact(db, id), version };
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

export function deleteContact(db, id) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = db.prepare('DELETE FROM contacts WHERE id = ?').run(id);
    if (!result.changes) {
      db.exec('ROLLBACK');
      return null;
    }
    const version = bumpVersion(db);
    db.exec('COMMIT');
    return { version };
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

export function setFavorite(db, id, isFavorite) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = db.prepare('UPDATE contacts SET favorite = ?, updated_at = ? WHERE id = ?').run(isFavorite ? 1 : 0, Date.now(), id);
    if (!result.changes) {
      db.exec('ROLLBACK');
      return null;
    }
    const version = bumpVersion(db);
    db.exec('COMMIT');
    return { contact: getContact(db, id), version };
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

export function replaceAll(db, contacts, groups, baseVersion) {
  const normalized = contacts.map(normalize);
  validateUniqueSet(normalized);
  db.exec('BEGIN IMMEDIATE');
  try {
    const currentVersion = getVersion(db);
    if (Number(baseVersion) !== currentVersion) {
      throw httpError(409, '通讯录已在其他客户端更新，请重新加载后再同步', {
        path: 'baseVersion',
        baseVersion: Number(baseVersion),
        currentVersion
      }, 'VERSION_CONFLICT');
    }
    const existing = getContacts(db);
    const incomingIds = new Set(normalized.map(contact => contact.id));
    for (const data of normalized) writeNormalizedContact(db, data);
    for (const old of existing) {
      if (!incomingIds.has(old.id)) db.prepare('DELETE FROM contacts WHERE id = ?').run(old.id);
    }
    setGroups(db, groups);
    const version = bumpVersion(db);
    db.exec('COMMIT');
    return { count: normalized.length, version };
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

export function initDb({ filename = process.env.DB_PATH || path.resolve('data/contacts.sqlite'), seed = process.env.SEED_DEMO !== 'false' } = {}) {
  if (filename !== ':memory:') mkdirSync(path.dirname(filename), { recursive: true });
  const db = new DatabaseSync(filename);
  db.exec('PRAGMA foreign_keys = ON');
  if (filename !== ':memory:') db.exec('PRAGMA journal_mode = WAL');
  db.exec(SCHEMA);
  db.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES (?, '1')").run(VERSION_KEY);
  const initialized = db.prepare("SELECT value FROM settings WHERE key = 'initialized'").get();
  if (!initialized) {
    db.exec('BEGIN IMMEDIATE');
    try {
      const groups = new Set(DEFAULT_GROUPS);
      const count = db.prepare('SELECT COUNT(*) AS count FROM contacts').get().count;
      if (seed && count === 0) {
        for (const contact of demoContacts()) {
          const data = normalize(contact);
          writeNormalizedContact(db, data);
          groups.add(data.group);
        }
      }
      setGroups(db, [...groups]);
      db.prepare("INSERT INTO settings (key, value) VALUES ('initialized', '1')").run();
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }
  return db;
}
