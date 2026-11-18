import QRCode from 'qrcode';
import Link from 'next/link';
import { PrintButton } from '@/components/PrintButton';
import { requireStaff } from '@/lib/auth';
import { env } from '@/lib/env';
import { createClient } from '@/lib/supabase/server';

export default async function JoinQrPage() {
  await requireStaff();
  const url = `${env.siteUrl()}/join`;
  const qr = await QRCode.toDataURL(url, { width: 600, margin: 1 });
  const supabase = await createClient();
  const { data: open } = await supabase.from('classes').select('name, courses(name)').eq('open_for_signup', true).eq('archived', false);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 print:hidden">
        <Link href="/admin/courses" className="text-sm font-bold text-brand-700">‹ コース・クラス</Link>
        <PrintButton />
      </div>
      <p className="text-sm print:hidden">
        このQRは全員共通です。教室に掲示したり、オリエンテーション資料に印刷してください。
        いま登録を受け付けているクラス：
        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
        <strong>{(open ?? []).map((k: any) => `${k.courses?.name} / ${k.name}`).join('、') || 'なし（コース・クラス画面で「登録受付中」にしてください）'}</strong>
      </p>
      <div className="mx-auto max-w-md rounded-2xl border-2 border-gray-300 bg-white p-8 text-center text-black">
        <p className="text-lg font-bold">{env.appName}</p>
        <p className="mt-1 text-2xl font-bold">訓練生の登録はこちら</p>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={qr} alt="登録用QRコード" className="mx-auto my-4 w-64" />
        <ol className="mx-auto max-w-xs list-decimal pl-5 text-left text-sm leading-relaxed">
          <li>スマホのカメラでQRコードを読み取る</li>
          <li>何期生・クラスを選び、名前と携帯番号を入力</li>
          <li>パスワードを決めて登録</li>
          <li>ホーム画面に追加すると便利です</li>
        </ol>
        <p className="mt-4 text-xs break-all">{url}</p>
      </div>
    </div>
  );
}
