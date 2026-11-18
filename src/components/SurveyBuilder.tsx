'use client';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent, type ReactNode } from 'react';
import { createSurvey } from '@/app/admin/surveys/actions';
import { Button, Card, Field } from '@/components/ui';

type Q = { kind: 'single' | 'multi' | 'text'; label: string; required: boolean; options: string[] };
const KIND_LABEL = { single: '1つ選ぶ', multi: '複数選べる', text: '自由に記入' };

export function SurveyBuilder({ kind, targetPicker, defaultDate }: { kind: 'attendance' | 'survey'; targetPicker: ReactNode; defaultDate: string }) {
  const router = useRouter();
  const [qs, setQs] = useState<Q[]>([{ kind: 'single', label: '', required: true, options: ['', ''] }]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [date, setDate] = useState(defaultDate);

  const upd = (i: number, patch: Partial<Q>) => setQs(qs.map((q, j) => (j === i ? { ...q, ...patch } : q)));

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);
    const r = await createSurvey({
      kind,
      title: String(f.get('title') ?? ''),
      description: String(f.get('description') ?? ''),
      target_date: String(f.get('target_date') ?? ''),
      due_local: String(f.get('due') ?? ''),
      targets: f.getAll('target').map(String),
      mode: String(f.get('mode')) === 'draft' ? 'draft' : 'now',
      questions: qs.map((q) => ({ ...q, options: q.kind === 'text' ? [] : q.options.map((o) => o.trim()).filter(Boolean) })),
    });
    if (r.error) {
      setError(r.error);
      setBusy(false);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    router.push(r.url!);
  }

  const d = date ? new Date(date + 'T00:00:00') : null;
  const autoTitle = d ? `${d.getMonth() + 1}/${d.getDate()}(${'日月火水木金土'[d.getDay()]}) の出欠確認` : '出欠確認';

  return (
    <form onSubmit={submit} className="space-y-4">
      {error && <p role="alert" className="rounded-xl border border-red-300 bg-red-50 p-3 font-semibold text-red-800">{error}</p>}
      <Card className="space-y-4">
        {kind === 'attendance' && (
          <Field label="対象日"><input type="date" name="target_date" value={date} onChange={(e) => setDate(e.target.value)} required /></Field>
        )}
        <Field label="タイトル">
          <input name="title" required maxLength={200} key={kind === 'attendance' ? autoTitle : 'survey'} defaultValue={kind === 'attendance' ? autoTitle : ''} />
        </Field>
        <Field label="説明（任意）"><textarea name="description" rows={3} /></Field>
        <Field label="回答期限（任意）" hint="期限を過ぎると自動で締め切ります">
          <input type="datetime-local" name="due" className="max-w-64" />
        </Field>
        {kind === 'attendance' && <p className="rounded-xl bg-brand-50 p-3 text-sm text-brand-700">選択肢は「出席・欠席・遅刻」と「連絡事項（任意の記入欄）」が自動で入ります。</p>}
      </Card>

      {kind === 'survey' && (
        <div className="space-y-3">
          {qs.map((q, i) => (
            <Card key={i} className="space-y-3">
              <div className="flex flex-wrap items-center gap-3">
                <span className="font-bold">質問{i + 1}</span>
                <select value={q.kind} onChange={(e) => upd(i, { kind: e.target.value as Q['kind'] })} className="w-auto" aria-label="回答の形式">
                  {Object.entries(KIND_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
                <label className="flex items-center gap-1.5 font-normal"><input type="checkbox" checked={q.required} onChange={(e) => upd(i, { required: e.target.checked })} /> 必須</label>
                {qs.length > 1 && <button type="button" className="ml-auto text-sm text-red-700 underline" onClick={() => setQs(qs.filter((_, j) => j !== i))}>この質問を削除</button>}
              </div>
              <input value={q.label} onChange={(e) => upd(i, { label: e.target.value })} placeholder="質問文" aria-label={`質問${i + 1}の文`} maxLength={500} />
              {q.kind !== 'text' && (
                <div className="space-y-2 pl-4">
                  {q.options.map((o, j) => (
                    <div key={j} className="flex gap-2">
                      <input value={o} onChange={(e) => upd(i, { options: q.options.map((x, k) => (k === j ? e.target.value : x)) })} placeholder={`選択肢${j + 1}`} aria-label={`選択肢${j + 1}`} maxLength={200} />
                      {q.options.length > 2 && <button type="button" className="shrink-0 text-sm text-red-700" aria-label="選択肢を削除" onClick={() => upd(i, { options: q.options.filter((_, k) => k !== j) })}>✕</button>}
                    </div>
                  ))}
                  <button type="button" className="text-sm font-bold text-brand-700" onClick={() => upd(i, { options: [...q.options, ''] })}>＋ 選択肢を追加</button>
                </div>
              )}
            </Card>
          ))}
          <Button type="button" variant="secondary" onClick={() => setQs([...qs, { kind: 'single', label: '', required: true, options: ['', ''] }])}>＋ 質問を追加</Button>
        </div>
      )}

      {targetPicker}

      <Card className="space-y-2">
        <label className="flex items-center gap-2 font-normal"><input type="radio" name="mode" value="now" defaultChecked /> 今すぐ配信</label>
        <label className="flex items-center gap-2 font-normal"><input type="radio" name="mode" value="draft" /> 下書きとして保存</label>
      </Card>
      <Button type="submit" disabled={busy}>{busy ? '保存しています…' : '保存・配信する'}</Button>
    </form>
  );
}
