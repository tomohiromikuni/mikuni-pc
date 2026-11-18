'use client';
import { createBrowserClient } from '@supabase/ssr';

/** ブラウザから使うクライアント（ファイルのアップロード、チャットの即時表示など）。権限ルールが適用される */
export function createClient() {
  return createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
}
