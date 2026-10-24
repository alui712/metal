import { connection } from "next/server";
import { runHealthChecks } from "@/server/health";

export async function GET() {
  await connection();
  const checks = await runHealthChecks();
  return Response.json({ checks });
}
