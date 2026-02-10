import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import logger from '@/lib/logger';
import {
  UnauthorizedError,
  DatabaseError,
  AppError,
  ErrorCode
} from '@/lib/errors';

const apiLogger = logger.child('email-alert-log-api');

/**
 * GET /api/email-alerts/log - Fetch email alert history for the current user
 * Supports optional filtering via ?subscription_id=<id>&limit=<number>
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const requestId = crypto.randomUUID();

  try {
    const supabase = await createClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      throw new UnauthorizedError("Authentication required");
    }

    const { searchParams } = new URL(request.url);
    const subscriptionId = searchParams.get("subscription_id");
    const limit = Math.min(parseInt(searchParams.get("limit") || '50', 10), 100);

    let query = supabase
      .from("email_alert_log")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (subscriptionId) {
      query = query.eq("subscription_id", subscriptionId);
    }

    const { data: logs, error: logError } = await query;

    if (logError) {
      apiLogger.error("Failed to fetch email alert logs", logError, { requestId });
      throw new DatabaseError("Failed to fetch alert history", { originalError: logError.message });
    }

    return NextResponse.json(logs || []);

  } catch (error) {
    apiLogger.error("GET /api/email-alerts/log failed", error, { requestId });

    if (error instanceof AppError) {
      return NextResponse.json(error.toErrorDetail(), { status: error.statusCode });
    }

    return NextResponse.json(
      new AppError("Failed to fetch alert history", ErrorCode.INTERNAL_ERROR).toErrorDetail(),
      { status: 500 }
    );
  }
}
