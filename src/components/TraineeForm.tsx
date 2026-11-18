import { Button, Field } from '@/components/ui';
import type { ClassOption } from '@/lib/classes';
import { formatPhone } from '@/lib/phone';

type Values = {
  full_name?: string;
  full_name_kana?: string;
  email?: string | null;
  phone?: string;
  class_id?: string;
  enrolled_on?: string | null;
  expected_completion_on?: string | null;
};

export function TraineeForm({
  action,
  classes,
  values = {},
  submitLabel,
  showContact = true,
}: {
  action: (f: FormData) => Promise<void>;
  classes: ClassOption[];
  values?: Values;
  submitLabel: string;
  showContact?: boolean;
}) {
  return (
    <form action={action} className="grid gap-4 sm:grid-cols-2">
      <Field label="氏名（必須）"><input name="full_name" defaultValue={values.full_name} required placeholder="山田 花子" /></Field>
      <Field label="フリガナ"><input name="full_name_kana" defaultValue={values.full_name_kana} placeholder="ヤマダ ハナコ" /></Field>
      {showContact ? (
        <>
          <Field label="携帯番号（必須・ログインIDになります）"><input name="phone" type="tel" inputMode="tel" defaultValue={values.phone ? formatPhone(values.phone) : ''} placeholder="090-1234-5678" required /></Field>
          <Field label="メールアドレス（任意）"><input name="email" type="email" defaultValue={values.email ?? ''} /></Field>
        </>
      ) : null}
      <Field label="所属（コース / クラス）">
        <select name="class_id" defaultValue={values.class_id ?? ''}>
          <option value="">未所属</option>
          {classes.map((c) => (
            <option key={c.id} value={c.id}>{c.label}</option>
          ))}
        </select>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="入校日"><input name="enrolled_on" type="date" defaultValue={values.enrolled_on ?? ''} /></Field>
        <Field label="修了予定日"><input name="expected_completion_on" type="date" defaultValue={values.expected_completion_on ?? ''} /></Field>
      </div>
      <div className="sm:col-span-2">
        <Button type="submit">{submitLabel}</Button>
      </div>
    </form>
  );
}
