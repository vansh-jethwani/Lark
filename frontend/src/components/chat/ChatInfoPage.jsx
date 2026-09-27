import { useEffect, useState, useMemo } from "react";
import { useParams, useNavigate } from "react-router";
import {
  XIcon,
  ArrowLeftIcon,
  ExpandIcon,
  SearchIcon,
  ShieldCheckIcon,
  ShieldOffIcon,
  LogOutIcon,
  PlusIcon,
  TrashIcon,
  ChevronRightIcon,
  ImageIcon,
  VideoIcon,
  FileTextIcon,
  MusicIcon,
  BellOffIcon,
  LockKeyholeIcon,
  TimerResetIcon,
  UserRoundIcon,
  PencilIcon,
} from "lucide-react";
import toast from "react-hot-toast";
import { useChatStore } from "../../store/useChatStore";
import { useAuthStore } from "../../store/useAuthStore";
import { MediaPreviewModal } from "./MediaPreviewModal";
import { getInitials } from "../../hooks/useSelectedConversation";
import { withTransform } from "../../lib/imagekit";
import { axiosInstance } from "../../lib/axios";

const IMAGE_TRANSFORM = "q-auto,w-640,f-auto";

function getMediaIcon(type) {
  if (type === "image") return <ImageIcon className="size-4" />;
  if (type === "video") return <VideoIcon className="size-4" />;
  if (type === "audio") return <MusicIcon className="size-4" />;
  return <FileTextIcon className="size-4" />;
}

function SimpleModal({ isOpen, onClose, title, children, footer }) {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="w-full max-w-md max-h-[90vh] flex flex-col rounded-2xl border border-border bg-background shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <p className="text-lg font-semibold">{title}</p>
          <button type="button" onClick={onClose} className="rounded-full p-1 text-muted hover:bg-surface">
            <XIcon className="size-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-border px-4 py-3">{footer}</div>}
      </div>
    </div>
  );
}

