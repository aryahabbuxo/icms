import axios from "axios";
import toast from "react-hot-toast";

export const USE_MOCKS = import.meta.env.VITE_USE_MOCKS === "true";
export const api = axios.create({ baseURL: (import.meta.env.VITE_API_URL || "http://localhost:8000") + "/api" });

api.interceptors.request.use((cfg) => {
  const t = localStorage.getItem("icms_token");
  if (t) cfg.headers.Authorization = `Bearer ${t}`;
  return cfg;
});

api.interceptors.response.use(
  (r) => r,
  (err) => {
    const e = err.response?.data?.error;
    if (err.response?.status === 401) {
      localStorage.removeItem("icms_token");
      localStorage.removeItem("icms_user");
      window.location = "/login";
    }
    // Trigger errors arrive as {error:{code,message}}; show the DB's own message.
    toast.error(e ? e.message : "Cannot reach the server", { id: e?.code || "net" });
    return Promise.reject(e || { code: "NETWORK", message: err.message });
  }
);

/** Resolve a mock after a realistic delay, so loading states are visible in mock mode too. */
export const mock = (data, ms = 500) => new Promise((r) => setTimeout(() => r(structuredClone(data)), ms));
