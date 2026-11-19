'use client';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { finalizeAnnouncement, saveAnnouncementDraft } from '@/app/admin/announcements/actions';
import { FilePicker } from '@/components/FilePicker';
import { Card, Field } from '@/components/ui';
import { uploadAttachment } from '@/lib/upload';

export type ComposerTargets = { all: boolean; total: number; courses: { id: string; name: string; count: number }[] };

/**
 * お知らせ作成フォーム（デザイン案A：左で入力・右に訓練生のスマホでの見え方）。
 * 保存 → 添付をアップロード → 配信 の順に行う。
 */
export function AnnouncementComposer({ targets }: { targets: ComposerTargets }) {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [picked, setPicked] = useState<string[]>([]);
  const [scheduling, setScheduling] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const people = useMemo(() => {
    if (picked.includes('all')) return targets.total;
    return targets.courses.filter((c) => picked.includes(`course:${c.id}`)).reduce((n, c) => n + c.count, 0);
  }, [picked, targets]);

  const toggle = (v: string) => setPicked((p) => (p.includes(v) ? p.filter((x) => x !== v) : [...p, v]));

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    const fd = new FormData(e.currentTarget, submitter);
    const mode = String(fd.get('mode') ?? 'now');
    setBusy('保存しています…');
    const draft = await saveAnnouncementDraft(fd);
    if ('error' in draft) {
      setError(draft.error);
      setBusy(null);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    const failed: string[] = [];
    for (const [i, f] of files.entries()) {
      setBusy(`ファイルを送信中…（${i + 1}/${files.length}）`);
      const r = await uploadAttachment(f, { orgId: draft.orgId, folder: `announcements/${draft.id}`, kind: 'announcement', announcementId: draft.id });
      if (r.error) failed.push(r.error);
    }
    if (failed.length) {
      // 添付に失敗したら配信せず、下書きのまま詳細画面へ
      router.push(`/admin/announcements/${draft.id}?error=` + encodeURIComponent('添付に失敗したため下書きで保存しました：' + failed.join(' / ')));
      return;
    }
    setBusy(mode === 'draft' ? '保存しています…' : '配信しています…');
    const r = await finalizeAnnouncement(draft.id, mode, String(fd.get('publish_at') ?? ''));
    router.push(r.url ?? `/admin/announcements/${draft.id}`);
  }

  const preview = <PhonePreview title={title} body={body} files={files} />;

  return (
    <form onSubmit={onSubmit} className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
      <div className="min-w-0 space-y-4">
        {error && <p role="alert" className="rounded-xl border border-red-300 bg-red-50 p-3 font-semibold text-red-800">{error}</p>}
        <Card className="space-y-4">
          <Field label="タイトル（必須）">
            <input name="title" value={title} onChange={(e) => setTitle(e.target.value)} required maxLength={200} />
          </Field>
          <Field label="本文">
            <textarea name="body" rows={7} value={body} onChange={(e) => setBody(e.target.value)} />
          </Field>
          <FilePicker files={files} onChange={setFiles} disabled={!!busy} />
        </Card>

        {/* スマホでは、プレビューは押したときだけ開く */}
        <details className="surface rounded-2xl border lg:hidden">
          <summary className="cursor-pointer px-4 py-3 font-bold text-brand-700">訓練生のスマホでの見え方を見る</summary>
          <div className="flex justify-center pb-4">{preview}</div>
        </details>

        <Card className="space-y-3">
          <h2 className="font-bold">宛先</h2>
          <div className="flex flex-wrap gap-2">
            {targets.all && (
              <Chip checked={picked.includes('all')} onChange={() => toggle('all')} value="all">
                受講中の全員{targets.total > 0 && `（${targets.total}人）`}
              </Chip>
            )}
            {targets.courses.map((c) => (
              <Chip key={c.id} checked={picked.includes(`course:${c.id}`)} onChange={() => toggle(`course:${c.id}`)} value={`course:${c.id}`}>
                {c.name}（{c.count}人）
              </Chip>
            ))}
          </div>
          {!targets.all && targets.courses.length === 0 && <p className="text-red-700">送れる宛先がありません。先に「訓練生」画面で期を作ってください。</p>}
          <p className="muted text-xs">複数の期を選ぶと、重複なく1回だけ届きます。</p>
        </Card>

        {scheduling && (
          <Card className="flex flex-wrap items-end gap-3">
            <Field label="配信する日時">
              <input type="datetime-local" name="publish_at" required className="max-w-60" />
            </Field>
            <button type="submit" name="mode" value="schedule" disabled={!!busy} className="min-h-11 rounded-xl bg-brand-600 px-5 font-bold text-white disabled:opacity-60">
              この日時で予約する
            </button>
            <button type="button" onClick={() => setScheduling(false)} className="muted min-h-11 px-2 text-sm font-bold underline">やめる</button>
          </Card>
        )}

        <div className="flex flex-wrap items-center gap-2">
          {busy ? (
            <p className="flex min-h-12 items-center gap-2 font-bold text-brand-700" role="status">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden />
              {busy}
            </p>
          ) : (
            <>
              {!scheduling && (
                <button type="submit" name="mode" value="now" className="min-h-12 rounded-xl bg-brand-600 px-6 text-base font-bold text-white hover:brightness-95">
                  {people > 0 ? `${people}人に送る` : '送る'}
                </button>
              )}
              {!scheduling && (
                <button type="button" onClick={() => setScheduling(true)} className="surface min-h-12 rounded-xl border px-4 font-bold hover:brightness-95">
                  日時を予約
                </button>
              )}
              <button type="submit" name="mode" value="draft" formNoValidate className="muted min-h-12 px-3 font-bold hover:underline">
                下書き保存
              </button>
            </>
          )}
        </div>
      </div>

      {/* PC：右側にいつも表示 */}
      <aside className="hidden lg:block">
        <div className="sticky top-6 flex flex-col items-center gap-2">
          <p className="muted text-sm font-bold">訓練生のスマホでの見え方</p>
          {preview}
          <p className="muted text-xs">入力すると、すぐに反映されます</p>
        </div>
      </aside>
    </form>
  );
}

