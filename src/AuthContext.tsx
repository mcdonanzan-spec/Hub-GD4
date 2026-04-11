import React, { createContext, useContext, useEffect, useState } from 'react';
import { auth, db } from './firebase';
import { onAuthStateChanged, User } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  isAdmin: boolean;
  isEditor: boolean;
  role: 'admin' | 'editor' | 'viewer';
}

const AuthContext = createContext<AuthContextType>({ 
  user: null, 
  loading: true, 
  isAdmin: false, 
  isEditor: false, 
  role: 'viewer' 
});

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<'admin' | 'editor' | 'viewer'>('viewer');

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setUser(user);
      if (user) {
        const userDoc = await getDoc(doc(db, 'users', user.uid));
        if (userDoc.exists()) {
          setRole(userDoc.data().role || 'viewer');
        } else {
          const isDefaultAdmin = user.email === 'mcdonanzan@gmail.com';
          const initialRole = isDefaultAdmin ? 'admin' : 'viewer';
          await setDoc(doc(db, 'users', user.uid), {
            email: user.email,
            displayName: user.displayName,
            role: initialRole,
            createdAt: new Date().toISOString()
          });
          setRole(initialRole);
        }
      } else {
        setRole('viewer');
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const isAdmin = role === 'admin';
  const isEditor = role === 'admin' || role === 'editor';

  return (
    <AuthContext.Provider value={{ user, loading, isAdmin, isEditor, role }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
