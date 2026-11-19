import { Card } from '@/components/ui';
import type { ClassOption } from '@/lib/classes';

/** 宛先（全体 / コース / クラス）のチェックボックス。値は all / course:<id> / class:<id> */
export function TargetPicker({ targets, name = 'target' }: { targets: { all: boolean; courses: { id: string; name: string }[]; classes: ClassOption[] }; name?: string }) {
  return (
    <Card className="space-y-3">
      <h2 className="font-bold">宛先</h2>
      {targets.all && (
        <label className="flex items-center gap-2"><input type="checkbox" name={name} value="all" /> 全訓練生</label>
      )}
      {targets.courses.length > 0 && (
        <div>
          <p className="muted text-sm">コース単位</p>
          <div className="flex flex-wrap gap-x-5 gap-y-1">
            {targets.courses.map((c) => (
              <label key={c.id} className="flex items-center gap-2 font-normal"><input type="checkbox" name={name} value={`course:${c.id}`} /> {c.name}</label>
            ))}
          </div>
        </div>
      )}
      {targets.classes.length > 0 && (
        <div>
          <p className="muted text-sm">クラス単位</p>
          <div className="flex flex-wrap gap-x-5 gap-y-1">
            {targets.classes.map((c) => (
              <label key={c.id} className="flex items-center gap-2 font-normal"><input type="checkbox" name={name} value={`class:${c.id}`} /> {c.label}</label>
            ))}
          </div>
        </div>
      )}
      {!targets.all && targets.classes.length === 0 && <p className="text-red-700">配信できる宛先がありません。先に「訓練生・クラス」画面で期とクラスを作ってください。</p>}
      <p className="muted text-xs">「全訓練生」を選ぶと、ほかの選択は無視されます。</p>
    </Card>
  );
}
