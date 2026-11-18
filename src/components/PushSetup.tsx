'use client';
import { useEffect, useState } from 'react';
import { deletePushSubscription, savePushSubscription } from '@/app/push-actions';
import { Button } from '@/components/ui';

type State = 'loading' | 'unsupported' | 'ios-install' | 'off' | 'on' | 'denied';

function urlBase64ToUint8Array(base64: string) {
  const pad = '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

const isIos = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;

/** 通知の オン/オフ。iPhone でホーム画面に追加していない場合は手順を案内 */
export function PushSetup({ vapidKey, compact = false, audience = 'trainee' }: { vapidKey: string; compact?: boolean; audience?: 'trainee' | 'staff' }) {
  const [state, setState] = useState<State>('loading');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      if (!('serviceWorker' in navigator)) return setState('unsupported');
      await navigator.serviceWorker.register('/sw.js');
      if (!('PushManager' in window) || !('Notification' in window)) return setState(isIos() && !isStandalone() ? 'ios-install' : 'unsupported');
      if (Notification.permission === 'denied') return setState('denied');
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      setState(sub ? 'on' : 'off');
    })().catch(() => setState('unsupported'));
  }, []);

  async function enable() {
    setBusy(true);
    setError(null);
    try {
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') {
        setState(perm === 'denied' ? 'denied' : 'off');
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(vapidKey) });
      const r = await savePushSubscription(sub.toJSON() as never, navigator.userAgent);
      if (r.error) throw new Error(r.error);
      setState('on');
    } catch (e) {
      setError('通知をオンにできませんでした：' + (e instanceof Error ? e.message : ''));
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) {
      await deletePushSubscription(sub.endpoint);
      await sub.unsubscribe();
    }
    setState('off');
    setBusy(false);
  }

  if (!vapidKey) return compact ? null : <p className="muted text-sm">通知機能は準備中です（管理者が設定するまでお待ちください）。</p>;
  if (state === 'loading') return null;
  if (compact && state !== 'off' && state !== 'ios-install') return null;

  const box = compact ? 'rounded-2xl border-2 border-brand-500 bg-brand-50 p-4 text-brand-700' : '';
  return (
    <div className={`space-y-2 ${box}`}>
      {state === 'on' && (
        <>
          <p className="font-bold">🔔 この端末で通知を受け取っています</p>
          {audience === 'trainee' && <p className="muted text-xs">平日20時〜翌7時・土日・祝日・休校日は通知せず、翌朝7時（休み明け）にまとめてお知らせします。</p>}
          <Button variant="secondary" onClick={disable} disabled={busy}>この端末の通知を止める</Button>
        </>
      )}
      {state === 'off' && (
        <>
          <p className="font-bold">🔔 {audience === 'trainee' ? '新しいお知らせやメッセージを通知で受け取れます' : '訓練生からのメッセージを通知で受け取れます'}</p>
          <Button onClick={enable} disabled={busy}>{busy ? '設定中…' : '通知を受け取る'}</Button>
        </>
      )}
      {state === 'ios-install' && (
        <>
          <p className="font-bold">🔔 iPhoneで通知を受け取るには</p>
          <ol className="list-decimal pl-5 text-sm">
            <li>Safariの下にある共有ボタン（□に↑）を押す</li>
            <li>「ホーム画面に追加」を選ぶ</li>
            <li>ホーム画面にできたアイコンから開き直す</li>
            <li>この画面の「通知を受け取る」を押す</li>
          </ol>
          <p className="muted text-xs">iOS 16.4以上が必要です。</p>
        </>
      )}
      {state === 'denied' && !compact && (
        <p className="text-sm">通知がブロックされています。スマホの「設定」→ このアプリ（またはブラウザ）→「通知」を許可してから、もう一度開いてください。</p>
      )}
      {state === 'unsupported' && !compact && <p className="muted text-sm">この端末・ブラウザは通知に対応していません。アプリを開けばお知らせは確認できます。</p>}
      {error && <p className="text-sm font-semibold text-red-700">{error}</p>}
    </div>
  );
}
