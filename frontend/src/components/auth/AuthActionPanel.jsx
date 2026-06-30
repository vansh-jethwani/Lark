import { Button } from "@heroui/react";
import { ArrowRightIcon, LoaderIcon, ShieldCheckIcon, SparklesIcon } from "lucide-react";
import { useState } from "react";
import toast from "react-hot-toast";
import { useNavigate } from "react-router";
import { AppLogo } from "../AppLogo";
import { useAuthStore } from "../../store/useAuthStore";
import { AuthCardShell } from "./AuthCardShell";

export function AuthActionPanel() {
  const [mode, setMode] = useState("login");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [form, setForm] = useState({
    fullName: "",
    username: "",
    identifier: "",
    email: "",
    password: "",
  });
  const login = useAuthStore((state) => state.login);
  const signup = useAuthStore((state) => state.signup);
  const navigate = useNavigate();
  const isSignup = mode === "signup";

  const updateField = (key, value) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setIsSubmitting(true);
    try {
      if (isSignup) {
        await signup({
          fullName: form.fullName,
          username: form.username,
          email: form.email,
          password: form.password,
        });
      } else {
        await login({
          identifier: form.identifier,
          password: form.password,
        });
      }
      navigate("/", { replace: true });
    } catch (error) {
      toast.error(error.response?.data?.message || "Authentication failed");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section className="flex flex-1 items-center justify-center bg-background px-6 py-8 md:px-16">
      <AuthCardShell>
        <form onSubmit={handleSubmit} className="flex flex-col">
          <div className="flex flex-col items-center text-center">
            <AppLogo size={64} className="mb-6 rounded-2xl" alt="" />

            <div className="mb-2 flex items-center gap-2 text-accent">
              <SparklesIcon className="size-4" />
              <span className="text-xs font-semibold uppercase tracking-widest">
                Secure Entry
              </span>
            </div>

            <h2 className="mb-3 text-3xl font-bold">
              {isSignup ? "Create your Lark" : "Welcome back"}
            </h2>

            <p className="mb-8 text-muted">
              {isSignup ? "Start chatting with your own account." : "Sign in with email or username."}
            </p>
          </div>

          <div className="space-y-3">
            {isSignup ? (
              <>
                <AuthInput
                  label="Full name"
                  value={form.fullName}
                  onChange={(value) => updateField("fullName", value)}
                  autoComplete="name"
                />
                <AuthInput
                  label="Username"
                  value={form.username}
                  onChange={(value) => updateField("username", value)}
                  autoComplete="username"
                />
                <AuthInput
                  label="Email"
                  type="email"
                  value={form.email}
                  onChange={(value) => updateField("email", value)}
                  autoComplete="email"
                />
              </>
            ) : (
              <AuthInput
                label="Email or username"
                value={form.identifier}
                onChange={(value) => updateField("identifier", value)}
                autoComplete="username"
              />
            )}

            <AuthInput
              label="Password"
              type="password"
              value={form.password}
              onChange={(value) => updateField("password", value)}
              autoComplete={isSignup ? "new-password" : "current-password"}
            />
          </div>

          <Button
            type="submit"
            fullWidth
            size="lg"
            variant="primary"
            isDisabled={isSubmitting}
            className="mt-6 h-14 rounded-xl text-base font-semibold"
          >
            {isSubmitting ? <LoaderIcon className="mr-2 size-4 animate-spin" /> : null}
            {isSignup ? "Create account" : "Sign in"}
            {!isSubmitting ? <ArrowRightIcon className="ml-2 size-4" /> : null}
          </Button>

          <button
            type="button"
            onClick={() => setMode(isSignup ? "login" : "signup")}
            className="mt-5 text-sm font-medium text-accent hover:underline"
          >
            {isSignup ? "Already have an account? Sign in" : "New to Lark? Create an account"}
          </button>

          <div className="mt-8 flex items-center justify-center gap-2 text-sm text-muted">
            <ShieldCheckIcon className="size-4 text-green-500" />
            Passwords are bcrypt-protected
          </div>
        </form>
      </AuthCardShell>
    </section>
  );
}

function AuthInput({ label, value, onChange, type = "text", autoComplete }) {
  return (
    <label className="block text-left">
      <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted">
        {label}
      </span>
      <input
        required
        type={type}
        value={value}
        autoComplete={autoComplete}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-xl border border-border bg-surface px-3 py-3 text-sm outline-none transition focus:border-accent/70"
      />
    </label>
  );
}
