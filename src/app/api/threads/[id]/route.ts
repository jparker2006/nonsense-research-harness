import { threadIdSchema } from "@/lib/threads/contracts";
import { getThreadStoreBinding } from "@/lib/threads/factory";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Context) {
  const parsed = threadIdSchema.safeParse((await context.params).id);
  if (!parsed.success) return Response.json({ error: "thread_id_invalid" }, { status: 400 });
  const binding = getThreadStoreBinding();
  try {
    const thread = await binding.store.load(parsed.data);
    if (!thread) return Response.json({ error: "thread_not_found" }, { status: 404 });
    return Response.json({ durable: binding.durable, warning: binding.warning, thread }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return Response.json({
      error: "thread_history_unavailable",
      warning: "History is temporarily unavailable. Current answers remain visible in this browser.",
    }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}

export async function DELETE(_request: Request, context: Context) {
  const parsed = threadIdSchema.safeParse((await context.params).id);
  if (!parsed.success) return Response.json({ error: "thread_id_invalid" }, { status: 400 });
  const binding = getThreadStoreBinding();
  try {
    const deleted = await binding.store.delete(parsed.data);
    return deleted
      ? new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } })
      : Response.json({ error: "thread_not_found" }, { status: 404 });
  } catch {
    return Response.json({ error: "thread_history_unavailable" }, { status: 503 });
  }
}
