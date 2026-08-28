import { create } from "zustand";
import { axiosInstance } from "../lib/axios";
import { io } from "socket.io-client";

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
    get().connectSocket(res.data);
    return res.data;
  },

  resendEmailOtp: async (email) => {
    const res = await axiosInstance.post("/auth/resend-email-otp", { email });
    return res.data;
  },

  login: async (payload) => {
    const res = await axiosInstance.post("/auth/login", payload);
    set({ authUser: res.data, isCheckingAuth: false });
    get().connectSocket(res.data);
    return res.data;
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
    const existingUserId = existingSocket?.io?.opts?.query?.userId;
    if (existingSocket && String(existingUserId) === String(user._id)) {
      if (!existingSocket.connected) existingSocket.connect();
      return;
    }
    if (existingSocket) existingSocket.disconnect();

    const socket = io(BASE_URL, { query: { userId: user._id } });

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
