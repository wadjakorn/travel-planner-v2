// /api/v1/trips/:tripId/expenses — GET list (with splits), POST create (idempotent)

import { listExpenses, createExpense } from '@/lib/services/expense-service';
import { apiJson } from '@/lib/api-response';
import { withUser, readJsonBody } from '@/lib/api/http';
import { withIdempotency } from '@/lib/api/idempotency';

type Ctx = { params: Promise<{ tripId: string }> };

export function GET(req: Request, ctx: Ctx) {
  return withUser(req, async (userId) => {
    const { tripId } = await ctx.params;
    return apiJson({ expenses: await listExpenses(userId, tripId) });
  });
}

export function POST(req: Request, ctx: Ctx) {
  return withUser(req, async (userId) => {
    const { tripId } = await ctx.params;
    const body = await readJsonBody(req);
    return withIdempotency(userId, req, body, async () => {
      const expense = await createExpense(userId, tripId, body);
      return { status: 201, body: { expense } };
    });
  });
}
