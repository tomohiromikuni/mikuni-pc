import { Field } from '@/components/ui';

type Cat = { id: string; name: string };

export function AnnouncementFields({ categories, values = {} }: { categories: Cat[]; values?: { title?: string; body?: string; priority?: string; category_id?: string | null } }) {
  return (
    <>
      <Field label="タイトル（必須）"><input name="title" defaultValue={values.title} required maxLength={200} /></Field>
      <Field label="本文"><textarea name="body" rows={8} defaultValue={values.body} /></Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="カテゴリー">
          <select name="category_id" defaultValue={values.category_id ?? ''}>
            <option value="">なし</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>
        <fieldset>
          <legend className="mb-1 text-sm font-semibold">優先度</legend>
          <div className="flex gap-4 pt-2">
            {[['normal', '通常'], ['important', '重要'], ['urgent', '緊急']].map(([v, l]) => (
              <label key={v} className="flex items-center gap-1.5 font-normal">
                <input type="radio" name="priority" value={v} defaultChecked={(values.priority ?? 'normal') === v} /> {l}
              </label>
            ))}
          </div>
        </fieldset>
      </div>
    </>
  );
}
