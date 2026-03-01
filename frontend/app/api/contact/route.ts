import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import logger from "@/lib/logger";
import {
  ValidationError,
  DatabaseError,
  AppError,
  ErrorCode,
} from "@/lib/errors";
import { enforceContactRateLimit } from "./rate-limit";

const apiLogger = logger.child("contact-api");
const RESEND_API_URL = "https://api.resend.com/emails";

const contactFormSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters").max(120),
  email: z.string().email("Invalid email address").max(254),
  company: z.string().min(2, "Company name must be at least 2 characters").max(160),
  message: z.string().min(10, "Message must be at least 10 characters").max(5000),
  // Honeypot field - must remain empty.
  website: z.string().trim().max(0, "Bot detection triggered").optional(),
});

type ContactFormData = z.infer<typeof contactFormSchema>;

function getClientIp(request: NextRequest): string {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    const first = forwardedFor.split(",")[0]?.trim();
    if (first) {
      return first;
    }
  }

  const realIp = request.headers.get("x-real-ip")?.trim();
  if (realIp) {
    return realIp;
  }

  return "unknown";
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function getMailConfig(): {
  apiKey: string;
  from: string;
  internalRecipient: string;
} {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new AppError(
      "Email service is not configured.",
      ErrorCode.INTERNAL_ERROR,
      500
    );
  }

  return {
    apiKey,
    from: process.env.CONTACT_FROM_EMAIL || "onboarding@resend.dev",
    internalRecipient:
      process.env.CONTACT_INTERNAL_EMAIL || "enterprise@legal-ai.augustyniak.ai",
  };
}

async function sendResendEmail(
  apiKey: string,
  payload: {
    from: string;
    to: string;
    subject: string;
    html: string;
    reply_to?: string;
  }
): Promise<void> {
  const response = await fetch(RESEND_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "");
    throw new AppError(
      "Failed to deliver contact email.",
      ErrorCode.INTERNAL_ERROR,
      500,
      {
        provider: "resend",
        status: response.status,
        body: errorBody,
      }
    );
  }
}

function buildInternalEmailHtml(contact: ContactFormData): string {
  return [
    "<h2>New Contact Submission</h2>",
    `<p><strong>Name:</strong> ${escapeHtml(contact.name)}</p>`,
    `<p><strong>Email:</strong> ${escapeHtml(contact.email)}</p>`,
    `<p><strong>Company:</strong> ${escapeHtml(contact.company)}</p>`,
    `<p><strong>Message:</strong></p><p>${escapeHtml(contact.message)}</p>`,
  ].join("");
}

function buildConfirmationEmailHtml(contact: ContactFormData): string {
  return [
    `<p>Hello ${escapeHtml(contact.name)},</p>`,
    "<p>Thank you for contacting JuDDGES. Our team received your message and will follow up shortly.</p>",
    "<p>Best regards,<br/>JuDDGES Team</p>",
  ].join("");
}

/**
 * POST /api/contact - Submit contact form
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const requestId = crypto.randomUUID();

  try {
    apiLogger.info("POST /api/contact started", { requestId });

    const body = await request.json().catch(() => ({}));
    const result = contactFormSchema.safeParse(body);

    if (!result.success) {
      apiLogger.warn("Contact form validation failed", {
        requestId,
        errors: result.error.issues,
      });

      throw new ValidationError("Validation error", {
        errors: result.error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      });
    }

    const validatedData: ContactFormData = result.data;
    const ipAddress = getClientIp(request);

    enforceContactRateLimit(ipAddress);

    const supabase = await createClient();
    const submissionId = crypto.randomUUID();

    const { error: insertError } = await supabase.from("contact_submissions").insert({
      id: submissionId,
      name: validatedData.name,
      email: validatedData.email,
      company: validatedData.company,
      message: validatedData.message,
      source: "website",
      ip_address: ipAddress,
      user_agent: request.headers.get("user-agent") || null,
      submitted_at: new Date().toISOString(),
    });

    if (insertError) {
      throw new DatabaseError("Failed to save contact submission", {
        originalError: insertError.message,
      });
    }

    const mailConfig = getMailConfig();

    await sendResendEmail(mailConfig.apiKey, {
      from: mailConfig.from,
      to: mailConfig.internalRecipient,
      subject: `New Contact Form Submission from ${validatedData.company}`,
      reply_to: validatedData.email,
      html: buildInternalEmailHtml(validatedData),
    });

    await sendResendEmail(mailConfig.apiKey, {
      from: mailConfig.from,
      to: validatedData.email,
      subject: "Thank you for contacting JuDDGES",
      html: buildConfirmationEmailHtml(validatedData),
    });

    apiLogger.info("POST /api/contact completed", {
      requestId,
      submissionId,
      company: validatedData.company,
      ipAddress,
    });

    return NextResponse.json(
      {
        success: true,
        message: "Contact form submitted successfully. We'll be in touch soon!",
      },
      { status: 200 }
    );
  } catch (error) {
    apiLogger.error("Contact form submission failed", error, { requestId });

    if (error instanceof AppError) {
      return NextResponse.json(
        {
          success: false,
          ...error.toErrorDetail(),
        },
        { status: error.statusCode }
      );
    }

    return NextResponse.json(
      {
        success: false,
        ...new AppError(
          "An error occurred. Please try again later.",
          ErrorCode.INTERNAL_ERROR
        ).toErrorDetail(),
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/contact - Health check endpoint
 */
export async function GET(): Promise<NextResponse> {
  return NextResponse.json({
    status: "ok",
    endpoint: "contact form API",
  });
}
