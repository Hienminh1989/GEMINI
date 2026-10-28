import React, { createContext, useContext, useEffect, useState } from 'react';
import { auth } from '../lib/firebase';
import { onAuthStateChanged, User, signInWithPopup, signInWithRedirect, getRedirectResult, GoogleAuthProvider, signOut } from 'firebase/auth';
import { UserData, Role } from '../types';
import { apiFetch } from '../lib/api';

let cachedAccessToken: string | null = null;
export const getAccessToken = () => cachedAccessToken;

interface AuthContextType {
  user: User | null;
  userData: UserData | null;
  loading: boolean;
  signInWithGoogle: () => Promise<void>;
  loginWithUsername: (username: string, pass: string) => Promise<void>;
  registerUser: (username: string, pass: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  userData: null,
  loading: true,
  signInWithGoogle: async () => {},
  loginWithUsername: async () => {},
  registerUser: async () => {},
  logout: async () => {}
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider: React.FC<{children: React.ReactNode}> = ({ children }) => {
  const [user, setUser] = useState<User | null>(() => {
    try {
      const localUser = localStorage.getItem('local_user') || sessionStorage.getItem('local_user');
      if (localUser) {
        const parsed = JSON.parse(localUser);
        if (parsed && parsed.uid) {
          return { uid: parsed.uid, email: parsed.email, displayName: parsed.name } as any;
        }
      }
    } catch (e) {}
    return null;
  });

  const [userData, setUserData] = useState<UserData | null>(() => {
    try {
      const localUser = localStorage.getItem('local_user') || sessionStorage.getItem('local_user');
      if (localUser) {
        const parsed = JSON.parse(localUser);
        if (parsed && parsed.uid) {
          return parsed;
        }
      }
    } catch (e) {}
    return null;
  });

  const [loading, setLoading] = useState(false);

  useEffect(() => {
    try {
      const localUser = localStorage.getItem('local_user') || sessionStorage.getItem('local_user');
      if (localUser) {
        const parsed = JSON.parse(localUser);
        if (parsed && parsed.uid) {
          setUser({ uid: parsed.uid, email: parsed.email, displayName: parsed.name } as any);
          setUserData(parsed);
          setLoading(false);
          return;
        }
      } else {
        setUser(null);
        setUserData(null);
      }
    } catch (e) {
      setUser(null);
      setUserData(null);
    }
    setLoading(false);
  }, []);

  const signInWithGoogle = async () => {
    const provider = new GoogleAuthProvider();
    try {
      const result = await signInWithPopup(auth, provider);
      const credential = GoogleAuthProvider.credentialFromResult(result);
      if (credential) {
        cachedAccessToken = credential.accessToken || null;
      }
    } catch (error: any) {
      if (error.code === 'auth/popup-blocked' || error.code === 'auth/popup-closed-by-user' || /popup/i.test(error.message)) {
        await signInWithRedirect(auth, provider);
      } else {
        throw error;
      }
    }
  };

  const loginWithUsername = async (username: string, pass: string) => {
    sessionStorage.removeItem('explicit_logout');
    const res = await apiFetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password: pass })
    });
    if (res.ok && res.data?.user) {
      const userObj = res.data.user;
      setUserData(userObj);
      setUser({ uid: userObj.uid, email: userObj.email, displayName: userObj.name } as any);
      localStorage.setItem('local_user', JSON.stringify(userObj));
    } else {
      throw new Error(res.error || 'Sai tên đăng nhập hoặc mật khẩu');
    }
  };

  const registerUser = async (username: string, pass: string) => {
    sessionStorage.removeItem('explicit_logout');
    const email = username + '@local.app';
    const newUid = 'local_' + Date.now().toString();
    const res = await apiFetch('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uid: newUid, email, name: 'Quản trị viên', role: 'super_admin', department: 'Ban Giám Đốc', password: pass })
    });
    if (res.ok && res.data) {
      const created = res.data;
      setUserData(created);
      setUser({ uid: created.uid, email: created.email, displayName: created.name } as any);
      localStorage.setItem('local_user', JSON.stringify(created));
    } else {
      throw new Error(res.error || 'Lỗi đăng ký');
    }
  };

  const logout = async () => {
    try {
      sessionStorage.setItem('explicit_logout', 'true');
      localStorage.removeItem('local_user');
      sessionStorage.removeItem('local_user');
      setUser(null);
      setUserData(null);
      await signOut(auth).catch(() => {});
    } catch (error) {
      console.error('Lỗi đăng xuất:', error);
    }
  };

  return (
    <AuthContext.Provider value={{ user, userData, loading, signInWithGoogle, loginWithUsername, registerUser, logout }}>
      {children}
    </AuthContext.Provider>
  );
};
