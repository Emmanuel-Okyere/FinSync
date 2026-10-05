import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, DM_Sans } from "next/font/google";
import { getSession } from "@/lib/auth/session";
import { FeedbackProvider } from "@/components/feedback";
import "./globals.css";

const display = Bricolage_Grotesque({ subsets: ["latin"], variable: "--font-bricolage", weight: ["500", "600", "700", "800"] });
const sans = DM_Sans({ subsets: ["latin"], variable: "--font-dm-sans" });

export const metadata: Metadata = {
  title: "FinSync",
  description: "Split your pay the way you want, tick off bills as you pay them, and see what's left to spend today.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f5f2ea" },
    { media: "(prefers-color-scheme: dark)", color: "#0d1412" },
  ],
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await getSession().catch(() => null);
  const theme = user?.settings.appearance;
  return (
    <html lang="en-GH" className={`${display.variable} ${sans.variable}`} data-theme={theme && theme !== "system" ? theme : undefined}>
      <body>
        <FeedbackProvider>{children}</FeedbackProvider>
      </body>
    </html>
  );
}
