import { ThemeProvider } from "./context/ThemeContext";
import { Navigate, Route, Routes } from "react-router";
import ChatPage from "./pages/ChatPage";
import AuthPage from "./pages/AuthPage";
import ProfileSettingsPage from "./pages/ProfileSettingsPage";
import PageLoader from "./components/PageLoader";
import { useAuthStore } from "./store/useAuthStore";
import { useEffect } from "react";

import { Toaster } from "react-hot-toast";

function App() {
  const checkAuth = useAuthStore((state) => state.checkAuth);
  const isCheckingAuth = useAuthStore((state) => state.isCheckingAuth);
  const authUser = useAuthStore((state) => state.authUser);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  if (isCheckingAuth) return <PageLoader />;

  return (
    <ThemeProvider>
        <Routes>
          <Route path="/" element={authUser ? <ChatPage /> : <Navigate to={"/auth"} replace />} />
          <Route
            path="/profile"
            element={authUser ? <ProfileSettingsPage /> : <Navigate to={"/auth"} replace />}
          />
          <Route
            path="/auth"
            element={!authUser ? <AuthPage /> : <Navigate to={"/"} replace />}
          />
        </Routes>
        <Toaster />
    </ThemeProvider>
  );
}

export default App;
