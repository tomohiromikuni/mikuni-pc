/** 画面を読み込んでいる間に、すぐ表示する仮の枠（押した瞬間に切り替わったと分かるように） */
export function Skeleton({ rows = 5, title = true }: { rows?: number; title?: boolean }) {
  return (
    <div className="animate-pulse space-y-4" aria-busy="true" aria-label="読み込み中">
      {title && <div className="h-7 w-48 rounded-lg bg-black/10" />}
      <div className="surface space-y-3 rounded-2xl border p-4">
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="flex items-center gap-3">
            <div className="h-3 w-3 rounded-full bg-black/10" />
            <div className="h-4 flex-1 rounded bg-black/10" style={{ maxWidth: `${85 - ((i * 13) % 40)}%` }} />
          </div>
        ))}
      </div>
    </div>
  );
}
