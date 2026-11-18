'use client';
import { ACCEPT, MAX_FILE_BYTES } from '@/lib/upload';

/** 添付するファイルを選ぶ（選んだファイルの一覧と削除ボタンつき） */
export function FilePicker({ files, onChange, disabled }: { files: File[]; onChange: (f: File[]) => void; disabled?: boolean }) {
  return (
    <div className="space-y-2">
      <label className="surface inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border px-4 font-bold hover:brightness-95">
        📎 画像・ファイルを選ぶ
        <input
          type="file"
          multiple
          accept={ACCEPT}
          className="sr-only"
          disabled={disabled}
          onChange={(e) => {
            onChange([...files, ...Array.from(e.target.files ?? [])]);
            e.target.value = '';
          }}
        />
      </label>
      {files.length > 0 && (
        <ul className="space-y-1 text-sm">
          {files.map((f, i) => (
            <li key={i} className="flex items-center gap-2">
              <span className="min-w-0 flex-1 truncate">{f.name}</span>
              {f.size > MAX_FILE_BYTES && !f.type.startsWith('image/') && <span className="font-bold text-red-700">10MB超</span>}
              <button type="button" className="text-red-700 underline" onClick={() => onChange(files.filter((_, j) => j !== i))} disabled={disabled}>
                外す
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="muted text-xs">画像は自動で縮小します。PDF・Word・Excelなどは1ファイル10MBまで。</p>
    </div>
  );
}
