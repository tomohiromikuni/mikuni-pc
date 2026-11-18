export type Role = 'admin' | 'staff' | 'trainee';
export type AccountStatus = 'invited' | 'active' | 'suspended';
export type Priority = 'normal' | 'important' | 'urgent';
export type Permission = 'view_pii' | 'manage_trainees' | 'announce' | 'chat' | 'survey';

export type Profile = {
  id: string;
  org_id: string;
  role: Role;
  status: AccountStatus;
  full_name: string;
  full_name_kana: string;
  terms_agreed_at: string | null;
};

export const PRIORITY_LABEL: Record<Priority, string> = {
  normal: '通常',
  important: '重要',
  urgent: '緊急',
};

export const STATUS_LABEL: Record<AccountStatus, string> = {
  invited: '招待中',
  active: '利用中',
  suspended: '利用停止',
};
