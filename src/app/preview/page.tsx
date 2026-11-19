import QRCode from 'qrcode';
import type { Metadata } from 'next';
import { DeviceViewer } from '@/components/DeviceViewer';
import { requireStaff } from '@/lib/auth';
import { env } from '@/lib/env';

export const metadata: Metadata = { title: '訓練生の画面を見る' };

/** 運営メンバー用：訓練生の画面を、スマホ・タブレット・PCの大きさで確認する */
export default async function PreviewPage() {
  await requireStaff();
  const url = `${env.siteUrl()}/`;
  const qr = await QRCode.toDataURL(url, { width: 300, margin: 1 });
  return <DeviceViewer qr={qr} url={url} />;
}
