'use client';
import { Button } from '@/components/ui';

export function PrintButton({ label = '印刷する' }: { label?: string }) {
  return <Button type="button" onClick={() => window.print()}>{label}</Button>;
}
