import { AuthActionPanel } from "../components/auth/AuthActionPanel";
import AuthHeader from "../components/auth/AuthHeader";
import { AuthHeroPanel } from "../components/auth/AuthHeroPanel";

function AuthPage() {
  return (
    <div className="h-dvh w-screen overflow-hidden bg-background text-foreground">
      <div className="flex h-full w-full flex-col bg-background">
        <AuthHeader />

        <main className="flex flex-1 overflow-hidden md:flex-row">
          <AuthHeroPanel />
          <AuthActionPanel />
        </main>
      </div>
    </div>
  );
}

export default AuthPage;