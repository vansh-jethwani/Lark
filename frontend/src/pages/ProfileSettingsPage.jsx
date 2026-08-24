import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeftIcon,
  CameraIcon,
  CheckIcon,
  ChevronRightIcon,
  LoaderIcon,
  LockIcon,
  LogOutIcon,
  MailIcon,
  MoonIcon,
  MonitorIcon,
  SunIcon,
  Trash2Icon,
  UserIcon,
  CalendarIcon,
  PaletteIcon,
  XIcon,
} from "lucide-react";
import { Link, Navigate } from "react-router";

import { DeleteAccountModal } from "../components/profile/DeleteAccountModal";
import { getInitials } from "../hooks/useSelectedConversation";
import { useAuthStore } from "../store/useAuthStore";
import { useProfileStore } from "../store/useProfileStore";
import { applyThemePresetToDocument, useTheme } from "../context/theme";
import { HERO_UI_THEME_PRESETS } from "../data/herouiThemePresets";

function formatJoinDate(date) {
  if (!date) return "Not available";
  const parsedDate = new Date(date);
  if (Number.isNaN(parsedDate.getTime())) return "Not available";

  return parsedDate.toLocaleDateString([], {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
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
      disabled={!onClick}
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
        onClick ? <ChevronRightIcon className="size-4 shrink-0 text-muted" /> : null
      )}
    </button>
  );
}

