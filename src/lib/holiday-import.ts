import 'server-only';
import { fetchHolidays } from '@/lib/holidays';
import { createAdminClient } from '@/lib/supabase/admin';

/** 祝日を取り込む（休校日として登録した日は上書きしない） */
export async function importHolidays(orgIds?: string[]) {
  const db = createAdminClient();
  const year = Number(new Intl.DateTimeFormat('en', { timeZone: 'Asia/Tokyo', year: 'numeric' }).format(new Date()));
  const list = await fetchHolidays(year - 1);
  const ids = orgIds ?? ((await db.from('organizations').select('id')).data ?? []).map((o) => o.id);
  let total = 0;
  for (const org of ids) {
    const { data: existing } = await db.from('calendar_days').select('day').eq('org_id', org).eq('kind', 'closure');
    const skip = new Set((existing ?? []).map((d) => d.day));
    const rows = list.filter((h) => !skip.has(h.day)).map((h) => ({ org_id: org, day: h.day, kind: 'holiday', name: h.name }));
    const { error } = await db.from('calendar_days').upsert(rows, { onConflict: 'org_id,day' });
    if (error) throw new Error(error.message);
    total += rows.length;
  }
  return { imported: total, latest: list.at(-1)?.day };
}
