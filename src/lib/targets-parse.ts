export type Target = { target_type: 'all' | 'course' | 'class'; course_id: string | null; class_id: string | null };

/** フォームの宛先値（all / course:<id> / class:<id>）を表の形に */
export function parseTargetValues(raw: string[]): Target[] {
  if (raw.includes('all')) return [{ target_type: 'all', course_id: null, class_id: null }];
  return raw.flatMap((v): Target[] => {
    const [type, id] = v.split(':');
    if (type === 'course' && id) return [{ target_type: 'course', course_id: id, class_id: null }];
    if (type === 'class' && id) return [{ target_type: 'class', course_id: null, class_id: id }];
    return [];
  });
}
