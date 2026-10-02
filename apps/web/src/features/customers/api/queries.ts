import { queryKeys } from '@rbp/api-client';
import type {
  CreateCustomerRequest,
  CustomerListParams,
  CustomerOrderListParams,
  ReceiveCustomerPaymentRequest,
} from '@rbp/types';
import { normalizePhone } from '@rbp/utils';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useQueryScope } from '@/features/auth/hooks/use-query-scope';
import { api } from '@/lib/api';

/** Exact phone lookup (POS-003). Only runs once the input is a valid phone number. */
export function useCustomerByPhone(phone: string) {
  const { ready, ...scope } = useQueryScope();
  const e164 = normalizePhone(phone);
  return useQuery({
    queryKey: queryKeys.customers.list(scope, { phone: e164 ?? '' }),
    queryFn: ({ signal }) => api.customers.list({ phone: e164 ?? '' }, signal),
    enabled: ready && !!e164,
    select: (page) => page.items[0] ?? null,
  });
}

export function useCustomerSearch(params: CustomerListParams, enabled = true) {
  const { ready, ...scope } = useQueryScope();
  return useQuery({
    queryKey: queryKeys.customers.list(scope, params),
    queryFn: ({ signal }) => api.customers.list(params, signal),
    enabled: ready && enabled,
    placeholderData: keepPreviousData,
  });
}

export function useCustomer(id: string | null | undefined) {
  const { ready, ...scope } = useQueryScope();
  return useQuery({
    queryKey: queryKeys.customers.detail(scope, id ?? '-'),
    queryFn: ({ signal }) => api.customers.get(id ?? '', signal),
    enabled: ready && !!id,
    staleTime: 60_000,
  });
}

export function useCreateCustomer() {
  const queryClient = useQueryClient();
  const { tenantId } = useQueryScope();
  return useMutation({
    mutationFn: (body: CreateCustomerRequest) => api.customers.create(body),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: queryKeys.customers.all({ tenantId }) }),
  });
}

/** Customer writes change lists, balances, statements and the audit log. */
function useInvalidateCustomers() {
  const queryClient = useQueryClient();
  const { ready: _r, ...scope } = useQueryScope();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.customers.all(scope) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.audit.all(scope) }),
    ]);
}

/** CUS-004 the customer's orders at every location. */
export function useCustomerOrders(id: string | undefined, params: CustomerOrderListParams) {
  const { ready, ...scope } = useQueryScope();
  return useQuery({
    queryKey: queryKeys.customers.orders(scope, id ?? '-', params),
    queryFn: ({ signal }) => api.customers.orders(id ?? '', params, signal),
    enabled: ready && !!id,
    placeholderData: keepPreviousData,
  });
}

/** CUS-005 statement with running balance. */
export function useCustomerLedger(id: string | undefined) {
  const { ready, ...scope } = useQueryScope();
  return useQuery({
    queryKey: queryKeys.customers.ledger(scope, id ?? '-'),
    queryFn: ({ signal }) => api.customers.ledger(id ?? '', signal),
    enabled: ready && !!id,
  });
}

export function useSaveCustomer() {
  const invalidate = useInvalidateCustomers();
  return useMutation({
    mutationFn: ({ id, body }: { id?: string; body: CreateCustomerRequest }) =>
      id ? api.customers.update(id, body) : api.customers.create(body),
    onSuccess: invalidate,
  });
}

export function useReceiveCustomerPayment() {
  const invalidate = useInvalidateCustomers();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: ReceiveCustomerPaymentRequest }) =>
      api.customers.receivePayment(id, body),
    onSuccess: invalidate,
  });
}
