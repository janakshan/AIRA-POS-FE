import { isApiError } from '@rbp/api-client';
import type { CategoryTreeNode } from '@rbp/types';
import {
  Button,
  Card,
  ConfirmDialog,
  DataTable,
  type DataTableColumn,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  EmptyState,
  FilterBar,
  FilterChip,
  PageHeader,
  StatusBadge,
  toast,
} from '@rbp/ui';
import { EllipsisVerticalIcon, FolderTreeIcon, PlusIcon, SearchXIcon } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router';
import { ListSearch } from '@/components/list-search';
import { QueryError } from '@/components/query-error';
import { Screen } from '@/components/screen';
import { useErrorMessage } from '@/components/use-error-message';
import { useAccess } from '@/features/auth/hooks/use-access';
import { useListParams } from '@/lib/use-list-params';
import { PageBreadcrumbs } from '@/navigation/page-breadcrumbs';
import { useCategoryTree, useUpdateCategory } from '../api/queries';
import { useLocalizedName } from '../lib/localized-name';

/** Keep matches plus their ancestors so the tree still reads correctly while searching. */
function filterTree(tree: CategoryTreeNode[], search: string, status: string | undefined) {
  const q = search.trim().toLowerCase();
  const hit = (c: CategoryTreeNode) =>
    (!q || c.name.toLowerCase().includes(q) || c.code.toLowerCase().includes(q)) &&
    (!status || (status === 'active') === c.isActive);
  if (!q && !status) return tree;
  const keep = new Set<string>();
  const byId = new Map(tree.map((c) => [c.id, c]));
  for (const c of tree) {
    if (!hit(c)) continue;
    let node: CategoryTreeNode | undefined = c;
    while (node && !keep.has(node.id)) {
      keep.add(node.id);
      node = node.parentId ? byId.get(node.parentId) : undefined;
    }
  }
  return tree.filter((c) => keep.has(c.id));
}