function ToggleSwitch({ on, onToggle, label }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={onToggle}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${on ? "bg-accent" : "bg-border"}`}
    >
      <span className={`inline-block size-4 transform rounded-full bg-white shadow transition-transform ${on ? "translate-x-6" : "translate-x-1"}`} />
    </button>
  );
}

function MediaTile({ item, onPreview }) {
  const content =
    item.mediaType === "image" ? (
      <img src={withTransform(item.image, IMAGE_TRANSFORM)} alt="" loading="lazy" className="size-full object-cover" />
    ) : (
      <div className="flex size-full items-center justify-center text-muted">{getMediaIcon(item.mediaType)}</div>
    );
  const className = "aspect-square w-full overflow-hidden rounded-xl border border-border bg-background";
  if (item.mediaType === "image" || item.mediaType === "video") {
    return (
      <button
        type="button"
        onClick={() => onPreview(item)}
        aria-label="Open media preview"
        className={`${className} cursor-pointer hover:opacity-90`}
      >
        {content}
      </button>
    );
  }
  return <div className={className}>{content}</div>;
}

const STRIP_VISIBLE_COUNT = 12;

function AvatarExpandButton({ onOpen }) {
  return (
    <button
      type="button"
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onOpen();
      }}
      aria-label="View profile photo"
      title="View profile photo"
      className="absolute bottom-0 right-0 grid size-8 place-items-center rounded-full border border-border bg-background text-muted shadow-md transition-transform hover:scale-105 active:scale-95"
    >
      <ExpandIcon className="size-4" />
    </button>
  );
}

function AvatarPreviewModal({ preview, onClose }) {
  if (!preview?.src) return null;
  return (
    <SimpleModal
      isOpen
      onClose={onClose}
      title={preview.name || "Profile photo"}
    >
      <img
        src={preview.src}
        alt={preview.name || "Profile photo"}
        className="max-h-[65vh] w-full rounded-xl bg-black/5 object-contain"
      />
    </SimpleModal>
  );
}

function MediaSection({ mediaItems }) {
  const [showAllMedia, setShowAllMedia] = useState(false);
  const [previewMedia, setPreviewMedia] = useState(null);

  const openPreview = (item) => {
    setPreviewMedia({
      type: item.mediaType,
      src: item.mediaType === "video" ? item.video : item.image,
      messageId: item._id,
      fileName: item.fileName || (item.mediaType === "video" ? "Video" : "Photo"),
    });
  };

  const visibleItems = mediaItems.slice(0, STRIP_VISIBLE_COUNT);
  const remainingCount = mediaItems.length - visibleItems.length;

  return (
    <>
      <section className="rounded-2xl border border-border bg-surface/45 p-3">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-sm font-medium">Media, links and docs</p>
          <span className="text-xs text-muted">{mediaItems.length}</span>
        </div>
        {mediaItems.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted">No media shared yet.</p>
        ) : (
          <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {visibleItems.map((item) => (
              <div key={item._id} className="size-24 shrink-0">
                <MediaTile item={item} onPreview={openPreview} />
              </div>
            ))}
            {remainingCount > 0 && (
              <button
                type="button"
                onClick={() => setShowAllMedia(true)}
                aria-label={`View all ${mediaItems.length} media items`}
                className="grid size-24 shrink-0 place-items-center rounded-xl bg-accent/15 text-sm font-bold text-accent transition-transform hover:scale-105 active:scale-95"
              >
                +{remainingCount}
              </button>
            )}
          </div>
        )}
      </section>

      {/* Full gallery as a page inside the info panel, latest first */}
      {showAllMedia ? (
        <div className="absolute inset-0 z-30 flex flex-col bg-background">
          <div className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-3">
            <button
              type="button"
              onClick={() => setShowAllMedia(false)}
              aria-label="Back to info"
              className="rounded-full p-1 text-muted hover:bg-surface"
            >
              <ArrowLeftIcon className="size-5" />
            </button>
            <p className="text-base font-semibold">Media, links and docs</p>
            <span className="text-xs text-muted">{mediaItems.length}</span>
          </div>
          <div className="flex-1 overflow-y-auto p-3 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <div className="flex flex-wrap gap-1.5">
              {mediaItems.map((item) => (
                <div key={item._id} className="size-24 shrink-0">
                  <MediaTile item={item} onPreview={openPreview} />
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      <MediaPreviewModal key={previewMedia?.src || "closed"} media={previewMedia} onClose={() => setPreviewMedia(null)} />
    </>
  );
}

export function ChatInfoPage() {
  const { conversationId } = useParams();
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(true);
  const [conversation, setConversation] = useState(null);
  const [isGroup, setIsGroup] = useState(false);
  const [media, setMedia] = useState([]);
  const [avatarPreview, setAvatarPreview] = useState(null);
  const [editingName, setEditingName] = useState(false);
  const [editingDescription, setEditingDescription] = useState(false);
  const [nameValue, setNameValue] = useState("");
  const [descriptionValue, setDescriptionValue] = useState("");
  const [groupImagePreview, setGroupImagePreview] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [showAddMembers, setShowAddMembers] = useState(false);
  const [memberSearch, setMemberSearch] = useState("");
  const [permissions, setPermissions] = useState({
    editInfo: "admins",
    addMembers: "admins",
    sendMessages: "members",
  });
  const [showPermissions, setShowPermissions] = useState(false);
  const [muted, setMuted] = useState(false);
  const [disappearing, setDisappearing] = useState(false);
  const [busyMemberAction, setBusyMemberAction] = useState(null);
  const [removeTarget, setRemoveTarget] = useState(null);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const [selectedMemberIds, setSelectedMemberIds] = useState([]);

  const conversations = useChatStore((state) => state.conversations);
  const users = useChatStore((state) => state.users);
  const authUser = useAuthStore((state) => state.authUser);
  const updateGroup = useChatStore((state) => state.updateGroup);
  const addGroupMembers = useChatStore((state) => state.addGroupMembers);
  const removeGroupMember = useChatStore((state) => state.removeGroupMember);
  const leaveGroup = useChatStore((state) => state.leaveGroup);
  const promoteAdmin = useChatStore((state) => state.promoteAdmin);
  const demoteAdmin = useChatStore((state) => state.demoteAdmin);
  const updateGroupPermissions = useChatStore((state) => state.updateGroupPermissions);

  const loadMedia = async (conversationId, group = false) => {
    try {
      const res = await axiosInstance.get(group ? `/groups/${conversationId}/media` : `/messages/${conversationId}/media`);
      setMedia(Array.isArray(res.data) ? res.data : []);
    } catch (error) {
      console.log("Error loading media:", error);
    }
  };

  useEffect(() => {
    if (!conversationId) return;
    const found = conversations.find((c) => c._id === conversationId);
    if (found) {
      const timer = window.setTimeout(() => {
        const group = Boolean(found.type === "group" || found.peer?.isGroup);
        setIsGroup(group);
        setConversation(found);
        setNameValue(found.name || "");
        setDescriptionValue(found.description || "");
        setPermissions(found.permissions || { editInfo: "admins", addMembers: "admins", sendMessages: "members" });
        if (group) setGroupImagePreview(found.profilePic || "");
        setIsLoading(false);
        loadMedia(conversationId, group);
      }, 0);
      return () => window.clearTimeout(timer);
    } else {
      const timer = window.setTimeout(() => {
        setIsLoading(conversations.length === 0);
        if (conversations.length > 0) setConversation(null);
      }, 0);
      return () => window.clearTimeout(timer);
    }
  }, [conversationId, conversations]);

  useEffect(() => {
    if (!conversationId) return;
    try {
      setMuted(window.localStorage.getItem(`lark:muted:${conversationId}`) === "1");
      setDisappearing(window.localStorage.getItem(`lark:disappearing:${conversationId}`) === "1");
    } catch {
      /* storage unavailable */
    }
  }, [conversationId]);

  const isAdmin = useMemo(() => {
    if (!isGroup || !conversation) return false;
    return conversation.admins?.some((a) => String(a._id || a) === String(authUser?._id));
  }, [isGroup, conversation, authUser]);

  const availableUsers = useMemo(() => {
    if (!users.length) return [];
    const query = memberSearch.trim().toLowerCase();
    return users.filter((user) => {
      if (String(user._id) === String(authUser?._id)) return false;
      if (!conversation?.members?.some((m) => String(m._id || m) === String(user._id))) {
        if (!query) return true;
        return (
          user.fullName?.toLowerCase().includes(query) ||
          user.username?.toLowerCase().includes(query)
        );
      }
      return false;
    });
  }, [users, memberSearch, conversation, authUser]);

  const handleBack = () => {
    navigate(-1);
  };

  const handleSaveName = async () => {
    if (!nameValue.trim()) return;
    setIsSaving(true);
    const result = await updateGroup(conversationId, { name: nameValue.trim() });
    setIsSaving(false);
    if (result) {
      setEditingName(false);
      setConversation(result);
    }
  };

  const handleSaveDescription = async () => {
    setIsSaving(true);
    const result = await updateGroup(conversationId, { description: descriptionValue.trim() });
    setIsSaving(false);
    if (result) {
      setEditingDescription(false);
      setConversation(result);
    }
  };

  const handleImageChange = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setGroupImagePreview(URL.createObjectURL(file));

    const formData = new FormData();
    formData.append("media", file);
    try {
      const uploadRes = await axiosInstance.post("/messages/upload", formData);
      if (uploadRes.data?.url) {
        const result = await updateGroup(conversationId, { profilePic: uploadRes.data.filePath || uploadRes.data.url });
        if (result) setConversation(result);
      }
    } catch (error) {
      setGroupImagePreview(conversation.profilePic || "");
      toast.error(error.response?.data?.message || "Failed to upload group image");
    }
  };

  const toggleMuted = () => {
    const next = !muted;
    setMuted(next);
    try {
      window.localStorage.setItem(`lark:muted:${conversationId}`, next ? "1" : "0");
    } catch {
      /* storage unavailable */
    }
  };

  const toggleDisappearing = () => {
    const next = !disappearing;
    setDisappearing(next);
    try {
      window.localStorage.setItem(`lark:disappearing:${conversationId}`, next ? "1" : "0");
    } catch {
      /* storage unavailable */
    }
  };

  const closeAddMembers = () => {
    setShowAddMembers(false);
    setMemberSearch("");
    setSelectedMemberIds([]);
  };

  const toggleMemberSelection = (userId) => {
    const id = String(userId);
    setSelectedMemberIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const handleAddMembers = async () => {
    if (selectedMemberIds.length === 0) return;
    const result = await addGroupMembers(conversationId, selectedMemberIds);
    if (result) {
      setConversation(result);
      closeAddMembers();
    }
  };

  const handleRemoveMember = async () => {
    if (!removeTarget || String(removeTarget) === String(authUser?._id)) return;
    const key = `remove:${removeTarget}`;
    setBusyMemberAction(key);
    const result = await removeGroupMember(conversationId, removeTarget);
    setBusyMemberAction(null);
    if (result) {
      setConversation(result);
      setRemoveTarget(null);
    }
  };

  const handleLeave = async () => {
    const result = await leaveGroup(conversationId);
    setShowLeaveConfirm(false);
    if (result) {
      navigate("/");
    }
  };

  const handlePromote = async (userId) => {
    const key = `promote:${userId}`;
    setBusyMemberAction(key);
    const result = await promoteAdmin(conversationId, userId);
    setBusyMemberAction(null);
    if (result) setConversation(result);
  };

  const handleDemote = async (userId) => {
    const key = `demote:${userId}`;
    setBusyMemberAction(key);
    const result = await demoteAdmin(conversationId, userId);
    setBusyMemberAction(null);
    if (result) setConversation(result);
  };

  const handleUpdatePermissions = async () => {
    const result = await updateGroupPermissions(conversationId, permissions);
    if (result) {
      setConversation(result);
      setShowPermissions(false);
    }
  };

  const canEditInfo = isAdmin || (isGroup && conversation?.permissions?.editInfo === "members");
  const canAddMembers = isAdmin || (isGroup && conversation?.permissions?.addMembers === "members");

  const mediaItems = useMemo(() => {
    const images = media.filter((m) => m.image).map((m) => ({ ...m, mediaType: "image" }));
    const videos = media.filter((m) => m.video).map((m) => ({ ...m, mediaType: "video" }));
    const audio = media.filter((m) => m.audio).map((m) => ({ ...m, mediaType: "audio" }));
    const files = media.filter((m) => m.file).map((m) => ({ ...m, mediaType: "file" }));
    return [...images, ...videos, ...audio, ...files].sort(
      (a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)
    );
  }, [media]);

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="size-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!conversation) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="text-lg font-semibold">Conversation not found</p>
        <button onClick={handleBack} className="px-4 py-2 bg-accent text-accent-foreground rounded-xl text-sm font-medium">
          Go back
        </button>
      </div>
    );
  }

  if (!isGroup) {
    const user = conversation;
    return (
      <div className="relative flex h-full flex-col overflow-hidden bg-background">
        <div className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-3">
          <button onClick={handleBack} className="rounded-full p-1 text-muted hover:bg-surface">
            <XIcon className="size-5" />
          </button>
          <p className="text-base font-semibold">Contact info</p>
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="flex flex-col items-center gap-2 px-6 pb-5 pt-7">
            {user.profilePic ? (
              <button
                type="button"
                onClick={() => setAvatarPreview({ src: user.profilePic, name: user.fullName || user.name })}
                aria-label="View profile photo"
                title="View profile photo"
                className="size-28 shrink-0 overflow-hidden rounded-full bg-surface ring-1 ring-border transition-transform hover:scale-[1.02] active:scale-95"
              >
                <img src={user.profilePic} alt="" className="size-full object-cover" />
              </button>
            ) : (
              <div className="flex size-28 shrink-0 items-center justify-center rounded-full bg-surface ring-1 ring-border">
                <span className="text-2xl font-medium">{getInitials(user.fullName || user.name)}</span>
              </div>
            )}
            {avatarPreview ? (
              <AvatarPreviewModal preview={avatarPreview} onClose={() => setAvatarPreview(null)} />
            ) : null}
            <p className="mt-1 text-lg font-semibold">{user.fullName || user.name}</p>
            <p className="text-sm text-muted">{user.username ? `@${user.username}` : "Lark contact"}</p>
            {user.bio && <p className="max-w-sm text-center text-sm text-muted">{user.bio}</p>}
          </div>

          <div className="mx-3 mb-3 sm:mx-5">
            <MediaSection mediaItems={mediaItems} />
          </div>

          <section className="mx-3 overflow-hidden rounded-2xl border border-border bg-surface/45 sm:mx-5">
            <div className="flex items-center gap-3 border-b border-border px-3 py-3">
              <UserRoundIcon className="size-5 shrink-0 text-accent" />
              <div className="min-w-0"><p className="truncate text-sm font-medium">{user.email || "Contact details"}</p><p className="truncate text-xs text-muted">Email</p></div>
            </div>
            <div className="flex items-center gap-3 border-b border-border px-3 py-3">
              <BellOffIcon className="size-5 shrink-0 text-accent" />
              <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">Notifications</p><p className="truncate text-xs text-muted">{muted ? "Muted" : "On"}</p></div>
              <ToggleSwitch on={!muted} onToggle={toggleMuted} label="Toggle notifications" />
            </div>
            <div className="flex items-center gap-3 border-b border-border px-3 py-3">
              <TimerResetIcon className="size-5 shrink-0 text-accent" />
              <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">Disappearing messages</p><p className="truncate text-xs text-muted">{disappearing ? "On" : "Off"}</p></div>
              <ToggleSwitch on={disappearing} onToggle={toggleDisappearing} label="Toggle disappearing messages" />
            </div>
            <div className="flex items-center gap-3 px-3 py-3">
              <LockKeyholeIcon className="size-5 shrink-0 text-accent" />
              <div className="min-w-0"><p className="truncate text-sm font-medium">Encryption</p><p className="truncate text-xs text-muted">Messages are end-to-end protected</p></div>
            </div>
          </section>
        </div>
      </div>
    );
  }

  const memberList = conversation.members || [];
  const adminIds = new Set((conversation.admins || []).map((a) => String(a._id || a)));
  const removeTargetMember = removeTarget
    ? memberList.find((m) => String(m._id || m) === String(removeTarget))
    : null;
  const groupAvatar = (
    <div className="size-24 rounded-full bg-surface border-2 border-dashed border-border flex items-center justify-center overflow-hidden">
      {groupImagePreview || conversation.profilePic ? (
        <img src={groupImagePreview || conversation.profilePic} alt="" className="size-full object-cover" />
      ) : (
        <span className="text-2xl font-medium">{getInitials(conversation.name || "G")}</span>
      )}
    </div>
  );

  return (
    <div className="relative flex h-full flex-col overflow-hidden bg-background">
      <div className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-2">
        <button onClick={handleBack} className="rounded-full p-1 text-muted hover:bg-surface">
          <XIcon className="size-5" />
        </button>
        <p className="text-lg font-semibold">Group Info</p>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="flex flex-col items-center gap-3 p-6">
          {canEditInfo ? (
            <label htmlFor="group-image-upload-info" className="relative block cursor-pointer">
              {groupAvatar}
              {groupImagePreview || conversation.profilePic ? (
                <AvatarExpandButton
                  onOpen={() => setAvatarPreview({ src: groupImagePreview || conversation.profilePic, name: conversation.name })}
                />
              ) : null}
            </label>
          ) : (
            <div className="relative">
              {groupAvatar}
              {conversation.profilePic ? (
                <AvatarExpandButton
                  onOpen={() => setAvatarPreview({ src: conversation.profilePic, name: conversation.name })}
                />
              ) : null}
            </div>
          )}
          {avatarPreview ? (
            <AvatarPreviewModal preview={avatarPreview} onClose={() => setAvatarPreview(null)} />
          ) : null}
          <input
            id="group-image-upload-info"
            type="file"
            accept="image/*"
            className="sr-only"
            onChange={handleImageChange}
          />
          {editingName ? (
            <div className="flex w-full max-w-sm items-center gap-2">
              <input
                type="text"
                value={nameValue}
                onChange={(e) => setNameValue(e.target.value)}
                maxLength={100}
                autoFocus
                className="flex-1 rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent/60"
              />
              <button onClick={handleSaveName} disabled={isSaving} className="px-3 py-2 text-sm bg-accent text-accent-foreground rounded-xl disabled:opacity-50">
                {isSaving ? "Saving..." : "Save"}
              </button>
              <button onClick={() => { setEditingName(false); setNameValue(conversation.name || ""); }} className="px-3 py-2 text-sm rounded-xl hover:bg-surface">
                Cancel
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <p className="text-xl font-semibold">{conversation.name}</p>
              {canEditInfo && (
                <button onClick={() => setEditingName(true)} className="rounded-full p-1 text-muted hover:bg-surface" aria-label="Edit group name">
                  <PencilIcon className="size-4" />
                </button>
              )}
            </div>
          )}
          {editingDescription ? (
            <div className="flex w-full max-w-sm flex-col gap-2">
              <textarea
                value={descriptionValue}
                onChange={(e) => setDescriptionValue(e.target.value)}
                maxLength={500}
                rows={2}
                className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent/60 resize-none"
              />
              <div className="flex gap-2">
                <button onClick={handleSaveDescription} disabled={isSaving} className="px-3 py-2 text-sm bg-accent text-accent-foreground rounded-xl disabled:opacity-50">
                  {isSaving ? "Saving..." : "Save"}
                </button>
                <button onClick={() => { setEditingDescription(false); setDescriptionValue(conversation.description || ""); }} className="px-3 py-2 text-sm rounded-xl hover:bg-surface">
                  Cancel
                </button>
              </div>
            </div>
          ) : conversation.description ? (
            <p className="text-center text-sm text-muted">{conversation.description}</p>
          ) : canEditInfo ? (
            <button onClick={() => setEditingDescription(true)} className="text-sm text-muted hover:text-foreground">
              Add description
            </button>
          ) : null}
          <p className="text-xs text-muted">Created {new Date(conversation.createdAt).toLocaleDateString()}</p>
        </div>

        <div className="border-t border-border" />

        <div className="px-4 py-4">
          <MediaSection mediaItems={mediaItems} />
        </div>

        <div className="border-t border-border" />

        <div className="p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-semibold text-muted uppercase tracking-wide">Members ({memberList.length})</p>
            {canAddMembers && (
              <button onClick={() => setShowAddMembers(true)} className="flex items-center gap-1 text-sm text-accent hover:opacity-80">
                <PlusIcon className="size-4" />
                Add
              </button>
            )}
          </div>

          <div className="flex flex-col gap-1">
            {memberList.map((member) => {
              const memberId = String(member._id || member);
              const isMe = memberId === String(authUser?._id);
              const isMemberAdmin = adminIds.has(memberId);
              return (
                <div key={memberId} className="flex items-center gap-3 rounded-xl px-3 py-2">
                  <div className="size-10 rounded-full bg-surface flex items-center justify-center overflow-hidden">
                    {member.profilePic ? (
                      <img src={member.profilePic} alt="" className="size-full object-cover" />
                    ) : (
                      <span className="text-xs font-medium">{getInitials(member.fullName)}</span>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {member.fullName} {isMe && <span className="text-muted">(you)</span>}
                    </p>
                    <p className="text-xs text-muted">
                      {isMemberAdmin ? "Admin" : "Member"}
                    </p>
                  </div>
                  {isAdmin && !isMe && (
                    <div className="flex gap-1">
                      {!isMemberAdmin ? (
                        <button onClick={() => handlePromote(memberId)} disabled={busyMemberAction === `promote:${memberId}`} className="rounded-full p-1.5 text-success hover:bg-surface disabled:opacity-50" aria-label="Promote to admin">
                          <ShieldCheckIcon className="size-4" />
                        </button>
                      ) : (
                        <button onClick={() => handleDemote(memberId)} disabled={busyMemberAction === `demote:${memberId}`} className="rounded-full p-1.5 text-danger hover:bg-surface disabled:opacity-50" aria-label="Demote admin">
                          <ShieldOffIcon className="size-4" />
                        </button>
                      )}
                      <button onClick={() => setRemoveTarget(memberId)} disabled={busyMemberAction === `remove:${memberId}`} className="rounded-full p-1.5 text-danger hover:bg-surface disabled:opacity-50" aria-label="Remove member">
                        <TrashIcon className="size-4" />
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {isAdmin && (
          <>
            <div className="border-t border-border" />
            <div className="p-4 flex flex-col gap-2">
              <p className="text-sm font-semibold text-muted uppercase tracking-wide mb-2">Group Settings</p>
              <button onClick={() => setShowPermissions(true)} className="flex w-full items-center justify-between rounded-xl border border-border px-4 py-3 text-sm hover:bg-surface transition-colors">
                <span>Permissions</span>
                <ChevronRightIcon className="size-4 text-muted" />
              </button>
            </div>
          </>
        )}

        <div className="border-t border-border" />

        <div className="p-4">
          <button onClick={() => setShowLeaveConfirm(true)} className="flex w-full items-center gap-2 rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger hover:bg-danger/20 transition-colors">
            <LogOutIcon className="size-4" />
            Leave Group
          </button>
        </div>
      </div>

      <SimpleModal isOpen={showAddMembers} onClose={closeAddMembers} title="Add Members" footer={
        <>
          <button type="button" onClick={closeAddMembers} className="px-4 py-2 text-sm rounded-xl hover:bg-surface">Cancel</button>
          <button
            type="button"
            onClick={handleAddMembers}
            disabled={selectedMemberIds.length === 0}
            className="px-4 py-2 text-sm font-medium bg-accent text-accent-foreground rounded-xl disabled:opacity-50"
          >
            Add{selectedMemberIds.length > 0 ? ` (${selectedMemberIds.length})` : ""}
          </button>
        </>
      }>
        <div className="relative mb-2">
          <SearchIcon className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
          <input
            type="text"
            placeholder="Search users"
            value={memberSearch}
            onChange={(e) => setMemberSearch(e.target.value)}
            className="w-full rounded-xl border border-border bg-surface pl-10 pr-3 py-2 text-sm outline-none focus:border-accent/60"
          />
        </div>
        <div className="max-h-60 overflow-y-auto flex flex-col gap-1 border border-border rounded-xl">
          {availableUsers.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-muted">No users found.</p>
          ) : (
            availableUsers.map((user) => {
              const userId = String(user._id);
              const checked = selectedMemberIds.includes(userId);
              return (
                <label
                  key={user._id}
                  className="flex w-full cursor-pointer items-center gap-3 px-3 py-2 text-left hover:bg-surface"
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleMemberSelection(userId)}
                    className="size-4 shrink-0 accent-accent"
                  />
                  <div className="size-9 rounded-full bg-surface flex items-center justify-center overflow-hidden">
                    {user.profilePic ? (
                      <img src={user.profilePic} alt="" className="size-full object-cover" />
                    ) : (
                      <span className="text-xs font-medium">{getInitials(user.fullName)}</span>
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{user.fullName}</p>
                    <p className="truncate text-xs text-muted">@{user.username}</p>
                  </div>
                </label>
              );
            })
          )}
        </div>
      </SimpleModal>

      <SimpleModal isOpen={showPermissions} onClose={() => setShowPermissions(false)} title="Group Permissions" footer={
        <>
          <button onClick={() => setShowPermissions(false)} className="px-4 py-2 text-sm rounded-xl hover:bg-surface">Cancel</button>
          <button onClick={handleUpdatePermissions} className="px-4 py-2 text-sm font-medium bg-accent text-accent-foreground rounded-xl">Save</button>
        </>
      }>
        <div className="flex flex-col gap-4">
          <div>
            <p className="text-sm font-medium mb-2">Who can edit group info?</p>
            <div className="flex gap-2">
              <button onClick={() => setPermissions((p) => ({ ...p, editInfo: "admins" }))} className={`px-3 py-2 text-sm rounded-xl border ${permissions.editInfo === "admins" ? "bg-accent text-accent-foreground border-accent" : "border-border hover:bg-surface"}`}>Admins only</button>
              <button onClick={() => setPermissions((p) => ({ ...p, editInfo: "members" }))} className={`px-3 py-2 text-sm rounded-xl border ${permissions.editInfo === "members" ? "bg-accent text-accent-foreground border-accent" : "border-border hover:bg-surface"}`}>All members</button>
            </div>
          </div>
          <div>
            <p className="text-sm font-medium mb-2">Who can add members?</p>
            <div className="flex gap-2">
              <button onClick={() => setPermissions((p) => ({ ...p, addMembers: "admins" }))} className={`px-3 py-2 text-sm rounded-xl border ${permissions.addMembers === "admins" ? "bg-accent text-accent-foreground border-accent" : "border-border hover:bg-surface"}`}>Admins only</button>
              <button onClick={() => setPermissions((p) => ({ ...p, addMembers: "members" }))} className={`px-3 py-2 text-sm rounded-xl border ${permissions.addMembers === "members" ? "bg-accent text-accent-foreground border-accent" : "border-border hover:bg-surface"}`}>All members</button>
            </div>
          </div>
          <div>
            <p className="text-sm font-medium mb-2">Who can send messages?</p>
            <div className="flex gap-2">
              <button onClick={() => setPermissions((p) => ({ ...p, sendMessages: "members" }))} className={`px-3 py-2 text-sm rounded-xl border ${permissions.sendMessages === "members" ? "bg-accent text-accent-foreground border-accent" : "border-border hover:bg-surface"}`}>All members</button>
              <button onClick={() => setPermissions((p) => ({ ...p, sendMessages: "admins" }))} className={`px-3 py-2 text-sm rounded-xl border ${permissions.sendMessages === "admins" ? "bg-accent text-accent-foreground border-accent" : "border-border hover:bg-surface"}`}>Admins only</button>
            </div>
          </div>
        </div>
      </SimpleModal>

      <SimpleModal
        isOpen={Boolean(removeTarget)}
        onClose={() => setRemoveTarget(null)}
        title="Remove member"
        footer={
          <>
            <button type="button" onClick={() => setRemoveTarget(null)} className="px-4 py-2 text-sm rounded-xl hover:bg-surface">Cancel</button>
            <button
              type="button"
              onClick={handleRemoveMember}
              disabled={Boolean(busyMemberAction)}
              className="px-4 py-2 text-sm font-medium bg-danger text-white rounded-xl disabled:opacity-50"
            >
              {busyMemberAction ? "Removing..." : "Remove"}
            </button>
          </>
        }
      >
        <p className="text-sm text-muted">
          Are you sure you want to remove{" "}
          <span className="font-medium text-foreground">{removeTargetMember?.fullName || "this member"}</span>{" "}
          from this group?
        </p>
      </SimpleModal>

      <SimpleModal
        isOpen={showLeaveConfirm}
        onClose={() => setShowLeaveConfirm(false)}
        title="Leave group"
        footer={
          <>
            <button type="button" onClick={() => setShowLeaveConfirm(false)} className="px-4 py-2 text-sm rounded-xl hover:bg-surface">Cancel</button>
            <button type="button" onClick={handleLeave} className="px-4 py-2 text-sm font-medium bg-danger text-white rounded-xl">
              Leave
            </button>
          </>
        }
      >
        <p className="text-sm text-muted">
          Are you sure you want to leave{" "}
          <span className="font-medium text-foreground">{conversation.name}</span>?
        </p>
      </SimpleModal>
    </div>
  );
}
