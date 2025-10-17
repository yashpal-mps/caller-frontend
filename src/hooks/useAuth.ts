import { useContext } from 'react';
import { AuthContext } from '../contexts/AuthContextType';

// Custom hook to use the auth context
export const useAuth = () => useContext(AuthContext);