'use client';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';

type Kind = 'phone' | 'tablet' | 'pc';
type Model = { id: string; label: string; w: number; h: number };

const MODELS: Record<Kind, Model[]> = {
  phone: [
    { id: 'iphone15', label: 'iPhone 15・16', w: 393, h: 852 },
    { id: 'iphonese', label: 'iPhone SE（小さめ）', w: 375, h: 667 },
    { id: 'iphonepro', label: 'iPhone 15・16 Pro Max（大きめ）', w: 430, h: 932 },
    { id: 'android', label: 'Android（一般的な大きさ）', w: 412, h: 915 },
  ],
  tablet: [
    { id: 'ipad', label: 'iPad（横向き）', w: 1180, h: 820 },
    { id: 'ipadmini', label: 'iPad mini（横向き）', w: 1133, h: 744 },
  ],
  pc: [
    { id: 'note', label: 'ノートPC（1280×800）', w: 1280, h: 800 },
    { id: 'desktop', label: 'デスクトップ（1440×900）', w: 1440, h: 900 },
  ],
};
const KIND_LABEL: Record<Kind, string> = { phone: 'スマホ', tablet: 'タブレット(横)', pc: 'PC' };

/** 枠の太さ・上の飾りの高さ（端末ごと） */
const FRAME: Record<Kind, { bezel: number; top: number; radius: number }> = {
  phone: { bezel: 12, top: 44, radius: 52 },
  tablet: { bezel: 16, top: 0, radius: 30 },
  pc: { bezel: 2, top: 36, radius: 10 },
};

const STORE_KEY = 'device-viewer';

const icons: Record<Kind, string> = {
  phone: 'M8 2h8a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zM11 18h2',
  tablet: 'M3 6h18a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1zM18 12h.01',
  pc: 'M3 4h18v12H3zM8 20h8M12 16v4',
};
function Icon({ kind, className = 'h-5 w-5' }: { kind: Kind; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={icons[kind]} />
    </svg>
  );
}

