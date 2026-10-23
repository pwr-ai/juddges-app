/**
 * @jest-environment node
 */
import { GET, dynamic } from "@/app/runtime-env.js/route";

describe("GET /runtime-env.js", () => {
  const saved = process.env.NEXT_PUBLIC_SUPABASE_URL;
  afterEach(() => {
    if (saved === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = saved;
  });

  it("is force-dynamic and uncacheable", async () => {
    expect(dynamic).toBe("force-dynamic");
    const res = GET();
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/^application\/javascript/);
    expect(res.headers.get("cache-control")).toContain("no-store");
  });

  it("serves the value of the running process, request by request", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://first.supabase.co";
    expect(await GET().text()).toContain("https://first.supabase.co");
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://second.supabase.co";
    const body = await GET().text();
    expect(body).toContain("https://second.supabase.co");
    expect(body).not.toContain("first.supabase.co");
    expect(body).toContain("window.__env=Object.assign");
  });
});
