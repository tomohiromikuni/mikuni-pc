import type { MetadataRoute } from 'next';
import { env } from '@/lib/env';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: env.appName,
    short_name: env.appName,
    start_url: '/',
    display: 'standalone',
    background_color: '#f4f6f5',
    theme_color: '#0b8a6b',
    lang: 'ja',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
