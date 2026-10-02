import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { DataTable, type DataTableColumn } from './data-table';
import { pageWindow } from './pagination';

interface Row {
  id: string;
  name: string;
  qty: number;
}
const rows: Row[] = [
  { id: 'a', name: 'Tea', qty: 3 },
  { id: 'b', name: 'Coffee', qty: 1 },
];
const columns: DataTableColumn<Row>[] = [
  { id: 'name', header: 'Name', cell: (r) => r.name, sortable: true, primary: true },
  { id: 'qty', header: 'Qty', cell: (r) => r.qty, align: 'right' },
];

describe('DataTable', () => {
  it('renders rows with an accessible caption', () => {
    render(<DataTable caption="Items" columns={columns} rows={rows} getRowId={(r) => r.id} />);
    const table = screen.getByRole('table', { name: 'Items' });
    expect(within(table).getAllByRole('row')).toHaveLength(3);
  });

  it('shows loading skeletons and marks the table busy', () => {
    render(
      <DataTable
        caption="Items"
        columns={columns}
        rows={undefined}
        loading
        getRowId={(r) => r.id}
      />,
    );
    expect(screen.getByRole('table')).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByRole('status')).toHaveTextContent('Loading');
  });

  it('renders the empty and error slots', () => {
    const { rerender } = render(
      <DataTable
        caption="Items"
        columns={columns}
        rows={[]}
        empty={<p>Nothing here</p>}
        getRowId={(r) => r.id}
      />,
    );
    expect(screen.getByText('Nothing here')).toBeInTheDocument();
    rerender(
      <DataTable
        caption="Items"
        columns={columns}
        rows={rows}
        error={<p>Boom</p>}
        getRowId={(r) => r.id}
      />,
    );
    expect(screen.getByText('Boom')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('cycles sort asc → desc → none and exposes aria-sort', async () => {
    const onSortChange = vi.fn();
    const { rerender } = render(
      <DataTable
        caption="Items"
        columns={columns}
        rows={rows}
        getRowId={(r) => r.id}
        sort={null}
        onSortChange={onSortChange}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: /Name/ }));
    expect(onSortChange).toHaveBeenLastCalledWith({ columnId: 'name', direction: 'asc' });
    rerender(
      <DataTable
        caption="Items"
        columns={columns}
        rows={rows}
        getRowId={(r) => r.id}
        sort={{ columnId: 'name', direction: 'asc' }}
        onSortChange={onSortChange}
      />,
    );
    expect(screen.getByRole('columnheader', { name: /Name/ })).toHaveAttribute(
      'aria-sort',
      'ascending',
    );
    await userEvent.click(screen.getByRole('button', { name: /Name/ }));
    expect(onSortChange).toHaveBeenLastCalledWith({ columnId: 'name', direction: 'desc' });
  });

  it('selects all rows', async () => {
    const onSelectionChange = vi.fn();
    render(
      <DataTable
        caption="Items"
        columns={columns}
        rows={rows}
        getRowId={(r) => r.id}
        selectedIds={new Set()}
        onSelectionChange={onSelectionChange}
      />,
    );
    await userEvent.click(screen.getByRole('checkbox', { name: 'Select all rows' }));
    expect(onSelectionChange).toHaveBeenCalledWith(new Set(['a', 'b']));
  });
});

describe('pageWindow', () => {
  it('collapses long ranges with gaps', () => {
    expect(pageWindow(1, 5)).toEqual([1, 2, 3, 4, 5]);
    expect(pageWindow(6, 12)).toEqual([1, 'gap', 5, 6, 7, 'gap', 12]);
  });
});
