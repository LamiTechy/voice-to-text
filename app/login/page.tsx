"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { LoadingBlock } from "@/components/ui/spinner";
import { useToast } from "@/components/ui/toast";
import type { SessionUser } from "@/lib/auth/types";
import { collectIssues, loginSchema } from "@/lib/utils/validators";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const toast = useToast();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const nextPath = searchParams.get("next") ?? "/dashboard";

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setFormError(null);

    const parsed = loginSchema.safeParse({ email, password });
    if (!parsed.success) {
      const errors: Record<string, string> = {};
      for (const issue of collectIssues(parsed.error)) {
        if (!errors[issue.path]) errors[issue.path] = issue.message;
      }
      setFieldErrors(errors);
      return;
    }
    setFieldErrors({});
    setBusy(true);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed.data),
      });
      const payload = (await response.json().catch(() => null)) as
        | { user?: SessionUser; error?: { message?: string } }
        | null;

      if (!response.ok || !payload?.user) {
        const message = payload?.error?.message ?? "Sign-in failed. Please try again.";
        setFormError(message);
        return;
      }

      toast.success(`Welcome back, ${payload.user.name}.`);
      router.push(nextPath);
      router.refresh();
    } catch {
      setFormError("Network error — check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card w-full max-w-md p-6 sm:p-8">
      <h1 className="text-2xl font-bold tracking-tight">Sign in</h1>
      <p className="mt-1 text-sm text-muted">
        Access your conversion history, statistics and saved audio.
      </p>

      <form onSubmit={submit} className="mt-6 space-y-4" noValidate>
        {formError && (
          <div
            role="alert"
            className="rounded-xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger"
          >
            {formError}
          </div>
        )}

        <div>
          <label htmlFor="login-email" className="label">
            Email address
          </label>
          <input
            id="login-email"
            type="email"
            autoComplete="email"
            className="input"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            aria-invalid={Boolean(fieldErrors.email)}
            aria-describedby={fieldErrors.email ? "login-email-error" : undefined}
            placeholder="you@example.com"
            required
          />
          {fieldErrors.email && (
            <p id="login-email-error" className="mt-1 text-xs text-danger">
              {fieldErrors.email}
            </p>
          )}
        </div>

        <div>
          <label htmlFor="login-password" className="label">
            Password
          </label>
          <input
            id="login-password"
            type="password"
            autoComplete="current-password"
            className="input"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            aria-invalid={Boolean(fieldErrors.password)}
            aria-describedby={fieldErrors.password ? "login-password-error" : undefined}
            placeholder="••••••••"
            required
          />
          {fieldErrors.password && (
            <p id="login-password-error" className="mt-1 text-xs text-danger">
              {fieldErrors.password}
            </p>
          )}
        </div>

        <button type="submit" className="btn btn-primary w-full" disabled={busy}>
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>

      <p className="mt-5 text-center text-sm text-muted">
        New to VoiceBridge?{" "}
        <Link href={`/register${nextPath !== "/dashboard" ? `?next=${encodeURIComponent(nextPath)}` : ""}`} className="font-medium text-primary underline">
          Create an account
        </Link>
      </p>
    </div>
  );
}

export default function LoginPage() {
  return (
    <div className="mx-auto flex min-h-[70vh] max-w-7xl items-center justify-center px-4 py-12 sm:px-6">
      <Suspense fallback={<LoadingBlock label="Loading sign-in…" />}>
        <LoginForm />
      </Suspense>
    </div>
  );
}
