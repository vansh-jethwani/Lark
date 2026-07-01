import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeftIcon,
  CameraIcon,
  CheckIcon,
  ChevronRightIcon,
  LoaderIcon,
  LogOutIcon,
  MailIcon,
  MoonIcon,
  MonitorIcon,
  PhoneIcon,
  ShieldIcon,
  SunIcon,
  Trash2Icon,
  UserIcon,
  CalendarIcon,
  PaletteIcon,
} from "lucide-react";
import { Link, Navigate } from "react-router";

import { DeleteAccountModal } from "../components/profile/DeleteAccountModal";
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
  return String(provider || "password")
    .replace(/^oauth_/, "")
    .replaceAll("_", " ");
}

function SettingSection({ title, children }) {
  return (
    <section className="border-b border-border py-3">
      {title && (
        <h2 className="px-4 pb-2 text-xs font-semibold uppercase tracking-wide text-accent">
          {title}
        </h2>
      )}
      <div>{children}</div>
    </section>
  );
}

function SettingRow({
  icon: Icon,
  label,
  value,
  danger = false,
  onClick,
  rightElement,
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-4 px-4 py-3 text-left transition hover:bg-surface"
    >
      {Icon && (
        <span
          className={`grid size-10 shrink-0 place-items-center rounded-full ${
            danger
              ? "bg-red-500/10 text-red-500"
              : "bg-accent-soft text-accent"
          }`}
        >
          <Icon className="size-5" />
        </span>
      )}

      <span className="min-w-0 flex-1 border-b border-border/70 pb-3">
        <span
          className={`block text-sm font-medium ${
            danger ? "text-red-500" : "text-foreground"
          }`}
        >
          {label}
        </span>

        {value && (
          <span className="mt-0.5 block truncate text-sm text-muted">
            {value}
          </span>
        )}
      </span>

      {rightElement ?? (
        <ChevronRightIcon className="size-4 shrink-0 text-muted" />
      )}
    </button>
  );
}

