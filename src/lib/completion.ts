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

/**
 * 修了生にも送ってよい通知か：出欠・アンケート（就職状況の確認など）の依頼と、その再通知だけ。
 * お知らせ・チャットの通知は送らない。
 */
export function allowedForGraduate(item: { kind: string; url: string }): boolean {
  if (item.kind === 'survey') return true;
  if (item.kind === 'reminder' && item.url.startsWith('/answers/')) return true;
  return false;
}
