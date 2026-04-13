import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { ServiceWorkerRegister } from "@/components/ServiceWorkerRegister";
import "./globals.css";

const geist = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const themeColor = "#0f1e3d";

export const metadata: Metadata = {
  title: "Ketolog",
  description: "ケトジェニック食事管理アプリ",
  applicationName: "Ketolog",
  appleWebApp: {
    capable: true,
    title: "Ketolog",
    statusBarStyle: "black-translucent",
  },
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: "/icons/icon-192.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja" className={`${geist.variable} min-h-dvh antialiased`}>
      <body className="min-h-dvh flex flex-col bg-gray-950 text-white touch-manipulation">
        <ServiceWorkerRegister />
        {children}
        <Analytics />
      </body>
    </html>
  );
}
