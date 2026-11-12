import type { Metadata, Viewport } from 'next';
import { Barlow, Barlow_Condensed, DM_Mono } from 'next/font/google';
import './globals.css';

const barlow = Barlow({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800', '900'],
});

// Acme Hire brand type system, matching the Trader Briefing / Quote Tool apps:
// Barlow Condensed for display headings, DM Mono for uppercase eyebrow/tag labels.
const barlowCondensed = Barlow_Condensed({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800', '900'],
  variable: '--font-condensed',
});

const dmMono = DM_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-mono-brand',
});

export const metadata: Metadata = {
  title: 'Acme Hire — Handover',
  description: 'Acme Hire unit handover and condition record system',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full">
      <body className={`${barlow.className} ${barlowCondensed.variable} ${dmMono.variable} min-h-full bg-gray-50 text-gray-900 antialiased`}>
        {children}
      </body>
    </html>
  );
}
