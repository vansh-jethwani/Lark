import { create } from "zustand";
import { axiosInstance } from "../lib/axios";
import { io } from "socket.io-client";
import { generateKeyPair, storeKeyPair, getKeyPair, exportPublicKey } from "../lib/crypto";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:4000/api";
const BASE_URL = import.meta.env.MODE === "development" ? API_URL.replace(/\/api\/?$/, "") : "/";

export const useAuthStore = create((set, get) => ({
  authUser: null,
  isCheckingAuth: true,
  onlineUsers: [],
  socket: null,

  checkAuth: async () => {
    set({ isCheckingAuth: true });

    try {
      const res = await axiosInstance.get("/auth/check");
      set({ authUser: res.data });
      get().initCrypto();
      get().connectSocket(res.data);
    } catch (error) {
      console.error("Error in checkAuth:", error);
      set({ authUser: null });
    } finally {
      set({ isCheckingAuth: false });
    }
  },

  signup: async (payload) => {
    const res = await axiosInstance.post("/auth/signup", payload);
    return res.data;
  },

  verifyEmailOtp: async (payload) => {
    const res = await axiosInstance.post("/auth/verify-email-otp", payload);
    set({ authUser: res.data, isCheckingAuth: false });
    get().initCrypto();
    get().connectSocket(res.data);
    return res.data;
  },

  resendEmailOtp: async (email) => {
    const res = await axiosInstance.post("/auth/resend-email-otp", { email });
    return res.data;
  },

  forgotPassword: async (email) => {
    const res = await axiosInstance.post("/auth/forgot-password", { email });
    return res.data;
  },

  verifyResetOtp: async (email, otp) => {
    const res = await axiosInstance.post("/auth/verify-reset-otp", { email, otp });
    return res.data;
  },

  resetPassword: async (email, password) => {
    const res = await axiosInstance.post("/auth/reset-password", { email, password });
    return res.data;
  },
  
  updatePublicKey: async (publicKey) => {
    const res = await axiosInstance.post("/auth/public-key", { publicKey });
    return res.data;
  },

  getPublicKey: async (userId) => {
    const res = await axiosInstance.get(`/auth/public-key/${userId}`);
    return res.data.publicKey;
  },

  login: async (payload) => {
    const res = await axiosInstance.post("/auth/login", payload);
    set({ authUser: res.data, isCheckingAuth: false });
    get().initCrypto();
    get().connectSocket(res.data);
    return res.data;
  },

  initCrypto: async () => {
    try {
      let keyPair = await getKeyPair();
      if (!keyPair) {
        keyPair = await generateKeyPair();
        await storeKeyPair(keyPair);
      }
      const publicKeyBase64 = await exportPublicKey(keyPair.publicKey);
      await get().updatePublicKey(publicKeyBase64);
      set((state) => ({ authUser: state.authUser ? { ...state.authUser, publicKey: publicKeyBase64 } : state.authUser }));
    } catch (err) {
      console.error("Crypto init failed:", err);
    }
  },

  logout: async () => {
    await axiosInstance.post("/auth/logout");
    get().clearAuth();
  },

  clearAuth: () => {
    set({ authUser: null, isCheckingAuth: false, onlineUsers: [] });
    get().disconnectSocket();
  },

  setAuthUser: (authUser) => set({ authUser }),

  connectSocket: (user) => {
    if (!user?._id) return;
    const existingSocket = get().socket;
    if (existingSocket) existingSocket.disconnect();

    const socket = io(BASE_URL, {
    withCredentials: true,
     transports: ["websocket"],
});

    set({ socket });

    socket.off("getOnlineUsers").on("getOnlineUsers", (userIds) => {
      set({ onlineUsers: userIds });
    });
  },

  disconnectSocket: () => {
    const socket = get().socket;
    socket?.disconnect();
    set({ socket: null });
  },
}));
