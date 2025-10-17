
import React, { useState } from 'react';
import type { ReactNode } from 'react';
import { AuthContext } from './AuthContextType';
import type { AuthContextType } from './AuthContextType';

// Props for the AuthProvider component
interface AuthProviderProps {
  children: ReactNode;
}

// Auth provider component
export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [token, setToken] = useState<string | null>(localStorage.getItem('token'));
  const isAuthenticated = !!token;

  // Login function
  const login = (newToken: string) => {
    setToken(newToken);
    localStorage.setItem('token', newToken);
  };

  // Logout function
  const logout = () => {
    setToken(null);
    localStorage.removeItem('token');
  };

  // Create the auth value object
  const authValue: AuthContextType = {
    isAuthenticated,
    token,
    login,
    logout,
  };

  return (
    <AuthContext.Provider value={authValue}>
      {children}
    </AuthContext.Provider>
  );
};
