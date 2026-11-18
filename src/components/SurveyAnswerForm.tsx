'use client';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { submitAnswer } from '@/app/(trainee)/answers/actions';
import { Button } from '@/components/ui';

type Q = { id: string; kind: 'single' | 'multi' | 'text'; label: string; required: boolean; options: { id: string; label: string }[] };
type Prev = Record<string, { optionIds: string[]; text: string }>;

const ATT_STYLE: Record<string, string> = {
  出席: 'peer-checked:bg-brand-600 peer-checked:border-brand-600',
  欠席: 'peer-checked:bg-red-600 peer-checked:border-red-600',
  遅刻: 'peer-checked:bg-amber-500 peer-checked:border-amber-500',
};

export function SurveyAnswerForm({ surveyId, questions, previous, attendance, readOnly }: { surveyId: string; questions: Q[]; previous: Prev; attendance: boolean; readOnly: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const answers = questions.map((q) => ({
      question_id: q.id,
      option_ids: q.kind === 'text' ? [] : f.getAll(`q-${q.id}`).map(String),
      text: q.kind === 'text' ? String(f.get(`q-${q.id}`) ?? '') : '',
    }));
    setBusy(true);
    setError(null);
    const r = await submitAnswer(surveyId, answers);
    setBusy(false);
    if (r.error) setError(r.error);
    else router.push('/answers?tab=done');
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      {questions.map((q, i) => (
        <fieldset key={q.id} disabled={readOnly} className="surface space-y-3 rounded-2xl border p-4">
          <legend className="sr-only">{q.label}</legend>
          <p className="font-bold">
            {!attendance && <span className="mr-1">Q{i + 1}.</span>}
            {q.label}
            {q.required ? <span className="ml-2 text-xs text-red-700">必須</span> : <span className="muted ml-2 text-xs">任意</span>}
          </p>
          {q.kind === 'text' ? (
            <textarea name={`q-${q.id}`} rows={3} maxLength={2000} defaultValue={previous[q.id]?.text ?? ''} />
          ) : attendance ? (
            <div className="grid grid-cols-3 gap-2">
              {q.options.map((o) => (
                <label key={o.id} className="font-bold">
                  <input type="radio" name={`q-${q.id}`} value={o.id} defaultChecked={previous[q.id]?.optionIds.includes(o.id)} className="peer sr-only" required={q.required} />
                  <span className={`surface flex h-16 cursor-pointer items-center justify-center rounded-2xl border-2 text-lg peer-checked:text-white peer-focus-visible:outline-2 ${ATT_STYLE[o.label] ?? 'peer-checked:bg-brand-600'}`}>{o.label}</span>
                </label>
              ))}
            </div>
          ) : (
            <div className="space-y-2">
              {q.options.map((o) => (
                <label key={o.id} className="flex min-h-11 items-center gap-3 rounded-xl border line px-3 font-normal">
                  <input type={q.kind === 'single' ? 'radio' : 'checkbox'} name={`q-${q.id}`} value={o.id} defaultChecked={previous[q.id]?.optionIds.includes(o.id)} required={q.kind === 'single' && q.required} />
                  {o.label}
                </label>
              ))}
            </div>
          )}
        </fieldset>
      ))}
      {error && <p role="alert" className="rounded-xl border border-red-300 bg-red-50 p-3 font-semibold text-red-800">{error}</p>}
      {!readOnly && <Button type="submit" disabled={busy} className="w-full">{busy ? '送信中…' : Object.keys(previous).length ? '回答を修正する' : '回答する'}</Button>}
    </form>
  );
}