function Chip({ checked, onChange, value, children }: { checked: boolean; onChange: () => void; value: string; children: React.ReactNode }) {
  return (
    <label
      className={`flex min-h-10 cursor-pointer items-center gap-2 rounded-full border-2 px-4 text-sm ${checked ? 'border-brand-600 bg-brand-50 font-bold text-brand-700' : 'line surface'}`}
    >
      <input type="checkbox" name="target" value={value} checked={checked} onChange={onChange} />
      {children}
    </label>
  );
}

/** 訓練生のスマホで開いたときの見た目（実際の画面と同じ並び） */
function PhonePreview({ title, body, files }: { title: string; body: string; files: File[] }) {
  // 画像はその場で小さく表示する
  const [urls, setUrls] = useState<string[]>([]);
  useEffect(() => {
    const u = files.map((f) => (f.type.startsWith('image/') ? URL.createObjectURL(f) : ''));
    setUrls(u);
    return () => u.forEach((x) => x && URL.revokeObjectURL(x));
  }, [files]);

  return (
    <div className="flex h-[540px] w-[270px] flex-col overflow-hidden rounded-[34px] border-8 border-[#1f2a26] bg-[#f4f6f5] text-[#1f2a26]" aria-label="プレビュー">
      <div className="flex h-10 shrink-0 items-center bg-brand-600 px-3 text-xs font-bold text-white">‹ お知らせ一覧</div>
      <div className="flex-1 space-y-2 overflow-y-auto p-3">
        <p className={`text-base leading-snug font-bold break-words ${title ? '' : 'opacity-40'}`}>{title || 'タイトル'}</p>
        <p className="text-[11px] text-[#5d6b66]">いま</p>
        <div className={`rounded-xl border border-[#dfe5e2] bg-white p-2.5 text-[13px] leading-relaxed whitespace-pre-wrap break-words ${body ? '' : 'opacity-40'}`}>
          {body || '本文がここに表示されます'}
        </div>
        {files.map((f, i) =>
          urls[i] ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={i} src={urls[i]} alt={f.name} className="w-full rounded-xl" />
          ) : (
            <div key={i} className="flex items-center gap-2 rounded-xl border border-[#dfe5e2] bg-white px-2.5 py-2 text-xs">
              <span className="rounded bg-red-600 px-1 text-[9px] font-bold text-white">{(f.name.split('.').pop() ?? '').toUpperCase().slice(0, 4)}</span>
              <span className="min-w-0 flex-1 truncate">{f.name}</span>
            </div>
          ),
        )}
      </div>
    </div>
  );
}
