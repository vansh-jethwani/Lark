import { create } from "zustand";
import { persist } from "zustand/middleware";

import { axiosInstance } from "../lib/axios";
import { encryptMessage, decryptMessage } from "../lib/crypto";
import {
  cacheGroupKey,
  clearDecryptedMediaCache,
  decryptTextWithGroupKey,
  dropGroupKeyCache,
  encryptBytesWithGroupKey,
  encryptTextWithGroupKey,
  fetchDecryptedMediaBytes,
  fetchGroupKey,
  generateGroupKey,
  getOwnPublicKeyB64,
  wrapGroupKeyFor,
} from "../lib/groupCrypto";
import { mergeCallHistory, normalizeCallRecord, readCallHistory } from "../lib/callHistory";
import { playMessageSound } from "../lib/sound";
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

// In-flight public-key fetches, keyed by partner userId, so concurrent
// messages from the same partner share a single network request instead
// of firing one GET /auth/public-key/:id per message.
const publicKeyFetchCache = new Map();

async function fetchPartnerPublicKey(partnerId) {
  const key = String(partnerId || "");
  if (!key) return null;
  let pending = publicKeyFetchCache.get(key);
  if (!pending) {
    pending = axiosInstance
      .get(`/auth/public-key/${key}`)
      .then((res) => res.data?.publicKey || null)
      .catch(() => null)
      .finally(() => {
        publicKeyFetchCache.delete(key);
      });
    publicKeyFetchCache.set(key, pending);
  }
  return pending;
}

// Per-conversation request tokens. When the user switches conversations
// quickly (A -> B -> A), a stale response for an older request is ignored
// instead of overwriting fresher state.
const messagesRequestTokens = {};
const olderMessagesRequestTokens = {};

async function postMessageToServer(get, messageData, selectedUser) {
  const { replyingTo } = get();
  // Work on a copy: encryption mutates the payload (FormData.set / object
  // spread), and the caller's original is kept pristine as the retry payload.
  let finalMessageData = messageData;
  if (messageData instanceof FormData) {
    const clone = new FormData();
    messageData.forEach((value, key) => clone.append(key, value));
    finalMessageData = clone;
  }

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

  if (selectedUser.type !== "group") {
    let partnerPubKey = selectedUser.publicKey;
    if (!partnerPubKey) {
      const conv = get().conversations.find((c) => String(c._id) === String(selectedUser._id));
      partnerPubKey = conv?.publicKey;
    }
    if (!partnerPubKey) {
      partnerPubKey = await fetchPartnerPublicKey(selectedUser._id);
    }

    if (partnerPubKey) {
      if (finalMessageData instanceof FormData) {
        const rawText = finalMessageData.get("text");
        if (rawText && typeof rawText === "string" && rawText.trim()) {
          const enc = await encryptMessage(rawText, partnerPubKey);
          if (enc) {
            finalMessageData.set("ciphertext", enc.ciphertext);
            finalMessageData.set("iv", enc.iv);
            finalMessageData.set("text", "");
          }
        }
      } else if (typeof finalMessageData.text === "string" && finalMessageData.text.trim()) {
        const enc = await encryptMessage(finalMessageData.text, partnerPubKey);
        if (enc) {
          finalMessageData = {
            ...finalMessageData,
            ciphertext: enc.ciphertext,
            iv: enc.iv,
            text: "",
          };
        }
      }
    }
  } else {
    // Group E2EE: ensure key coverage (lazy rotation when needed), then
    // encrypt the text and/or media bytes client-side.
    let groupKeyInfo;
    try {
      groupKeyInfo = await ensureGroupKeyForSend(get, selectedUser);
    } catch (error) {
      throw new Error(error?.response?.data?.message || error.message || "Couldn't set up group encryption.", { cause: error });
    }
    const { key: groupKey, version } = groupKeyInfo;
    const mediaKindFor = (mime) =>
      mime.startsWith("image") ? "image" : mime.startsWith("video") ? "video" : mime.startsWith("audio") ? "audio" : "file";

    if (finalMessageData instanceof FormData) {
      const rawText = finalMessageData.get("text");
      if (rawText && typeof rawText === "string" && rawText.trim()) {
        const enc = await encryptTextWithGroupKey(groupKey, rawText);
        finalMessageData.set("ciphertext", enc.ciphertext);
        finalMessageData.set("iv", enc.iv);
        finalMessageData.set("text", "");
      }
      const media = finalMessageData.get("media");
      if (media && typeof media.arrayBuffer === "function" && media.size > 0) {
        const buf = await media.arrayBuffer();
        const encBytes = await encryptBytesWithGroupKey(groupKey, buf);
        const encFile = new File([encBytes.data], media.name || "file", { type: "application/octet-stream" });
        finalMessageData.set("media", encFile);
        finalMessageData.set("mediaKind", mediaKindFor(media.type || ""));
        finalMessageData.set("originalFileType", media.type || "application/octet-stream");
        finalMessageData.set("mediaIv", encBytes.iv);
      }
      finalMessageData.set("keyVersion", String(version));
    } else if (typeof finalMessageData.text === "string" && finalMessageData.text.trim()) {
      const enc = await encryptTextWithGroupKey(groupKey, finalMessageData.text);
      finalMessageData = {
        ...finalMessageData,
        ciphertext: enc.ciphertext,
        iv: enc.iv,
        text: "",
        keyVersion: version,
      };
    } else if (!finalMessageData.media) {
      throw new Error("Message text or media is required.");
    }
  }

  const res = await axiosInstance.post(
    selectedUser.type === "group" ? `/groups/${selectedUser._id}/messages` : `/messages/send/${selectedUser._id}`,
    finalMessageData
  );

  return res.data;
}


