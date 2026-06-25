import { Show, SignInButton, SignUpButton, UserButton } from '@clerk/react'
import { Button } from '@heroui/react';
import { ThemeProvider } from './context/themeContext';
import { WallpaperProvider } from './context/WallpaperContext';
import { Routes, Route, Navigate } from 'react-router';
import ChatPage from './pages/chatPage';
import AuthPage from './pages/AuthPage';
import { useAuth } from '@clerk/react';

function App() {

  const { isSignedIn, isLoaded } = useAuth();

  if(!isLoaded) return <div>Loading...</div>;

  return (
    <ThemeProvider>
    <WallpaperProvider>
      <Routes>
        <Route path="/" element={isSignedIn ? <ChatPage /> : <Navigate to="/auth" />} />
        <Route path="/auth" element={isSignedIn ? <Navigate to="/" /> : <AuthPage />} />
      </Routes>
      
    </WallpaperProvider>
    </ThemeProvider>
  )
}

export default App
