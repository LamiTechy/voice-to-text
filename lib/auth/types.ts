export type SessionRole = "user" | "admin";

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  role: SessionRole;
}

export interface AuthResponse {
  user: SessionUser | null;
}
