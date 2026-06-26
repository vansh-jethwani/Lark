import { Show, SignInButton, SignUpButton, UserButton } from '@clerk/react'
import { Button } from '@heroui/react';
import { ThemeProvider } from './context/ThemeContext';
import { WallpaperProvider } from './context/WallpaperContext';
import { Routes, Route, Navigate } from 'react-router';
import ChatPage from './pages/ChatPage';
import AuthPage from './pages/AuthPage';
import { useAuth } from '@clerk/react';
import PageLoader from './components/PageLoader';
import { useAuthStore } from './store/useAuthStore';
import { Toaster } from 'react-hot-toast';

function App() {

  const { isSignedIn, isLoaded } = useAuth();

  // const { clearAuth, checkAuth, isCheckingAuth } = useAuthStore();

  const clearAuth = useAuthStore((state) => state.clearAuth);
  const checkAuth = useAuthStore((state) => state.checkAuth);
  const isCheckingAuth = useAuthStore((state) => state.isCheckingAuth);

  useEffect(() => {
    if(!isLoaded) return;
    if(isSignedIn) checkAuth();
    else clearAuth();
  }, [isSignedIn, isLoaded, checkAuth, clearAuth]);

  if(!isLoaded || (isSignedIn && isCheckingAuth)) return <PageLoader />;

  return (
    <ThemeProvider>
    <WallpaperProvider>
      <Routes>
        <Route path="/" element={isSignedIn ? <ChatPage /> : <Navigate to="/auth" />} />
        <Route path="/auth" element={isSignedIn ? <Navigate to="/" /> : <AuthPage />} />
      </Routes>
      <Toaster />
    </WallpaperProvider>
    </ThemeProvider>
  )
}

export default App
