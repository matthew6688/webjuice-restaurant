import { defineCollection, z } from 'astro:content';

const blogCollection = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string(),
    description: z.string(),
    pubDate: z.coerce.date(),
    updatedDate: z.coerce.date().optional(),
    author: z.string().default('WebJuice Team'),
    tags: z.array(z.string()).default([]),
    draft: z.boolean().default(false),
    coverImage: z.string().optional(),
  }),
});

const casesCollection = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string(),
    client: z.string(),
    industry: z.string(),
    description: z.string(),
    pubDate: z.coerce.date(),
    results: z.array(z.string()).default([]),
    draft: z.boolean().default(false),
  }),
});

const pagesCollection = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string(),
    description: z.string(),
    order: z.number().default(0),
  }),
});

export const collections = {
  blog: blogCollection,
  cases: casesCollection,
  pages: pagesCollection,
};
