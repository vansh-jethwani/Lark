import { APP_NAME } from "../AppLogo";
import { AuthHeroPattern } from "./AuthHeroPattern";

const heroPanelClassName = [
  "relative hidden h-full flex-col overflow-hidden",
  "bg-muted/20 dark:bg-black",
  "md:flex md:w-1/2 md:border-r md:border-border",
].join(" ");

const heroImageClassName = [
  "w-[min(72%,24rem)]",
  "animate-[auth-float-y_4.5s_ease-in-out_infinite]",
  "object-contain object-center select-none motion-reduce:animate-none",
].join(" ");

export function AuthHeroPanel() {
  return (
    <section className={heroPanelClassName}>
      <AuthHeroPattern />

      <div className="relative z-10 flex h-full flex-col px-8 py-8 lg:px-10 lg:py-10">
        <div>
          <p className="mb-2 font-mono text-[11px] font-semibold uppercase tracking-[0.24em] text-muted">
            Secure gateway
          </p>

          <h2 className="font-mono text-2xl font-semibold uppercase tracking-[0.04em] text-foreground lg:text-3xl">
            Open {APP_NAME}
          </h2>

          <p className="mt-3 max-w-md font-mono text-[13px] leading-6 text-muted lg:text-sm">
            Chats, photos and reactions stay perfectly in sync.
            Sign in to continue your conversations securely.
          </p>
        </div>

        <div className="flex flex-1 items-center justify-center py-4">
          <img
            src="/auth.png"
            alt=""
            className="w-64 lg:w-72 xl:w-80 object-contain"
            draggable={false}
            decoding="async"
          />
        </div>

        <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted">
          End-to-end encrypted · Private by design
        </p>
      </div>
    </section>
  );
}