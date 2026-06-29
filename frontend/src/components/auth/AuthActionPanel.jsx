import { useClerk } from "@clerk/react";
import { Button } from "@heroui/react";
import { ArrowRightIcon, ShieldCheckIcon, SparklesIcon } from "lucide-react";
import { AppLogo } from "../AppLogo";
import { AuthCardShell } from "./AuthCardShell";

const AFTER_AUTH = "/";

export function AuthActionPanel() {
  const clerk = useClerk();

  return (
    <section className="flex flex-1 items-center justify-center bg-background px-8 py-8 md:px-16">
      <AuthCardShell>
        <div className="flex flex-col items-center text-center">
          <AppLogo
            size={64}
            className="mb-6 rounded-2xl"
            alt=""
          />

          <div className="mb-2 flex items-center gap-2 text-accent">
            <SparklesIcon className="size-4" />
            <span className="text-xs font-semibold uppercase tracking-widest">
              Secure Entry
            </span>
          </div>

          <h2 className="mb-3 text-3xl font-bold">
            Welcome to Lark
          </h2>

          <p className="mb-10 text-muted">
            Continue securely using your account.
          </p>

          <Button
            fullWidth
            size="lg"
            variant="primary"
            className="h-14 rounded-xl text-base font-semibold"
            onPress={() =>
              clerk.openSignIn({
                fallbackRedirectUrl: AFTER_AUTH,
                forceRedirectUrl: AFTER_AUTH,
              })
            }
          >
            Continue

            <ArrowRightIcon className="ml-2 size-4" />
          </Button>

          <div className="mt-8 flex items-center gap-2 text-sm text-muted">
            <ShieldCheckIcon className="size-4 text-green-500" />
            TLS Protected Session
          </div>
        </div>
      </AuthCardShell>
    </section>
  );
}