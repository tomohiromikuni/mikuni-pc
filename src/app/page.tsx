import { redirect } from 'next/navigation';
import { requireActive } from '@/lib/auth';

export default async function Root() {
  const me = await requireActive();
  redirect(me.role === 'trainee' ? '/home' : '/admin');
}
