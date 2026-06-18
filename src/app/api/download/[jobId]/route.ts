import type { NextRequest } from "next/server";
import { loadDesktopRoute } from "@/app/api/_desktop-route-loader";
import { desktopRequiredResponse } from "@/app/api/_desktop-required";
import { isVercelWeb } from "@/lib/deployment-target";

type DownloadRoute = typeof import("@/server/desktop-routes/download-route");

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ jobId: string }> }
) {
  if (isVercelWeb()) return desktopRequiredResponse();
  const route = await loadDesktopRoute<DownloadRoute>("download-route");
  return route.GET(req, context);
}
