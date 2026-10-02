import type { Customer, Tenant } from '@rbp/types';

const T1 = 'ten_01PILOT' as Tenant['id'];
const T2 = 'ten_02GROCERY' as Tenant['id'];
const SEEDED_AT = '2026-09-01T00:00:00.000Z';

function customer(
  tenantId: Tenant['id'],
  id: string,
  name: string,
  phones: string[],
  extra: Partial<Pick<Customer, 'type' | 'address' | 'notes' | 'lastOrderAt'>> & {
    owes?: number;
  } = {},
): Customer {
  const { owes = 0, ...rest } = extra;
  return {
    id: id as Customer['id'],
    tenantId,
    name,
    type: 'RETAIL',
    phones: phones.map((number, i) => ({
      number,
      primary: i === 0,
      ...(i > 0 ? { label: 'Home' } : {}),
    })),
    outstanding: { amount: owes * 100, currency: 'LKR' },
    lastOrderAt: null,
    createdAt: SEEDED_AT,
    updatedAt: SEEDED_AT,
    ...rest,
  };
}

/** Demo customers (REQ-399…419). Phones are E.164; a few owe money for the credit demos. */
export function createCustomerSeed(): Customer[] {
  return [
    customer(T1, 'cus_01', 'Nimal Perera', ['+94771234567'], {
      type: 'REGULAR',
      owes: 2500,
      address: '12 Galle Road, Colombo 03',
      lastOrderAt: '2026-09-20T07:30:00.000Z',
    }),
    customer(T1, 'cus_02', 'Kavitha Sivakumar', ['+94772345678', '+94112345678'], {
      type: 'REGULAR',
      address: '45 Temple Road, Jaffna',
      lastOrderAt: '2026-09-24T12:10:00.000Z',
    }),
    customer(T1, 'cus_03', 'Mohamed Rizwan', ['+94773456789']),
    customer(T1, 'cus_04', 'Anjali Kumari', ['+94714567890'], { owes: 850 }),
    customer(T1, 'cus_05', 'Suresh Fernando', ['+94705678901']),
    customer(T1, 'cus_06', 'Dilshan Jayawardena', ['+94766789012'], {
      notes: 'Prefers less spicy food',
    }),
    customer(T1, 'cus_07', 'Tharindu Silva', ['+94757890123']),
    customer(T1, 'cus_08', 'Priyanka Rajapaksha', ['+94788901234']),
    customer(T1, 'cus_09', 'Colombo Tech Park Canteen', ['+94119012345'], {
      type: 'CORPORATE',
      owes: 18750,
      address: 'Trace Expert City, Colombo 10',
    }),
    customer(T1, 'cus_10', 'Ramesh Nadarajah', ['+94770123456']),
    customer(T2, 'cus_21', 'Nimal Perera', ['+94771234567'], { owes: 1200 }),
    customer(T2, 'cus_22', 'Shanthi Wickramasinghe', ['+94712223344']),
    customer(T2, 'cus_23', 'Farook Hameed', ['+94763334455']),
    customer(T2, 'cus_24', 'Lakmini de Silva', ['+94774445566']),
  ];
}
