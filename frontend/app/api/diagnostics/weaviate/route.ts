import { NextResponse } from "next/server";
import { createClient } from '@/lib/supabase/server';
import { checkWeaviateHealth, getWeaviateConfig } from '@/lib/weaviate-connection';

export async function GET() {
  try {
    // Get the authenticated user
    const supabase = await createClient();
    const { data: userData, error: userError } = await supabase.auth.getUser();

    if (userError || !userData?.user) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    // Run diagnostics
    const config = getWeaviateConfig();
    const healthCheck = await checkWeaviateHealth(config);
    
    const envInfo = {
      WV_URL: process.env.WV_URL || 'not set',
      WV_HOST: process.env.WV_HOST || 'not set', 
      WV_PORT: process.env.WV_PORT || 'not set',
      WV_GRPC_PORT: process.env.WV_GRPC_PORT || 'not set',
      WV_API_KEY: process.env.WV_API_KEY ? '***set***' : 'not set'
    };

    return NextResponse.json({
      health: healthCheck,
      configuration: config,
      environment: envInfo,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error("Error in Weaviate diagnostics:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Internal server error",
      },
      { status: 500 }
    );
  }
}