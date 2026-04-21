/**
 * ANOLLA SPEC - CLERK PROVIDER SETUP
 * Ticket 2: Clerk Auth Setup
 * 
 * Root layout wrapper with Clerk Provider.
 * Fixed: Import ClerkProvider from correct package (@clerk/nextjs not @clerk/nextjs/server)
 */

import { ClerkProvider } from "@clerk/nextjs";
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Slick Scheduling - Auto Detailing Booking Platform",
  description: "Best auto-detailing booking platform of 2026. Book your vehicle detailing services easily.",
  keywords: ["auto detailing", "car wash", "vehicle detailing", "booking", "scheduling"],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ClerkProvider>
      <html lang="en">
        <body>{children}</body>
      </html>
    </ClerkProvider>
  );
}