/**
 * ANOLLA SPEC - CLERK AUTHENTICATION CONFIGURATION
 * Ticket 2: Clerk Auth Setup
 * 
 * Environment variables needed:
 * NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
 * CLERK_SECRET_KEY
 */

import { SignIn } from "@clerk/nextjs";
 
export default function SignInPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <SignIn 
        routing="path"
        path="/sign-in"
        signUpUrl="/sign-up"
        afterSignInUrl="/dashboard"
        redirectUrl="/dashboard"
      />
    </div>
  );
}