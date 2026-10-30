import { createContext, useContext, useState } from "react";
import { login as apiLogin } from "../api";

const AuthCtx = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem("icms_user")); } catch { return null; }
  });

  const login = async (email, password) => {
    const { token, user } = await apiLogin(email, password);
    localStorage.setItem("icms_token", token);
    localStorage.setItem("icms_user", JSON.stringify(user));
    setUser(user);
    return user;
  };
  const logout = () => {
    localStorage.removeItem("icms_token");
    localStorage.removeItem("icms_user");
    setUser(null);
  };
  return <AuthCtx.Provider value={{ user, login, logout }}>{children}</AuthCtx.Provider>;
}

export const useAuth = () => useContext(AuthCtx);