/** 訓練生の画面を、スマホ・タブレット・PC の大きさで確認する（運営メンバー用） */
export function DeviceViewer({ qr, url, start = '/home' }: { qr: string; url: string; start?: string }) {
  const [kind, setKind] = useState<Kind>('phone');
  const [modelId, setModelId] = useState<Record<Kind, string>>({ phone: 'iphone15', tablet: 'ipad', pc: 'note' });
  const [copied, setCopied] = useState(false);
  const stage = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });

  // 前回選んだ端末を覚えておく（使えなければ何もしない）
  useEffect(() => {
    try {
      const s = JSON.parse(localStorage.getItem(STORE_KEY) ?? 'null');
      if (s?.kind && MODELS[s.kind as Kind]) setKind(s.kind);
      if (s?.modelId) setModelId((m) => ({ ...m, ...s.modelId }));
    } catch {}
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({ kind, modelId }));
    } catch {}
  }, [kind, modelId]);

  useLayoutEffect(() => {
    const el = stage.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setBox({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const model = MODELS[kind].find((m) => m.id === modelId[kind]) ?? MODELS[kind][0];
  const f = FRAME[kind];
  const outerW = model.w + f.bezel * 2;
  const outerH = model.h + f.top + f.bezel * 2;
  const scale = box.w ? Math.min(1, (box.w - 32) / outerW, (box.h - 32) / outerH) : 0;
  const pct = Math.round(scale * 100);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  }

  return (
    <div className="flex h-dvh flex-col bg-[#e7ebe9] text-[#1f2a26]">
      <p className="shrink-0 border-b-2 border-amber-400 bg-amber-50 px-4 py-2 text-center text-sm font-bold text-amber-900">
        運営メンバーの確認用の表示です（お知らせの既読や回答には数えません）
      </p>

      <header className="flex shrink-0 flex-wrap items-center gap-3 border-b border-[#dfe5e2] bg-white px-4 py-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-600 text-white"><Icon kind={kind} /></span>
        <p className="min-w-0 flex-1 text-base font-bold">{KIND_LABEL[kind].replace('(横)', '')}の大きさで表示しています</p>
        <div role="radiogroup" aria-label="表示する端末" className="flex overflow-hidden rounded-xl border-2 border-brand-600">
          {(Object.keys(KIND_LABEL) as Kind[]).map((k) => (
            <button
              key={k}
              type="button"
              role="radio"
              aria-checked={kind === k}
              onClick={() => setKind(k)}
              className={`flex min-h-11 items-center gap-1.5 px-4 font-bold not-first:border-l-2 not-first:border-brand-600 ${kind === k ? 'bg-brand-600 text-white' : 'bg-white text-brand-700 hover:bg-brand-50'}`}
            >
              <Icon kind={k} />
              {KIND_LABEL[k]}
            </button>
          ))}
        </div>
        <a href={start} className="flex min-h-11 items-center gap-1.5 rounded-xl border-2 border-brand-600 px-4 font-bold text-brand-700 hover:bg-brand-50">
          <Icon kind="pc" />
          PCの幅で見る（このタブだけ）
        </a>
      </header>

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <div ref={stage} className="relative min-h-[60vh] flex-1 overflow-hidden lg:min-h-0">
          {scale > 0 && (
            <div className="absolute top-1/2 left-1/2" style={{ width: outerW * scale, height: outerH * scale, transform: 'translate(-50%, -50%)' }}>
              <div
                className="origin-top-left bg-[#1f2a26] shadow-2xl"
                style={{ width: outerW, height: outerH, padding: f.bezel, borderRadius: f.radius, transform: `scale(${scale})` }}
              >
                <div className="flex h-full w-full flex-col overflow-hidden bg-white" style={{ borderRadius: Math.max(f.radius - f.bezel, 4) }}>
                  {kind === 'phone' && (
                    <div className="relative flex shrink-0 items-center justify-between px-8 text-[15px] font-bold" style={{ height: f.top }}>
                      <span>9:41</span>
                      <span className="absolute top-2 left-1/2 h-7 w-28 -translate-x-1/2 rounded-full bg-[#1f2a26]" aria-hidden />
                      <span className="text-xs tracking-tight" aria-hidden>▂▄▆ ▮</span>
                    </div>
                  )}
                  {kind === 'pc' && (
                    <div className="flex shrink-0 items-center gap-2 bg-[#eef1f0] px-3" style={{ height: f.top }}>
                      <span className="h-3 w-3 rounded-full bg-red-400" />
                      <span className="h-3 w-3 rounded-full bg-amber-400" />
                      <span className="h-3 w-3 rounded-full bg-green-500" />
                      <span className="ml-3 flex-1 truncate rounded-md bg-white px-3 py-1 text-xs text-[#5d6b66]">{url}</span>
                    </div>
                  )}
                  <iframe key={kind + model.id} src={start} title={`${model.label}での表示`} className="block w-full flex-1 border-0 bg-white" />
                </div>
              </div>
            </div>
          )}
        </div>

        <aside className="w-full shrink-0 space-y-4 overflow-y-auto border-t border-[#dfe5e2] bg-[#f4f6f5] p-4 lg:w-80 lg:border-t-0 lg:border-l">
          <section className="space-y-3 rounded-2xl border border-[#dfe5e2] bg-white p-4">
            <div className="flex gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={qr} alt="アプリを開くQRコード" className="h-28 w-28 shrink-0 rounded-lg border border-[#dfe5e2]" />
              <div>
                <h2 className="text-lg font-bold">スマホで開く</h2>
                <p className="text-sm leading-relaxed">カメラで読み取ると、このアプリがスマホで開きます。</p>
              </div>
            </div>
            <p className="text-sm break-all text-[#5d6b66]">{url}</p>
            <button type="button" onClick={copy} className="min-h-11 w-full rounded-xl border-2 border-brand-600 font-bold text-brand-700 hover:bg-brand-50">
              {copied ? 'コピーしました' : 'アドレスをコピー'}
            </button>
          </section>

          <a href="/admin" className="flex min-h-12 items-center justify-center rounded-xl border-2 border-brand-600 bg-white font-bold text-brand-700 hover:bg-brand-50">
            ‹ 管理画面に戻る
          </a>

          <label className="block space-y-1.5">
            <span className="text-sm font-bold">機種</span>
            <select value={model.id} onChange={(e) => setModelId((m) => ({ ...m, [kind]: e.target.value }))} className="w-full">
              {MODELS[kind].map((m) => (
                <option key={m.id} value={m.id}>{m.label}</option>
              ))}
            </select>
          </label>
          <p className="text-sm leading-relaxed text-[#5d6b66]">
            {model.label}で開いたときと同じ範囲（横{model.w}×縦{model.h}）を見せています。
            {pct > 0 && pct < 100 && `画面に入るように、本来の${pct}%に縮めています（見える範囲は同じです）。`}
          </p>
        </aside>
      </div>
    </div>
  );
}
