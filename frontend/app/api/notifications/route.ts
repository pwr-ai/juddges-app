import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import logger from '@/lib/logger';
import {
  UnauthorizedError,
  DatabaseError,
  ValidationError,
  AppError,
  ErrorCode
} from '@/lib/errors';

const apiLogger = logger.child('notifications-api');

/**
 * GET /api/notifications - Fetch unread notifications for the current user
 * Returns up to 50 most recent notifications, ordered by created_at desc
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const requestId = crypto.randomUUID();

  try {
    const supabase = await createClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      throw new UnauthorizedError("Authentication required");
    }

    // Support optional ?all=true to include read notifications
    const { searchParams } = new URL(request.url);
    const includeAll = searchParams.get("all") === "true";

    let query = supabase
      .from("notifications")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(50);

    if (!includeAll) {
      query = query.eq("is_read", false);
    }

    const { data: notifications, error: fetchError } = await query;

    if (fetchError) {
      apiLogger.error("Failed to fetch notifications", fetchError, { requestId });
      throw new DatabaseError("Failed to fetch notifications", { originalError: fetchError.message });
    }

    return NextResponse.json(notifications || []);

  } catch (error) {
    apiLogger.error("GET /api/notifications failed", error, { requestId });

    if (error instanceof AppError) {
      return NextResponse.json(error.toErrorDetail(), { status: error.statusCode });
    }

    return NextResponse.json(
      new AppError("Failed to fetch notifications", ErrorCode.INTERNAL_ERROR).toErrorDetail(),
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/notifications - Mark a notification as read
 * Body: { id: string }
 */
export async function PATCH(request: NextRequest): Promise<NextResponse> {
  const requestId = crypto.randomUUID();

  try {
    const supabase = await createClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      throw new UnauthorizedError("Authentication required");
    }

    const body = await request.json().catch(() => ({}));
    const { id } = body;

    if (!id || typeof id !== 'string') {
      throw new ValidationError("Notification ID is required");
    }

    const { data: notification, error: updateError } = await supabase
      .from("notifications")
      .update({ is_read: true })
      .eq("id", id)
      .eq("user_id", user.id)
      .select()
      .single();

    if (updateError) {
      apiLogger.error("Failed to mark notification as read", updateError, { requestId });
      throw new DatabaseError("Failed to update notification", { originalError: updateError.message });
    }

    return NextResponse.json(notification);

  } catch (error) {
    apiLogger.error("PATCH /api/notifications failed", error, { requestId });

    if (error instanceof AppError) {
      return NextResponse.json(error.toErrorDetail(), { status: error.statusCode });
    }

    return NextResponse.json(
      new AppError("Failed to update notification", ErrorCode.INTERNAL_ERROR).toErrorDetail(),
      { status: 500 }
    );
  }
}
