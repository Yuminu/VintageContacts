import { z } from 'zod';

export const contactSchema = z.object({
  id: z.string().min(1).max(100).optional(),
  name: z.string().trim().min(1, '联系人姓名不能为空').max(60),
  group: z.string().trim().max(30).default('未分组'),
  speedCode: z.string().trim().max(10).default(''),
  phones: z.array(z.string().max(35)).default([]),
  emails: z.array(z.string().max(150)).default([]),
  socials: z.array(z.object({
    platform: z.string().trim().max(50).default('其他'),
    value: z.string().trim().min(1).max(200)
  })).default([]),
  address: z.string().max(500).default(''),
  notes: z.string().max(10000).default(''),
  favorite: z.boolean().default(false),
  dialCount: z.number().int().min(0).default(0),
  searchCount: z.number().int().min(0).default(0),
  lastContactAt: z.number().int().min(0).default(0),
  createdAt: z.number().int().min(0).optional(),
  updatedAt: z.number().int().min(0).optional(),
  demo: z.boolean().default(false)
});

export const contactsPayloadSchema = z.object({
  contacts: z.array(contactSchema).max(5000),
  groups: z.array(z.string().trim().min(1).max(30)).max(100).default([]),
  baseVersion: z.number().int().min(0)
});

export const favoritePayloadSchema = z.object({
  isFavorite: z.boolean()
});
