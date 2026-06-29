import { APP_NAME, AppLogo } from "../AppLogo";
import { ThemePresetPicker } from "../ThemePresetPicker";
import { ThemeToggle } from "../ThemeToggle";

function AuthHeader() {
  return (
    <header className="flex h-16 shrink-0 items-center justify-between border-b border-border bg-background px-6">
      <div className="flex items-center gap-3">
        <AppLogo
          size={36}
          className="rounded-lg"
          alt=""
        />

        <div>
          <h1 className="text-xl font-bold">{APP_NAME}</h1>
          <p className="text-sm text-muted">
            Private session
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <ThemePresetPicker />
        <ThemeToggle />
      </div>
    </header>
  );
}

export default AuthHeader;