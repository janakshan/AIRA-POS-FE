import {
  type Announcements,
  closestCenter,
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  arrayMove,
  rectSortingStrategy,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Button } from '@rbp/ui';
import { cn } from '@rbp/utils';
import {
  ArrowDownIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
  ArrowUpIcon,
  GripVerticalIcon,
} from 'lucide-react';
import type * as React from 'react';
import { useTranslation } from 'react-i18next';

export interface SortableListProps<T> {
  items: T[];
  getId: (item: T) => string;
  getLabel: (item: T) => string;
  onReorder: (ids: string[]) => void;
  renderItem: (item: T) => React.ReactNode;
  /** `grid` lays items out as tiles (arrow buttons become ←/→). */
  layout?: 'list' | 'grid';
  className?: string;
  itemClassName?: (item: T) => string | undefined;
  /** Accessible name of the list. */
  label: string;
}

/**
 * Reorderable list for CAT-007. Drag with mouse/touch (handle), keyboard (focus the handle,
 * Space to pick up, arrows to move, Space to drop), or the move buttons.
 */
export function SortableList<T>({
  items,
  getId,
  getLabel,
  onReorder,
  renderItem,
  layout = 'list',
  className,
  itemClassName,
  label,
}: SortableListProps<T>) {
  const { t } = useTranslation('catalog');
  const ids = items.map(getId);
  const nameOf = (id: string | number) => {
    const item = items.find((i) => getId(i) === String(id));
    return item ? getLabel(item) : String(id);
  };
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const move = (from: number, to: number) => {
    if (to < 0 || to >= ids.length || from === to) return;
    onReorder(arrayMove(ids, from, to));
  };

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    move(ids.indexOf(String(active.id)), ids.indexOf(String(over.id)));
  };

  const position = (id: string | number) => ids.indexOf(String(id)) + 1;
  const announcements: Announcements = {
    onDragStart: ({ active }) => t('quickPad.pickedUp', { name: nameOf(active.id) }),
    onDragOver: ({ active, over }) =>
      over
        ? t('quickPad.moved', {
            name: nameOf(active.id),
            position: position(over.id),
            total: ids.length,
          })
        : undefined,
    onDragEnd: ({ active, over }) =>
      over
        ? t('quickPad.dropped', { name: nameOf(active.id), position: position(over.id) })
        : t('quickPad.cancelled'),
    onDragCancel: () => t('quickPad.cancelled'),
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={onDragEnd}
      accessibility={{ announcements }}
    >
      <SortableContext
        items={ids}
        strategy={layout === 'grid' ? rectSortingStrategy : verticalListSortingStrategy}
      >
        <ul
          aria-label={label}
          className={cn(
            layout === 'grid'
              ? 'grid grid-cols-[repeat(auto-fill,minmax(10rem,1fr))] gap-2'
              : 'space-y-2',
            className,
          )}
        >
          {items.map((item, index) => (
            <SortableItem
              key={getId(item)}
              id={getId(item)}
              label={getLabel(item)}
              layout={layout}
              first={index === 0}
              last={index === items.length - 1}
              onMove={(delta) => move(index, index + delta)}
              className={itemClassName?.(item)}
            >
              {renderItem(item)}
            </SortableItem>
          ))}
        </ul>
      </SortableContext>
    </DndContext>
  );
}

function SortableItem({
  id,
  label,
  layout,
  first,
  last,
  onMove,
  className,
  children,
}: {
  id: string;
  label: string;
  layout: 'list' | 'grid';
  first: boolean;
  last: boolean;
  onMove: (delta: number) => void;
  className: string | undefined;
  children: React.ReactNode;
}) {
  const { t } = useTranslation('catalog');
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });
  const Prev = layout === 'grid' ? ArrowLeftIcon : ArrowUpIcon;
  const Next = layout === 'grid' ? ArrowRightIcon : ArrowDownIcon;
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn(
        'flex items-center gap-1 rounded-xl border bg-card p-1.5 shadow-xs',
        isDragging && 'relative z-10 opacity-90 shadow-lg ring-2 ring-primary',
        className,
      )}
    >
      <button
        ref={setActivatorNodeRef}
        type="button"
        className="flex size-10 touch-safe shrink-0 cursor-grab touch-none items-center justify-center rounded-lg text-muted-foreground focus-ring hover:bg-accent active:cursor-grabbing"
        aria-label={t('quickPad.dragHandle', { name: label })}
        {...attributes}
        {...listeners}
      >
        <GripVerticalIcon className="size-5" aria-hidden />
      </button>
      <div className="min-w-0 flex-1">{children}</div>
      <div className={cn('flex shrink-0', layout === 'grid' ? 'flex-col' : 'flex-row')}>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          disabled={first}
          onClick={() => onMove(-1)}
          aria-label={t('common.moveUp', { name: label })}
        >
          <Prev />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          disabled={last}
          onClick={() => onMove(1)}
          aria-label={t('common.moveDown', { name: label })}
        >
          <Next />
        </Button>
      </div>
    </li>
  );
}
