import type { LucideIcon } from 'lucide-react';
import type * as React from 'react';
import { cn } from '@rbp/utils';
import { Card } from '../components/card';

export interface StatCardProps {
  label: React.ReactNode;
  value: React.ReactNode;
  hint?: React.ReactNode;
  icon?: LucideIcon;
  className?: string;
}

export function StatCard({ label, value, hint, icon: Icon, className }: StatCardProps) {
  return (
    <Card className={cn('gap-2 px-5', className)}>
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>{label}</span>
        {Icon && <Icon className="size-4" />}
      </div>
      <div className="text-2xl font-semibold tracking-tight tabular-nums">{value}</div>
      {hint && <div className="text-xs text-muted-foreground">{hint}</div>}
    </Card>
  );
}
