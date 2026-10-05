import { clearSessionCookie } from "@/lib/auth/session";
import { errorResponse, jsonOk } from "@/lib/utils/errors";

export async function POST() {
  try {
    await clearSessionCookie();
    return jsonOk({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
