import { useMediaQuery } from "./useMediaQuery";
import { formatMessageTime } from "../lib/utils";
import { useChatStore } from "../store/useChatStore";
import { useAuthStore } from "../store/useAuthStore";
import { AI_USER, AI_USER_ID } from "../data/aiUser";

// John Doe -> JD
export function getInitials(name) {
  return String(name || "")
    .split(" ")
    .filter(Boolean)
    .map((namePart) => namePart[0])
    .join("");
}

function mapUserToConversation({ user, messages, authUser, onlineUsers }) {
  const getId = (value) => String(value?._id || value || "");
  const getSenderName = (senderId) =>
    getId(senderId) === getId(authUser?._id)
      ? authUser?.fullName || "You"
      : user.fullName;

  const mappedMessages = (Array.isArray(messages) ? messages : []).map((message) => {
    const replyTo = message.replyTo
      ? {
          id: message.replyTo._id,
          text: message.replyTo.text || "",
          imageUrl: message.replyTo.image,
          videoUrl: message.replyTo.video,
          fileUrl: message.replyTo.file,
          fileName: message.replyTo.fileName,
          senderId: message.replyTo.senderId,
          senderName: getSenderName(message.replyTo.senderId),
        }
      : null;

    return {
      id: message._id,
      role: String(message.senderId) === String(authUser?._id) ? "me" : "them",
      text: message.text || "",
      time: formatMessageTime(message.createdAt),
      imageUrl: message.image,
      videoUrl: message.video,
      fileUrl: message.file,
      fileName: message.fileName,
      fileType: message.fileType,
      fileSize: message.fileSize,
      senderId: message.senderId,
      senderName: getSenderName(message.senderId),
      isForwarded: Boolean(message.isForwarded),
      forwardedFrom: message.forwardedFrom,
      isPinned: Boolean(message.isPinned),
      pinnedAt: message.pinnedAt,
      pinnedBy: message.pinnedBy,
      deliveredAt: message.deliveredAt,
      readAt: message.readAt,
      replyTo,
    };
  });

  return {
    id: user._id,
    peer: {
      name: user.fullName,
      subtitle: user.email,
      isOnline: user.isAI ? true : onlineUsers.includes(user._id),
      avatarUrl: user.profilePic,
      initials: user.isAI ? "AI" : getInitials(user.fullName),
    },
    messages: mappedMessages,
  };
}

export function useSelectedConversation() {
  const activeConversationId = useChatStore((state) => state.activeConversationId);
  const conversations = useChatStore((state) => state.conversations);
  const users = useChatStore((state) => state.users);
  const messages = useChatStore((state) => state.messages);

  const authUser = useAuthStore((state) => state.authUser);
  const onlineUsers = useAuthStore((state) => state.onlineUsers);

  const isLargeScreen = useMediaQuery("(min-width: 1024px)");

  const selectedUser = activeConversationId
    ? activeConversationId === AI_USER_ID
      ? AI_USER
      : users.find((user) => user._id === activeConversationId) ||
        conversations.find((user) => user._id === activeConversationId)
    : null;

  const activeConversation = selectedUser
    ? mapUserToConversation({ user: selectedUser, messages, authUser, onlineUsers })
    : null;

  return {
    activeConversation,
    activeConversationId,
    isLargeScreen,
  };
}
