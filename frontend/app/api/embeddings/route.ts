import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/logger";

const BACKEND_URL = process.env.API_BASE_URL || "http://backend:8002";
const API_KEY = process.env.BACKEND_API_KEY || "";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const endpoint = searchParams.get("endpoint") || "models";

  try {
    const response = await fetch(`${BACKEND_URL}/embeddings/${endpoint}`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": API_KEY,
      },
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: "Backend error" }));
      return NextResponse.json(error, { status: response.status });
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    logger.error("Embeddings API error: ", error);
    return NextResponse.json(
      { error: "Failed to fetch embedding models" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get("action") || "set-active";

  try {
    const body = await request.json();

    let backendPath = "/embeddings/models/active";
    if (action === "test") {
      backendPath = "/embeddings/test";
    }

    const response = await fetch(`${BACKEND_URL}${backendPath}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": API_KEY,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: "Backend error" }));
      return NextResponse.json(error, { status: response.status });
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    logger.error("Embeddings API error: ", error);
    return NextResponse.json(
      { error: "Failed to process embedding request" },
      { status: 500 }
    );
  }
}
