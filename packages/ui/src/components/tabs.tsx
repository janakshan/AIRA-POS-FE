import { Tabs as TabsPrimitive } from 'radix-ui';
import * as React from 'react';
import { cn } from '@rbp/utils';

type TabsVariant = 'pill' | 'underline';
const VariantContext = React.createContext<TabsVariant>('pill');

export function Tabs({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Root>) {
  return <TabsPrimitive.Root className={cn('flex flex-col gap-3', className)} {...props} />;
}

export function TabsList({
  className,
  variant = 'pill',
  scrollable,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.List> & {
  /** pill: segmented control. underline: page sub-navigation. */
  variant?: TabsVariant;
  /** Scroll horizontally instead of squeezing (mobile sub-navigation). */
  scrollable?: boolean;
}) {
  return (
    <VariantContext.Provider value={variant}>
      <TabsPrimitive.List
        data-variant={variant}
        className={cn(
          variant === 'pill'
            ? 'inline-flex h-10 w-fit items-center rounded-lg bg-muted p-1 text-muted-foreground pointer-coarse:h-auto'
            : 'flex w-full items-end gap-1 border-b text-muted-foreground',
          scrollable && 'scrollbar-none max-w-full justify-start overflow-x-auto',
          className,
        )}
        {...props}
      />
    </VariantContext.Provider>
  );
}

export function TabsTrigger({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  const variant = React.useContext(VariantContext);
  return (
    <TabsPrimitive.Trigger
      className={cn(
        'inline-flex shrink-0 items-center justify-center gap-1.5 text-sm font-medium whitespace-nowrap focus-ring transition-colors disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4',
        variant === 'pill'
          ? 'h-full touch-safe flex-1 rounded-md px-3 data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-sm'
          : '-mb-px h-11 border-b-2 border-transparent px-3 hover:text-foreground data-[state=active]:border-primary data-[state=active]:text-foreground',
        className,
      )}
      {...props}
    />
  );
}

export function TabsContent({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return <TabsPrimitive.Content className={cn('flex-1 outline-none', className)} {...props} />;
}
