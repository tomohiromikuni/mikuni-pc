import type { Metadata, Viewport } from 'next';
import { env } from '@/lib/env';
import './globals.css';

export const metadata: Metadata = {
  title: env.appName,
  description: '職業訓練生と事務局の情報共有アプリ',
  appleWebApp: { capable: true, title: env.appName, statusBarStyle: 'default' },
  icons: { icon: '/icon-192.png', apple: '/apple-touch-icon.png' },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: '#0b8a6b',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
