import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getBackendUrl } from '@/app/api/utils/backend-url';

interface SchemaField {
  description?: string;
  type?: string;
  [key: string]: unknown;
}

export async function POST(request: Request) {
  try {
    const apiUrl = getBackendUrl();

    const body = await request.json();
    const {
      message,
      collection_id = null,
      conversation_history = [],
      current_schema = null,
      agent_id = null,
      session_id = null, // New: support session_id
      document_type = "tax_interpretation", // Default to tax interpretation
    } = body;

    // Get user from session
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Use session_id or agent_id (prioritize session_id for new API)
    const sessionIdentifier = session_id || agent_id;

    // Determine if this is the first message or a continuation
    const isFirstMessage = !sessionIdentifier || conversation_history.length === 0;

    let endpoint: string;
    let requestBody: {
      prompt?: string;
      current_schema?: Record<string, unknown> | null;
      document_type?: string;
      collection_id?: string | null;
      user_id?: string;
      user_feedback?: string;
    };

    if (isFirstMessage) {
      // Initialize new generation session using new API
      endpoint = `${apiUrl}/schemas/generate`;
      requestBody = {
        prompt: message,
        current_schema: current_schema || {},
        document_type: document_type,
        collection_id: collection_id,
        user_id: user.id,
      };
    } else {
      // Continue existing conversation using new API
      endpoint = `${apiUrl}/schemas/generate/${sessionIdentifier}/refine`;
      requestBody = {
        user_feedback: message,
      };
    }

    const backendResponse = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": process.env.BACKEND_API_KEY || "",
      },
      body: JSON.stringify(requestBody),
    });

    if (!backendResponse.ok) {
      const errorText = await backendResponse.text();
      console.error("Backend error:", errorText);
      throw new Error(`Failed to generate schema: ${backendResponse.status}`);
    }

    const result = await backendResponse.json();

    // Extract relevant information from response
    // Support both old agent_id and new session_id
    const schema = result.current_schema || result.schema;
    const sessionId = result.session_id || result.agent_id;
    const confidence = result.confidence_score ||
                       result.merged_data_assessment?.confidence_score ||
                       0.8;

    // Generate response message based on agent's last message
    const lastMessage = result.messages?.[result.messages.length - 1];
    const assistantMessage = lastMessage?.content ||
                            generateResponseMessage(message, schema, current_schema, isFirstMessage);

    return NextResponse.json({
      message: assistantMessage,
      schema: schema,
      session_id: sessionId, // New: return session_id
      agent_id: sessionId, // Keep for backward compatibility
      confidence: confidence,
      refinement_rounds: result.refinement_rounds || 0,
      data_refinement_rounds: result.data_refinement_rounds || 0,
      needs_refinement: result.assessment_result?.needs_refinement ||
                       result.merged_data_assessment?.needs_refinement ||
                       false,
      validation_results: {
        assessment: result.assessment_result,
        data_assessment: result.merged_data_assessment,
      },
    });
  } catch (error) {
    console.error("Schema chat error:", error);
    return NextResponse.json(
      { error: "Failed to process schema generation request" },
      { status: 500 }
    );
  }
}

function generateResponseMessage(
  userMessage: string,
  newSchema: Record<string, unknown> | null,
  previousSchema: Record<string, unknown> | null,
  isFirstMessage: boolean
): string {
  // Fallback message generation if agent doesn&apos;t provide one
  if (!newSchema) {
    return "I&apos;m processing your request. Please provide more details about what you'd like to extract.";
  }

  const lowerMessage = userMessage.toLowerCase();
  const schemaFields = newSchema.schema || newSchema || {};
  const fieldCount = Object.keys(schemaFields).length;

  // Check if this is an initial request or a refinement
  if (isFirstMessage || !previousSchema) {
    if (fieldCount === 0) {
      return "I&apos;m working on understanding your requirements. Could you provide more details about what information you'd like to extract?";
    }

    return `I've created an extraction schema with ${fieldCount} field${fieldCount !== 1 ? 's' : ''} based on your requirements. The schema includes:\n\n${
      Object.entries(schemaFields)
        .slice(0, 5)
        .map(([key, value]: [string, unknown]) => {
          const field = value as SchemaField;
          return `• ${key}: ${field.description || field.type}`;
        })
        .join("\n")
    }${fieldCount > 5 ? `\n• ...and ${fieldCount - 5} more field${fieldCount - 5 !== 1 ? 's' : ''}` : ""}\n\nYou can refine this schema by asking me to add, modify, or remove fields.`;
  }

  const previousFields = previousSchema.schema || previousSchema || {};

  // Handle refinement requests
  if (lowerMessage.includes("add") || lowerMessage.includes("include")) {
    const newFields = Object.keys(schemaFields).filter(
      key => !Object.keys(previousFields).includes(key)
    );

    if (newFields.length > 0) {
      return `I've added the following field${newFields.length !== 1 ? 's' : ''} to your schema:\n\n${
        newFields.map(field => `• ${field}`).join("\n")
      }\n\nThe schema now captures the additional information you requested.`;
    }
  }

  if (lowerMessage.includes("remove") || lowerMessage.includes("delete")) {
    const removedFields = Object.keys(previousFields).filter(
      key => !Object.keys(schemaFields).includes(key)
    );

    if (removedFields.length > 0) {
      return `I've removed the following field${removedFields.length !== 1 ? 's' : ''} from your schema:\n\n${
        removedFields.map(field => `• ${field}`).join("\n")
      }\n\nThe schema has been simplified as requested.`;
    }
  }

  if (lowerMessage.includes("required") || lowerMessage.includes("optional")) {
    return `I've updated the field requirements in your schema. The required fields are now properly marked to ensure critical information is always extracted.`;
  }

  if (lowerMessage.includes("format") || lowerMessage.includes("structure")) {
    return `I've restructured the schema to better organize the extracted information. The fields are now grouped more logically for easier processing.`;
  }

  // Default refinement message
  return `I've refined your schema based on your feedback. The updated schema now better captures the information you need to extract from your documents.`;
}