async function decryptMessagesArray(messages, get) {
  if (!messages || !Array.isArray(messages)) return messages;
  const authUser = useAuthStore.getState().authUser;
  if (!authUser) return messages;

  return Promise.all(
    messages.map(async (msg) => {
      // Group E2EE: decrypt with the versioned group key.
      if (msg.groupId && msg.ciphertext && msg.iv) {
        const groupId = String(msg.groupId?._id || msg.groupId);
        const version = Number(msg.keyVersion) || 0;
        if (!version) return { ...msg, decryptFailed: true };
        let key = null;
        try {
          key = await fetchGroupKey(groupId, version);
        } catch {
          // leave key null -> decryptFailed below
        }
        if (key) {
          const plaintext = await decryptTextWithGroupKey(key, msg.ciphertext, msg.iv);
          if (plaintext != null) {
            let out = { ...msg, text: plaintext };
            // Encrypted reply preview: decrypt with the same group key.
            const replyTo = msg.replyTo;
            if (replyTo && typeof replyTo === "object" && replyTo.ciphertext && replyTo.iv) {
              const replyPlain = await decryptTextWithGroupKey(key, replyTo.ciphertext, replyTo.iv);
              out = { ...out, replyTo: { ...replyTo, text: replyPlain != null ? replyPlain : "" } };
            }
            return out;
          }
        }
        return { ...msg, decryptFailed: true };
      }
      if (msg.ciphertext && msg.iv) {
        const senderIdStr = String(msg.senderId?._id || msg.senderId);
        const receiverIdStr = String(msg.receiverId?._id || msg.receiverId);
        const isOutgoing = senderIdStr === String(authUser._id);
        const partnerId = isOutgoing ? receiverIdStr : senderIdStr;

        let partnerPubKey = null;
        if (partnerId) {
          const conv = get().conversations.find((c) => String(c._id) === partnerId);
          const userObj = get().users.find((u) => String(u._id) === partnerId);
          partnerPubKey =
            conv?.publicKey ||
            userObj?.publicKey ||
            msg.sender?.publicKey ||
            msg.receiver?.publicKey;

          if (!partnerPubKey) {
            partnerPubKey = await fetchPartnerPublicKey(partnerId);
          }
        }

        if (partnerPubKey) {
          const plaintext = await decryptMessage(msg.ciphertext, msg.iv, partnerPubKey);
          if (plaintext) {
            return { ...msg, text: plaintext };
          }
        }
      }
      return msg;
    })
  );
}

async function decryptSingleMessage(msg, get) {
    const res = await decryptMessagesArray([msg], get);
    return res[0];
}

// ---------------- Group E2EE orchestration ----------------

// Resolve a publicKey for every member: populated member object -> users
// list -> server fallback. Accepts member objects or bare ids.
async function buildPublicKeyMap(get, members) {
  const map = new Map();
  const users = asArray(get().users);
  const userById = new Map(users.map((u) => [String(u._id), u]));
  for (const member of members) {
    const memberId = String(member?._id || member || "");
    if (!memberId || map.has(memberId)) continue;
    let publicKey = member?.publicKey || userById.get(memberId)?.publicKey || null;
    if (!publicKey) {
      try {
        publicKey = await fetchPartnerPublicKey(memberId);
      } catch {
        publicKey = null;
      }
    }
    if (publicKey) map.set(memberId, publicKey);
  }
  return map;
}

// Generate a fresh group key and wrap it for every member id given.
async function wrapKeyForMembers(get, members) {
  const memberIds = members.map((m) => String(m?._id || m || "")).filter(Boolean);
  const publicKeyMap = await buildPublicKeyMap(get, members);
  const missing = memberIds.filter((memberId) => !publicKeyMap.has(memberId));
  if (missing.length > 0) {
    throw new Error("Couldn't set up encryption: a member hasn't opened Lark yet.");
  }
  const groupKey = await generateGroupKey();
  const wraps = [];
  for (const memberId of memberIds) {
    wraps.push({ userId: memberId, wrappedKey: await wrapGroupKeyFor(groupKey, publicKeyMap.get(memberId)) });
  }
  return { groupKey, wraps, memberIds, wrapperPublicKey: await getOwnPublicKeyB64() };
}

// Standalone rotation (lazy rotation before sending when coverage is stale).
// Returns { key, version }. Retries once on version conflicts.
async function rotateGroupKeyNow(get, groupId, expectedVersion, members) {
  const { groupKey, wraps, memberIds, wrapperPublicKey } = await wrapKeyForMembers(get, members);
  const res = await axiosInstance.put(`/groups/${groupId}/key`, {
    expectedVersion,
    wrapperPublicKey,
    wraps,
  });
  const version = Number(res.data?.keyVersion) || expectedVersion + 1;
  cacheGroupKey(groupId, version, groupKey);
  get().applyGroupKeyUpdate(groupId, version, res.data?.keyHolders || memberIds);
  return { key: groupKey, version };
}

