import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { logger } from "@/lib/logger";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { schema, document_ids } = body;

    // Get user from session
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Fetch documents from the collection
    const { error: docError } = await supabase
      .from("documents")
      .select("*")
      .in("id", document_ids)
      .limit(10);

    if (docError) {
      throw new Error("Failed to fetch documents");
    }

    // Mock test results for now (in production, this would call the extraction service)
    const results = await Promise.all(
      document_ids.map(async (docId: string) => {
        // Simulate extraction with random success/failure
        const success = Math.random() > 0.2; // 80% success rate
        const executionTime = Math.random() * 500 + 100; // 100-600ms

        if (success) {
          // Generate mock extracted data based on schema
          const extractedData: Record<string, unknown> = {};
          const schemaFields = schema.schema || schema;

          Object.entries(schemaFields).forEach(([fieldName, fieldConfig]) => {
            const config = fieldConfig as { type?: string };
            if (config.type === "string") {
              extractedData[fieldName] = `Sample ${fieldName} value`;
            } else if (config.type === "array") {
              extractedData[fieldName] = [`Item 1`, `Item 2`];
            } else if (config.type === "number") {
              extractedData[fieldName] = Math.floor(Math.random() * 1000);
            } else if (config.type === "object") {
              extractedData[fieldName] = {
                sample: "object data",
                nested: "value",
              };
            } else {
              extractedData[fieldName] = "Sample value";
            }
          });

          return {
            document_id: docId,
            success: true,
            extracted_data: extractedData,
            execution_time: executionTime,
          };
        } else {
          return {
            document_id: docId,
            success: false,
            error: "Failed to extract data: Schema validation error",
            execution_time: executionTime,
          };
        }
      })
    );

    // Calculate statistics
    const successCount = results.filter(r => r.success).length;
    const totalTime = results.reduce((sum, r) => sum + (r.execution_time || 0), 0);
    const averageTime = totalTime / results.length;

    return NextResponse.json({
      results,
      statistics: {
        total: results.length,
        successful: successCount,
        failed: results.length - successCount,
        success_rate: (successCount / results.length) * 100,
        average_time: averageTime,
      },
    });
  } catch (error) {
    logger.error("Schema test error: ", error);
    return NextResponse.json(
      { error: "Failed to test schema" },
      { status: 500 }
    );
  }
}
