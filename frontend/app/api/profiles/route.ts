import { NextResponse } from "next/server";
import { CreateUserProfile, UpdateUserProfile } from "@/types/user_profile";
import { v4 as uuidv4 } from "uuid";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("user_profiles")
      .select("*")
      .order("createdAt", { ascending: false });

    if (error) {
      console.error("GET profiles error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error("GET profiles error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const body: CreateUserProfile = await request.json();

    // Generate a UUID for the new user and add timestamps
    const now = new Date().toISOString();
    const userWithId = {
      ...body,
      id: uuidv4(),
      createdAt: now,
      updatedAt: now,
    };

    const { data, error } = await supabase
      .from("user_profiles")
      .insert([userWithId])
      .select()
      .single();

    if (error) {
      console.error("POST profiles error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error("POST profiles error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function PUT(request: Request) {
  try {
    const supabase = await createClient();
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "ID is required" }, { status: 400 });
    }

    const body: UpdateUserProfile = await request.json();

    // Add updatedAt timestamp
    const updatedBody = {
      ...body,
      updatedAt: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from("user_profiles")
      .update(updatedBody)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      console.error("PUT profiles error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error("PUT profiles error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const supabase = await createClient();
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "ID is required" }, { status: 400 });
    }

    const { error } = await supabase
      .from("user_profiles")
      .delete()
      .eq("id", id);

    if (error) {
      console.error("DELETE profiles error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE profiles error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
