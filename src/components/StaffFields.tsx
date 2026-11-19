import { Field } from '@/components/ui';
import type { ClassOption } from '@/lib/classes';
import { PERMISSIONS } from '@/lib/permissions';

export type StaffValues = { full_name?: string; email?: string; role?: string; perms?: string[]; scopes?: string[] };

/** スタッフの役割・権限・担当範囲の入力欄（新規・編集で共通） */
export function StaffFields({ classes, values = {}, isNew }: { classes: ClassOption[]; values?: StaffValues; isNew: boolean }) {
  const courses = [...new Map(classes.map((c) => [c.courseId, c.courseName])).entries()];
  const has = (v: string) => values.scopes?.includes(v);
  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="氏名"><input name="full_name" defaultValue={values.full_name} required /></Field>
        {isNew ? <Field label="メールアドレス（ログインID）"><input name="email" type="email" required /></Field> : <Field label="メールアドレス"><input value={values.email ?? ''} readOnly className="opacity-70" /></Field>}
      </div>
      <fieldset>
        <legend className="mb-1 text-sm font-semibold">役割</legend>
        <div className="flex flex-wrap gap-5">
          <label className="flex items-center gap-2 font-normal"><input type="radio" name="role" value="staff" defaultChecked={values.role !== 'admin'} /> スタッフ・講師（下の権限・担当範囲だけ）</label>
          <label className="flex items-center gap-2 font-normal"><input type="radio" name="role" value="admin" defaultChecked={values.role === 'admin'} /> 管理者（すべての機能）</label>
        </div>
      </fieldset>
      <fieldset>
        <legend className="mb-1 text-sm font-semibold">できること（スタッフの場合）</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {PERMISSIONS.map((p) => (
            <label key={p.key} className="flex items-start gap-2 rounded-xl border line p-3 font-normal">
              <input type="checkbox" name="perm" value={p.key} defaultChecked={values.perms?.includes(p.key) ?? ['announce', 'chat', 'survey'].includes(p.key)} className="mt-1" />
              <span><strong>{p.label}</strong><br /><span className="muted text-xs">{p.hint}</span></span>
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend className="mb-1 text-sm font-semibold">担当範囲（スタッフの場合）</legend>
        <label className="mb-2 flex items-center gap-2 font-normal"><input type="checkbox" name="scope" value="all" defaultChecked={values.scopes ? has('all') : true} /> すべての期</label>
        {courses.length > 0 && (
          <div className="space-y-2 pl-2">
            <p className="muted text-xs">特定の期だけを担当する場合は、上のチェックを外して選んでください。</p>
            <div className="flex flex-wrap gap-x-5 gap-y-1">
              {courses.map(([id, name]) => <label key={id} className="flex items-center gap-2 font-normal"><input type="checkbox" name="scope" value={`course:${id}`} defaultChecked={has(`course:${id}`)} /> {name}</label>)}
            </div>
          </div>
        )}
      </fieldset>
    </div>
  );
}
