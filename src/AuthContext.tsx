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
      console.log("Auth state changed:", user?.email);
      setUser(user);
      if (user) {
        try {
          console.log("Fetching user doc for:", user.uid);
          // Use a timeout for the getDoc call
          const userDocPromise = getDoc(doc(db, 'users', user.uid));
          const timeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error("Timeout fetching user doc")), 5000)
          );
          
          const userDoc = await Promise.race([userDocPromise, timeoutPromise]) as any;
          
          if (userDoc.exists()) {
            console.log("User doc found, role:", userDoc.data().role);
            setRole(userDoc.data().role || 'viewer');
          } else {
            console.log("User doc not found, creating default...");
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
        } catch (err) {
          console.error("Error in AuthContext Firestore calls:", err);
          // Fallback for the default admin even if Firestore fails
          if (user.email === 'mcdonanzan@gmail.com') {
            setRole('admin');
          }
        }
      } else {
        setRole('viewer');
      }
      setLoading(false);
      console.log("Auth loading finished");
    });

    // Global safety timeout to ensure the app eventually shows something
    const timer = setTimeout(() => {
      setLoading(false);
    }, 8000);

    return () => {
      unsubscribe();
      clearTimeout(timer);
    };
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
