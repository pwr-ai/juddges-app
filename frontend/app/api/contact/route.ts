import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import logger from '@/lib/logger';
import {
  ValidationError,
  AppError,
  ErrorCode
} from '@/lib/errors';

const apiLogger = logger.child('contact-api');

// Validation schema
const contactFormSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  email: z.string().email("Invalid email address"),
  company: z.string().min(2, "Company name must be at least 2 characters"),
  message: z.string().min(10, "Message must be at least 10 characters"),
});

type ContactFormData = z.infer<typeof contactFormSchema>;

/**
 * POST /api/contact - Submit contact form
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const requestId = crypto.randomUUID();

  try {
    apiLogger.info('POST /api/contact started', { requestId });

    const body = await request.json();

    // Validate input
    const result = contactFormSchema.safeParse(body);

    if (!result.success) {
      apiLogger.warn('Contact form validation failed', {
        requestId,
        errors: result.error.issues
      });

      throw new ValidationError(
        "Validation error",
        {
          errors: result.error.issues.map(issue => ({
            path: issue.path.join('.'),
            message: issue.message
          }))
        }
      );
    }

    const validatedData: ContactFormData = result.data;

    // TODO: Implement email sending using Resend or similar service
    // For now, we'll log the data securely (without full details in prod)
    apiLogger.info("Contact form submission received", {
      requestId,
      company: validatedData.company,
      hasName: !!validatedData.name,
      hasEmail: !!validatedData.email,
      messageLength: validatedData.message.length,
      ip: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown',
      userAgent: request.headers.get('user-agent')
    });

    // TODO: Store in Supabase or database
    // const supabase = await createClient();
    // const { data, error } = await supabase
    //   .from('contact_leads')
    //   .insert([
    //     {
    //       name: validatedData.name,
    //       email: validatedData.email,
    //       company: validatedData.company,
    //       message: validatedData.message,
    //       submitted_at: new Date().toISOString(),
    //       ip_address: request.ip,
    //       user_agent: request.headers.get('user-agent'),
    //     }
    //   ]);

    // TODO: Send email notification
    // await sendEmail({
    //   to: 'enterprise@legal-ai.augustyniak.ai',
    //   subject: `New Contact Form Submission from ${validatedData.company}`,
    //   html: `...`
    // });

    // TODO: Send confirmation email to user
    // await sendEmail({
    //   to: validatedData.email,
    //   subject: 'Thank you for contacting AI-Tax Enterprise',
    //   html: `...`
    // });

    apiLogger.info('POST /api/contact completed', { requestId });

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
          ...error.toErrorDetail()
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
        ).toErrorDetail()
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
