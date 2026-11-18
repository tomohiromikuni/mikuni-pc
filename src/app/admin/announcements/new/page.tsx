import Link from 'next/link';
import { AnnouncementComposer } from '@/components/AnnouncementComposer';
import { AnnouncementFields } from '@/components/AnnouncementFields';
import { Card, Notice, PageTitle, type Flash } from '@/components/ui';
import { requirePerm } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { getTargetOptions } from '@/lib/targets';

export default async function NewAnnouncementPage({ searchParams }: { searchParams: Promise<Flash> }) {
  const me = await requirePerm('announce');
  const { error } = await searchParams;
  const supabase = await createClient();
  const [{ data: categories }, targets] = await Promise.all([
    supabase.from('announcement_categories').select('id, name').order('sort_order'),
    getTargetOptions(),
  ]);

  return (
    <div className="space-y-4">
      <Link href="/admin/announcements" className="text-sm font-bold text-brand-700">‹ お知らせ一覧</Link>
      <PageTitle>お知らせを作成</PageTitle>
      <Notice error={error} />
      <AnnouncementComposer
        fields={<AnnouncementFields categories={categories ?? []} allowImmediate={me.role === 'admin'} />}
        targets={
        <Card className="space-y-3">
          <h2 className="font-bold">宛先</h2>
          {targets.all && (
            <label className="flex items-center gap-2"><input type="checkbox" name="target" value="all" /> 全訓練生</label>
          )}
          {targets.courses.length > 0 && (
            <div>
              <p className="muted text-sm">コース単位</p>
              <div className="flex flex-wrap gap-x-5 gap-y-1">
                {targets.courses.map((c) => (
                  <label key={c.id} className="flex items-center gap-2 font-normal"><input type="checkbox" name="target" value={`course:${c.id}`} /> {c.name}</label>
                ))}
              </div>
            </div>
          )}
          {targets.classes.length > 0 && (
            <div>
              <p className="muted text-sm">クラス単位</p>
              <div className="flex flex-wrap gap-x-5 gap-y-1">
                {targets.classes.map((c) => (
                  <label key={c.id} className="flex items-center gap-2 font-normal"><input type="checkbox" name="target" value={`class:${c.id}`} /> {c.label}</label>
                ))}
              </div>
            </div>
          )}
          {!targets.all && targets.classes.length === 0 && <p className="text-red-700">配信できる宛先がありません。先にコース・クラスを登録してください。</p>}
          <p className="muted text-xs">「全訓練生」を選ぶと、ほかの選択は無視されます。複数のコース・クラスを選ぶと、重複なく1回だけ届きます。</p>
        </Card>
        }
        timing={
        <Card className="space-y-3">
          <h2 className="font-bold">配信のタイミング</h2>
          <label className="flex items-center gap-2 font-normal"><input type="radio" name="mode" value="now" defaultChecked /> 今すぐ配信</label>
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-2 font-normal"><input type="radio" name="mode" value="schedule" /> 日時を予約：</label>
            <input type="datetime-local" name="publish_at" className="max-w-60" aria-label="予約日時" />
          </div>
          <label className="flex items-center gap-2 font-normal"><input type="radio" name="mode" value="draft" /> 下書きとして保存（配信しない）</label>
        </Card>
        }
      />
    </div>
  );
}
