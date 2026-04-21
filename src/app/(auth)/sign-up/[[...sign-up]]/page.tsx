/**
 * ANOLLA SPEC - CLERK SIGN UP CONFIGURATION
 * Ticket 2: Clerk Auth Setup
 */

import { SignUp } from "@clerk/nextjs";
 
export default function SignUpPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <SignUp 
        routing="path"
        path="/sign-up"
        signInUrl="/sign-in"
        afterSignUpUrl="/onboarding"
        redirectUrl="/onboarding"
      />
    </div>
  );
}