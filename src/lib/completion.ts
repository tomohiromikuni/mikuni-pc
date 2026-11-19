// 受講が終わった訓練生か（通知を止める判定に使う）

export type CompletionInfo = {
  courseArchived?: boolean | null; // 所属している期を「修了」にした
  courseEndsOn?: string | null; // 期の終了日（YYYY-MM-DD）
  expectedCompletionOn?: string | null; // 本人の修了予定日（YYYY-MM-DD）
};

/** today：日本時間の「YYYY-MM-DD」 */
export function hasFinished(info: CompletionInfo, today: string): boolean {
  if (info.courseArchived) return true;
  if (info.courseEndsOn && info.courseEndsOn < today) return true;
  if (info.expectedCompletionOn && info.expectedCompletionOn < today) return true;
  return false;
}
