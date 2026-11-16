import express from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { contactSchema, contactsPayloadSchema, favoritePayloadSchema } from './schema.js';
import {
  createContact,
  deleteContact,
  getContact,
  getContacts,
  getGroups,
  getVersion,
  replaceAll,
  setFavorite,
  updateContact
} from './db.js';

const directory = path.dirname(fileURLToPath(import.meta.url));
const defaultDist = path.resolve(directory, '../dist');

function parse(schema, body) {
  const result = schema.safeParse(body);
  if (!result.success) {
    const error = new Error('请求数据不合法');
    error.status = 400;
    error.code = 'VALIDATION_ERROR';
    error.details = result.error.issues.map(issue => ({
      path: issue.path.join('.'),
      message: issue.message,
      code: issue.code
    }));
    throw error;
  }
  return result.data;
}

export function createApp({ db, distDir = defaultDist, rateLimitEnabled = true } = {}) {
  if (!db) throw new Error('createApp 需要数据库实例');
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
  app.use(express.json({ limit: '5mb' }));

  if (rateLimitEnabled) {
    app.use('/api', rateLimit({
      windowMs: 60_000,
      limit: 300,
      standardHeaders: true,
      legacyHeaders: false
    }));
  }

  const health = (req, res) => {
    try {
      db.prepare('SELECT 1').get();
      res.json({ success: true, data: { status: 'ok', time: new Date().toISOString() } });
    } catch {
      res.status(503).json({ success: false, error: { code: 'DB_UNAVAILABLE', message: '数据库不可用' } });
    }
  };
  app.get('/healthz', health);
  app.get('/api/health', health);

  app.get('/api/contacts', (req, res) => {
    res.json({ success: true, data: { contacts: getContacts(db), groups: getGroups(db), version: getVersion(db) } });
  });

  app.put('/api/contacts', (req, res) => {
    const payload = parse(contactsPayloadSchema, req.body);
    const result = replaceAll(db, payload.contacts, payload.groups, payload.baseVersion);
    res.json({ success: true, data: result });
  });

  app.get('/api/contacts/:id', (req, res) => {
    const contact = getContact(db, req.params.id);
    if (!contact) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: '联系人不存在' } });
      return;
    }
    res.json({ success: true, data: contact });
  });

  app.post('/api/contacts', (req, res) => {
    const contact = parse(contactSchema, req.body);
    const result = createContact(db, contact);
    res.status(201).json({ success: true, data: result.contact, version: result.version, message: '联系人已创建' });
  });

  app.put('/api/contacts/:id', (req, res) => {
    const contact = parse(contactSchema, req.body);
    const result = updateContact(db, req.params.id, contact);
    if (!result) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: '联系人不存在' } });
      return;
    }
    res.json({ success: true, data: result.contact, version: result.version, message: '联系人已更新' });
  });

  app.delete('/api/contacts/:id', (req, res) => {
    const result = deleteContact(db, req.params.id);
    if (!result) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: '联系人不存在' } });
      return;
    }
    res.json({ success: true, data: { id: req.params.id }, version: result.version, message: '联系人已删除' });
  });

  app.patch('/api/contacts/:id/favorite', (req, res) => {
    const payload = parse(favoritePayloadSchema, req.body);
    const result = setFavorite(db, req.params.id, payload.isFavorite);
    if (!result) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: '联系人不存在' } });
      return;
    }
    res.json({ success: true, data: result.contact, version: result.version, message: '收藏状态已更新' });
  });

  app.use(express.static(distDir, { index: 'index.html', etag: true, maxAge: 0 }));

  app.use((req, res) => {
    if (req.path.startsWith('/api/')) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: '接口不存在' } });
      return;
    }
    res.status(404).type('text/plain').send('Not found');
  });

  app.use((error, req, res, next) => {
    if (res.headersSent) {
      next(error);
      return;
    }
    const status = error.status || (error.type === 'entity.parse.failed' ? 400 : 500);
    if (status >= 500) console.error(error);
    res.status(status).json({
      success: false,
      error: {
        code: error.code || (status >= 500 ? 'INTERNAL_ERROR' : 'BAD_REQUEST'),
        message: status >= 500 ? '服务器内部错误' : error.message,
        details: error.details
      }
    });
  });

  return app;
}
