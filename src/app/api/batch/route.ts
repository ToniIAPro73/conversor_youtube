import type { NextRequest } from "next/server";
import { loadDesktopRoute } from "@/app/api/_desktop-route-loader";
import { desktopRequiredResponse } from "@/app/api/_desktop-required";
import { isVercelWeb } from "@/lib/deployment-target";

type BatchRoute = typeof import("@/server/desktop-routes/batch-route");

export async function POST(req: NextRequest) {
  if (isVercelWeb()) return desktopRequiredResponse();
  const route = await loadDesktopRoute<BatchRoute>("batch-route");
  return route.POST(req);
}

export async function GET(req: NextRequest) {
  if (isVercelWeb()) return desktopRequiredResponse();
  const route = await loadDesktopRoute<BatchRoute>("batch-route");
  return route.GET(req);
}
