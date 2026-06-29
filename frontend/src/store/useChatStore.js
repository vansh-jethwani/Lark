import { create } from "zustand";
import { persist } from "zustand/middleware";

import { axiosInstance } from "../lib/axios";
import { useAuthStore } from "./useAuthStore";
import toast from "react-hot-toast";

import { AI_USER, AI_USER_ID } from "../data/aiUser";

const asArray = (value) => (Array.isArray(value) ? value : []);
const getMessagePartnerId = (message, authUserId) =>
  String(message.senderId) === String(authUserId) ? String(message.receiverId) : String(message.senderId);

function sortConversations(conversations) {
  return [...asArray(conversations)].sort(
    (a, b) => new Date(b.lastMessageAt || b.updatedAt || 0) - new Date(a.lastMessageAt || a.updatedAt || 0),
  );
}

function upsertConversation(conversations, partner, lastMessage, unreadCount) {
  if (!partner?._id) return sortConversations(conversations);

  const existing = asArray(conversations).find((conversation) => conversation._id === partner._id);
  const nextConversation = {
    ...(existing || partner),
    ...partner,
    unreadCount,
    lastMessage,
    lastMessageAt: lastMessage?.createdAt || existing?.lastMessageAt || new Date().toISOString(),
  };

  return sortConversations([
    nextConversation,
    ...asArray(conversations).filter((conversation) => conversation._id !== partner._id),
  ]);
}

function updateConversation(conversations, conversationId, updater) {
  return sortConversations(
    asArray(conversations).map((conversation) =>
      conversation._id === conversationId ? updater(conversation) : conversation,
    ),
  );
}

