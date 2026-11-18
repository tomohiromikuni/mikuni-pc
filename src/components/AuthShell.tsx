import type { ReactNode } from 'react';
import { env } from '@/lib/env';

export function AuthShell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-4 py-10">
      <p className="mb-2 text-center text-sm font-bold text-brand-700">{env.appName}</p>
      <h1 className="mb-6 text-center text-2xl font-bold">{title}</h1>
      <div className="surface space-y-5 rounded-2xl border p-6">{children}</div>
    </main>
  );
}
