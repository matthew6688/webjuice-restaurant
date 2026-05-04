import fs from 'node:fs';
import path from 'node:path';
import { siteConfig } from '../config/site';

const CONTENT_PATH = process.env.WEBJUICE_CONTENT_PATH || 'src/data/content.restaurant.json';
const DESIGN_PATH = process.env.WEBJUICE_DESIGN_PATH || 'src/data/design.restaurant.json';
const CHECKOUT_PATH = process.env.WEBJUICE_CHECKOUT_PATH || 'src/data/checkout.json';

export function loadRestaurantContent() {
  const content = readJson(CONTENT_PATH) || fallbackContent();
  const hasRealMenu = Array.isArray(content.menu?.sections) && content.menu.sections.length > 0;
  if (process.env.WEBJUICE_REQUIRE_ARTIFACTS === 'true' && !hasRealMenu) {
    throw new Error(`Restaurant content artifact with menu.sections is required: ${CONTENT_PATH}`);
  }
  return content;
}

export function loadRestaurantDesign() {
  return readJson(DESIGN_PATH) || {
    tokens: {
      palette: {
        background: '#f5f1e8',
        surface: '#ffffff',
        ink: '#17120e',
        accent: '#b9802f',
        muted: '#7c6b5b',
      },
    },
    directions: [],
  };
}

export function loadCheckoutArtifact() {
  return readJson(CHECKOUT_PATH) || {
    tiers: [],
    feedbackUrl: '',
  };
}

export function firstImage(content: any) {
  return content.gallery?.find((item: any) => item.type === 'image' && item.url)?.url
    || content.brand?.ogImage
    || '';
}

export function supportingImages(content: any) {
  return (content.gallery || [])
    .filter((item: any) => item.type === 'image' && item.url)
    .map((item: any) => item.url)
    .filter((url: string, index: number, list: string[]) => list.indexOf(url) === index)
    .slice(1, 4);
}

export function paletteVars(design: any) {
  const palette = design.tokens?.palette || {};
  return {
    '--wj-bg': palette.surface || '#f5f1e8',
    '--wj-surface': '#ffffff',
    '--wj-ink': palette.ink || '#17120e',
    '--wj-accent': palette.accent || '#b9802f',
    '--wj-muted': palette.muted || '#7c6b5b',
  };
}

function readJson(filePath: string) {
  const resolved = path.resolve(process.cwd(), filePath);
  if (!fs.existsSync(resolved)) return null;
  return JSON.parse(fs.readFileSync(resolved, 'utf8'));
}

function fallbackContent() {
  const phone = (siteConfig as any).phone || '';
  const address = (siteConfig as any).address || '';
  return {
    hero: {
      name: siteConfig.name,
      cuisine: 'restaurant',
      rating: null,
      reviewCount: 0,
      tagline: siteConfig.tagline,
    },
    contact: {
      phone,
      email: siteConfig.email,
      address,
      website: '',
      googleMapsUrl: address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}` : '',
    },
    cta: {
      callUrl: phone ? `tel:${phone.replace(/[^+\d]/g, '')}` : '',
      mapUrl: address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}` : '',
      reserveUrl: '',
    },
    menu: {
      sourceUrl: '',
      sections: [],
    },
    gallery: [],
    brand: {
      logo: '',
      colors: [],
      ogImage: '',
    },
  };
}