function PopupModal({ open, title, children, onClose, footer }) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-md rounded-2xl border border-border bg-background p-4 shadow-2xl">
        <div className="flex items-center justify-between gap-3 border-b border-border pb-3">
          <h2 className="min-w-0 truncate text-lg font-semibold">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="grid size-9 shrink-0 place-items-center rounded-full hover:bg-surface"
            aria-label={`Close ${title}`}
          >
            <XIcon className="size-5" />
          </button>
        </div>

        <div className="py-4">{children}</div>

        {footer && <div className="flex justify-end gap-2 pt-1">{footer}</div>}
      </div>
    </div>
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

  if (!open) return null;

  return (
    <PopupModal
      open={open}
      title={title}
      onClose={onClose}
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full px-4 py-2 text-sm font-semibold hover:bg-surface"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onSave(localValue.trim())}
            className="inline-flex items-center gap-2 rounded-full bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground"
          >
            <CheckIcon className="size-4" />
            Save
          </button>
        </>
      }
    >
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
    </PopupModal>
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-md rounded-2xl border border-border bg-background p-4 shadow-2xl">
        <div className="flex items-center justify-between gap-3 pb-3">
          <h2 className="text-lg font-semibold">Choose theme</h2>
          <button
            type="button"
            onClick={onClose}
            className="grid size-9 shrink-0 place-items-center rounded-full hover:bg-surface"
            aria-label="Close theme dialog"
          >
            <XIcon className="size-5" />
          </button>
        </div>

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
                  {selected && <span className="size-3 rounded-full bg-accent" />}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function AccentThemeModal({ open, currentPreset, onClose, onSelect }) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-xl rounded-2xl border border-border bg-background p-4 shadow-2xl">
        <div className="flex items-center justify-between gap-3 pb-3">
          <h2 className="text-lg font-semibold">Accent theme</h2>
          <button
            type="button"
            onClick={onClose}
            className="grid size-9 shrink-0 place-items-center rounded-full hover:bg-surface"
            aria-label="Close accent theme dialog"
          >
            <XIcon className="size-5" />
          </button>
        </div>

        <div className="grid max-h-[60dvh] grid-cols-3 gap-3 overflow-y-auto rounded-2xl border border-border p-3 sm:grid-cols-4">
          {HERO_UI_THEME_PRESETS.map((preset) => {
            const selected = currentPreset === preset.id;

            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => {
                  onSelect(preset.id);
                  onClose();
                }}
                className={`relative flex flex-col items-center gap-2 rounded-xl p-2 text-center transition ${
                  selected ? "bg-accent-soft ring-2 ring-accent" : "hover:bg-surface"
                }`}
                aria-pressed={selected}
              >
                <span className="relative">
                  <span
                    className="block size-14 rounded-full shadow-sm ring-1 ring-border"
                    style={{ background: preset.swatch }}
                  />

                  {selected && (
                    <span className="absolute -right-1 -top-1 grid size-5 place-items-center rounded-full bg-accent text-accent-foreground shadow">
                      <CheckIcon className="size-3" strokeWidth={3} />
                    </span>
                  )}
                </span>

                <span className="text-xs font-medium text-foreground">
                  {preset.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function UpdatePasswordModal({ open, isSaving, onClose, onSave }) {
  const [form, setForm] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [error, setError] = useState("");

  if (!open) return null;

  const clearAndClose = () => {
    setForm({
      currentPassword: "",
      newPassword: "",
      confirmPassword: "",
    });
    setError("");
    onClose();
  };

  const updateField = (field, value) => {
    setError("");
    setForm((current) => ({ ...current, [field]: value }));
  };

  const handleSubmit = async () => {
    if (!form.currentPassword || !form.newPassword || !form.confirmPassword) {
      setError("All password fields are required.");
      return;
    }

    if (form.newPassword.length < 8) {
      setError("New password must be at least 8 characters.");
      return;
    }

    if (form.newPassword !== form.confirmPassword) {
      setError("New password and confirmation do not match.");
      return;
    }

    const didUpdate = await onSave(form);
    if (didUpdate) clearAndClose();
  };

  return (
    <PopupModal
      open={open}
      title="Update password"
      onClose={clearAndClose}
      footer={
        <>
          <button
            type="button"
            onClick={clearAndClose}
            className="rounded-full px-4 py-2 text-sm font-semibold hover:bg-surface"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isSaving}
            className="rounded-full bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSaving ? "Updating..." : "Update password"}
          </button>
        </>
      }
    >
      <div className="space-y-3">
        <input
          type="password"
          value={form.currentPassword}
          onChange={(event) => updateField("currentPassword", event.target.value)}
          className="w-full rounded-xl border border-border bg-surface px-4 py-3 text-sm outline-none focus:border-accent"
          placeholder="Old password"
          autoComplete="current-password"
        />

        <input
          type="password"
          value={form.newPassword}
          onChange={(event) => updateField("newPassword", event.target.value)}
          className="w-full rounded-xl border border-border bg-surface px-4 py-3 text-sm outline-none focus:border-accent"
          placeholder="New password"
          autoComplete="new-password"
        />

        <input
          type="password"
          value={form.confirmPassword}
          onChange={(event) => updateField("confirmPassword", event.target.value)}
          className="w-full rounded-xl border border-border bg-surface px-4 py-3 text-sm outline-none focus:border-accent"
          placeholder="Confirm new password"
          autoComplete="new-password"
        />

        {error && <p className="text-sm text-red-500">{error}</p>}
      </div>
    </PopupModal>
  );
}

export default function ProfileSettingsPage() {
  const authUser = useAuthStore((state) => state.authUser);
  const clearAuth = useAuthStore((state) => state.clearAuth);
  const logout = useAuthStore((state) => state.logout);

  const { themePreference, setTheme, themePreset, setThemePreset } = useTheme();

  const {
    profile,
    isProfileLoading,
    isProfileSaving,
    isPasswordSaving,
    isDeletingAccount,
    getProfile,
    updateProfile,
    updatePassword,
    deleteProfile,
  } = useProfileStore();

  const [photoFile, setPhotoFile] = useState(null);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [themeModalOpen, setThemeModalOpen] = useState(false);
  const [accentThemeModalOpen, setAccentThemeModalOpen] = useState(false);
  const [detailModal, setDetailModal] = useState(null);
  const [logoutModalOpen, setLogoutModalOpen] = useState(false);
  const [passwordModalOpen, setPasswordModalOpen] = useState(false);
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

    const updatedProfile = await updateProfile({
      fullName: profile?.fullName || "",
      username: profile?.username || "",
      bio: profile?.bio || "",
      [editField.key]: value,
    });

    if (updatedProfile) setEditField(null);
  };

  const handleLogout = async () => {
    setLogoutModalOpen(false);
    await logout();
  };

  const handleDeleteAccount = async (password) => {
    const didDelete = await deleteProfile(password);
    if (!didDelete) return;
    clearAuth();
  };

  const themeLabel =
    themePreference === "system"
      ? "System default"
      : themePreference === "dark"
        ? "Dark"
        : "Light";
  const accentThemeLabel =
    HERO_UI_THEME_PRESETS.find((preset) => preset.id === themePreset)?.label || "Default";

  const handleAccentThemeSelect = (presetId) => {
    applyThemePresetToDocument(presetId);
    setThemePreset(presetId);
  };

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
            />

            <SettingRow
              icon={CalendarIcon}
              label="Date Joined"
              value={formatJoinDate(profile?.createdAt)}
            />

            <SettingRow
              icon={LockIcon}
              label="Password"
              value="Update your account password"
              onClick={() => setPasswordModalOpen(true)}
            />
          </SettingSection>

          <SettingSection title="Appearance">
            <SettingRow
              icon={PaletteIcon}
              label="Mode"
              value={themeLabel}
              onClick={() => setThemeModalOpen(true)}
            />

            <SettingRow
              icon={PaletteIcon}
              label="Accent theme"
              value={accentThemeLabel}
              onClick={() => setAccentThemeModalOpen(true)}
            />
          </SettingSection>

          <SettingSection title="Session">
            <SettingRow
              icon={LogOutIcon}
              label="Logout"
              onClick={() => setLogoutModalOpen(true)}
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
        key={editField?.key || "edit-field"}
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

      <AccentThemeModal
        open={accentThemeModalOpen}
        currentPreset={themePreset}
        onClose={() => setAccentThemeModalOpen(false)}
        onSelect={handleAccentThemeSelect}
      />

      <UpdatePasswordModal
        open={passwordModalOpen}
        isSaving={isPasswordSaving}
        onClose={() => setPasswordModalOpen(false)}
        onSave={updatePassword}
      />

      <PopupModal
        open={Boolean(detailModal)}
        title={detailModal?.title}
        onClose={() => setDetailModal(null)}
        footer={
          <button
            type="button"
            onClick={() => setDetailModal(null)}
            className="rounded-full bg-surface px-4 py-2 text-sm font-semibold"
          >
            Close
          </button>
        }
      >
        <p className="text-xs font-semibold uppercase tracking-wide text-accent">
          {detailModal?.label}
        </p>
        <p className="mt-2 break-words text-base text-foreground">
          {detailModal?.value}
        </p>
      </PopupModal>

      <PopupModal
        open={logoutModalOpen}
        title="Logout"
        onClose={() => setLogoutModalOpen(false)}
        footer={
          <>
            <button
              type="button"
              onClick={() => setLogoutModalOpen(false)}
              className="rounded-full px-4 py-2 text-sm font-semibold hover:bg-surface"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleLogout}
              className="rounded-full bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground"
            >
              Logout
            </button>
          </>
        }
      >
        <p className="text-sm text-muted">
          You will be signed out of Lark on this device.
        </p>
      </PopupModal>

      <DeleteAccountModal
        isOpen={deleteModalOpen}
        isDeleting={isDeletingAccount}
        onClose={() => setDeleteModalOpen(false)}
        onConfirm={handleDeleteAccount}
      />
    </div>
  );
}
