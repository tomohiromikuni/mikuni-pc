import type { Permission } from '@/lib/types';

export const PERMISSIONS: { key: Permission; label: string; hint: string }[] = [
  { key: 'announce', label: 'お知らせの配信', hint: '担当範囲にお知らせを作成・配信できる' },
  { key: 'chat', label: 'チャットの閲覧・返信', hint: '担当範囲の訓練生との個別チャットを見て返信できる' },
  { key: 'survey', label: '出欠・アンケート', hint: '作成・配信・集計ができる' },
  { key: 'manage_trainees', label: '訓練生の登録・編集', hint: '登録・所属変更・招待の発行ができる' },
  { key: 'view_pii', label: '連絡先の閲覧', hint: '訓練生のメールアドレス・電話番号を見られる' },
];
