import { create } from "zustand";
import toast from "react-hot-toast";
import { axiosInstance } from "../lib/axios";
import { useAuthStore } from "./useAuthStore";
import { useChatStore } from "./useChatStore";

export const useProfileStore = create((set) => ({
  profile: null,
  isProfileLoading: false,
  isProfileSaving: false,
  isPasswordSaving: false,
  isDeletingAccount: false,

  getProfile: async () => {
    set({ isProfileLoading: true });
    try {
      const res = await axiosInstance.get("/profile");
      set({ profile: res.data });
      return res.data;
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to load profile");
      return null;
    } finally {
      set({ isProfileLoading: false });
    }
  },

  updateProfile: async ({ fullName, username, bio, profilePic }) => {
    set({ isProfileSaving: true });
    try {
      const formData = new FormData();
      formData.append("fullName", fullName);
      formData.append("username", username);
      formData.append("bio", bio || "");
      if (profilePic) formData.append("profilePic", profilePic);

      const res = await axiosInstance.put("/profile", formData);
      set({ profile: res.data });
      useAuthStore.getState().setAuthUser(res.data);
      useChatStore.getState().updateLocalUserProfile(res.data);
      toast.success("Profile updated");
      return res.data;
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to update profile");
      return null;
    } finally {
      set({ isProfileSaving: false });
    }
  },

  updatePassword: async ({ currentPassword, newPassword, confirmPassword }) => {
    set({ isPasswordSaving: true });
    try {
      await axiosInstance.patch("/profile/password", {
        currentPassword,
        newPassword,
        confirmPassword,
      });
      toast.success("Password updated");
      return true;
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to update password");
      return false;
    } finally {
      set({ isPasswordSaving: false });
    }
  },

  deleteProfile: async (password) => {
    set({ isDeletingAccount: true });
    try {
      await axiosInstance.delete("/profile", { data: { password } });
      toast.success("Account deleted");
      return true;
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to delete account");
      return false;
    } finally {
      set({ isDeletingAccount: false });
    }
  },
}));
