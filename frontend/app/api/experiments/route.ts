import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import logger from "@/lib/logger";
import { UnauthorizedError, AppError } from "@/lib/errors";

const apiLogger = logger.child("experiments-api");

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:8004";
const BACKEND_API_KEY = process.env.BACKEND_API_KEY || "";

/**
 * GET /api/experiments - List experiments
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const requestId = crypto.randomUUID();

  try {
    apiLogger.info("GET /api/experiments started", { requestId });

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      throw new UnauthorizedError("Authentication required");
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status") || "";
    const featureArea = searchParams.get("feature_area") || "";
    const endpoint = searchParams.get("endpoint") || "";

    // Route to active experiments endpoint
    let backendPath = "/api/experiments";
    if (endpoint === "active") {
      backendPath = "/api/experiments/active/running";
    }

    const params = new URLSearchParams();
    if (status) params.set("status", status);
    if (featureArea) params.set("feature_area", featureArea);

    const url = `${BACKEND_URL}${backendPath}${params.toString() ? "?" + params.toString() : ""}`;

    const backendResponse = await fetch(url, {
      headers: {
        "X-API-Key": BACKEND_API_KEY,
        "Content-Type": "application/json",
        Authorization: `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
      },
    });

    if (!backendResponse.ok) {
      const errorText = await backendResponse.text();
      apiLogger.error("Backend experiments request failed", {
        requestId,
        status: backendResponse.status,
        error: errorText,
      });
      return NextResponse.json(
        { error: "Failed to fetch experiments", detail: errorText },
        { status: backendResponse.status }
      );
    }

    const data = await backendResponse.json();

    apiLogger.info("GET /api/experiments completed", {
      requestId,
      userId: user.id,
    });

    return NextResponse.json(data);
  } catch (error) {
    apiLogger.error("GET /api/experiments failed", error, { requestId });

    if (error instanceof AppError) {
      return NextResponse.json(error.toErrorDetail(), {
        status: error.statusCode,
      });
    }

    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/experiments - Create experiment, assign variant, or track event
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const requestId = crypto.randomUUID();

  try {
    apiLogger.info("POST /api/experiments started", { requestId });

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      throw new UnauthorizedError("Authentication required");
    }

    const { searchParams } = new URL(request.url);
    const action = searchParams.get("action") || "create";
    const body = await request.json();

    let backendPath = "/api/experiments";
    if (action === "assign") {
      backendPath = `/api/experiments/assign?experiment_id=${body.experiment_id}&variant_id=${body.variant_id}`;
    } else if (action === "track") {
      backendPath = "/api/experiments/track";
    }

    const backendResponse = await fetch(`${BACKEND_URL}${backendPath}`, {
      method: "POST",
      headers: {
        "X-API-Key": BACKEND_API_KEY,
        "Content-Type": "application/json",
        Authorization: `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
      },
      body: action === "assign" ? undefined : JSON.stringify(body),
    });

    if (!backendResponse.ok) {
      const errorText = await backendResponse.text();
      apiLogger.error("Backend experiments POST failed", {
        requestId,
        action,
        status: backendResponse.status,
        error: errorText,
      });
      return NextResponse.json(
        { error: `Failed to ${action} experiment`, detail: errorText },
        { status: backendResponse.status }
      );
    }

    const data = await backendResponse.json();

    apiLogger.info("POST /api/experiments completed", {
      requestId,
      userId: user.id,
      action,
    });

    return NextResponse.json(data);
  } catch (error) {
    apiLogger.error("POST /api/experiments failed", error, { requestId });

    if (error instanceof AppError) {
      return NextResponse.json(error.toErrorDetail(), {
        status: error.statusCode,
      });
    }

    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/experiments - Update an experiment
 */
export async function PATCH(request: NextRequest): Promise<NextResponse> {
  const requestId = crypto.randomUUID();

  try {
    apiLogger.info("PATCH /api/experiments started", { requestId });

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      throw new UnauthorizedError("Authentication required");
    }

    const { searchParams } = new URL(request.url);
    const experimentId = searchParams.get("id");

    if (!experimentId) {
      return NextResponse.json(
        { error: "Missing experiment id" },
        { status: 400 }
      );
    }

    const body = await request.json();

    const backendResponse = await fetch(
      `${BACKEND_URL}/api/experiments/${experimentId}`,
      {
        method: "PATCH",
        headers: {
          "X-API-Key": BACKEND_API_KEY,
          "Content-Type": "application/json",
          Authorization: `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
        },
        body: JSON.stringify(body),
      }
    );

    if (!backendResponse.ok) {
      const errorText = await backendResponse.text();
      apiLogger.error("Backend experiments PATCH failed", {
        requestId,
        experimentId,
        status: backendResponse.status,
        error: errorText,
      });
      return NextResponse.json(
        { error: "Failed to update experiment", detail: errorText },
        { status: backendResponse.status }
      );
    }

    const data = await backendResponse.json();

    apiLogger.info("PATCH /api/experiments completed", {
      requestId,
      userId: user.id,
      experimentId,
    });

    return NextResponse.json(data);
  } catch (error) {
    apiLogger.error("PATCH /api/experiments failed", error, { requestId });

    if (error instanceof AppError) {
      return NextResponse.json(error.toErrorDetail(), {
        status: error.statusCode,
      });
    }

    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
