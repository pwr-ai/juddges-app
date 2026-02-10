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
import type { AlertType, AlertFrequency } from '@/types/email-alert';

const apiLogger = logger.child('email-alerts-api');

const VALID_ALERT_TYPES: AlertType[] = ['saved_search', 'citation_update', 'collection_change'];
const VALID_FREQUENCIES: AlertFrequency[] = ['immediate', 'daily', 'weekly'];
const VALID_DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

/**
 * GET /api/email-alerts - Fetch all email alert subscriptions for the current user
 * Supports optional filtering via ?type=<alert_type>&active=<boolean>
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
    const alertType = searchParams.get("type");
    const activeOnly = searchParams.get("active");

    let query = supabase
      .from("email_alert_subscriptions")
      .select("*, saved_searches(name, query)")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (alertType && VALID_ALERT_TYPES.includes(alertType as AlertType)) {
      query = query.eq("alert_type", alertType);
    }

    if (activeOnly === 'true') {
      query = query.eq("is_active", true);
    }

    const { data: alerts, error: alertError } = await query;

    if (alertError) {
      apiLogger.error("Failed to fetch email alerts", alertError, { requestId });
      throw new DatabaseError("Failed to fetch email alerts", { originalError: alertError.message });
    }

    // Flatten the joined saved_search data
    const result = (alerts || []).map(alert => {
      const { saved_searches, ...rest } = alert;
      return {
        ...rest,
        saved_search: saved_searches || undefined,
      };
    });

    return NextResponse.json(result);

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
    const {
      alert_type,
      saved_search_id,
      document_id,
      collection_id,
      name,
      description,
      frequency,
      digest_day,
      digest_time,
      email_address,
    } = body;

    // Validate required fields
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      throw new ValidationError("Name is required");
    }

    if (name.length > 200) {
      throw new ValidationError("Name must be 200 characters or fewer");
    }

    if (!alert_type || !VALID_ALERT_TYPES.includes(alert_type)) {
      throw new ValidationError("Invalid alert type. Must be one of: saved_search, citation_update, collection_change");
    }

    if (!frequency || !VALID_FREQUENCIES.includes(frequency)) {
      throw new ValidationError("Invalid frequency. Must be one of: immediate, daily, weekly");
    }

    // Validate reference based on alert type
    if (alert_type === 'saved_search' && !saved_search_id) {
      throw new ValidationError("saved_search_id is required for saved_search alerts");
    }
    if (alert_type === 'citation_update' && !document_id) {
      throw new ValidationError("document_id is required for citation_update alerts");
    }
    if (alert_type === 'collection_change' && !collection_id) {
      throw new ValidationError("collection_id is required for collection_change alerts");
    }

    // Validate weekly digest day
    if (frequency === 'weekly' && (!digest_day || !VALID_DAYS.includes(digest_day))) {
      throw new ValidationError("digest_day is required for weekly frequency");
    }

    // Validate email if provided
    if (email_address && typeof email_address === 'string') {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email_address)) {
        throw new ValidationError("Invalid email address format");
      }
    }

    const { data: alert, error: insertError } = await supabase
      .from("email_alert_subscriptions")
      .insert({
        user_id: user.id,
        alert_type,
        saved_search_id: saved_search_id || null,
        document_id: document_id || null,
        collection_id: collection_id || null,
        name: name.trim(),
        description: description || null,
        frequency,
        digest_day: digest_day || null,
        digest_time: digest_time || '09:00:00',
        email_address: email_address || null,
      })
      .select("*, saved_searches(name, query)")
      .single();

    if (insertError) {
      apiLogger.error("Failed to create email alert", insertError, { requestId });
      throw new DatabaseError("Failed to create email alert", { originalError: insertError.message });
    }

    // Flatten joined data
    const { saved_searches, ...rest } = alert;
    const result = { ...rest, saved_search: saved_searches || undefined };

    apiLogger.info('POST /api/email-alerts completed', { requestId, alertId: result.id });

    return NextResponse.json(result, { status: 201 });

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
      throw new ValidationError("Alert subscription ID is required");
    }

    if (updates.name !== undefined && (typeof updates.name !== 'string' || updates.name.trim().length === 0)) {
      throw new ValidationError("Name must be a non-empty string");
    }

    if (updates.frequency !== undefined && !VALID_FREQUENCIES.includes(updates.frequency)) {
      throw new ValidationError("Invalid frequency");
    }

    if (updates.frequency === 'weekly' && updates.digest_day !== undefined && !VALID_DAYS.includes(updates.digest_day)) {
      throw new ValidationError("Invalid digest day");
    }

    // Build update object with only provided fields
    const updateData: Record<string, unknown> = {};
    if (updates.name !== undefined) updateData.name = updates.name.trim();
    if (updates.description !== undefined) updateData.description = updates.description;
    if (updates.is_active !== undefined) updateData.is_active = updates.is_active;
    if (updates.frequency !== undefined) updateData.frequency = updates.frequency;
    if (updates.digest_day !== undefined) updateData.digest_day = updates.digest_day;
    if (updates.digest_time !== undefined) updateData.digest_time = updates.digest_time;
    if (updates.email_address !== undefined) updateData.email_address = updates.email_address;

    const { data: alert, error: updateError } = await supabase
      .from("email_alert_subscriptions")
      .update(updateData)
      .eq("id", id)
      .eq("user_id", user.id)
      .select("*, saved_searches(name, query)")
      .single();

    if (updateError) {
      apiLogger.error("Failed to update email alert", updateError, { requestId });
      throw new DatabaseError("Failed to update email alert", { originalError: updateError.message });
    }

    const { saved_searches, ...rest } = alert;
    const result = { ...rest, saved_search: saved_searches || undefined };

    return NextResponse.json(result);

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
      throw new ValidationError("Alert subscription ID is required");
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
