// /api/v1/expenses/:expenseId — PATCH update (+splits), DELETE (soft)

import { updateExpense, removeExpense } from '@/lib/services/expense-service';
import { apiJson } from '@/lib/api-response';
import { withUser, readJsonBody } from '@/lib/api/http';

type Ctx = { params: Promise<{ expenseId: string }> };

export function PATCH(req: Request, ctx: Ctx) {
  return withUser(req, async (userId) => {
    const { expenseId } = await ctx.params;
    const expense = await updateExpense(userId, expenseId, await readJsonBody(req));
    return apiJson({ expense });
  });
}

export function DELETE(req: Request, ctx: Ctx) {
  return withUser(req, async (userId) => {
    const { expenseId } = await ctx.params;
    return apiJson(await removeExpense(userId, expenseId).then((r) => ({ ok: true, ...r })));
  });
}
