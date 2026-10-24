import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Instrument_Serif } from "next/font/google";
import { Suspense } from "react";
import {
  LiveSidebarNav,
  LiveTabBar,
  MobileHeader,
  SidebarNav,
  TabBar,
} from "@/components/shell/app-nav";
import { TourDock } from "@/components/judge/tour-dock";
import { CommandPalette } from "@/components/shell/command-palette";
import { MotionProvider } from "@/components/shell/motion-provider";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const displaySerif = Instrument_Serif({
  variable: "--font-display-serif",
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
});

export const metadata: Metadata = {
  title: { default: "METAL", template: "%s · METAL" },
  description: "Every moment has a story. Turn your gameplay recordings into searchable memories.",
  applicationName: "METAL",
};

export const viewport: Viewport = {
  themeColor: "#070709",
  colorScheme: "dark",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${displaySerif.variable} h-full antialiased`}
    >
      <body className="metal-backdrop min-h-full">
        <MotionProvider>
          <a
            href="#main"
            className="sr-only z-50 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
          >
            Skip to content
          </a>
          <div className="flex min-h-dvh">
            <aside
              data-shell
              style={{ viewTransitionName: "app-sidebar" }}
              className="sticky top-0 hidden h-dvh w-64 shrink-0 border-r border-line bg-surface/70 px-3 py-5 md:block"
            >
              {/* Pathname is request data under Cache Components; the fallback keeps the shell prerendered. */}
              <Suspense fallback={<SidebarNav pathname={null} />}>
                <LiveSidebarNav />
              </Suspense>
            </aside>
            <main id="main" className="min-w-0 flex-1 pb-28 md:pb-0">
              <MobileHeader />
              {children}
            </main>
          </div>
          <Suspense fallback={<TabBar pathname={null} />}>
            <LiveTabBar />
          </Suspense>
          <CommandPalette />
          {/* The guided judge tour; usePathname needs a boundary under Cache Components. */}
          <Suspense fallback={null}>
            <TourDock />
          </Suspense>
        </MotionProvider>
      </body>
    </html>
  );
}