export const useChatStore = create(
  persist(
    (set, get) => ({
      users: [],
      conversations: [],
      messages: [],
      selectedUser: null,
      isConversationsLoading: false,
      isUsersLoading: false,
      isMessagesLoading: false,
      activeConversationId: null,
      searchQuery: "",
      sidebarTab: "chats",
      composerText: "",
      isSoundEnabled: true,
      isSendingMedia: false,

      getUsers: async () => {
        set({ isUsersLoading: true });
        try {
          const res = await axiosInstance.get("/messages/users");
          const users = asArray(res.data);
          set((state) => ({
            users,
            selectedUser:
              state.selectedUser && users.some((user) => user._id === state.selectedUser._id)
                ? state.selectedUser
                : null,
          }));
        } catch (error) {
          console.log("Error in get Users", error.message);
        } finally {
          set({ isUsersLoading: false });
        }
      },

      getConversations: async () => {
        set({ isConversationsLoading: true });
        try {
          const res = await axiosInstance.get("/messages/conversations");
          set({ conversations: sortConversations(res.data) });
        } catch (error) {
          console.log("Error in getConversations", error.message);
        } finally {
          set({ isConversationsLoading: false });
        }
      },

      getMessages: async (userId) => {
        if (userId === AI_USER_ID) {
          set({ isMessagesLoading: true }); // do not clear messages here

          try {
            const res = await axiosInstance.get("/ai/messages");
            const authUser = useAuthStore.getState().authUser;

            const aiMessages = asArray(res.data).map((msg) => ({
              _id: msg._id,
              senderId: msg.role === "user" ? authUser._id : AI_USER_ID,
              receiverId: msg.role === "user" ? AI_USER_ID : authUser._id,
              text: msg.text,
              image: msg.fileType?.startsWith("image/") ? msg.file : "",
              file: !msg.fileType?.startsWith("image/") ? msg.file : "",
              fileName: msg.fileName,
              fileType: msg.fileType,
              fileSize: msg.fileSize,
              createdAt: msg.createdAt,
            }));

            set({ messages: aiMessages });
          } catch (error) {
            toast.error(error.response?.data?.message || "Failed to load AI messages");
            // do not set messages: [] here
          } finally {
            set({ isMessagesLoading: false });
          }

          return;
        }

        set({ isMessagesLoading: true, messages: [] });
        try {
          const res = await axiosInstance.get(`/messages/${userId}`);
          if (get().activeConversationId === userId) {
            set((state) => ({
              messages: asArray(res.data),
              conversations: updateConversation(state.conversations, userId, (conversation) => ({
                ...conversation,
                unreadCount: 0,
              })),
            }));
          }
        } catch (error) {
          if (get().activeConversationId === userId) {
            set({ messages: [] });
          }
          toast.error(error.response?.data?.message || "Failed to load messages");
        } finally {
          if (get().activeConversationId === userId) {
            set({ isMessagesLoading: false });
          }
        }
      },

      sendMessage: async (messageData) => {
        const { selectedUser } = get();
        if (!selectedUser) return false;

        try {
          const res = await axiosInstance.post(`/messages/send/${selectedUser._id}`, messageData);
          set((state) => ({
            messages: asArray(state.messages).some(
              (message) => String(message._id) === String(res.data._id),
            )
              ? state.messages
              : [...asArray(state.messages), res.data],
            composerText: "",
            conversations: upsertConversation(state.conversations, selectedUser, res.data, 0),
          }));
          return true;
        } catch (error) {
          toast.error(error.response?.data?.message || "Failed to send message");
          return false;
        }
      },

      sendAIMessage: async ({ file } = {}) => {
        const messageText = get().composerText.trim();
        const authUser = useAuthStore.getState().authUser;

        if (!messageText && !file) return false;
        if (!authUser?._id) return false;

        const tempId = `temp-ai-${Date.now()}`;
        const isImage = file?.type?.startsWith("image/");

        const tempUserMessage = {
          _id: tempId,
          senderId: authUser._id,
          receiverId: AI_USER_ID,
          text: messageText,
          image: isImage ? URL.createObjectURL(file) : "",
          file: !isImage && file ? "#" : "",
          fileName: file?.name || "",
          fileType: file?.type || "",
          fileSize: file?.size || 0,
          createdAt: new Date().toISOString(),
        };

        set((state) => ({
          messages: [...asArray(state.messages), tempUserMessage],
          composerText: "",
        }));

        try {
          const formData = new FormData();
          formData.append("message", messageText);
          if (file) formData.append("file", file);

          const res = await axiosInstance.post("/ai/chat", formData);

          const { userMessage, aiMessage } = res.data;

          const mappedUserMessage = {
            _id: userMessage._id,
            senderId: authUser._id,
            receiverId: AI_USER_ID,
            text: userMessage.text,
            image: userMessage.fileType?.startsWith("image/") ? userMessage.file : "",
            file: !userMessage.fileType?.startsWith("image/") ? userMessage.file : "",
            fileName: userMessage.fileName,
            fileType: userMessage.fileType,
            fileSize: userMessage.fileSize,
            createdAt: userMessage.createdAt,
          };

          const mappedAIMessage = {
            _id: aiMessage._id,
            senderId: AI_USER_ID,
            receiverId: authUser._id,
            text: aiMessage.text,
            createdAt: aiMessage.createdAt,
          };

          set((state) => ({
            messages: [
              ...asArray(state.messages).filter((msg) => msg._id !== tempId),
              mappedUserMessage,
              mappedAIMessage,
            ],
            conversations: upsertConversation(state.conversations, AI_USER, mappedAIMessage, 0),
          }));

          return true;
        } catch (error) {
          toast.error(error.response?.data?.message || "Failed to get AI response");
          return false;
        }
      },

      subscribeToChatEvents: () => {
        const socket = useAuthStore.getState().socket;
        if (!socket) return;

        socket.off("newMessage");
        socket.off("messagesRead");
        socket.off("conversationRead");

        socket.on("newMessage", async (newMessage) => {
          const authUser = useAuthStore.getState().authUser;
          const authUserId = authUser?._id;
          if (!authUserId) return;

          const partnerId = getMessagePartnerId(newMessage, authUserId);
          const isActiveConversation = String(get().activeConversationId) === partnerId;
          const isIncoming = String(newMessage.senderId) !== String(authUserId);

          set((state) => {
            const partner =
              state.users.find((user) => user._id === partnerId) ||
              state.conversations.find((conversation) => conversation._id === partnerId);
            const hasMessage = asArray(state.messages).some(
              (message) => String(message._id) === String(newMessage._id),
            );
            const existingConversation = state.conversations.find(
              (conversation) => conversation._id === partnerId,
            );
            const unreadCount =
              isIncoming && !isActiveConversation
                ? Number(existingConversation?.unreadCount || 0) + 1
                : 0;

            return {
              messages:
                isActiveConversation && !hasMessage
                  ? [...asArray(state.messages), newMessage]
                  : state.messages,
              conversations: upsertConversation(state.conversations, partner, newMessage, unreadCount),
            };
          });

          if (isIncoming && isActiveConversation) {
            await get().markConversationAsRead(partnerId);
          }
        });

        socket.on("messagesRead", ({ messageIds, readAt }) => {
          const readMessageIds = new Set(asArray(messageIds).map((messageId) => String(messageId)));

          set((state) => ({
            messages: asArray(state.messages).map((message) =>
              readMessageIds.has(String(message._id)) ? { ...message, readAt } : message,
            ),
            conversations: sortConversations(
              asArray(state.conversations).map((conversation) =>
                readMessageIds.has(String(conversation.lastMessage?._id))
                  ? {
                    ...conversation,
                    lastMessage: { ...conversation.lastMessage, readAt },
                  }
                  : conversation,
              ),
            ),
          }));
        });

        socket.on("conversationRead", ({ conversationId }) => {
          set((state) => ({
            conversations: updateConversation(state.conversations, conversationId, (conversation) => ({
              ...conversation,
              unreadCount: 0,
            })),
          }));
        });
      },

      unsubscribeFromMessages: () => {
        const socket = useAuthStore.getState().socket;
        socket?.off("newMessage");
        socket?.off("messagesRead");
        socket?.off("conversationRead");
      },

      setSelectedUser: (selectedUser) => set({ selectedUser }),

      setActiveConversationId: (activeConversationId) => {
        set((state) => {
          const selectedUser =
            activeConversationId === AI_USER_ID
              ? AI_USER
              : state.users.find((user) => user._id === activeConversationId) ||
              state.conversations.find((user) => user._id === activeConversationId) ||
              null;

          return {
            activeConversationId,
            selectedUser,
            messages:
              activeConversationId === state.activeConversationId
                ? state.messages
                : [],
            conversations: activeConversationId
              ? updateConversation(state.conversations, activeConversationId, (conversation) => ({
                ...conversation,
                unreadCount: 0,
              }))
              : state.conversations,
          };
        });
      },

      setSearchQuery: (searchQuery) => set({ searchQuery }),
      setSidebarTab: (sidebarTab) => set({ sidebarTab }),
      setComposerText: (composerText) => set({ composerText }),
      setSoundEnabled: (isSoundEnabled) => set({ isSoundEnabled }),

      sendTextMessage: async (conversationId) => {
        const messageText = get().composerText.trim();
        if (!conversationId || !messageText) return false;

        return get().sendMessage({ text: messageText });
      },

      sendMediaMessage: async ({ conversationId, file }) => {
        if (!conversationId || !file) return false;

        const formData = new FormData();
        formData.append("media", file);

        set({ isSendingMedia: true });
        try {
          return await get().sendMessage(formData);
        } finally {
          set({ isSendingMedia: false });
        }
      },

      markConversationAsRead: async (conversationId) => {
        if (!conversationId) return;

        set((state) => ({
          conversations: updateConversation(state.conversations, conversationId, (conversation) => ({
            ...conversation,
            unreadCount: 0,
          })),
        }));

        try {
          await axiosInstance.patch(`/messages/${conversationId}/read`);
        } catch (error) {
          console.log("Error in markConversationAsRead", error.message);
        }
      },
    }),
    {
      name: "Lark-storage",
      partialize: (state) => ({ isSoundEnabled: state.isSoundEnabled }),
    },
  ),
);
