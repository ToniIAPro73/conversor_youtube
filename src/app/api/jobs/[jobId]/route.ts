import type { NextRequest } from "next/server";
import { loadDesktopRoute } from "@/app/api/_desktop-route-loader";
import { desktopRequiredResponse } from "@/app/api/_desktop-required";
import { isVercelWeb } from "@/lib/deployment-target";

type JobRoute = typeof import("@/server/desktop-routes/job-route");

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ jobId: string }> }
) {
  if (isVercelWeb()) return desktopRequiredResponse();
  const route = await loadDesktopRoute<JobRoute>("job-route");
  return route.GET(req, context);
}

export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ jobId: string }> }
) {
  if (isVercelWeb()) return desktopRequiredResponse();
  const route = await loadDesktopRoute<JobRoute>("job-route");
  return route.DELETE(req, context);
}
