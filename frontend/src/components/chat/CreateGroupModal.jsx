import { useState, useMemo } from "react";
import { XIcon, SearchIcon, UsersIcon } from "lucide-react";
import toast from "react-hot-toast";
import { useChatStore } from "../../store/useChatStore";
import { useAuthStore } from "../../store/useAuthStore";
import { getInitials } from "../../hooks/useSelectedConversation";

export function CreateGroupModal({ isOpen, onClose }) {
  const [groupName, setGroupName] = useState("");
  const [groupDescription, setGroupDescription] = useState("");
  const [groupImage, setGroupImage] = useState(null);
  const [groupImagePreview, setGroupImagePreview] = useState("");
  const [selectedMembers, setSelectedMembers] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const users = useChatStore((state) => state.users);
  const authUser = useAuthStore((state) => state.authUser);
  const createGroup = useChatStore((state) => state.createGroup);
  const setActiveConversationId = useChatStore((state) => state.setActiveConversationId);

  const availableUsers = useMemo(() => {
    if (!users.length) return [];
    const query = searchQuery.trim().toLowerCase();
    return users.filter((user) => {
      if (String(user._id) === String(authUser?._id)) return false;
      if (selectedMembers.some((m) => String(m._id) === String(user._id))) return true;
      if (!query) return true;
      return (
        user.fullName?.toLowerCase().includes(query) ||
        user.username?.toLowerCase().includes(query)
      );
    });
  }, [users, searchQuery, selectedMembers, authUser]);

  const toggleMember = (user) => {
    setSelectedMembers((current) => {
      const exists = current.some((m) => String(m._id) === String(user._id));
      if (exists) return current.filter((m) => String(m._id) !== String(user._id));
      return [...current, user];
    });
  };

  const handleImageChange = (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setGroupImage(file);
    setGroupImagePreview(URL.createObjectURL(file));
  };

  const resetForm = () => {
    setGroupName("");
    setGroupDescription("");
    setGroupImage(null);
    setGroupImagePreview("");
    setSelectedMembers([]);
    setSearchQuery("");
    setIsSubmitting(false);
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const handleCreate = async () => {
    const trimmedName = groupName.trim();
    if (!trimmedName) {
      toast.error("Group name is required");
      return;
    }
    if (selectedMembers.length === 0) {
      toast.error("Add at least one member");
      return;
    }
    if (isSubmitting) return;

    setIsSubmitting(true);
    try {
      let profilePic = "";
      if (groupImage) {
        const formData = new FormData();
        formData.append("media", groupImage);
        const uploadRes = await fetch(
          `${import.meta.env.VITE_API_URL || "http://localhost:4000/api"}/messages/upload`,
          { method: "POST", body: formData, credentials: "include" }
        );
        const uploadData = await uploadRes.json();
        if (!uploadRes.ok) throw new Error(uploadData.message || "Upload failed");
        profilePic = uploadData.filePath || uploadData.url;
      }

      const group = await createGroup({
        name: trimmedName,
        memberIds: selectedMembers.map((m) => m._id),
        profilePic,
        description: groupDescription.trim(),
      });

      if (group) {
        setActiveConversationId(group._id);
        handleClose();
      }
    } catch (error) {
      console.log("Create group error:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="w-full max-w-lg max-h-[90vh] flex flex-col rounded-2xl border border-border bg-background shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <p className="text-lg font-semibold">Create New Group</p>
          <button type="button" onClick={handleClose} className="rounded-full p-1 text-muted hover:bg-surface">
            <XIcon className="size-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          <div className="flex flex-col items-center gap-3 mb-4">
            <label htmlFor="group-image-upload" className="cursor-pointer">
              <div className="size-20 rounded-full bg-surface border-2 border-dashed border-border flex items-center justify-center overflow-hidden">
                {groupImagePreview ? (
                  <img src={groupImagePreview} alt="" className="size-full object-cover" />
                ) : (
                  <UsersIcon className="size-8 text-muted" />
                )}
              </div>
            </label>
            <input
              id="group-image-upload"
              type="file"
              accept="image/*"
              className="sr-only"
              onChange={handleImageChange}
            />
            {groupImagePreview && (
              <button type="button" onClick={() => { setGroupImage(null); setGroupImagePreview(""); }} className="text-xs text-muted hover:text-foreground">
                Remove photo
              </button>
            )}
          </div>

          <div className="flex flex-col gap-3">
            <input
              type="text"
              placeholder="Group Name"
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              maxLength={100}
              className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent/60"
            />

            <textarea
              placeholder="Description (optional)"
              value={groupDescription}
              onChange={(e) => setGroupDescription(e.target.value)}
              maxLength={500}
              rows={2}
              className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent/60 resize-none"
            />

            <div className="flex flex-col gap-2">
              <p className="text-sm font-medium text-muted">Add Members</p>
              <div className="relative">
                <SearchIcon className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
                <input
                  type="text"
                  placeholder="Search users"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full rounded-xl border border-border bg-surface pl-10 pr-3 py-2 text-sm outline-none focus:border-accent/60"
                />
              </div>
              <div className="max-h-60 overflow-y-auto flex flex-col gap-1 border border-border rounded-xl">
                {availableUsers.length === 0 ? (
                  <p className="px-4 py-6 text-center text-sm text-muted">
                    No users found.
                  </p>
                ) : (
                  availableUsers.map((user) => {
                    const isSelected = selectedMembers.some(
                      (m) => String(m._id) === String(user._id)
                    );
                    return (
                      <button
                        key={user._id}
                        type="button"
                        onClick={() => toggleMember(user)}
                        className={`flex w-full items-center gap-3 px-3 py-2 text-left transition-colors ${
                          isSelected ? "bg-accent-soft" : "hover:bg-surface"
                        }`}
                      >
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
                        {isSelected && (
                          <span className="ml-auto text-xs font-medium text-accent">Selected</span>
                        )}
                      </button>
                    );
                  })
                )}
              </div>
              {selectedMembers.length > 0 && (
                <p className="text-xs text-muted">{selectedMembers.length} member(s) selected</p>
              )}
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-border px-4 py-3">
          <button type="button" onClick={handleClose} className="px-4 py-2 text-sm rounded-xl hover:bg-surface transition-colors">
            Cancel
          </button>
          <button
            type="button"
            onClick={handleCreate}
            disabled={!groupName.trim() || selectedMembers.length === 0 || isSubmitting}
            className="px-4 py-2 text-sm font-medium bg-accent text-accent-foreground rounded-xl hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
          >
            {isSubmitting ? "Creating..." : "Create Group"}
          </button>
        </div>
      </div>
    </div>
  );
}
