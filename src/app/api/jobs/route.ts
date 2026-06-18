import type { NextRequest } from "next/server";
import { loadDesktopRoute } from "@/app/api/_desktop-route-loader";
import { desktopRequiredResponse } from "@/app/api/_desktop-required";
import { isVercelWeb } from "@/lib/deployment-target";

type JobsRoute = typeof import("@/server/desktop-routes/jobs-route");

export async function POST(req: NextRequest) {
  if (isVercelWeb()) return desktopRequiredResponse();
  const route = await loadDesktopRoute<JobsRoute>("jobs-route");
  return route.POST(req);
}
