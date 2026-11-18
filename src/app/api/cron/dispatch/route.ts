import { NextResponse } from 'next/server';
import { isCronRequest } from '@/lib/cron-auth';
import { dispatchDue } from '@/lib/push';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  if (!isCronRequest(req)) return new NextResponse('unauthorized', { status: 401 });
  return NextResponse.json(await dispatchDue());
}
export const GET = POST;
