import { getSessionUser } from "@/lib/auth/session";
import { errorResponse, jsonOk } from "@/lib/utils/errors";

export async function GET() {
  try {
    const user = await getSessionUser();
    return jsonOk({ user });
  } catch (error) {
    return errorResponse(error);
  }
}
