import { computeAdminStats } from "@/lib/api/admin";
import { getSessionUser } from "@/lib/auth/session";
import { errorResponse, jsonError, jsonOk } from "@/lib/utils/errors";

export async function GET() {
  try {
    const user = await getSessionUser();
    if (!user) {
      return jsonError("UNAUTHORIZED", "Sign in to continue.", 401);
    }
    if (user.role !== "admin") {
      return jsonError("FORBIDDEN", "Administrator access is required.", 403);
    }

    const stats = await computeAdminStats();
    return jsonOk({ stats });
  } catch (error) {
    return errorResponse(error);
  }
}
