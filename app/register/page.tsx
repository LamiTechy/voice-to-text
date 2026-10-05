"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { LoadingBlock } from "@/components/ui/spinner";
import { useToast } from "@/components/ui/toast";
import type { SessionUser } from "@/lib/auth/types";
import { collectIssues, registerSchema } from "@/lib/utils/validators";
import { cn } from "@/lib/utils/cn";

function strengthOf(password: string): { score: number; label: string } {
  let score = 0;
  if (password.length >= 8) score += 1;
  if (password.length >= 12) score += 1;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score += 1;
  if (/[0-9]/.test(password)) score += 1;
  if (/[^a-zA-Z0-9]/.test(password)) score += 1;
  const labels = ["Too short", "Weak", "Fair", "Good", "Strong", "Excellent"];
  return { score, label: labels[Math.min(score, labels.length - 1)] ?? "Weak" };
}

function RegisterForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const toast = useToast();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const nextPath = searchParams.get("next") ?? "/dashboard";
  const strength = strengthOf(password);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setFormError(null);

    const parsed = registerSchema.safeParse({ name, email, password });
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
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed.data),
      });
      const payload = (await response.json().catch(() => null)) as
        | { user?: SessionUser; error?: { message?: string } }
        | null;

      if (!response.ok || !payload?.user) {
        const message = payload?.error?.message ?? "Sign-up failed. Please try again.";
        setFormError(message);
        return;
      }

      toast.success(`Welcome, ${payload.user.name}! Your account is ready.`);
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
      <h1 className="text-2xl font-bold tracking-tight">Create your account</h1>
      <p className="mt-1 text-sm text-muted">
        Keep every conversion, revisit past audio and track your usage.
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
          <label htmlFor="register-name" className="label">
            Full name
          </label>
          <input
            id="register-name"
            type="text"
            autoComplete="name"
            className="input"
            value={name}
            onChange={(event) => setName(event.target.value)}
            aria-invalid={Boolean(fieldErrors.name)}
            aria-describedby={fieldErrors.name ? "register-name-error" : undefined}
            placeholder="Ada Lovelace"
            required
          />
          {fieldErrors.name && (
            <p id="register-name-error" className="mt-1 text-xs text-danger">
              {fieldErrors.name}
            </p>
          )}
        </div>

        <div>
          <label htmlFor="register-email" className="label">
            Email address
          </label>
          <input
            id="register-email"
            type="email"
            autoComplete="email"
            className="input"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            aria-invalid={Boolean(fieldErrors.email)}
            aria-describedby={fieldErrors.email ? "register-email-error" : undefined}
            placeholder="you@example.com"
            required
          />
          {fieldErrors.email && (
            <p id="register-email-error" className="mt-1 text-xs text-danger">
              {fieldErrors.email}
            </p>
          )}
        </div>

        <div>
          <label htmlFor="register-password" className="label">
            Password
          </label>
          <input
            id="register-password"
            type="password"
            autoComplete="new-password"
            className="input"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            aria-invalid={Boolean(fieldErrors.password)}
            aria-describedby={fieldErrors.password ? "register-password-error" : "password-strength"}
            placeholder="At least 8 characters"
            required
          />
          <div className="mt-2 flex items-center gap-2" id="password-strength">
            <div className="flex h-1.5 flex-1 gap-1">
              {[0, 1, 2, 3, 4].map((index) => (
                <span
                  key={index}
                  className={cn(
                    "h-full flex-1 rounded-full transition-colors",
                    index < strength.score
                      ? strength.score >= 4
                        ? "bg-success"
                        : strength.score >= 3
                          ? "bg-warning"
                          : "bg-danger"
                      : "bg-subtle",
                  )}
                />
              ))}
            </div>
            <span className="text-xs text-muted">{password ? strength.label : ""}</span>
          </div>
          {fieldErrors.password && (
            <p id="register-password-error" className="mt-1 text-xs text-danger">
              {fieldErrors.password}
            </p>
          )}
          <p className="mt-1 text-xs text-muted">
            Minimum 8 characters with at least one letter and one number.
          </p>
        </div>

        <button type="submit" className="btn btn-primary w-full" disabled={busy}>
          {busy ? "Creating account…" : "Create account"}
        </button>
      </form>

      <p className="mt-5 text-center text-sm text-muted">
        Already registered?{" "}
        <Link href={`/login${nextPath !== "/dashboard" ? `?next=${encodeURIComponent(nextPath)}` : ""}`} className="font-medium text-primary underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}

export default function RegisterPage() {
  return (
    <div className="mx-auto flex min-h-[70vh] max-w-7xl items-center justify-center px-4 py-12 sm:px-6">
      <Suspense fallback={<LoadingBlock label="Loading registration…" />}>
        <RegisterForm />
      </Suspense>
    </div>
  );
}
