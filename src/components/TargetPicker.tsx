import { Card } from '@/components/ui';
import type { ClassOption } from '@/lib/classes';

/** 宛先（全体 / 期）のチェックボックス。値は all / course:<id> */
export function TargetPicker({ targets, name = 'target', finishedFirst = false }: { targets: { all: boolean; courses: { id: string; name: string }[]; finishedCourses?: { id: string; name: string }[]; classes: ClassOption[] }; name?: string; finishedFirst?: boolean }) {
  return (
    <Card className="space-y-3">
      <h2 className="font-bold">宛先</h2>
      {targets.all && (
        <label className="flex items-center gap-2"><input type="checkbox" name={name} value="all" /> 全訓練生</label>
      )}
      {targets.courses.length > 0 && (
        <div>
          <p className="muted text-sm">期ごと</p>
          <div className="flex flex-wrap gap-x-5 gap-y-1">
            {targets.courses.map((c) => (
              <label key={c.id} className="flex items-center gap-2 font-normal"><input type="checkbox" name={name} value={`course:${c.id}`} /> {c.name}</label>
            ))}
          </div>
        </div>
      )}
      
      {(targets.finishedCourses ?? []).length > 0 && (
        <div className={finishedFirst ? 'rounded-xl bg-amber-50 p-2' : ''}>
          <p className="muted text-sm">修了した期（修了生あて：就職状況の確認など）</p>
          <div className="flex flex-wrap gap-x-5 gap-y-1">
            {(targets.finishedCourses ?? []).map((c) => (
              <label key={c.id} className="flex items-center gap-2 font-normal"><input type="checkbox" name={name} value={`course:${c.id}`} /> {c.name}</label>
            ))}
          </div>
        </div>
      )}
      {!targets.all && targets.courses.length === 0 && <p className="text-red-700">配信できる宛先がありません。先に「訓練生」画面で期を作ってください。</p>}
      <p className="muted text-xs">「全訓練生」を選ぶと、ほかの選択は無視されます（修了生にも届きます）。</p>
    </Card>
  );
}
