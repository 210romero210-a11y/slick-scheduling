/**
 * ANOLLA SPEC - CLERK PROVIDER SETUP
 * Ticket 2: Clerk Auth Setup
 * 
 * Root layout wrapper with Clerk Provider.
 */

import { ClerkProvider } from "@clerk/nextjs/server";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Slick Scheduling - Auto Detailing Booking",
  description: "Best auto-detailing booking platform of 2026",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ClerkProvider
      appearance={{
        elements: {
          rootBox: "clerk-root",
          card: "clerk-card",
          formButtonPrimary: "clerk-button-primary",
          formInput: "clerk-input",
          footerActionLink: "clerk-link",
        },
      }}
    >
      <html lang="en">
        <body>{children}</body>
      </html>
    </ClerkProvider>
  );
}