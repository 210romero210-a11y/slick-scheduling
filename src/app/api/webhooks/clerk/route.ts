/**
 * ANOLLA SPEC - CLERK WEBHOOK HANDLER
 * Ticket 2: Clerk Auth Setup
 * 
 * Handles Clerk webhooks for user sync and role assignment.
 */

import { Webhook } from "svix";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import type { UserRole } from "@/lib/auth/roles";

// Clerk webhook event types we handle
type ClerkWebhookEvent = {
  type: "user.created" | "user.updated" | "user.deleted";
  data: {
    id: string;
    email_addresses: { email_address: string }[];
    first_name?: string;
    last_name?: string;
    public_metadata?: {
      role?: UserRole;
      studioIds?: string[];
    };
  };
};

export async function POST(req: Request) {
  const WEBHOOK_SECRET = process.env.CLERK_WEBHOOK_SECRET;
  
  if (!WEBHOOK_SECRET) {
    console.error("CLERK_WEBHOOK_SECRET not set");
    return NextResponse.json(
      { error: "Webhook secret not configured" },
      { status: 500 }
    );
  }

  const headerPayload = await headers();
  const svix_id = headerPayload.get("svix-id");
  const svix_timestamp = headerPayload.get("svix-timestamp");
  const svix_signature = headerPayload.get("svix-signature");

  if (!svix_id || !svix_timestamp || !svix_signature) {
    return NextResponse.json(
      { error: "Missing svix headers" },
      { status: 400 }
    );
  }

  const payload = await req.json();
  const body = JSON.stringify(payload);

  const wh = new Webhook(WEBHOOK_SECRET);
  let evt: ClerkWebhookEvent;

  try {
    evt = wh.verify(body, {
      "svix-id": svix_id,
      "svix-timestamp": svix_timestamp,
      "svix-signature": svix_signature,
    }) as ClerkWebhookEvent;
  } catch (err) {
    console.error("Webhook verification failed:", err);
    return NextResponse.json(
      { error: "Webhook verification failed" },
      { status: 400 }
    );
  }

  const { type, data } = evt;

  // Handle user.created - Create new user in Convex
  if (type === "user.created") {
    const email = data.email_addresses[0]?.email_address;
    
    // In a real implementation, you would call Convex mutation here
    // await convex.mutation("users:create", {
    //   clerkUserId: data.id,
    //   email,
    //   name,
    //   role: data.public_metadata?.role ?? "customer",
    //   studioIds: data.public_metadata?.studioIds ?? [],
    // });

    console.log(`User created: ${email} with role: ${data.public_metadata?.role ?? "customer"}`);
  }

  // Handle user.updated - Update user in Convex
  if (type === "user.updated") {
    const email = data.email_addresses[0]?.email_address;
    const name = [data.first_name, data.last_name].filter(Boolean).join(" ") || email;

    // In a real implementation, you would call Convex mutation here
    // await convex.mutation("users:update", {
    //   clerkUserId: data.id,
    //   updates: {
    //     email,
    //     name,
    //     role: data.public_metadata?.role,
    //     studioIds: data.public_metadata?.studioIds,
    //   },
    // });

    console.log(`User updated: ${email}`);
  }

  // Handle user.deleted - Soft delete user in Convex
  if (type === "user.deleted") {
    // In a real implementation, you would call Convex mutation here
    // await convex.mutation("users:deactivate", {
    //   clerkUserId: data.id,
    // });

    console.log(`User deleted: ${data.id}`);
  }

  return NextResponse.json({ success: true });
}