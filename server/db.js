import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { demoContacts } from '../dist/data.js';

export const DEFAULT_GROUPS = ['家人', '朋友', '大学同学', '同事', '老师'];

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

function methodRows(contact) {
  const rows = [];
  for (const value of Array.isArray(contact.phones) ? contact.phones : []) {
    const text = String(value ?? '').trim();
    if (text) rows.push(['phone', '', text, rows.length]);
  }
  for (const value of Array.isArray(contact.emails) ? contact.emails : []) {
    const text = String(value ?? '').trim();
    if (text) rows.push(['email', '', text, rows.length]);
  }
  for (const social of Array.isArray(contact.socials) ? contact.socials : []) {
    const text = String(social?.value ?? '').trim();
    if (text) rows.push(['social', String(social?.platform || '其他').trim() || '其他', text, rows.length]);
  }
  return rows;
}

function normalize(contact) {
  const name = String(contact.name ?? '').trim();
  if (!name) {
    const error = new Error('联系人姓名不能为空');
    error.status = 400;
    throw error;
  }
  const now = Date.now();
  return {
    id: String(contact.id || randomUUID()),
    name,
    group: String(contact.group || '未分组').trim() || '未分组',
    speedCode: String(contact.speedCode ?? '').trim(),
    address: String(contact.address ?? ''),
    notes: String(contact.notes ?? ''),
    favorite: contact.favorite ? 1 : 0,
    dialCount: Math.max(0, Number(contact.dialCount) || 0),
    searchCount: Math.max(0, Number(contact.searchCount) || 0),
    lastContactAt: Math.max(0, Number(contact.lastContactAt) || 0),
    createdAt: Math.max(0, Number(contact.createdAt) || now),
    updatedAt: Math.max(0, Number(contact.updatedAt) || now),
    demo: contact.demo ? 1 : 0,
    methods: methodRows(contact)
  };
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
  const value = [...new Set((Array.isArray(groups) ? groups : []).map(group => String(group).trim()).filter(Boolean))];
  db.prepare("INSERT INTO settings (key, value) VALUES ('groups', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(JSON.stringify(value));
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
  db.exec('BEGIN IMMEDIATE');
  try {
    writeNormalizedContact(db, data);
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
  return getContact(db, data.id);
}

export function updateContact(db, id, contact) {
  const existing = getContact(db, id);
  if (!existing) return null;
  const data = normalize({ ...contact, id, createdAt: existing.createdAt, updatedAt: Date.now() });
  db.exec('BEGIN IMMEDIATE');
  try {
    writeNormalizedContact(db, data);
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
  return getContact(db, id);
}

export function deleteContact(db, id) {
  const result = db.prepare('DELETE FROM contacts WHERE id = ?').run(id);
  return result.changes > 0;
}

export function setFavorite(db, id, isFavorite) {
  const result = db.prepare('UPDATE contacts SET favorite = ?, updated_at = ? WHERE id = ?').run(isFavorite ? 1 : 0, Date.now(), id);
  if (!result.changes) return null;
  return getContact(db, id);
}

export function replaceAll(db, contacts, groups) {
  const normalized = contacts.map(normalize);
  db.exec('BEGIN IMMEDIATE');
  try {
    db.exec('DELETE FROM contact_methods');
    db.exec('DELETE FROM contacts');
    for (const data of normalized) writeNormalizedContact(db, data);
    setGroups(db, groups);
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
  return normalized.length;
}

export function initDb({ filename = process.env.DB_PATH || path.resolve('data/contacts.sqlite'), seed = process.env.SEED_DEMO !== 'false' } = {}) {
  if (filename !== ':memory:') mkdirSync(path.dirname(filename), { recursive: true });
  const db = new DatabaseSync(filename);
  db.exec('PRAGMA foreign_keys = ON');
  if (filename !== ':memory:') db.exec('PRAGMA journal_mode = WAL');
  db.exec(SCHEMA);
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
