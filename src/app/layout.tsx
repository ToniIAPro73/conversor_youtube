import type { Metadata, Viewport } from "next";
import "./globals.css";
import { TooltipProvider } from "@/components/ui/tooltip";
import { FILESTUDIO_BRAND } from "@/lib/filestudio-brand";

export const viewport: Viewport = {
  themeColor: FILESTUDIO_BRAND.themeColor,
  width: "device-width",
  initialScale: 1,
};

export const metadata: Metadata = {
  metadataBase: new URL(FILESTUDIO_BRAND.siteUrl),
  applicationName: FILESTUDIO_BRAND.name,
  title: {
    default: FILESTUDIO_BRAND.name,
    template: `%s | ${FILESTUDIO_BRAND.name}`,
  },
  description: FILESTUDIO_BRAND.description,
  icons: {
    icon: [
      { url: "/icon.png", type: "image/png" },
      { url: "/favicon.ico", sizes: "any" },
    ],
    apple: { url: "/icon.png", type: "image/png" },
  },
  openGraph: {
    type: "website",
    siteName: FILESTUDIO_BRAND.name,
    title: FILESTUDIO_BRAND.name,
    description: FILESTUDIO_BRAND.description,
    url: FILESTUDIO_BRAND.siteUrl,
    images: [{ url: FILESTUDIO_BRAND.logoPath, width: 512, height: 512, alt: FILESTUDIO_BRAND.name }],
  },
  twitter: {
    card: "summary",
    title: FILESTUDIO_BRAND.name,
    description: FILESTUDIO_BRAND.description,
    images: [FILESTUDIO_BRAND.logoPath],
  },
  appleWebApp: {
    capable: true,
    title: FILESTUDIO_BRAND.shortName,
    statusBarStyle: "black-translucent",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="es"
      className="h-full antialiased"
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col" suppressHydrationWarning>
        <TooltipProvider>
          {children}
        </TooltipProvider>
      </body>
    </html>
  );
}
