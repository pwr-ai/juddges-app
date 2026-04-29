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

const apiLogger = logger.child('email-alerts-api');

/**
 * GET /api/email-alerts - Fetch all email alert subscriptions for the current user
 * Supports optional type filtering via ?type=<frequency>
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
    const type = searchParams.get("type");

    let query = supabase
      .from("email_alert_subscriptions")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (type) {
      query = query.eq("frequency", type);
    }

    const { data: alerts, error: fetchError } = await query;

    if (fetchError) {
      apiLogger.error("Failed to fetch email alerts", fetchError, { requestId });
      throw new DatabaseError("Failed to fetch email alerts", { originalError: fetchError.message });
    }

    return NextResponse.json(alerts || []);

  } catch (error) {
    apiLogger.error("GET /api/email-alerts failed", error, { requestId });

    if (error instanceof AppError) {
      return NextResponse.json(error.toErrorDetail(), { status: error.statusCode });
    }

    return NextResponse.json(
      new AppError("Failed to fetch email alerts", ErrorCode.INTERNAL_ERROR).toErrorDetail(),
      { status: 500 }
    );
  }
}

/**
 * POST /api/email-alerts - Create a new email alert subscription
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const requestId = crypto.randomUUID();

  try {
    const supabase = await createClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      throw new UnauthorizedError("Authentication required");
    }

    const body = await request.json().catch(() => ({}));
    const { name, query: searchQuery, search_config, frequency, channels, webhook_url } = body;

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      throw new ValidationError("Name is required");
    }

    if (name.length > 200) {
      throw new ValidationError("Name must be 200 characters or fewer");
    }

    if (!searchQuery || typeof searchQuery !== 'string' || searchQuery.trim().length === 0) {
      throw new ValidationError("Search query is required");
    }

    // Validate frequency if provided
    if (frequency && !['daily', 'weekly'].includes(frequency)) {
      throw new ValidationError("Frequency must be 'daily' or 'weekly'");
    }

    // Validate channels if provided
    const validChannels = ['email', 'in_app', 'webhook'];
    if (channels && Array.isArray(channels)) {
      const invalidChannels = channels.filter((c: string) => !validChannels.includes(c));
      if (invalidChannels.length > 0) {
        throw new ValidationError(`Invalid channels: ${invalidChannels.join(', ')}`);
      }
    }

    // Require webhook_url when webhook channel is selected
    if (channels?.includes('webhook') && (!webhook_url || typeof webhook_url !== 'string' || webhook_url.trim().length === 0)) {
      throw new ValidationError("Webhook URL is required when webhook channel is selected");
    }

    const { data: alert, error: insertError } = await supabase
      .from("email_alert_subscriptions")
      .insert({
        user_id: user.id,
        name: name.trim(),
        query: searchQuery.trim(),
        search_config: search_config || {},
        frequency: frequency || 'daily',
        channels: channels || ['email'],
        webhook_url: webhook_url || null,
        is_active: true,
      })
      .select()
      .single();

    if (insertError) {
      apiLogger.error("Failed to create email alert", insertError, { requestId });
      throw new DatabaseError("Failed to create email alert", { originalError: insertError.message });
    }

    apiLogger.info('POST /api/email-alerts completed', { requestId, alertId: alert.id });

    return NextResponse.json(alert, { status: 201 });

  } catch (error) {
    apiLogger.error("POST /api/email-alerts failed", error, { requestId });

    if (error instanceof AppError) {
      return NextResponse.json(error.toErrorDetail(), { status: error.statusCode });
    }

    return NextResponse.json(
      new AppError("Failed to create email alert", ErrorCode.INTERNAL_ERROR).toErrorDetail(),
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/email-alerts - Update an email alert subscription
 * Body: { id: string, ...updates }
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
    const { id, ...updates } = body;

    if (!id || typeof id !== 'string') {
      throw new ValidationError("Email alert ID is required");
    }

    if (updates.name !== undefined && (typeof updates.name !== 'string' || updates.name.trim().length === 0)) {
      throw new ValidationError("Name must be a non-empty string");
    }

    if (updates.frequency !== undefined && !['daily', 'weekly'].includes(updates.frequency)) {
      throw new ValidationError("Frequency must be 'daily' or 'weekly'");
    }

    // Build update object with only provided fields
    const updateData: Record<string, unknown> = {};
    if (updates.name !== undefined) updateData.name = updates.name.trim();
    if (updates.query !== undefined) updateData.query = updates.query;
    if (updates.search_config !== undefined) updateData.search_config = updates.search_config;
    if (updates.is_active !== undefined) updateData.is_active = updates.is_active;
    if (updates.frequency !== undefined) updateData.frequency = updates.frequency;
    if (updates.channels !== undefined) updateData.channels = updates.channels;
    if (updates.webhook_url !== undefined) updateData.webhook_url = updates.webhook_url;

    const { data: alert, error: updateError } = await supabase
      .from("email_alert_subscriptions")
      .update(updateData)
      .eq("id", id)
      .eq("user_id", user.id)
      .select()
      .single();

    if (updateError) {
      apiLogger.error("Failed to update email alert", updateError, { requestId });
      throw new DatabaseError("Failed to update email alert", { originalError: updateError.message });
    }

    return NextResponse.json(alert);

  } catch (error) {
    apiLogger.error("PATCH /api/email-alerts failed", error, { requestId });

    if (error instanceof AppError) {
      return NextResponse.json(error.toErrorDetail(), { status: error.statusCode });
    }

    return NextResponse.json(
      new AppError("Failed to update email alert", ErrorCode.INTERNAL_ERROR).toErrorDetail(),
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/email-alerts?id=<alert_id> - Delete an email alert subscription
 */
export async function DELETE(request: NextRequest): Promise<NextResponse> {
  const requestId = crypto.randomUUID();

  try {
    const supabase = await createClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      throw new UnauthorizedError("Authentication required");
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      throw new ValidationError("Email alert ID is required");
    }

    const { error: deleteError } = await supabase
      .from("email_alert_subscriptions")
      .delete()
      .eq("id", id)
      .eq("user_id", user.id);

    if (deleteError) {
      apiLogger.error("Failed to delete email alert", deleteError, { requestId });
      throw new DatabaseError("Failed to delete email alert", { originalError: deleteError.message });
    }

    return NextResponse.json({ success: true });

  } catch (error) {
    apiLogger.error("DELETE /api/email-alerts failed", error, { requestId });

    if (error instanceof AppError) {
      return NextResponse.json(error.toErrorDetail(), { status: error.statusCode });
    }

    return NextResponse.json(
      new AppError("Failed to delete email alert", ErrorCode.INTERNAL_ERROR).toErrorDetail(),
      { status: 500 }
    );
  }
}
