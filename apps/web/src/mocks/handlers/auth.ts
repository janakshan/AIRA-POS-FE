import type { LoginRequest, LoginResponse } from '@rbp/types';
import { http, HttpResponse } from 'msw';
import { issueToken } from '../context';
import { db } from '../db';
import { API, handle, MockHttpError } from '../http';

export const authHandlers = [
  http.post(
    `${API}/auth/login`,
    handle(async ({ request }) => {
      const body = (await request.json()) as LoginRequest;
      const state = db.get();
      const user = state.users.find((u) => u.email.toLowerCase() === body.email?.toLowerCase());
      if (!user || user.password !== body.password) {
        throw new MockHttpError('INVALID_CREDENTIALS', 401, 'Email or password is incorrect');
      }
      // Prototype: a user belongs to one tenant. Multi-tenant membership would add a tenant picker here.
      const membership = state.tenantUsers.find((t) => t.userId === user.id);
      if (!membership) throw new MockHttpError('FORBIDDEN', 403, 'User has no tenant membership');
      if (membership.status === 'INACTIVE') {
        throw new MockHttpError('FORBIDDEN', 403, 'This sign-in has been deactivated', {
          reason: 'ACCOUNT_DISABLED',
        });
      }
      const { password: _password, ...publicUser } = user;
      return HttpResponse.json<LoginResponse>({
        accessToken: issueToken(membership.id),
        user: publicUser,
      });
    }),
  ),

  http.post(
    `${API}/auth/logout`,
    handle(() => new HttpResponse(null, { status: 204 })),
  ),
];
