import type { User } from "@shared/schema";
import { createContext, useCallback, useContext, useEffect, useState } from "react";

/**
 * URL do backend (Railway)
 * Ex: https://adorable-connection-production-5421.up.railway.app
 */
const API_URL = import.meta.env.VITE_API_URL;

if (!API_URL) {
  throw new Error("VITE_API_URL não definida. Configure no Railway.");
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (
    companyName: string,
    name: string,
    email: string,
    password: string
  ) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(() =>
    localStorage.getItem("token")
  );
  const [isLoading, setIsLoading] = useState(true);

  /**
   * Busca usuário logado
   */
  const fetchUser = useCallback(async () => {
    if (!token) {
      setIsLoading(false);
      return;
    }

    try {
      const res = await fetch(`${API_URL}/api/auth/me`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!res.ok) {
        throw new Error("Token inválido");
      }

      const data = await res.json();
      setUser(data.user);
    } catch (err) {
      console.error("[Auth] fetchUser error:", err);
      localStorage.removeItem("token");
      setToken(null);
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchUser();
  }, [fetchUser]);

  /**
   * Login
   */
  const login = async (email: string, password: string) => {
    const res = await fetch(`${API_URL}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });

    const text = await res.text();
    let data: any = {};

    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      throw new Error("Resposta inválida do servidor");
    }

    if (!res.ok) {
      throw new Error(data.message || "Falha no login");
    }

    localStorage.setItem("token", data.token);
    setToken(data.token);
    setUser(data.user);
  };

  /**
   * Registro
   */
  const register = async (
    companyName: string,
    name: string,
    email: string,
    password: string
  ) => {
    const res = await fetch(`${API_URL}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ companyName, name, email, password }),
    });

    const text = await res.text();
    let data: any = {};

    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      throw new Error("Resposta inválida do servidor");
    }

    if (!res.ok) {
      throw new Error(data.message || "Falha no cadastro");
    }

    localStorage.setItem("token", data.token);
    setToken(data.token);
    setUser(data.user);
  };

  /**
   * Logout
   */
  const logout = () => {
    localStorage.removeItem("token");
    setToken(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider
      value={{ user, token, isLoading, login, register, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
}

/**
 * Hook principal
 */
export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}

/**
 * Fetch autenticado
 */
export function useAuthFetch() {
  const { token } = useAuth();

  return useCallback(
    async (url: string, options: RequestInit = {}) => {
      const headers: HeadersInit = {
        ...(options.headers || {}),
      };

      if (token) {
        (headers as Record<string, string>).Authorization = `Bearer ${token}`;
      }

      if (options.body) {
        (headers as Record<string, string>)["Content-Type"] =
          "application/json";
      }

      return fetch(`${API_URL}${url}`, {
        ...options,
        headers,
      });
    },
    [token]
  );
}
