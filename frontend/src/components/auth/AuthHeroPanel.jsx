import { APP_NAME } from "../AppLogo";
import { AuthHeroPattern } from "./AuthHeroPattern";

const heroPanelClassName = [
  "relative hidden h-full flex-col overflow-hidden",
  "bg-muted/20 dark:bg-black",
  "md:flex md:w-1/2 md:border-r md:border-border",
].join(" ");

const heroImageClassName = [
  "w-[min(80%,28rem)]",
  "animate-[auth-float-y_4.5s_ease-in-out_infinite]",
  "object-contain object-center select-none motion-reduce:animate-none",
].join(" ");

export function AuthHeroPanel() {
  return (
    <section className={heroPanelClassName}>
      <AuthHeroPattern />

      <div className="relative z-1 flex h-full flex-col px-10 py-10">
        <div>
          <p className="mb-3 font-mono text-xs font-semibold uppercase tracking-[0.28em] text-muted">
            Secure gateway
          </p>

          <h2 className="font-mono text-3xl font-semibold uppercase tracking-[0.06em] text-foreground">
            Open {APP_NAME}
          </h2>

          <p className="mt-4 max-w-lg font-mono text-sm font-medium leading-relaxed text-muted">
            Chats, photos, and reactions stay in sync — sign in to continue.
          </p>
        </div>

        <div className="flex flex-1 items-center justify-center">
          <img
            src="/auth.png"
            alt=""
            width={640}
            height={640}
            className={heroImageClassName}
            draggable={false}
            decoding="async"
          />
        </div>

        <p className="font-mono text-xs font-medium uppercase tracking-[0.18em] text-muted">
          End-to-end session · Encrypted in transit
        </p>
      </div>
    </section>
  );
}