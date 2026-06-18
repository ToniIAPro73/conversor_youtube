import { NextResponse } from "next/server";

export function desktopRequiredResponse(): NextResponse {
  return NextResponse.json(
    {
      error: {
        code: "DESKTOP_REQUIRED",
        message: "Esta operación requiere Anclora FileStudio Desktop.",
        deploymentTarget: "vercel",
      },
    },
    { status: 503 }
  );
}
