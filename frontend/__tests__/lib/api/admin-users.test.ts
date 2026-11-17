/**
 * /admin/users derives the "confirmed" / "pending" badge from
 * email_confirmed_at. The mapper used to hard-code null, so every account
 * rendered as pending (#885).
 */
import { mapRawAdminUser } from "@/lib/api/admin";

const base = {
  id: "u1",
  email: "a@b.com",
  created_at: "2024-01-01T00:00:00Z",
  last_sign_in_at: null,
  app_metadata: {},
};

describe("mapRawAdminUser", () => {
  it("propagates email_confirmed_at from the backend", () => {
    const user = mapRawAdminUser({
      ...base,
      email_confirmed_at: "2024-01-02T10:00:00+00:00",
    });
    expect(user.email_confirmed_at).toBe("2024-01-02T10:00:00+00:00");
  });

  it("keeps unconfirmed accounts pending (null)", () => {
    expect(
      mapRawAdminUser({ ...base, email_confirmed_at: null }).email_confirmed_at,
    ).toBeNull();
    expect(mapRawAdminUser(base).email_confirmed_at).toBeNull();
  });

  it("flattens is_admin from app_metadata", () => {
    expect(
      mapRawAdminUser({ ...base, app_metadata: { is_admin: true } }).is_admin,
    ).toBe(true);
  });
});
