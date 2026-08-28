import { create } from "zustand";
import { persist } from "zustand/middleware";

import { axiosInstance } from "../lib/axios";
import { useAuthStore } from "./useAuthStore";
import toast from "react-hot-toast";


const asArray = (value) => (Array.isArray(value) ? value : []);
const asId = (value) => String(value?._id || value || "");
const getMessagePartnerId = (message, authUserId) =>
  message.groupId ? asId(message.groupId) : asId(message.senderId) === String(authUserId) ? asId(message.receiverId) : asId(message.senderId);

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

function updateMessageById(messages, messageId, updater) {
  return asArray(messages).map((message) =>
    String(message._id) === String(messageId) ? updater(message) : message,
  );
}

export const useChatStore = create(
  persist(
    (set, get) => ({
      users: [],
      searchedUsers: [],
      conversations: [],
      messages: [],
      selectedUser: null,
      isConversationsLoading: false,
      isUsersLoading: false,
      isMessagesLoading: false,
      isLoadingOlderMessages: false,
      hasMoreMessages: false,
      nextMessageCursor: null,
      activeConversationId: null,
      searchQuery: "",
      sidebarTab: "chats",
      messageSearchQuery: "",
      composerText: "",
      drafts: {},
      replyingTo: null,
      editingMessage: null,
      isSendingMedia: false,
      typingUsers: {},

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
          const [directRes, groupsRes] = await Promise.all([
            axiosInstance.get("/messages/conversations"),
            axiosInstance.get("/groups"),
          ]);
          const conversations = sortConversations([
            ...asArray(directRes.data),
            ...asArray(groupsRes.data).map((group) => ({ ...group, type: "group" })),
          ]);
          set((state) => ({
            conversations,
            selectedUser: state.activeConversationId
              ? conversations.find((conversation) => String(conversation._id) === String(state.activeConversationId)) || null
              : state.selectedUser,
          }));
        } catch (error) {
          console.log("Error in getConversations", error.message);
        } finally {
          set({ isConversationsLoading: false });
        }
      },

      getMessages: async (userId) => {
        set({ isMessagesLoading: true, messages: [], hasMoreMessages: false, nextMessageCursor: null });
        try {
          const conversation = get().conversations.find((item) => String(item._id) === String(userId));
          const baseUrl = conversation?.type === "group" ? `/groups/${userId}/messages` : `/messages/${userId}`;
          const res = await axiosInstance.get(`${baseUrl}?paginated=true&limit=40`);
          const payload = Array.isArray(res.data) ? { messages: res.data, hasMore: false, nextCursor: null } : res.data;
          if (get().activeConversationId === userId) {
            set((state) => ({
              messages: asArray(payload.messages),
              hasMoreMessages: Boolean(payload.hasMore),
              nextMessageCursor: payload.nextCursor || null,
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

      searchUsers: async (query) => {
        const normalizedQuery = String(query || "").trim();
        if (!normalizedQuery) return set({ searchedUsers: [] });
        try {
          const res = await axiosInstance.get(`/messages/users?q=${encodeURIComponent(normalizedQuery)}`);
          set({ searchedUsers: asArray(res.data) });
        } catch (error) {
          console.log("Error searching users", error.message);
          set({ searchedUsers: [] });
        }
      },

      openDirectChat: (user) => {
        if (!user?._id) return;
        set((state) => ({
          users: state.users.some((item) => String(item._id) === String(user._id)) ? state.users : [...state.users, user],
          activeConversationId: user._id,
          selectedUser: user,
          messages: [],
          composerText: state.drafts?.[user._id] || "",
          messageSearchQuery: "",
        }));
      },

      loadOlderMessages: async () => {
        const { activeConversationId, nextMessageCursor, hasMoreMessages, isLoadingOlderMessages } = get();
        if (!activeConversationId || !nextMessageCursor || !hasMoreMessages || isLoadingOlderMessages) return false;
        const conversation = get().conversations.find((item) => String(item._id) === String(activeConversationId));
        const baseUrl = conversation?.type === "group" ? `/groups/${activeConversationId}/messages` : `/messages/${activeConversationId}`;
        set({ isLoadingOlderMessages: true });
        try {
          const res = await axiosInstance.get(`${baseUrl}?paginated=true&limit=40&before=${encodeURIComponent(nextMessageCursor)}`);
          const payload = Array.isArray(res.data) ? { messages: res.data, hasMore: false, nextCursor: null } : res.data;
          if (String(get().activeConversationId) !== String(activeConversationId)) return false;
          set((state) => {
            const existing = new Set(asArray(state.messages).map((message) => String(message._id)));
            return {
              messages: [...asArray(payload.messages).filter((message) => !existing.has(String(message._id))), ...asArray(state.messages)],
              hasMoreMessages: Boolean(payload.hasMore),
              nextMessageCursor: payload.nextCursor || null,
            };
          });
          return true;
        } catch (error) {
          toast.error(error.response?.data?.message || "Failed to load older messages");
          return false;
        } finally { set({ isLoadingOlderMessages: false }); }
      },

      sendMessage: async (messageData) => {
        const { selectedUser } = get();
        if (!selectedUser) return false;

        try {
          const { replyingTo } = get();
          let finalMessageData = messageData;

          if (replyingTo) {
            const replyToId = replyingTo._id || replyingTo.id;

            if (messageData instanceof FormData) {
              finalMessageData = messageData;
              if (!finalMessageData.has("replyTo")) {
                finalMessageData.append("replyTo", replyToId);
              }
            } else {
              finalMessageData = {
                ...messageData,
                replyTo: replyToId,
              };
            }
          }

          const res = await axiosInstance.post(
            selectedUser.type === "group" ? `/groups/${selectedUser._id}/messages` : `/messages/send/${selectedUser._id}`,
            finalMessageData
          );
          set((state) => ({
            messages: asArray(state.messages).some(
              (message) => String(message._id) === String(res.data._id),
            )
              ? state.messages
              : [...asArray(state.messages), res.data],
            composerText: "",
            drafts: { ...state.drafts, [selectedUser._id]: "" },
            replyingTo: null,
            conversations: upsertConversation(state.conversations, selectedUser, res.data, 0),
          }));
          return true;
        } catch (error) {
          toast.error(error.response?.data?.message || "Failed to send message");
          return false;
        }
      },

      createGroup: async (payload) => {
        try {
          const res = await axiosInstance.post("/groups", payload);
          const group = { ...res.data, type: "group" };
          set((state) => ({ conversations: upsertConversation(state.conversations, group, null, 0) }));
          toast.success("Group created");
          return group;
        } catch (error) { toast.error(error.response?.data?.message || "Failed to create group"); return null; }
      },
      updateGroup: async (groupId, payload) => {
        try { const res = await axiosInstance.patch(`/groups/${groupId}`, payload); const group = { ...res.data, type: "group" }; set((state) => ({ conversations: updateConversation(state.conversations, groupId, (old) => ({ ...old, ...group })), selectedUser: state.selectedUser?._id === groupId ? { ...state.selectedUser, ...group } : state.selectedUser })); return group; }
        catch (error) { toast.error(error.response?.data?.message || "Failed to update group"); return null; }
      },
      addGroupMembers: async (groupId, memberIds) => {
        try { const res = await axiosInstance.post(`/groups/${groupId}/members`, { memberIds }); const group = { ...res.data, type: "group" }; set((state) => ({ conversations: updateConversation(state.conversations, groupId, (old) => ({ ...old, ...group })), selectedUser: state.selectedUser?._id === groupId ? { ...state.selectedUser, ...group } : state.selectedUser })); return group; }
        catch (error) { toast.error(error.response?.data?.message || "Failed to add members"); return null; }
      },
      removeGroupMember: async (groupId, userId) => {
        try { const res = await axiosInstance.delete(`/groups/${groupId}/members/${userId}`); const group = { ...res.data.group, type: "group" }; set((state) => ({ conversations: updateConversation(state.conversations, groupId, (old) => ({ ...old, ...group })), selectedUser: state.selectedUser?._id === groupId ? { ...state.selectedUser, ...group } : state.selectedUser })); return group; }
        catch (error) { toast.error(error.response?.data?.message || "Failed to remove member"); return null; }
      },
      leaveGroup: async (groupId) => {
        try { await axiosInstance.post(`/groups/${groupId}/leave`); set((state) => ({ conversations: state.conversations.filter((c) => String(c._id) !== String(groupId)), activeConversationId: String(state.activeConversationId) === String(groupId) ? null : state.activeConversationId, selectedUser: String(state.selectedUser?._id) === String(groupId) ? null : state.selectedUser })); return true; }
        catch (error) { toast.error(error.response?.data?.message || "Failed to leave group"); return false; }
      },
      promoteAdmin: async (groupId, userId) => { try { const res = await axiosInstance.post(`/groups/${groupId}/admins/${userId}/promote`); const group = { ...res.data, type: "group" }; set((state) => ({ conversations: updateConversation(state.conversations, groupId, (old) => ({ ...old, ...group })) })); return group; } catch (error) { toast.error(error.response?.data?.message || "Failed to promote admin"); return null; } },
      demoteAdmin: async (groupId, userId) => { try { const res = await axiosInstance.post(`/groups/${groupId}/admins/${userId}/demote`); const group = { ...res.data, type: "group" }; set((state) => ({ conversations: updateConversation(state.conversations, groupId, (old) => ({ ...old, ...group })) })); return group; } catch (error) { toast.error(error.response?.data?.message || "Failed to demote admin"); return null; } },
      updateGroupPermissions: async (groupId, permissions) => { try { const res = await axiosInstance.patch(`/groups/${groupId}/permissions`, permissions); const group = { ...res.data, type: "group" }; set((state) => ({ conversations: updateConversation(state.conversations, groupId, (old) => ({ ...old, ...group })) })); return group; } catch (error) { toast.error(error.response?.data?.message || "Failed to update permissions"); return null; } },

      editMessage: async (messageId, text) => {
        try {
          const res = await axiosInstance.patch(`/messages/edit/${messageId}`, {
            text,
          });

          set((state) => ({
            messages: updateMessageById(state.messages, messageId, () => res.data),
            composerText: "",
            editingMessage: null,
          }));
          return true;
        } catch (error) {
          toast.error(error.response?.data?.message || "Failed to edit message");
          return false;
        }
      },

      toggleReaction: async (messageId, emoji) => {
        try {
          const res = await axiosInstance.patch(`/messages/reaction/${messageId}`, {
            emoji,
          });

          set((state) => ({
            messages: updateMessageById(state.messages, messageId, () => res.data),
          }));
          return true;
        } catch (error) {
          toast.error(error.response?.data?.message || "Failed to react");
          return false;
        }
      },

      deleteMessage: async (id, type = "me") => {
        try {
          await axiosInstance.delete(`/messages/delete/${id}`, {
            data: { type },
          });

          set((state) => ({
            messages: state.messages.filter((message) => {
              const messageId = message._id || message.id;
              return messageId !== id;
            }),
          }));
        } catch (error) {
          console.log("Error deleting message:", error.response?.data || error.message);
        }
      },

      deleteMessages: async (ids, type = "me") => {
        const messageIds = asArray(ids).filter(Boolean);
        if (messageIds.length === 0) return false;

        try {
          await Promise.all(
            messageIds.map((id) =>
              axiosInstance.delete(`/messages/delete/${id}`, {
                data: { type },
              }),
            ),
          );

          const deletedIds = new Set(messageIds.map((id) => String(id)));
          set((state) => ({
            messages: asArray(state.messages).filter(
              (message) => !deletedIds.has(String(message._id || message.id)),
            ),
          }));

          return true;
        } catch (error) {
          toast.error(error.response?.data?.message || "Failed to delete messages");
          return false;
        }
      },

      togglePinMessage: async (id) => {
        try {
          const res = await axiosInstance.patch(`/messages/pin/${id}`);

          set((state) => ({
            messages: updateMessageById(state.messages, res.data._id, () => res.data),
          }));

          toast.success(res.data.isPinned ? "Message pinned" : "Message unpinned");
          return true;
        } catch (error) {
          toast.error(error.response?.data?.message || "Failed to update pin");
          return false;
        }
      },

      forwardMessage: async ({ messageId, receiverId, receiverIds }) => {
        const targetReceiverIds = receiverIds || (receiverId ? [receiverId] : []);
        if (!messageId || targetReceiverIds.length === 0) return false;

        try {
          const res = await axiosInstance.post(`/messages/forward/${messageId}`, {
            receiverIds: targetReceiverIds,
          });
          const forwardedMessages = asArray(res.data?.messages || res.data);

          set((state) => {
            const nextMessages = forwardedMessages.reduce((messages, forwardedMessage) => {
              const partnerId = getMessagePartnerId(
                forwardedMessage,
                useAuthStore.getState().authUser?._id,
              );
              const isActiveConversation = String(state.activeConversationId) === String(partnerId);
              const hasMessage = asArray(messages).some(
                (message) => String(message._id) === String(forwardedMessage._id),
              );

              return isActiveConversation && !hasMessage
                ? [...asArray(messages), forwardedMessage]
                : messages;
            }, state.messages);

            const nextConversations = forwardedMessages.reduce((conversations, forwardedMessage) => {
              const partnerId = getMessagePartnerId(
                forwardedMessage,
                useAuthStore.getState().authUser?._id,
              );
              const targetUser =
                state.users.find((user) => user._id === partnerId) ||
                state.conversations.find((conversation) => conversation._id === partnerId);

              return upsertConversation(conversations, targetUser, forwardedMessage, 0);
            }, state.conversations);

            return {
              messages: nextMessages,
              conversations: nextConversations,
            };
          });

          toast.success(
            targetReceiverIds.length === 1
              ? "Message forwarded"
              : `Message forwarded to ${targetReceiverIds.length} chats`,
          );
          return true;
        } catch (error) {
          toast.error(error.response?.data?.message || "Failed to forward message");
          return false;
        }
      },

      forwardMessages: async ({ messageIds, receiverIds }) => {
        const sourceMessageIds = asArray(messageIds).filter(Boolean);
        const targetReceiverIds = asArray(receiverIds).filter(Boolean);
        if (sourceMessageIds.length === 0 || targetReceiverIds.length === 0) return false;

        try {
          const responses = await Promise.all(
            sourceMessageIds.map((messageId) =>
              axiosInstance.post(`/messages/forward/${messageId}`, {
                receiverIds: targetReceiverIds,
              }),
            ),
          );
          const forwardedMessages = responses.flatMap((res) =>
            asArray(res.data?.messages || res.data),
          );

          set((state) => {
            const authUserId = useAuthStore.getState().authUser?._id;
            const nextMessages = forwardedMessages.reduce((messages, forwardedMessage) => {
              const partnerId = getMessagePartnerId(forwardedMessage, authUserId);
              const isActiveConversation = String(state.activeConversationId) === String(partnerId);
              const hasMessage = asArray(messages).some(
                (message) => String(message._id) === String(forwardedMessage._id),
              );

              return isActiveConversation && !hasMessage
                ? [...asArray(messages), forwardedMessage]
                : messages;
            }, state.messages);

            const nextConversations = forwardedMessages.reduce((conversations, forwardedMessage) => {
              const partnerId = getMessagePartnerId(forwardedMessage, authUserId);
              const targetUser =
                state.users.find((user) => user._id === partnerId) ||
                state.conversations.find((conversation) => conversation._id === partnerId);

              return upsertConversation(conversations, targetUser, forwardedMessage, 0);
            }, state.conversations);

            return {
              messages: nextMessages,
              conversations: nextConversations,
            };
          });

          toast.success("Messages forwarded");
          return true;
        } catch (error) {
          toast.error(error.response?.data?.message || "Failed to forward messages");
          return false;
        }
      },

      subscribeToChatEvents: () => {
        const socket = useAuthStore.getState().socket;
        if (!socket) return;

        socket.off("newMessage");
        socket.off("messagesRead");
        socket.off("conversationRead");
        socket.off("typing");
        socket.off("messagePinned");
        socket.off("messageReaction");
        socket.off("messageEdited");
        socket.off("messageDeleted");
        socket.off("group:updated");
        socket.off("group:member-added");
        socket.off("group:member-removed");
        socket.off("group:member-left");
        socket.off("group:admin-updated");
        socket.off("group:removed");
        socket.off("group:left");

        const applyGroupUpdate = (payload) => {
          const group = { ...(payload.group || payload), type: "group" };
          if (!group._id) return;
          set((state) => ({
            conversations: updateConversation(state.conversations, group._id, (old) => ({ ...old, ...group })),
            selectedUser: state.selectedUser?._id === group._id ? { ...state.selectedUser, ...group } : state.selectedUser,
          }));
        };
        socket.on("group:updated", applyGroupUpdate);
        ["group:member-added", "group:member-removed", "group:member-left", "group:admin-updated"].forEach((event) => socket.on(event, applyGroupUpdate));
        const removeGroup = ({ groupId }) => set((state) => ({
          conversations: state.conversations.filter((item) => String(item._id) !== String(groupId)),
          activeConversationId: String(state.activeConversationId) === String(groupId) ? null : state.activeConversationId,
        }));
        socket.on("group:removed", removeGroup);
        socket.on("group:left", removeGroup);

        socket.on("typing", ({ senderId, isTyping }) => {
          set((state) => ({
            typingUsers: {
              ...state.typingUsers,
              [senderId]: isTyping,
            },
          }));
        });

        socket.on("newMessage", async (newMessage) => {
          const authUser = useAuthStore.getState().authUser;
          const authUserId = authUser?._id;
          if (!authUserId) return;

          const partnerId = getMessagePartnerId(newMessage, authUserId);
          const isActiveConversation = String(get().activeConversationId) === partnerId;
          const isIncoming = asId(newMessage.senderId) !== String(authUserId);

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

        socket.on("messageEdited", (updatedMessage) => {
          set((state) => ({
            messages: state.messages.map((msg) =>
              msg._id === updatedMessage._id ? updatedMessage : msg
            ),
          }));
        });

        socket.on("messageDeleted", (messageId) => {
          set((state) => ({
            messages: state.messages.filter((msg) => msg._id !== messageId),
          }));
        });

        socket.on("messagePinned", (updatedMessage) => {
          set((state) => ({
            messages: updateMessageById(state.messages, updatedMessage._id, () => updatedMessage),
          }));
        });

        socket.on("messageReaction", (updatedMessage) => {
          set((state) => ({
            messages: updateMessageById(state.messages, updatedMessage._id, () => updatedMessage),
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
        socket?.off("typing");
        socket?.off("messageEdited");
        socket?.off("messageDeleted");
        socket?.off("messagePinned");
        socket?.off("messageReaction");
        ["group:updated", "group:member-added", "group:member-removed", "group:member-left", "group:admin-updated", "group:removed", "group:left"].forEach((event) => socket?.off(event));
      },

      setSelectedUser: (selectedUser) => set({ selectedUser }),

      setActiveConversationId: (activeConversationId) => {
        set((state) => {
          const selectedUser =
            state.users.find((user) => user._id === activeConversationId) ||
              state.conversations.find((user) => user._id === activeConversationId) ||
              null;

          return {
            activeConversationId,
            selectedUser,
            composerText: activeConversationId ? state.drafts?.[activeConversationId] || "" : "",
            messageSearchQuery: "",
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
      setMessageSearchQuery: (messageSearchQuery) => set({ messageSearchQuery }),
      setSidebarTab: (sidebarTab) => set({ sidebarTab }),
      setComposerText: (composerText) => set((state) => ({
        composerText,
        drafts: state.activeConversationId
          ? { ...state.drafts, [state.activeConversationId]: composerText }
          : state.drafts,
      })),
      setReplyingTo: (message) => set({ replyingTo: message }),
      setEditingMessage: (message) =>
        set({
          editingMessage: message,
          replyingTo: null,
          composerText: message?.text || "",
        }),

      clearReplyingTo: () => set({ replyingTo: null }),
      clearEditingMessage: () => set({ editingMessage: null, composerText: "" }),

      sendTextMessage: async (conversationId) => {
        const messageText = get().composerText.trim();
        const { replyingTo, editingMessage } = get();

        if (!conversationId || !messageText) return false;

        if (editingMessage) {
          return get().editMessage(editingMessage.id || editingMessage._id, messageText);
        }

        return get().sendMessage({
          text: messageText,
          replyTo: replyingTo?._id || replyingTo?.id || null,
        });
      },

      sendMediaMessage: async ({ conversationId, file, caption = "" }) => {
        if (!conversationId || !file) return false;

        const { replyingTo } = get();

        const formData = new FormData();
        formData.append("media", file);
        if (caption.trim()) {
          formData.append("text", caption.trim());
        }

        if (replyingTo) {
          formData.append("replyTo", replyingTo._id || replyingTo.id);
        }

        set({ isSendingMedia: true });

        try {
          return await get().sendMessage(formData);
        } finally {
          set({ isSendingMedia: false });
        }
      },

      sendVoiceMessage: async ({ conversationId, file }) => {
        return get().sendMediaMessage({ conversationId, file });
      },

      sendTypingStatus: (receiverId, isTyping) => {
        const socket = useAuthStore.getState().socket;
        if (!socket || !receiverId) return;

        socket.emit("typing", { receiverId, isTyping });
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

      updateLocalUserProfile: (profile) => {
        if (!profile?._id) return;

        const patchUser = (user) =>
          user?._id === profile._id
            ? {
                ...user,
                fullName: profile.fullName,
                username: profile.username,
                profilePic: profile.profilePic,
                bio: profile.bio,
              }
            : user;

        set((state) => ({
          users: asArray(state.users).map(patchUser),
          conversations: asArray(state.conversations).map(patchUser),
          selectedUser:
            state.selectedUser?._id === profile._id
              ? patchUser(state.selectedUser)
              : state.selectedUser,
        }));
      },
    }),
    {
      name: "Lark-storage",
      // Conversations and message histories are fetched on demand; persisting them makes
      // startup slower and can exhaust localStorage for active users.
      partialize: (state) => ({
        sidebarTab: state.sidebarTab,
        activeConversationId: state.activeConversationId,
        drafts: state.drafts,
      }),
    },
  ),
);