// Ensure we hold a group key covering the current member set before sending.
// Rotates lazily when the group was never encrypted or membership changed.
async function ensureGroupKeyForSend(get, group, retried = false) {
  const groupId = String(group._id);
  const memberIds = (group.members || []).map((m) => String(m?._id || m || "")).filter(Boolean);
  const serverVersion = Number(group.keyVersion) || 0;
  const holders = new Set(asArray(group.keyHolders).map(String));
  const covered = serverVersion > 0 && memberIds.length > 0 && memberIds.every((id) => holders.has(id));
  if (covered) {
    try {
      const key = await fetchGroupKey(groupId, serverVersion);
      return { key, version: serverVersion };
    } catch {
      // Our wrap is missing or broken (e.g. keypair changed): rotate to recover.
    }
  }
  try {
    return await rotateGroupKeyNow(get, groupId, serverVersion, group.members || []);
  } catch (error) {
    if (error?.response?.status === 409 && !retried) {
      const { data } = await axiosInstance.get(`/groups/${groupId}`);
      const fresh = { ...data, type: "group" };
      get().applyGroupKeyUpdate(groupId, Number(fresh.keyVersion) || 0, fresh.keyHolders || []);
      return ensureGroupKeyForSend(get, { ...group, ...fresh }, true);
    }
    throw error;
  }
}

// Build a keyRotation payload for an ATOMIC membership change.
// `nextMembers`: member objects/ids AFTER the change. Returns null when the
// group isn't encrypted (no rotation needed).
async function buildKeyRotation(get, group, nextMembers) {
  const serverVersion = Number(group?.keyVersion) || 0;
  if (!serverVersion) return null;
  const { groupKey, wraps, memberIds, wrapperPublicKey } = await wrapKeyForMembers(get, nextMembers);
  return {
    payload: { expectedVersion: serverVersion, wrapperPublicKey, wraps },
    key: groupKey,
    version: serverVersion + 1,
    memberIds,
  };
}

// Forward an ENCRYPTED message: decrypt locally, then re-send as a new
// forwarded message so each target gets content encrypted for THEM
// (ciphertext can't be reused — it was encrypted for other recipients).
async function forwardEncryptedMessage(get, original, target) {
  const decrypted = await decryptSingleMessage(original, get);
  const mediaUrl =
    original.imageOriginal || original.image || original.video || original.audio || original.file;
  if (decrypted?.decryptFailed || (!decrypted?.text?.trim() && !mediaUrl)) return false;

  let sent = 0;
  if (decrypted.text && decrypted.text.trim()) {
    const ok = await get().sendMessageTo(
      target,
      { text: decrypted.text, isForwarded: true, forwardedFrom: String(original._id) },
      { optimistic: false, silent: true }
    );
    if (ok) sent++;
  }
  if (mediaUrl) {
    try {
      let bytes = null;
      let mime = original.fileType || "";
      if (original.groupId && Number(original.keyVersion) > 0 && original.mediaIv) {
        const key = await fetchGroupKey(
          String(original.groupId?._id || original.groupId),
          Number(original.keyVersion)
        );
        const blob = await fetchDecryptedMediaBytes(mediaUrl, key, original.mediaIv, original.fileType);
        if (blob) {
          bytes = blob;
          mime = original.fileType || blob.type;
        }
      } else {
        // Plaintext media (DMs): download and re-upload as-is.
        const res = await fetch(mediaUrl);
        if (res.ok) {
          bytes = await res.blob();
          mime = original.fileType || bytes.type;
        }
      }
      if (bytes) {
        const file = new File([bytes], original.fileName || "media", {
          type: mime || "application/octet-stream",
        });
        const fd = new FormData();
        fd.append("media", file);
        fd.append("isForwarded", "true");
        fd.append("forwardedFrom", String(original._id));
        const ok = await get().sendMessageTo(target, fd, { optimistic: false, silent: true });
        if (ok) sent++;
      }
    } catch {
      // Media forward skipped; the text part (if any) already went through.
    }
  }
  return sent > 0;
}

