import { NextResponse, type NextRequest } from 'next/server';
import { getMe, hasPerm } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { answerText, loadSurveyResults } from '@/lib/surveys';

const esc = (v: string) => (/[",\r\n]/.test(v) ? `"${v.replaceAll('"', '""')}"` : v);

/** 集計結果を Excel で開ける CSV（BOM付き UTF-8）で出力 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const me = await getMe();
  if (!me || me.status !== 'active' || me.role === 'trainee' || !(await hasPerm('survey'))) return new NextResponse('権限がありません', { status: 403 });
  const { id } = await params;
  const supabase = await createClient();
  const { data: s } = await supabase.from('surveys').select('title').eq('id', id).maybeSingle();
  if (!s) return new NextResponse('見つかりません', { status: 404 });
  const { questions, people } = await loadSurveyResults(id);
  const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' }) : '未回答');
  const lines = [
    ['氏名', 'フリガナ', '所属', ...questions.map((q) => q.label), '回答日時'],
    ...people.map((p) => [p.name, p.kana, p.classLabel, ...questions.map((q) => answerText(q, p.answers[q.id])), fmt(p.respondedAt)]),
  ];
  const csv = '﻿' + lines.map((r) => r.map(esc).join(',')).join('\r\n') + '\r\n';
  const name = encodeURIComponent(`${s.title}_結果.csv`);
  return new NextResponse(csv, {
    headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename*=UTF-8''${name}`, 'Cache-Control': 'no-store' },
  });
}
