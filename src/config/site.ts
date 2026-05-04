export interface SiteConfig {
  name: string;
  tagline: string;
  description: string;
  email: string;
  domain: string;
  fromName: string;
  navLinks: { label: string; href: string }[];
  footer: { text: string };
}

export const siteConfig: SiteConfig = {
  name: 'Bistro Template',
  tagline: 'Modern Dining, Timeless Flavor',
  description: 'A beautiful website template for restaurants, cafes, and food businesses.',
  email: 'hello@bistro.template',
  domain: 'restaurant.webjuice.fengtalk.ai',
  fromName: 'Bistro Template',
  navLinks: [
    { label: 'Home', href: '/' },
    { label: 'Menu', href: '/menu' },
    { label: 'About', href: '/about' },
    { label: 'Contact', href: '/contact' },
  ],
  footer: {
    text: 'Built with WebJuice Stack.',
  },
};
