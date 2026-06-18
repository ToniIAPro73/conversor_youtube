import { loadDesktopRoute } from "@/app/api/_desktop-route-loader";
import { desktopRequiredResponse } from "@/app/api/_desktop-required";
import { isVercelWeb } from "@/lib/deployment-target";

export const dynamic = "force-dynamic";

type HistoryRoute = typeof import("@/server/desktop-routes/history-route");

export async function GET() {
  if (isVercelWeb()) return desktopRequiredResponse();
  const route = await loadDesktopRoute<HistoryRoute>("history-route");
  return route.GET();
}