/** CAT-001 Category List: the multi-level tree (REQ-114…136). */
export function CategoryListPage() {
  const { t } = useTranslation('catalog');
  const navigate = useNavigate();
  const { can } = useAccess();
  const canManage = can('catalog.manage');
  const list = useListParams({ filterKeys: ['status'] });
  const tree = useCategoryTree();
  const update = useUpdateCategory();
  const errorMessage = useErrorMessage();
  const nameOf = useLocalizedName();
  const [confirming, setConfirming] = useState<CategoryTreeNode | null>(null);

  const rows = useMemo(
    () => (tree.data ? filterTree(tree.data, list.search, list.filters.status) : undefined),
    [tree.data, list.search, list.filters.status],
  );

  const setActive = (category: CategoryTreeNode, isActive: boolean) =>
    update.mutate(
      { id: category.id, body: { isActive } },
      {
        onSuccess: () => {
          setConfirming(null);
          toast.success(
            t(isActive ? 'categories.activated' : 'categories.deactivated', {
              name: category.name,
            }),
          );
        },
        onError: (error) => {
          setConfirming(null);
          if (isApiError(error) && error.code === 'CONFLICT') {
            toast.error(t('categories.blockedTitle', { name: category.name }), {
              description: t('categories.blockedDescription', {
                children: error.details?.children ?? 0,
                products: error.details?.products ?? 0,
              }),
            });
          } else {
            toast.error(errorMessage(error));
          }
        },
      },
    );

  const columns: DataTableColumn<CategoryTreeNode>[] = [
    {
      id: 'name',
      header: t('common.name'),
      primary: true,
      cell: (c) => (
        <span className="flex items-center gap-2" style={{ paddingLeft: c.depth * 24 }}>
          {c.depth > 0 && (
            <span aria-hidden className="text-muted-foreground">
              └
            </span>
          )}
          {c.imageUrl ? (
            <img src={c.imageUrl} alt="" className="size-7 shrink-0 rounded-md object-cover" />
          ) : (
            <span
              aria-hidden
              className="size-3 shrink-0 rounded-full"
              style={{ background: c.color }}
            />
          )}
          <span className="font-medium">{nameOf(c)}</span>
          {c.childCount > 0 && (
            <span className="text-xs text-muted-foreground">
              {t('categories.subcategories', { count: c.childCount })}
            </span>
          )}
        </span>
      ),
    },
    {
      id: 'code',
      header: t('common.code'),
      cell: (c) => <span className="font-mono text-xs">{c.code}</span>,
      width: 'w-32',
    },
    {
      id: 'products',
      header: t('categories.products'),
      align: 'right',
      width: 'w-28',
      cell: (c) => c.productCount,
    },
    {
      id: 'status',
      header: t('common.active'),
      width: 'w-32',
      cell: (c) => (
        <StatusBadge tone={c.isActive ? 'success' : 'neutral'} size="sm">
          {t(c.isActive ? 'common.active' : 'common.inactive')}
        </StatusBadge>
      ),
    },
    ...(canManage
      ? [
          {
            id: 'actions',
            header: <span className="sr-only">{t('common.actions')}</span>,
            width: 'w-14',
            align: 'right' as const,
            hideOnMobile: false,
            cell: (c: CategoryTreeNode) => (
              // Stop row navigation when using the menu.
              <div onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={t('common.moreFor', { name: c.name })}
                    >
                      <EllipsisVerticalIcon />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onSelect={() => navigate(c.id)}>
                      {t('common.edit')}
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => navigate(`new?parent=${c.id}`)}>
                      {t('categories.addSub')}
                    </DropdownMenuItem>
                    {c.isActive ? (
                      <DropdownMenuItem variant="destructive" onSelect={() => setConfirming(c)}>
                        {t('categories.deactivate')}
                      </DropdownMenuItem>
                    ) : (
                      <DropdownMenuItem onSelect={() => setActive(c, true)}>
                        {t('categories.activate')}
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            ),
          },
        ]
      : []),
  ];

  return (
    <Screen id="CAT-001" title={t('nav:items.categories')} className="space-y-section">
      <PageHeader
        eyebrow={<PageBreadcrumbs />}
        title={t('nav:items.categories')}
        actions={
          canManage && (
            <Button asChild>
              <Link to="new">
                <PlusIcon /> {t('categories.new')}
              </Link>
            </Button>
          )
        }
      />
      <Card className="p-0">
        <DataTable
          caption={t('categories.caption')}
          columns={columns}
          rows={rows}
          getRowId={(c) => c.id}
          getRowLabel={(c) => c.name}
          loading={tree.isPending}
          {...(canManage ? { onRowClick: (c: CategoryTreeNode) => navigate(c.id) } : {})}
          error={
            tree.isError ? (
              <QueryError error={tree.error} onRetry={() => tree.refetch()} />
            ) : undefined
          }
          empty={
            tree.data?.length ? (
              <EmptyState
                icon={SearchXIcon}
                title={t('common.noResultsTitle')}
                description={t('common.noResultsHint')}
              />
            ) : (
              <EmptyState
                icon={FolderTreeIcon}
                title={t('categories.emptyTitle')}
                description={t('categories.emptyHint')}
              />
            )
          }
          toolbar={
            <FilterBar
              search={
                <ListSearch
                  value={list.search}
                  onSearch={list.setSearch}
                  placeholder={t('categories.searchPlaceholder')}
                  aria-label={t('common.search')}
                />
              }
              filters={
                <>
                  {[
                    [null, 'common.all'],
                    ['active', 'common.active'],
                    ['inactive', 'common.inactive'],
                  ].map(([value, key]) => (
                    <FilterChip
                      key={key}
                      active={(list.filters.status ?? null) === value}
                      onClick={() => list.setFilter('status', value ?? null)}
                    >
                      {t(key ?? '')}
                    </FilterChip>
                  ))}
                </>
              }
            />
          }
        />
      </Card>
      <ConfirmDialog
        open={!!confirming}
        onOpenChange={(open) => !open && setConfirming(null)}
        title={t('categories.deactivateTitle', { name: confirming?.name })}
        description={t('categories.deactivateDescription')}
        confirmLabel={t('categories.deactivate')}
        cancelLabel={t('common.cancel')}
        destructive
        loading={update.isPending}
        onConfirm={() => confirming && setActive(confirming, false)}
      />
    </Screen>
  );
}
