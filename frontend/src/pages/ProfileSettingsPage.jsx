import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeftIcon,
  CameraIcon,
  LoaderIcon,
  LogOutIcon,
  MoonIcon,
  MonitorIcon,
  SaveIcon,
  SunIcon,
  Trash2Icon,
} from "lucide-react";
import { Link, Navigate } from "react-router";

import { DeleteAccountModal } from "../components/profile/DeleteAccountModal";
import { ProfileField, TextArea, TextInput } from "../components/profile/ProfileField";
import { getInitials } from "../hooks/useSelectedConversation";
import { useAuthStore } from "../store/useAuthStore";
import { useProfileStore } from "../store/useProfileStore";
import { useTheme } from "../context/theme";

function formatJoinDate(date) {
  if (!date) return "Not available";
  return new Date(date).toLocaleDateString([], {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function readProvider(provider) {
  return String(provider || "password").replace(/^oauth_/, "").replaceAll("_", " ");
}

export default function ProfileSettingsPage() {
  const authUser = useAuthStore((state) => state.authUser);
  const clearAuth = useAuthStore((state) => state.clearAuth);
  const logout = useAuthStore((state) => state.logout);
  const { themePreference, setTheme } = useTheme();
  const {
    profile,
    isProfileLoading,
    isProfileSaving,
    isDeletingAccount,
    getProfile,
    updateProfile,
    deleteProfile,
  } = useProfileStore();

  const [draft, setDraft] = useState(null);
  const [photoFile, setPhotoFile] = useState(null);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);

  useEffect(() => {
    getProfile();
  }, [getProfile]);

  const form = {
    fullName: draft?.fullName ?? profile?.fullName ?? "",
    username: draft?.username ?? profile?.username ?? "",
    bio: draft?.bio ?? profile?.bio ?? "",
  };

  const photoPreview = useMemo(
    () => (photoFile ? URL.createObjectURL(photoFile) : profile?.profilePic || ""),
    [photoFile, profile?.profilePic],
  );

  useEffect(() => () => {
    if (photoFile && photoPreview) URL.revokeObjectURL(photoPreview);
  }, [photoFile, photoPreview]);

  if (!authUser) return <Navigate to="/auth" replace />;

  const hasChanges =
    photoFile ||
    form.fullName !== (profile?.fullName || "") ||
    form.username !== (profile?.username || "") ||
    form.bio !== (profile?.bio || "");

  const handleSave = async () => {
    const updatedProfile = await updateProfile({
      ...form,
      profilePic: photoFile,
    });
    if (updatedProfile) {
      setPhotoFile(null);
      setDraft(null);
    }
  };

  const handleLogout = async () => {
    await logout();
  };

  const handleDeleteAccount = async (confirmation) => {
    const didDelete = await deleteProfile(confirmation);
    if (!didDelete) return;
    clearAuth();
  };

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <main className="mx-auto flex min-h-dvh w-full max-w-5xl flex-col px-4 py-4 sm:px-6 lg:px-8">
        <header className="flex items-center gap-3 border-b border-border pb-4">
          <Link
            to="/"
            className="grid size-10 shrink-0 place-items-center rounded-full hover:bg-surface"
            aria-label="Back to chat"
          >
            <ArrowLeftIcon className="size-5" />
          </Link>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-xl font-semibold">Profile & Settings</h1>
            <p className="text-sm text-muted">Manage your Lark identity and preferences.</p>
          </div>
        </header>

        {isProfileLoading ? (
          <div className="grid flex-1 place-items-center">
            <LoaderIcon className="size-7 animate-spin text-accent" />
          </div>
        ) : (
          <div className="grid gap-4 py-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
            <section className="rounded-2xl border border-border bg-background p-4 shadow-sm">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                <div className="relative size-28 shrink-0">
                  <div className="grid size-28 overflow-hidden rounded-full bg-accent-soft text-3xl font-semibold text-accent">
                    {photoPreview ? (
                      <img src={photoPreview} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <span className="place-self-center">
                        {getInitials(profile?.fullName || authUser.fullName)}
                      </span>
                    )}
                  </div>
                  <label className="absolute bottom-0 right-0 grid size-10 cursor-pointer place-items-center rounded-full bg-accent text-accent-foreground shadow-lg">
                    <CameraIcon className="size-5" aria-hidden />
                    <input
                      type="file"
                      accept="image/*"
                      className="sr-only"
                      onChange={(event) => setPhotoFile(event.target.files?.[0] || null)}
                    />
                  </label>
                </div>

                <div className="min-w-0 flex-1">
                  <h2 className="text-lg font-semibold">{profile?.fullName}</h2>
                  <p className="truncate text-sm text-muted">@{profile?.username}</p>
                  <p className="mt-2 max-w-xl text-sm text-muted">
                    Choose a clear photo and username so friends can recognize you in chats.
                  </p>
                </div>
              </div>

              <div className="mt-6 grid gap-4 sm:grid-cols-2">
                <ProfileField label="Full name">
                  <TextInput
                    value={form.fullName}
                    onChange={(event) =>
                      setDraft((current) => ({ ...form, ...current, fullName: event.target.value }))
                    }
                  />
                </ProfileField>

                <ProfileField label="Username">
                  <TextInput
                    value={form.username}
                    onChange={(event) =>
                      setDraft((current) => ({ ...form, ...current, username: event.target.value }))
                    }
                  />
                </ProfileField>

                <div className="sm:col-span-2">
                  <ProfileField label="Bio">
                    <TextArea
                      maxLength={160}
                      value={form.bio}
                      onChange={(event) =>
                        setDraft((current) => ({ ...form, ...current, bio: event.target.value }))
                      }
                      placeholder="Write a short status or bio..."
                    />
                  </ProfileField>
                  <p className="mt-1 text-right text-xs text-muted">{form.bio.length}/160</p>
                </div>
              </div>

              <div className="mt-5 flex justify-end">
                <button
                  type="button"
                  disabled={!hasChanges || isProfileSaving}
                  onClick={handleSave}
                  className="inline-flex items-center gap-2 rounded-full bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isProfileSaving ? (
                    <LoaderIcon className="size-4 animate-spin" />
                  ) : (
                    <SaveIcon className="size-4" />
                  )}
                  Save changes
                </button>
              </div>
            </section>

            <aside className="space-y-4">
              <section className="rounded-2xl border border-border bg-background p-4 shadow-sm">
                <h2 className="text-base font-semibold">Account</h2>
                <dl className="mt-3 space-y-3 text-sm">
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-muted">Email</dt>
                    <dd className="mt-0.5 break-words">{profile?.email}</dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-muted">Phone</dt>
                    <dd className="mt-0.5">{profile?.phoneNumber || "Not available"}</dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-muted">Joined</dt>
                    <dd className="mt-0.5">{formatJoinDate(profile?.createdAt)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-muted">Provider</dt>
                    <dd className="mt-0.5 capitalize">{readProvider(profile?.authProvider)}</dd>
                  </div>
                </dl>
              </section>

              <section className="rounded-2xl border border-border bg-background p-4 shadow-sm">
                <h2 className="text-base font-semibold">Theme</h2>
                <div className="mt-3 grid grid-cols-3 gap-2">
                  {[
                    { id: "light", label: "Light", icon: SunIcon },
                    { id: "dark", label: "Dark", icon: MoonIcon },
                    { id: "system", label: "System", icon: MonitorIcon },
                  ].map((option) => {
                    const Icon = option.icon;
                    const selected = themePreference === option.id;
                    return (
                      <button
                        key={option.id}
                        type="button"
                        onClick={() => setTheme(option.id)}
                        className={`flex flex-col items-center gap-1 rounded-xl border px-2 py-3 text-xs font-semibold ${
                          selected
                            ? "border-accent bg-accent-soft text-accent"
                            : "border-border hover:bg-surface"
                        }`}
                      >
                        <Icon className="size-4" />
                        {option.label}
                      </button>
                    );
                  })}
                </div>
              </section>

              <section className="rounded-2xl border border-border bg-background p-4 shadow-sm">
                <h2 className="text-base font-semibold">Session</h2>
                <div className="mt-3 space-y-2">
                  <button
                    type="button"
                    onClick={handleLogout}
                    className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-semibold hover:bg-surface"
                  >
                    <LogOutIcon className="size-4" />
                    Logout
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeleteModalOpen(true)}
                    className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-semibold text-red-500 hover:bg-red-500/10"
                  >
                    <Trash2Icon className="size-4" />
                    Delete account
                  </button>
                </div>
              </section>
            </aside>
          </div>
        )}
      </main>

      <DeleteAccountModal
        isOpen={deleteModalOpen}
        isDeleting={isDeletingAccount}
        onClose={() => setDeleteModalOpen(false)}
        onConfirm={handleDeleteAccount}
      />
    </div>
  );
}
