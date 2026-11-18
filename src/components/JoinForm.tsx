'use client';
import { useMemo, useState } from 'react';
import { Button, Field } from '@/components/ui';

type Cls = { id: string; name: string; courseId: string; courseName: string };

/** 共通QRの登録フォーム：期（コース）→ クラス → 名前・携帯番号・パスワード */
export function JoinForm({ classes, action, terms }: { classes: Cls[]; action: (f: FormData) => Promise<void>; terms: string }) {
  const courses = useMemo(() => [...new Map(classes.map((c) => [c.courseId, c.courseName])).entries()], [classes]);
  const [course, setCourse] = useState(courses.length === 1 ? courses[0][0] : '');
  const [busy, setBusy] = useState(false);
  const inCourse = classes.filter((c) => c.courseId === course);

  return (
    <form action={async (f) => { setBusy(true); await action(f); setBusy(false); }} className="space-y-4">
      <Field label="何期生ですか？">
        <select value={course} onChange={(e) => setCourse(e.target.value)} required>
          <option value="">選んでください</option>
          {courses.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
        </select>
      </Field>
      {course && (
        <Field label="クラス">
          <select name="class_id" required defaultValue={inCourse.length === 1 ? inCourse[0].id : ''} key={course}>
            {inCourse.length !== 1 && <option value="">選んでください</option>}
            {inCourse.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>
      )}
      <Field label="氏名"><input name="full_name" autoComplete="name" placeholder="山田 花子" required maxLength={100} /></Field>
      <Field label="フリガナ"><input name="full_name_kana" placeholder="ヤマダ ハナコ" required maxLength={100} /></Field>
      <Field label="携帯番号（ログインIDになります）"><input name="phone" type="tel" inputMode="tel" autoComplete="tel" placeholder="090-1234-5678" required /></Field>
      <Field label="パスワード" hint="8文字以上。忘れないようにしてください">
        <input name="password" type="password" autoComplete="new-password" minLength={8} required />
      </Field>
      <Field label="パスワード（確認のためもう一度）"><input name="confirm" type="password" autoComplete="new-password" minLength={8} required /></Field>
      {/* ロボット対策（人には見えない） */}
      <input name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden />
      <details className="rounded-xl border line p-3 text-sm">
        <summary className="cursor-pointer font-bold">利用規約と個人情報の取り扱い（タップで表示）</summary>
        <div className="mt-2 max-h-60 overflow-y-auto whitespace-pre-wrap">{terms}</div>
      </details>
      <label className="flex items-center gap-2 font-normal"><input type="checkbox" name="agree" required /> 利用規約に同意します</label>
      <Button type="submit" className="w-full" disabled={busy}>{busy ? '登録しています…' : '登録して始める'}</Button>
    </form>
  );
}
