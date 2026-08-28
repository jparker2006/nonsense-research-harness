import { getThreadStoreBinding } from "@/lib/threads/factory";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const binding = getThreadStoreBinding();
  try {
    const threads = await binding.store.list(50);
    return Response.json({ durable: binding.durable, warning: binding.warning, threads }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return Response.json({
      durable: false,
      warning: "History is temporarily unavailable. Current answers remain visible in this browser.",
      threads: [],
    }, {
      status: 503,
      headers: { "Cache-Control": "no-store" },
    });
  }
}
