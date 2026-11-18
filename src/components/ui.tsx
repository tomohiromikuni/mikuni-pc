import Link from 'next/link';
import type { ComponentProps, ReactNode } from 'react';
import type { Priority } from '@/lib/types';
import { PRIORITY_LABEL } from '@/lib/types';

const btn = {
  primary: 'bg-brand-600 text-white hover:bg-brand-700',
  secondary: 'surface border hover:brightness-95',
  danger: 'bg-red-600 text-white hover:bg-red-700',
};

export function buttonClass(variant: keyof typeof btn = 'primary', extra = '') {
  return `inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-5 py-2 font-bold transition ${btn[variant]} ${extra}`;
}

export function Button({ variant = 'primary', className = '', ...props }: ComponentProps<'button'> & { variant?: keyof typeof btn }) {
  return <button className={buttonClass(variant, className)} {...props} />;
}

export function LinkButton({ variant = 'primary', className = '', ...props }: ComponentProps<typeof Link> & { variant?: keyof typeof btn }) {
  return <Link className={buttonClass(variant, className)} {...props} />;
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`surface rounded-2xl border p-4 ${className}`}>{children}</div>;
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="block text-sm">{label}</label>
      {children}
      {hint && <p className="muted text-xs">{hint}</p>}
    </div>
  );
}

export function Notice({ error, message }: { error?: string; message?: string }) {
  if (error)
    return (
      <p role="alert" className="rounded-xl border border-red-300 bg-red-50 p-3 font-semibold text-red-800">
        {error}
      </p>
    );
  if (message)
    return (
      <p role="status" className="rounded-xl border border-brand-500/40 bg-brand-50 p-3 font-semibold text-brand-700">
        {message}
      </p>
    );
  return null;
}

export function PriorityBadge({ priority }: { priority: Priority }) {
  if (priority === 'normal') return null;
  const cls = priority === 'urgent' ? 'bg-red-600 text-white' : 'bg-amber-400 text-amber-950';
  return <span className={`rounded-md px-2 py-0.5 text-xs font-bold ${cls}`}>{PRIORITY_LABEL[priority]}</span>;
}

export function UnreadDot() {
  return <span aria-label="未読" className="inline-block h-2.5 w-2.5 shrink-0 rounded-full bg-red-500" />;
}

export function PageTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <h1 className="text-xl font-bold">{children}</h1>
      {action}
    </div>
  );
}

/** searchParams の error / message を取り出す */
export type Flash = { error?: string; message?: string };
