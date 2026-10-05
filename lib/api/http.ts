import { DatabaseNotConfiguredError, getDb, type Database } from "@/lib/db";
import { ApiError } from "@/lib/utils/errors";

/** Returns the database client or throws a user-facing 503 ApiError. */
export function requireDb(): Database {
  try {
    return getDb();
  } catch (error) {
    if (error instanceof DatabaseNotConfiguredError) {
      throw new ApiError("DATABASE_NOT_CONFIGURED", error.message, 503);
    }
    throw error;
  }
}

export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new ApiError("VALIDATION_ERROR", "Request body must be valid JSON.", 400);
  }
}