function resolveForwardTargets(get, targetReceiverIds) {
  return targetReceiverIds
    .map(
      (id) =>
        asArray(get().conversations).find((c) => String(c._id) === String(id)) ||
        asArray(get().users).find((u) => String(u._id) === String(id))
    )
    .filter(Boolean);
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
      messageSearchOpen: false,
      composerText: "",
      drafts: {},
      replyingTo: null,
      editingMessage: null,
      isSendingMedia: false,
      typingUsers: {},
      callHistory: [],
      isCallHistoryLoading: false,
      // disappearing-message timers: peerId -> seconds (0 = off)
      dmDisappearing: {},
      blockedUsers: [],

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
        } catch {
          // Error in get Users
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
        } catch {
          // Error in getConversations
        } finally {
          set({ isConversationsLoading: false });
        }
      },

      fetchCallHistory: async () => {
        if (get().isCallHistoryLoading) return;
        set({ isCallHistoryLoading: true });
        try {
          const res = await axiosInstance.get("/auth/calls");
          const authUser = useAuthStore.getState().authUser;
          set({ callHistory: mergeCallHistory(readCallHistory(), asArray(res.data).map((r) => normalizeCallRecord(r, authUser?._id))) });
        } catch {}
        finally { set({ isCallHistoryLoading: false }); }
      },


      getMessages: async (userId) => {
        const requestToken = (messagesRequestTokens[userId] =
          (messagesRequestTokens[userId] || 0) + 1);
        set({ isMessagesLoading: true, messages: [], hasMoreMessages: false, nextMessageCursor: null });
        try {
          const conversation = get().conversations.find((item) => String(item._id) === String(userId));
          const baseUrl = conversation?.type === "group" ? `/groups/${userId}/messages` : `/messages/${userId}`;
          const res = await axiosInstance.get(`${baseUrl}?paginated=true&limit=40`);
          const payload = Array.isArray(res.data) ? { messages: res.data, hasMore: false, nextCursor: null } : res.data;
          const decryptedMessages = await decryptMessagesArray(payload.messages, get);
          if (messagesRequestTokens[userId] !== requestToken) return;
          if (get().activeConversationId === userId) {
            set((state) => ({
              messages: asArray(decryptedMessages),
              hasMoreMessages: Boolean(payload.hasMore),
              nextMessageCursor: payload.nextCursor || null,
              conversations: updateConversation(state.conversations, userId, (conversation) => ({
                ...conversation,
                unreadCount: 0,
              })),
            }));
          }
        } catch (error) {
          if (messagesRequestTokens[userId] !== requestToken) return;
          if (get().activeConversationId === userId) {
            set({ messages: [] });
          }
          toast.error(error.response?.data?.message || "Failed to load messages");
        } finally {
          if (messagesRequestTokens[userId] === requestToken && get().activeConversationId === userId) {
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
        } catch {
          // Error searching users
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
        const requestToken = (olderMessagesRequestTokens[activeConversationId] =
          (olderMessagesRequestTokens[activeConversationId] || 0) + 1);
        const conversation = get().conversations.find((item) => String(item._id) === String(activeConversationId));
        const baseUrl = conversation?.type === "group" ? `/groups/${activeConversationId}/messages` : `/messages/${activeConversationId}`;
        set({ isLoadingOlderMessages: true });
        try {
          const res = await axiosInstance.get(`${baseUrl}?paginated=true&limit=40&before=${encodeURIComponent(nextMessageCursor)}`);
          const payload = Array.isArray(res.data) ? { messages: res.data, hasMore: false, nextCursor: null } : res.data;
          payload.messages = await decryptMessagesArray(payload.messages, get); // Patched loadOlderMessages
          if (olderMessagesRequestTokens[activeConversationId] !== requestToken) return false;
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
        } finally {
          if (olderMessagesRequestTokens[activeConversationId] === requestToken) {
            set({ isLoadingOlderMessages: false });
          }
        }
      },

      // Core send used by the composer (via sendMessage) and by forwarding
      // (direct target, no optimistic bubble in the open chat).
      sendMessageTo: async (target, messageData, options = {}) => {
        if (!target) return false;

        // Optimistic insert: show the message instantly with a temp id.
        // On success it is replaced by the server message; on failure it is
        // marked "failed" so the user can retry it from the message bubble.
        const authUser = useAuthStore.getState().authUser;
        const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const isFormData = messageData instanceof FormData;
        // Idempotency key: the server dedups retried sends on (senderId, clientId).
        // Generated once per logical send so retries reuse the same key.
        const clientId =
          typeof crypto !== "undefined" && crypto.randomUUID
            ? crypto.randomUUID()
            : `cid-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
        let payloadToSend = messageData;
        if (isFormData) {
          if (!messageData.has("clientId")) messageData.append("clientId", clientId);
        } else {
          payloadToSend = { ...messageData, clientId: messageData?.clientId || clientId };
        }
        const showOptimistic = options.optimistic !== false;
        if (showOptimistic) {
          const optimisticMessage = {
            _id: tempId,
            senderId: authUser?._id,
            receiverId: target.type === "group" ? null : target._id,
            groupId: target.type === "group" ? target._id : null,
            text: isFormData ? String(messageData.get("text") || "") : String(messageData?.text || ""),
            createdAt: new Date().toISOString(),
            status: "sending",
            targetConversationId: target._id,
            pendingPayload: payloadToSend,
          };
          set((state) => ({
            messages: [...asArray(state.messages), optimisticMessage],
          }));
        }

        try {
          const serverMessage = await postMessageToServer(get, payloadToSend, target);
          const decryptedNewMessage = await decryptSingleMessage(serverMessage, get);

          set((state) => {
            const current = asArray(state.messages);
            let replaced = false;
            const next = current.map((message) => {
              if (showOptimistic && String(message._id) === tempId) {
                replaced = true;
                return decryptedNewMessage;
              }
              return message;
            });
            const isActiveTarget = String(state.activeConversationId) === String(target._id);
            const alreadyThere = next.some(
              (message) => String(message._id) === String(decryptedNewMessage._id)
            );
            return {
              messages:
                replaced || alreadyThere || !isActiveTarget
                  ? next
                  : [...next, decryptedNewMessage],
              conversations: upsertConversation(state.conversations, target, decryptedNewMessage, 0),
            };
          });
          return true;
        } catch (error) {
          if (showOptimistic) {
            set((state) => ({
              messages: asArray(state.messages).map((message) =>
                String(message._id) === tempId ? { ...message, status: "failed" } : message,
              ),
            }));
          }
          if (!options.silent) toast.error(error.response?.data?.message || error.message || "Failed to send message");
          return false;
        }
      },

      sendMessage: async (messageData) => {
        const { selectedUser } = get();
        if (!selectedUser) return false;

        // Clear the composer immediately so a fast double-Enter can't fire a
        // second send with the same text. `replyingTo` is left alone here
        // because postMessageToServer reads it after the optimistic insert.
        set((state) => ({ composerText: "", drafts: { ...state.drafts, [selectedUser._id]: "" } }));

        const ok = await get().sendMessageTo(selectedUser, messageData);
        if (ok) {
          set((state) => ({
            composerText: "",
            drafts: { ...state.drafts, [selectedUser._id]: "" },
            replyingTo: null,
          }));
        }
        return ok;
      },

      retrySend: async (tempId) => {
        const temp = asArray(get().messages).find(
          (message) => String(message._id) === String(tempId),
        );
        if (!temp?.pendingPayload) return false;

        const targetId = temp.targetConversationId;
        const target =
          asArray(get().conversations).find((c) => String(c._id) === String(targetId)) ||
          asArray(get().users).find((u) => String(u._id) === String(targetId));
        if (!target) {
          toast.error("Conversation is no longer available");
          return false;
        }

        set((state) => ({
          messages: asArray(state.messages).map((message) =>
            String(message._id) === String(tempId) ? { ...message, status: "sending" } : message,
          ),
        }));

        try {
          const serverMessage = await postMessageToServer(get, temp.pendingPayload, target);
          const decryptedNewMessage = await decryptSingleMessage(serverMessage, get);
          set((state) => {
            const current = asArray(state.messages);
            let replaced = false;
            const next = current.map((message) => {
              if (String(message._id) === String(tempId)) {
                replaced = true;
                return decryptedNewMessage;
              }
              return message;
            });
            return {
              messages: replaced
                ? next
                : current.some(
                    (message) => String(message._id) === String(decryptedNewMessage._id),
                  )
                  ? current
                  : [...current, decryptedNewMessage],
              conversations: upsertConversation(state.conversations, target, decryptedNewMessage, 0),
            };
          });
          return true;
        } catch (error) {
          set((state) => ({
            messages: asArray(state.messages).map((message) =>
              String(message._id) === String(tempId) ? { ...message, status: "failed" } : message,
            ),
          }));
          toast.error(error.response?.data?.message || "Failed to send message");
          return false;
        }
      },

      createGroup: async (payload) => {
        try {
          const authUser = useAuthStore.getState().authUser;
          const selfId = String(authUser?._id || "");
          const memberIds = [...new Set([selfId, ...(payload.memberIds || []).map(String)])].filter(Boolean);
          // E2EE bootstrap: wrap a fresh group key for every member client-side.
          const publicKeyMap = await buildPublicKeyMap(get(), memberIds);
          const selfPublicKey = await getOwnPublicKeyB64();
          publicKeyMap.set(selfId, selfPublicKey);
          const missing = memberIds.filter((id) => !publicKeyMap.has(id));
          if (missing.length > 0) {
            toast.error("Couldn't set up encryption: a member hasn't opened Lark yet.");
            return null;
          }
          const groupKey = await generateGroupKey();
          const keyWraps = [];
          for (const id of memberIds) {
            keyWraps.push({ userId: id, wrappedKey: await wrapGroupKeyFor(groupKey, publicKeyMap.get(id)) });
          }
          const res = await axiosInstance.post("/groups", {
            ...payload,
            keyWraps,
            keyWrapperPublicKey: selfPublicKey,
          });
          const group = { ...res.data, type: "group" };
          cacheGroupKey(group._id, Number(group.keyVersion) || 1, groupKey);
          set((state) => ({ conversations: upsertConversation(state.conversations, group, null, 0) }));
          toast.success("Group created");
          return group;
        } catch (error) { toast.error(error.response?.data?.message || "Failed to create group"); return null; }
      },
      updateGroup: async (groupId, payload) => {
        try { const res = await axiosInstance.patch(`/groups/${groupId}`, payload); const group = { ...res.data, type: "group" }; set((state) => ({ conversations: updateConversation(state.conversations, groupId, (old) => ({ ...old, ...group })), selectedUser: state.selectedUser?._id === groupId ? { ...state.selectedUser, ...group } : state.selectedUser })); return group; }
        catch (error) { toast.error(error.response?.data?.message || "Failed to update group"); return null; }
      },
      // Group E2EE: refresh cached key metadata after a rotation.
      applyGroupKeyUpdate: (groupId, keyVersion, keyHolders) => {
        set((state) => ({
          conversations: updateConversation(state.conversations, groupId, (old) => ({ ...old, keyVersion, keyHolders })),
          selectedUser: state.selectedUser?._id === groupId ? { ...state.selectedUser, keyVersion, keyHolders } : state.selectedUser,
        }));
      },
      addGroupMembers: async (groupId, memberIds) => {
        // E2EE: rotate the group key atomically with the add. Retries once
        // when our group snapshot is stale (409 version conflict).
        for (let attempt = 0; attempt < 2; attempt++) {
          try {
            const state = get();
            const group = asArray(state.conversations).find((c) => String(c._id) === String(groupId));
            const nextMembers = [...(group?.members || []), ...memberIds.map((id) => ({ _id: String(id) }))];
            // De-dupe by id for the wrap set.
            const seen = new Set();
            const deduped = nextMembers.filter((m) => {
              const id = String(m?._id || m);
              if (seen.has(id)) return false;
              seen.add(id);
              return true;
            });
            const rotation = await buildKeyRotation(get(), group, deduped);
            const res = await axiosInstance.post(`/groups/${groupId}/members`, {
              memberIds,
              ...(rotation ? { keyRotation: rotation.payload } : {}),
            });
            const updated = { ...res.data, type: "group" };
            if (rotation) cacheGroupKey(groupId, rotation.version, rotation.key);
            set((s) => ({ conversations: updateConversation(s.conversations, groupId, (old) => ({ ...old, ...updated })), selectedUser: s.selectedUser?._id === groupId ? { ...s.selectedUser, ...updated } : s.selectedUser }));
            return updated;
          } catch (error) {
            if (error?.response?.status === 409 && attempt === 0) {
              try {
                const { data } = await axiosInstance.get(`/groups/${groupId}`);
                get().applyGroupKeyUpdate(groupId, Number(data.keyVersion) || 0, data.keyHolders || []);
              } catch { /* fall through to retry */ }
              continue;
            }
            toast.error(error.response?.data?.message || error.message || "Failed to add members");
            return null;
          }
        }
        return null;
      },
      removeGroupMember: async (groupId, userId) => {
        // E2EE: rotate atomically so the removed member can't read new messages.
        for (let attempt = 0; attempt < 2; attempt++) {
          try {
            const state = get();
            const group = asArray(state.conversations).find((c) => String(c._id) === String(groupId));
            const nextMembers = (group?.members || []).filter((m) => String(m?._id || m) !== String(userId));
            const rotation = await buildKeyRotation(get(), group, nextMembers);
            const res = await axiosInstance.delete(`/groups/${groupId}/members/${userId}`, {
              data: rotation ? { keyRotation: rotation.payload } : {},
            });
            const updated = { ...res.data.group, type: "group" };
            if (rotation) cacheGroupKey(groupId, rotation.version, rotation.key);
            set((s) => ({ conversations: updateConversation(s.conversations, groupId, (old) => ({ ...old, ...updated })), selectedUser: s.selectedUser?._id === groupId ? { ...s.selectedUser, ...updated } : s.selectedUser }));
            return updated;
          } catch (error) {
            if (error?.response?.status === 409 && attempt === 0) {
              try {
                const { data } = await axiosInstance.get(`/groups/${groupId}`);
                get().applyGroupKeyUpdate(groupId, Number(data.keyVersion) || 0, data.keyHolders || []);
              } catch { /* fall through to retry */ }
              continue;
            }
            toast.error(error.response?.data?.message || error.message || "Failed to remove member");
            return null;
          }
        }
        return null;
      },
      leaveGroup: async (groupId) => {
        try {
          // E2EE: best-effort rotation for the remaining members before leaving.
          const state = get();
          const group = asArray(state.conversations).find((c) => String(c._id) === String(groupId));
          const selfId = String(useAuthStore.getState().authUser?._id || "");
          const nextMembers = (group?.members || []).filter((m) => String(m?._id || m) !== selfId);
          let keyRotation = null;
          try {
            const rotation = await buildKeyRotation(get(), group, nextMembers);
            keyRotation = rotation?.payload || null;
          } catch { keyRotation = null; }
          await axiosInstance.post(`/groups/${groupId}/leave`, keyRotation ? { keyRotation } : {});
          dropGroupKeyCache(String(groupId)); // forget the group key once we're out
          set((s) => ({ conversations: s.conversations.filter((c) => String(c._id) !== String(groupId)), activeConversationId: String(s.activeConversationId) === String(groupId) ? null : s.activeConversationId, selectedUser: String(s.selectedUser?._id) === String(groupId) ? null : s.selectedUser }));
          return true;
        }
        catch (error) { toast.error(error.response?.data?.message || "Failed to leave group"); return false; }
      },
      promoteAdmin: async (groupId, userId) => { try { const res = await axiosInstance.post(`/groups/${groupId}/admins/${userId}/promote`); const group = { ...res.data, type: "group" }; set((state) => ({ conversations: updateConversation(state.conversations, groupId, (old) => ({ ...old, ...group })) })); return group; } catch (error) { toast.error(error.response?.data?.message || "Failed to promote admin"); return null; } },
      demoteAdmin: async (groupId, userId) => { try { const res = await axiosInstance.post(`/groups/${groupId}/admins/${userId}/demote`); const group = { ...res.data, type: "group" }; set((state) => ({ conversations: updateConversation(state.conversations, groupId, (old) => ({ ...old, ...group })) })); return group; } catch (error) { toast.error(error.response?.data?.message || "Failed to demote admin"); return null; } },
      updateGroupPermissions: async (groupId, permissions) => { try { const res = await axiosInstance.patch(`/groups/${groupId}/permissions`, permissions); const group = { ...res.data, type: "group" }; set((state) => ({ conversations: updateConversation(state.conversations, groupId, (old) => ({ ...old, ...group })) })); return group; } catch (error) { toast.error(error.response?.data?.message || "Failed to update permissions"); return null; } },

      // Disappearing messages (direct chats): peerId -> seconds, 0 = off.
      fetchDisappearing: async (peerId) => {
        try {
          const res = await axiosInstance.get(`/messages/disappearing/${peerId}`);
          const duration = Number(res.data?.duration) || 0;
          set((state) => ({ dmDisappearing: { ...state.dmDisappearing, [String(peerId)]: duration } }));
          return duration;
        } catch { return 0; }
      },
      setDisappearing: async (peerId, duration) => {
        try {
          const res = await axiosInstance.put(`/messages/disappearing/${peerId}`, { duration });
          const next = Number(res.data?.duration) || 0;
          set((state) => ({ dmDisappearing: { ...state.dmDisappearing, [String(peerId)]: next } }));
          return next;
        } catch (error) { toast.error(error.response?.data?.message || "Failed to update disappearing messages"); return null; }
      },

      // Blocked users
      fetchBlockedUsers: async () => {
        try {
          const res = await axiosInstance.get("/profile/blocked");
          set({ blockedUsers: asArray(res.data) });
        } catch { /* not fatal */ }
      },
      blockUser: async (userId) => {
        try {
          await axiosInstance.post(`/profile/block/${userId}`);
          await get().fetchBlockedUsers();
          set((state) => ({
            users: state.users.filter((u) => String(u._id) !== String(userId)),
            conversations: state.conversations.filter((c) => String(c._id) !== String(userId)),
            selectedUser: String(state.selectedUser?._id) === String(userId) ? null : state.selectedUser,
            activeConversationId: String(state.activeConversationId) === String(userId) ? null : state.activeConversationId,
          }));
          toast.success("User blocked");
          return true;
        } catch (error) { toast.error(error.response?.data?.message || "Failed to block user"); return false; }
      },
      unblockUser: async (userId) => {
        try {
          await axiosInstance.delete(`/profile/block/${userId}`);
          set((state) => ({ blockedUsers: state.blockedUsers.filter((u) => String(u._id) !== String(userId)) }));
          get().getUsers();
          toast.success("User unblocked");
          return true;
        } catch (error) { toast.error(error.response?.data?.message || "Failed to unblock user"); return false; }
      },

      editMessage: async (messageId, text) => {
        try {
          const trimmed = text.trim();
          if (!trimmed) {
            toast.error("Message text is required");
            return false;
          }
          // E2EE: re-encrypt the edited text so an encrypted message never
          // downgrades to plaintext on the server.
          const existing = asArray(get().messages).find(
            (m) => String(m._id || m.id) === String(messageId)
          );
          let payload = { text: trimmed };
          if (existing?.ciphertext) {
            if (existing.groupId) {
              const groupId = String(existing.groupId?._id || existing.groupId);
              const group =
                asArray(get().conversations).find((c) => String(c._id) === groupId) || { _id: groupId, members: [] };
              const { key } = await ensureGroupKeyForSend(get, group);
              const enc = await encryptTextWithGroupKey(key, trimmed);
              payload = { ciphertext: enc.ciphertext, iv: enc.iv };
            } else {
              const senderIdStr = String(existing.senderId?._id || existing.senderId);
              const receiverIdStr = String(existing.receiverId?._id || existing.receiverId);
              const authUserId = String(useAuthStore.getState().authUser?._id);
              const partnerId = senderIdStr === authUserId ? receiverIdStr : senderIdStr;
              let partnerPubKey =
                asArray(get().conversations).find((c) => String(c._id) === partnerId)?.publicKey ||
                asArray(get().users).find((u) => String(u._id) === partnerId)?.publicKey;
              if (!partnerPubKey) partnerPubKey = await fetchPartnerPublicKey(partnerId);
              if (!partnerPubKey) {
                toast.error("Couldn't encrypt the edited message");
                return false;
              }
              const enc = await encryptMessage(trimmed, partnerPubKey);
              if (!enc) {
                toast.error("Couldn't encrypt the edited message");
                return false;
              }
              payload = { ciphertext: enc.ciphertext, iv: enc.iv };
            }
          }
          const res = await axiosInstance.patch(`/messages/edit/${messageId}`, payload);
          const decrypted = await decryptSingleMessage(res.data, get());

          set((state) => ({
            messages: updateMessageById(state.messages, messageId, () => decrypted),
            composerText: "",
            editingMessage: null,
          }));
          return true;
        } catch (error) {
          toast.error(error.response?.data?.message || error.message || "Failed to edit message");
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

          clearDecryptedMediaCache(String(id));
          set((state) => ({
            messages: state.messages.filter((message) => {
              const messageId = message._id || message.id;
              return messageId !== id;
            }),
          }));
        } catch {
          // Error deleting message
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
          deletedIds.forEach((messageId) => clearDecryptedMediaCache(messageId));
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

        // Encrypted originals can't use the server forward endpoint — it would
        // copy ciphertext that was encrypted for other recipients.
        const original = asArray(get().messages).find((m) => String(m._id) === String(messageId));
        if (original?.ciphertext) {
          try {
            const targets = resolveForwardTargets(get, targetReceiverIds);
            let sent = 0;
            for (const target of targets) {
              if (await forwardEncryptedMessage(get, original, target)) sent++;
            }
            if (sent > 0) {
              toast.success(
                targetReceiverIds.length === 1
                  ? "Message forwarded"
                  : `Message forwarded to ${sent} chats`
              );
              return true;
            }
            toast.error("Couldn't forward this message");
            return false;
          } catch (error) {
            toast.error(error.message || "Failed to forward message");
            return false;
          }
        }

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

        // Split: encrypted originals are re-sent client-side (see
        // forwardEncryptedMessage); plaintext keeps the server fast path.
        const stateMessages = asArray(get().messages);
        const encryptedIds = sourceMessageIds.filter((id) =>
          stateMessages.some((m) => String(m._id) === String(id) && m.ciphertext)
        );
        const plainIds = sourceMessageIds.filter((id) => !encryptedIds.includes(id));

        try {
          const responses = await Promise.all(
            plainIds.map((messageId) =>
              axiosInstance.post(`/messages/forward/${messageId}`, {
                receiverIds: targetReceiverIds,
              }),
            ),
          );
          const forwardedMessages = responses.flatMap((res) =>
            asArray(res.data?.messages || res.data),
          );

          let encryptedOk = true;
          if (encryptedIds.length > 0) {
            const targets = resolveForwardTargets(get, targetReceiverIds);
            for (const id of encryptedIds) {
              const original = stateMessages.find((m) => String(m._id) === String(id));
              if (!original) {
                encryptedOk = false;
                continue;
              }
              for (const target of targets) {
                if (!(await forwardEncryptedMessage(get, original, target))) encryptedOk = false;
              }
            }
          }
          if (!encryptedOk && forwardedMessages.length === 0) {
            toast.error("Some messages couldn't be forwarded");
            return false;
          }

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

      subscribeToChatEvents: () => {        const socket = useAuthStore.getState().socket;
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
        socket.off("group:key-rotated");
        socket.off("messagesExpired");
        socket.off("disappearingChanged");

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
        const removeGroup = ({ groupId }) => {
          dropGroupKeyCache(String(groupId)); // forget the group key once we're out
          set((state) => ({
            conversations: state.conversations.filter((item) => String(item._id) !== String(groupId)),
            activeConversationId: String(state.activeConversationId) === String(groupId) ? null : state.activeConversationId,
          }));
        };
        socket.on("group:removed", removeGroup);
        socket.on("group:left", removeGroup);
        // Group E2EE: another member rotated the key — refresh metadata so
        // the next send/decrypt uses the new version.
        socket.on("group:key-rotated", ({ groupId, keyVersion, keyHolders }) => {
          if (groupId) get().applyGroupKeyUpdate(groupId, keyVersion, keyHolders || []);
        });

        socket.on("typing", ({ senderId, isTyping }) => {
          set((state) => ({
            typingUsers: {
              ...state.typingUsers,
              [senderId]: isTyping,
            },
          }));
        });

        socket.on("newMessage", async (rawMessage) => {
          const newMessage = await decryptSingleMessage(rawMessage, get);
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
            // The server echoes our own message back over the socket; if that
            // echo arrives before the POST response, replace the optimistic
            // placeholder with the confirmed message instead of duplicating it.
            const optimisticIndex = asArray(state.messages).findIndex(
              (message) =>
                String(message._id).startsWith("temp-") &&
                asId(message.senderId) === asId(newMessage.senderId) &&
                String(message.text || "") === String(newMessage.text || "") &&
                Math.abs(
                  new Date(newMessage.createdAt).getTime() - new Date(message.createdAt).getTime(),
                ) < 15000,
            );
            const existingConversation = state.conversations.find(
              (conversation) => conversation._id === partnerId,
            );
            const unreadCount =
              isIncoming && !isActiveConversation
                ? Number(existingConversation?.unreadCount || 0) + 1
                : 0;

            let messages = state.messages;
            if (isActiveConversation && !hasMessage) {
              if (optimisticIndex >= 0) {
                messages = [...asArray(state.messages)];
                messages[optimisticIndex] = newMessage;
              } else {
                messages = [...asArray(state.messages), newMessage];
              }
            }

            return {
              messages,
              conversations: upsertConversation(state.conversations, partner, newMessage, unreadCount),
            };
          });

          if (isIncoming && isActiveConversation) {
            await get().markConversationAsRead(partnerId);
          }

          // Incoming-message sound: only for messages arriving in a
          // background conversation (or a background tab), and only when the
          // user hasn't disabled it in Settings → Notifications.
          if (
            isIncoming &&
            (!isActiveConversation || document.hidden) &&
            authUser?.notificationPrefs?.messageSound !== false
          ) {
            playMessageSound();
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

        // Expired disappearing messages: drop them from the open chat live.
        socket.on("messagesExpired", ({ messageIds }) => {
          const ids = new Set((messageIds || []).map(String));
          if (ids.size === 0) return;
          set((state) => ({
            messages: state.messages.filter((msg) => !ids.has(String(msg._id))),
          }));
        });

        // The other party changed the DM disappearing timer.
        socket.on("disappearingChanged", ({ conversationId, duration }) => {
          if (!conversationId) return;
          set((state) => ({
            dmDisappearing: { ...state.dmDisappearing, [String(conversationId)]: Number(duration) || 0 },
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
        socket?.off("messagesExpired");
        socket?.off("disappearingChanged");
        ["group:updated", "group:member-added", "group:member-removed", "group:member-left", "group:admin-updated", "group:removed", "group:left", "group:key-rotated"].forEach((event) => socket?.off(event));
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
            messageSearchOpen: false,
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

      setMessageSearchQuery: (messageSearchQuery) => set({ messageSearchQuery }),
setMessageSearchOpen: (messageSearchOpen) => set({ messageSearchOpen }),
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
        } catch {
          // Error in markConversationAsRead
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
