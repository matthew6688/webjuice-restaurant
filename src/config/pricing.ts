export interface PricingTier {
  id: string;
  name: string;
  price: number;
  description: string;
  features: string[];
}

export interface NichePricing {
  niche: string;
  label: string;
  tiers: PricingTier[];
}

export const nichePricing: Record<string, NichePricing> = {
  restaurant: {
    niche: 'restaurant',
    label: 'Restaurant & Cafe',
    tiers: [
      {
        id: 'starter',
        name: 'Starter',
        price: 199,
        description: 'Simple menu and contact site',
        features: ['Template customization', 'Logo & brand colors', 'Digital menu page', 'Contact form', 'Mobile responsive'],
      },
      {
        id: 'pro',
        name: 'Pro',
        price: 399,
        description: 'Full restaurant website with gallery',
        features: ['Everything in Starter', 'Photo gallery', 'Reservation form', 'Reviews section', 'Social media links', 'Hours & location'],
      },
    ],
  },
};

export function getPricing(niche: string): NichePricing {
  return nichePricing[niche] || nichePricing.restaurant;
}