function EditFieldModal({
  open,
  title,
  value,
  multiline = false,
  maxLength,
  onClose,
  onSave,
}) {
  const [localValue, setLocalValue] = useState(value || "");

  useEffect(() => {
    setLocalValue(value || "");
  }, [value, open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-background">
      <header className="flex h-16 items-center gap-3 border-b border-border px-4">
        <button
          type="button"
          onClick={onClose}
          className="grid size-10 place-items-center rounded-full hover:bg-surface"
        >
          <ArrowLeftIcon className="size-5" />
        </button>

        <h2 className="flex-1 text-lg font-semibold">{title}</h2>

        <button
          type="button"
          onClick={() => onSave(localValue.trim())}
          className="grid size-10 place-items-center rounded-full bg-accent text-accent-foreground"
        >
          <CheckIcon className="size-5" />
        </button>
      </header>

      <main className="mx-auto w-full max-w-xl px-4 py-6">
        {multiline ? (
          <textarea
            autoFocus
            maxLength={maxLength}
            value={localValue}
            onChange={(event) => setLocalValue(event.target.value)}
            className="min-h-32 w-full resize-none rounded-xl border border-border bg-surface px-4 py-3 text-sm outline-none focus:border-accent"
            placeholder="Write something..."
          />
        ) : (
          <input
            autoFocus
            value={localValue}
            onChange={(event) => setLocalValue(event.target.value)}
            className="w-full rounded-xl border border-border bg-surface px-4 py-3 text-sm outline-none focus:border-accent"
          />
        )}

        {maxLength && (
          <p className="mt-2 text-right text-xs text-muted">
            {localValue.length}/{maxLength}
          </p>
        )}
      </main>
    </div>
  );
}

function ThemeModal({ open, currentTheme, onClose, onSelect }) {
  if (!open) return null;

  const options = [
    { id: "light", label: "Light", icon: SunIcon },
    { id: "dark", label: "Dark", icon: MoonIcon },
    { id: "system", label: "System default", icon: MonitorIcon },
  ];

  return (
    <div className="fixed inset-0 z-50 bg-black/40">
      <div className="absolute bottom-0 left-0 right-0 rounded-t-3xl bg-background p-4 shadow-2xl">
        <div className="mx-auto max-w-xl">
          <h2 className="px-2 pb-3 text-lg font-semibold">Choose theme</h2>

          <div className="overflow-hidden rounded-2xl border border-border">
            {options.map((option) => {
              const Icon = option.icon;
              const selected = currentTheme === option.id;

              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => {
                    onSelect(option.id);
                    onClose();
                  }}
                  className="flex w-full items-center gap-4 border-b border-border px-4 py-4 last:border-b-0 hover:bg-surface"
                >
                  <Icon className="size-5 text-accent" />
                  <span className="flex-1 text-left text-sm font-medium">
                    {option.label}
                  </span>

                  <span
                    className={`grid size-5 place-items-center rounded-full border ${
                      selected ? "border-accent" : "border-muted"
                    }`}
                  >
                    {selected && (
                      <span className="size-3 rounded-full bg-accent" />
                    )}
                  </span>
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={onClose}
            className="mt-4 w-full rounded-full bg-surface px-4 py-3 text-sm font-semibold"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
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

  const [photoFile, setPhotoFile] = useState(null);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [themeModalOpen, setThemeModalOpen] = useState(false);
  const [editField, setEditField] = useState(null);

  useEffect(() => {
    getProfile();
  }, [getProfile]);

  const photoPreview = useMemo(
    () => (photoFile ? URL.createObjectURL(photoFile) : profile?.profilePic || ""),
    [photoFile, profile?.profilePic]
  );

  useEffect(() => {
    return () => {
      if (photoFile && photoPreview) URL.revokeObjectURL(photoPreview);
    };
  }, [photoFile, photoPreview]);

  if (!authUser) return <Navigate to="/auth" replace />;

  const handlePhotoChange = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setPhotoFile(file);

    const updatedProfile = await updateProfile({
      fullName: profile?.fullName || "",
      username: profile?.username || "",
      bio: profile?.bio || "",
      profilePic: file,
    });

    if (updatedProfile) {
      setPhotoFile(null);
    }
  };

  const handleFieldSave = async (value) => {
    if (!editField) return;

    await updateProfile({
      fullName: profile?.fullName || "",
      username: profile?.username || "",
      bio: profile?.bio || "",
      [editField.key]: value,
    });

    setEditField(null);
  };

  const handleLogout = async () => {
    await logout();
  };

  const handleDeleteAccount = async (confirmation) => {
    const didDelete = await deleteProfile(confirmation);
    if (!didDelete) return;
    clearAuth();
  };

  const themeLabel =
    themePreference === "system"
      ? "System default"
      : themePreference === "dark"
        ? "Dark"
        : "Light";

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-border bg-background/95 px-4 backdrop-blur">
        <Link
          to="/"
          className="grid size-10 shrink-0 place-items-center rounded-full hover:bg-surface"
          aria-label="Back to chat"
        >
          <ArrowLeftIcon className="size-5" />
        </Link>

        <div className="min-w-0 flex-1">
          <h1 className="truncate text-xl font-semibold">Settings</h1>
        </div>

        {isProfileSaving && (
          <LoaderIcon className="size-5 animate-spin text-accent" />
        )}
      </header>

      {isProfileLoading ? (
        <main className="grid min-h-[calc(100dvh-4rem)] place-items-center">
          <LoaderIcon className="size-7 animate-spin text-accent" />
        </main>
      ) : (
        <main className="mx-auto min-h-[calc(100dvh-4rem)] w-full max-w-2xl">
          <section className="flex flex-col items-center border-b border-border px-4 py-8">
            <div className="relative size-24">
              <div className="grid size-24 overflow-hidden rounded-full bg-accent-soft text-3xl font-semibold text-accent">
                {photoPreview ? (
                  <img
                    src={photoPreview}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <span className="place-self-center">
                    {getInitials(profile?.fullName || authUser.fullName)}
                  </span>
                )}
              </div>

              <label className="absolute bottom-0 right-0 grid size-9 cursor-pointer place-items-center rounded-full bg-accent text-accent-foreground shadow-lg">
                <CameraIcon className="size-4" />
                <input
                  type="file"
                  accept="image/*"
                  className="sr-only"
                  onChange={handlePhotoChange}
                />
              </label>
            </div>

            <h2 className="mt-4 text-xl font-semibold">
              {profile?.fullName || authUser.fullName}
            </h2>

            <p className="mt-1 text-sm text-muted">@{profile?.username}</p>

            {profile?.bio && (
              <p className="mt-3 max-w-sm text-center text-sm text-muted">
                {profile.bio}
              </p>
            )}
          </section>

          <SettingSection title="Profile">
            <SettingRow
              icon={UserIcon}
              label="Name"
              value={profile?.fullName || "Add your name"}
              onClick={() =>
                setEditField({
                  key: "fullName",
                  title: "Edit name",
                  value: profile?.fullName || "",
                })
              }
            />

            <SettingRow
              icon={UserIcon}
              label="Username"
              value={profile?.username ? `@${profile.username}` : "Add username"}
              onClick={() =>
                setEditField({
                  key: "username",
                  title: "Edit username",
                  value: profile?.username || "",
                })
              }
            />

            <SettingRow
              icon={UserIcon}
              label="Bio"
              value={profile?.bio || "Add a short bio"}
              onClick={() =>
                setEditField({
                  key: "bio",
                  title: "Edit bio",
                  value: profile?.bio || "",
                  multiline: true,
                  maxLength: 160,
                })
              }
            />
          </SettingSection>

          <SettingSection title="Account">
            <SettingRow
              icon={MailIcon}
              label="Email"
              value={profile?.email || "Not available"}
              rightElement={null}
            />

            <SettingRow
              icon={PhoneIcon}
              label="Phone"
              value={profile?.phoneNumber || "Not available"}
              rightElement={null}
            />

            <SettingRow
              icon={CalendarIcon}
              label="Joined"
              value={formatJoinDate(profile?.createdAt)}
              rightElement={null}
            />

            <SettingRow
              icon={ShieldIcon}
              label="Login provider"
              value={readProvider(profile?.authProvider)}
              rightElement={null}
            />
          </SettingSection>

          <SettingSection title="Appearance">
            <SettingRow
              icon={PaletteIcon}
              label="Theme"
              value={themeLabel}
              onClick={() => setThemeModalOpen(true)}
            />
          </SettingSection>

          <SettingSection title="Session">
            <SettingRow
              icon={LogOutIcon}
              label="Logout"
              onClick={handleLogout}
              rightElement={null}
            />
          </SettingSection>

          <SettingSection title="Danger zone">
            <SettingRow
              icon={Trash2Icon}
              label="Delete account"
              value="This action cannot be undone"
              danger
              onClick={() => setDeleteModalOpen(true)}
              rightElement={null}
            />
          </SettingSection>
        </main>
      )}

      <EditFieldModal
        open={Boolean(editField)}
        title={editField?.title}
        value={editField?.value}
        multiline={editField?.multiline}
        maxLength={editField?.maxLength}
        onClose={() => setEditField(null)}
        onSave={handleFieldSave}
      />

      <ThemeModal
        open={themeModalOpen}
        currentTheme={themePreference}
        onClose={() => setThemeModalOpen(false)}
        onSelect={setTheme}
      />

      <DeleteAccountModal
        isOpen={deleteModalOpen}
        isDeleting={isDeletingAccount}
        onClose={() => setDeleteModalOpen(false)}
        onConfirm={handleDeleteAccount}
      />
    </div>
  );
}