'use client';
import Link from 'next/link';
import { useState } from 'react';
import { findExisting, importTrainees, type ImportResult } from '@/app/admin/trainees/actions';
import { Button, Card, buttonClass } from '@/components/ui';
import { templateCsv, validateRows, type ImportClass, type ImportRow } from '@/lib/import-validate';

type Step = { kind: 'select' } | { kind: 'preview'; fileName: string; rows: ImportRow[] } | { kind: 'done'; result: ImportResult };

async function readFile(file: File): Promise<unknown[][]> {
  if (/\.xlsx$/i.test(file.name)) {
    const { readSheet } = await import('read-excel-file/browser');
    return (await readSheet(file)) as unknown[][];
  }
  if (/\.xls$/i.test(file.name)) throw new Error('古い形式（.xls）は読めません。Excelで「.xlsx」または「CSV UTF-8」形式で保存し直してください');
  // CSV：UTF-8 で読み、文字化けしていれば Shift_JIS（Excelの標準のCSV）として読み直す
  const buf = await file.arrayBuffer();
  let text = new TextDecoder('utf-8').decode(buf);
  if (text.includes('�')) text = new TextDecoder('shift_jis').decode(buf);
  const Papa = (await import('papaparse')).default;
  return Papa.parse<string[]>(text.replace(/^﻿/, ''), { skipEmptyLines: false }).data;
}

export function ImportWizard({ classes }: { classes: ImportClass[] }) {
  const [step, setStep] = useState<Step>({ kind: 'select' });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function downloadTemplate() {
    const blob = new Blob([templateCsv(classes[0])], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = '訓練生一括登録テンプレート.csv';
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function onFile(file: File) {
    setError(null);
    setBusy(true);
    try {
      const sheet = await readFile(file);
      const first = validateRows(sheet as never, classes);
      if (first.headerError) throw new Error(first.headerError);
      const ex = await findExisting(first.rows.map((r) => r.email), first.rows.map((r) => r.phone));
      const { rows } = validateRows(sheet as never, classes, { emails: new Set(ex.emails), phones: new Set(ex.phones) });
      if (rows.length > 500) throw new Error('一度に登録できるのは500人までです。ファイルを分けてください');
      setStep({ kind: 'preview', fileName: file.name, rows });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'ファイルを読み込めませんでした');
    } finally {
      setBusy(false);
    }
  }

  async function submit(rows: ImportRow[], fileName: string) {
    setBusy(true);
    const ok = rows.filter((r) => r.errors.length === 0);
    const result = await importTrainees(
      ok.map(({ line, full_name, full_name_kana, email, phone, class_id, enrolled_on, expected_completion_on }) => ({
        line, full_name, full_name_kana, email, phone, class_id, enrolled_on, expected_completion_on,
      })),
      fileName,
    );
    setBusy(false);
    setStep({ kind: 'done', result });
  }

  if (step.kind === 'done') {
    const { result } = step;
    return (
      <Card className="space-y-4">
        <p className="text-lg font-bold">{result.succeeded}人を名簿に登録しました。</p>
        <p className="text-sm">本人には<strong>共通の登録用QR</strong>から登録してもらってください。名簿の携帯番号と氏名が一致すれば、このアカウントにつながります。</p>
        {result.failed.length > 0 && (
          <div>
            <p className="font-bold text-red-700">{result.failed.length}人は登録できませんでした：</p>
            <ul className="list-disc pl-5 text-sm">
              {result.failed.map((f) => <li key={f.line}>{f.line}行目 {f.name}：{f.error}</li>)}
            </ul>
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          <Link href="/admin/join-qr" className={buttonClass('primary')}>登録用QR（共通）を表示する</Link>
          <Link href="/admin/trainees" className={buttonClass('secondary')}>訓練生一覧へ</Link>
        </div>
      </Card>
    );
  }

  if (step.kind === 'preview') {
    const ok = step.rows.filter((r) => r.errors.length === 0);
    const ng = step.rows.length - ok.length;
    return (
      <div className="space-y-4">
        <Card className="space-y-2">
          <p>
            <strong>{step.fileName}</strong>：全{step.rows.length}行のうち、
            <strong className="text-brand-700">登録できる {ok.length}行</strong>
            {ng > 0 && <>、<strong className="text-red-700">エラー {ng}行</strong></>}
          </p>
          {ng > 0 && <p className="text-sm">エラーの行は登録されません。ファイルを直して読み込み直すか、エラーのない行だけ先に登録できます。</p>}
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => submit(step.rows, step.fileName)} disabled={busy || ok.length === 0}>
              {busy ? '登録しています…（人数が多いと1分ほどかかります）' : `${ok.length}人を登録する`}
            </Button>
            <Button variant="secondary" onClick={() => setStep({ kind: 'select' })} disabled={busy}>ファイルを選び直す</Button>
          </div>
        </Card>
        <Card className="overflow-x-auto p-0">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="muted">
              <tr className="border-b line">
                <th className="px-3 py-2">行</th><th className="px-3 py-2">氏名</th><th className="px-3 py-2">携帯番号</th>
                <th className="px-3 py-2">所属</th><th className="px-3 py-2">期間</th><th className="px-3 py-2">チェック結果</th>
              </tr>
            </thead>
            <tbody className="divide-y line">
              {step.rows.map((r) => (
                <tr key={r.line} className={r.errors.length ? 'bg-red-50 text-red-950' : ''}>
                  <td className="px-3 py-2">{r.line}</td>
                  <td className="px-3 py-2">{r.full_name}<span className="block text-xs opacity-70">{r.full_name_kana}</span></td>
                  <td className="px-3 py-2 break-all">{r.phone}{r.email && <span className="block text-xs opacity-70">{r.email}</span>}</td>
                  <td className="px-3 py-2">{r.class_label}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{r.enrolled_on || '—'} 〜 {r.expected_completion_on || '—'}</td>
                  <td className="px-3 py-2">{r.errors.length ? r.errors.map((e) => <div key={e}>⚠ {e}</div>) : <span className="font-bold text-brand-700">OK</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {error && <p role="alert" className="rounded-xl border border-red-300 bg-red-50 p-3 font-semibold text-red-800">{error}</p>}
      <Card className="space-y-3">
        <h2 className="font-bold">1. テンプレートに入力する</h2>
        <p className="text-sm">
          見出しは「{['氏名', 'フリガナ', '電話番号', 'メールアドレス', 'コース', 'クラス', '入校日', '修了予定日'].join('・')}」です。
          氏名と電話番号（携帯）は必須、メールアドレスは任意です。コース（期）・クラスは「訓練生・クラス」画面に登録した名前と同じにしてください。
        </p>
        <Button variant="secondary" onClick={downloadTemplate}>テンプレート（CSV）をダウンロード</Button>
      </Card>
      <Card className="space-y-3">
        <h2 className="font-bold">2. ファイルを選ぶ</h2>
        <p className="text-sm">Excel（.xlsx）または CSV に対応しています。登録する前に、内容とエラーを確認できます。</p>
        <label className={buttonClass('primary', 'cursor-pointer')}>
          {busy ? '読み込み中…' : 'ファイルを選ぶ'}
          <input type="file" accept=".xlsx,.csv,text/csv" className="sr-only" disabled={busy} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) onFile(f); }} />
        </label>
      </Card>
    </div>
  );
}
