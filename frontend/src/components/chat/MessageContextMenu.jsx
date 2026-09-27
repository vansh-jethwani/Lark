import { useEffect, useRef } from "react";
import {
  Reply,
  Pencil,
  Pin,
  Copy,
  Forward,
  Trash2,
  CheckSquare,
} from "lucide-react";
import { ReactionPicker } from "./ReactionBar";

export function MessageContextMenu({
  position,
  isOwnMessage,
  message,
  onClose,
  onReply,
  onEdit,
  onPin,
  onCopy,
  onForward,
  onDelete,
  onSelect,
  onReact,
}) {
  const menuRef = useRef(null);

  useEffect(() => {
    menuRef.current?.focus();

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <>
      {/* Close when clicking outside */}
      <div
        className="fixed inset-0 z-40"
        onClick={onClose}
      />

      <div
        ref={menuRef}
        role="menu"
        aria-label="Message actions"
        tabIndex={-1}
        className="fixed z-50 w-56 rounded-xl border border-border bg-background p-2 shadow-2xl outline-none"
        style={{
          top: position.y,
          left: position.x,
        }}
      >
        <ReactionPicker onReact={onReact} />

        <MenuButton
          icon={<Reply size={18} />}
          text="Reply"
          onClick={onReply}
        />

        {isOwnMessage && (
          <MenuButton
            icon={<Pencil size={18} />}
            text="Edit"
            onClick={onEdit}
          />
        )}

        <MenuButton
          icon={<Pin size={18} />}
          text={message.isPinned ? "Unpin" : "Pin"}
          onClick={onPin}
        />

        {message.text && (
          <MenuButton
            icon={<Copy size={18} />}
            text="Copy Text"
            onClick={onCopy}
          />
        )}

        <MenuButton
          icon={<Forward size={18} />}
          text="Forward"
          onClick={onForward}
        />

        <MenuButton
          icon={<Trash2 size={18} />}
          text="Delete"
          danger
          onClick={onDelete}
        />

        <MenuButton
          icon={<CheckSquare size={18} />}
          text="Select"
          onClick={onSelect}
        />
      </div>
    </>
  );
}

function MenuButton({
  icon,
  text,
  danger = false,
  onClick,
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm transition hover:bg-base-200 ${
        danger ? "text-red-500" : ""
      }`}
    >
      {icon}
      {text}
    </button>
  );
}
