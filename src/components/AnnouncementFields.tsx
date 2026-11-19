import { Field } from '@/components/ui';

/** お知らせの編集欄（タイトルと本文だけ） */
export function AnnouncementFields({ values = {} }: { values?: { title?: string; body?: string } }) {
  return (
    <>
      <Field label="タイトル（必須）"><input name="title" defaultValue={values.title} required maxLength={200} /></Field>
      <Field label="本文"><textarea name="body" rows={8} defaultValue={values.body} /></Field>
    </>
  );
}
