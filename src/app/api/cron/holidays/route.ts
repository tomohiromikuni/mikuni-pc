import { NextResponse } from 'next/server';
import { isCronRequest } from '@/lib/cron-auth';
import { importHolidays } from '@/lib/holiday-import';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  if (!isCronRequest(req)) return new NextResponse('unauthorized', { status: 401 });
  try {
    return NextResponse.json(await importHolidays());
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
export const GET = POST;
