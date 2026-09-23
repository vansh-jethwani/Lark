import { Avatar, Button } from "@heroui/react";
import {
  ArrowDownLeftIcon,
  ArrowUpRightIcon,
  Maximize2Icon,
  Minimize2Icon,
  MicIcon,
  MicOffIcon,
  PhoneIcon,
  PhoneIncomingIcon,
  PhoneOutgoingIcon,
  PhoneOffIcon,
  Trash2Icon,
  VideoIcon,
  VideoOffIcon,
  Volume2Icon,
  VolumeXIcon,
  XIcon,
  MinusIcon,
  RefreshCwIcon,
  ShieldCheckIcon,
  ScreenShareIcon,
  ScreenShareOffIcon,
  PictureInPicture2Icon,
  WifiIcon
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { AppLogo } from "../AppLogo";
import { getInitials } from "../../hooks/useSelectedConversation";
import { useAuthStore } from "../../store/useAuthStore";
import { useChatStore } from "../../store/useChatStore";
import {
  addCallHistory,
  callStatusLabel,
  dateLabel,
  formatCallDuration,
  groupCallHistory,
  mergeCallHistory,
  normalizeCallRecord,
  readCallHistory,
  timeLabel
} from "../../lib/callHistory";
import { axiosInstance } from "../../lib/axios";

const STUN = "stun:stun.l.google.com:19302";
const constraints = (type, facingMode = "user") => ({
  audio: {
    echoCancellation: { ideal: true },
    noiseSuppression: { ideal: true },
    autoGainControl: { ideal: true },
    sampleRate: { ideal: 48000 },
    channelCount: { ideal: 1 },
    latency: { ideal: 0.02 },
  },
  video: type === "video" ? {
    facingMode: { ideal: facingMode },
    width: { ideal: 1920, max: 1920 },
    height: { ideal: 1080, max: 1080 },
    frameRate: { ideal: 30, max: 30 },
  } : false,
});

async function tuneSender(sender) {
  if (!sender?.getParameters || !sender.setParameters) return;
  try {
    const parameters = sender.getParameters();
    if (!parameters.encodings?.length) parameters.encodings = [{}];
    const encoding = parameters.encodings[0];
    if (sender.track?.kind === "audio") encoding.maxBitrate = 96000;
    if (sender.track?.kind === "video") {
      encoding.maxBitrate = 2500000;
      encoding.maxFramerate = 30;
      parameters.degradationPreference = "balanced";
    }
    await sender.setParameters(parameters);
  } catch {
    /* Browsers that do not support bitrate tuning will use standard settings */
  }
}

const debug = (...args) => {
  if (import.meta.env.DEV) console.debug("[WEBRTC]", ...args);
};

export function CallHistory() {
  const users = useChatStore((state) => state.users);
  const searchQuery = useChatStore((state) => state.searchQuery);
  const authUser = useAuthStore((state) => state.authUser);
  const history = useChatStore((state) => state.callHistory);
  const [expandedKey, setExpandedKey] = useState(null);

  useEffect(() => {
    const refresh = () => {
      const local = readCallHistory();
      useChatStore.setState((state) => ({
        callHistory: mergeCallHistory(state.callHistory, local),
      }));
    };
    window.addEventListener("lark:call-history", refresh);
    return () => window.removeEventListener("lark:call-history", refresh);
  }, []);

  const groups = useMemo(() => {
    const grouped = groupCallHistory(history);
    const query = searchQuery.trim().toLowerCase();
    if (!query) return grouped;
    const matchingUserIds = new Set(
      users
        .filter((user) => user.username?.toLowerCase().includes(query))
        .map((user) => String(user._id))
    );
    return grouped.filter((group) => matchingUserIds.has(String(group.peerId)));
  }, [history, searchQuery, users]);

  const matchingUsers = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return [];
    return users.filter((user) => user.username?.toLowerCase().includes(query));
  }, [searchQuery, users]);

  return (
    <div className="w-full p-0">
      {matchingUsers.length > 0 ? (
        <div className="mb-2 border-b border-border pb-2">
          <p className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-muted">
            People
          </p>
          {matchingUsers.map((user) => (
            <CallUserSearchRow key={user._id} user={user} />
          ))}
        </div>
      ) : null}
      {groups.length === 0 ? (
        <p className="px-3 py-8 text-center text-sm text-muted">
          {searchQuery.trim()
            ? matchingUsers.length > 0
              ? "No call history for these users."
              : "No users match your search."
            : "No calls yet"}
        </p>
      ) : (
        groups.map((group) => {
          const latest = group.latest;
          const user = users.find((item) => String(item._id) === String(group.peerId));
          const expanded = expandedKey === group.key;
          return (
            <div key={group.key} className="overflow-hidden">
              <button
                type="button"
                className="flex w-full items-center gap-3 px-2.5 py-3 text-left transition-colors hover:bg-surface/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                onClick={() => setExpandedKey(expanded ? null : group.key)}
                aria-expanded={expanded}
              >
                <Avatar className="size-12 shrink-0">
                  <Avatar.Image alt={latest.peerName} src={user?.profilePic || latest.peerAvatar} />
                  <Avatar.Fallback>{getInitials(latest.peerName)}</Avatar.Fallback>
                </Avatar>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-foreground">
                    {latest.peerName}
                    {group.entries.length > 1 ? ` (${group.entries.length})` : ""}
                  </span>
                  <span
                    className={`mt-0.5 flex items-center gap-1 truncate text-xs ${
                      isUnsuccessful(latest) ? "text-danger" : "text-muted"
                    }`}
                  >
                    <CallDirectionIcon entry={latest} />
                    {dateTimeLabel(latest.createdAt)}
                  </span>
                </span>
                <CallActionButton entry={latest} />
              </button>
              {expanded ? (
                <div className="space-y-3 border-t border-border/50 bg-surface/30 px-14 py-3 sm:px-16">
                  {group.entries.map((entry) => (
                    <CallHistoryDetail key={entry.id} entry={entry} />
                  ))}
                </div>
              ) : null}
            </div>
          );
        })
      )}
    </div>
  );
}

function CallActionButton({ entry }) {
  const Icon = entry.type === "video" ? VideoIcon : PhoneIcon;
  const startCall = (event) => {
    event.stopPropagation();
    window.dispatchEvent(
      new CustomEvent("lark:start-call", {
        detail: {
          type: entry.type,
          user: { _id: entry.peerId, fullName: entry.peerName, profilePic: entry.peerAvatar },
        },
      })
    );
  };
  return (
    <span
      role="button"
      tabIndex={0}
      aria-label={`${entry.type === "video" ? "Video" : "Audio"} call ${entry.peerName}`}
      title={`${entry.type === "video" ? "Video" : "Audio"} call`}
      onClick={startCall}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") startCall(event);
      }}
      className="grid size-9 shrink-0 place-items-center rounded-full text-emerald-500 transition-colors hover:bg-emerald-500/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
    >
      <Icon className="size-5" />
    </span>
  );
}

function CallUserSearchRow({ user }) {
  const startCall = (type) =>
    window.dispatchEvent(
      new CustomEvent("lark:start-call", {
        detail: {
          type,
          user: {
            _id: user._id,
            fullName: user.fullName,
            profilePic: user.profilePic,
            isOnline: user.isOnline,
          },
        },
      })
    );
  return (
    <div className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-surface/60">
      <Avatar className="size-10 shrink-0">
        <Avatar.Image alt={user.fullName} src={user.profilePic} />
        <Avatar.Fallback>{getInitials(user.fullName)}</Avatar.Fallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">{user.fullName}</p>
        <p className="truncate text-xs text-muted">@{user.username}</p>
      </div>
      <div className="flex shrink-0 gap-1">
        <Button
          isIconOnly
          size="sm"
          variant="ghost"
          aria-label={`Audio call ${user.fullName}`}
          onPress={() => startCall("audio")}
        >
          <PhoneIcon className="size-4" />
        </Button>
        <Button
          isIconOnly
          size="sm"
          variant="ghost"
          aria-label={`Video call ${user.fullName}`}
          onPress={() => startCall("video")}
        >
          <VideoIcon className="size-4" />
        </Button>
      </div>
    </div>
  );
}

function CallDirectionIcon({ entry }) {
  const Icon = entry.direction === "incoming" ? PhoneIncomingIcon : PhoneOutgoingIcon;
  return <Icon className="size-3.5 shrink-0" />;
}

function isUnsuccessful(entry) {
  return ["missed", "rejected", "cancelled", "failed"].includes(entry.status);
}

function CombinedCallIcon({ entry, className = "" }) {
  const TypeIcon = entry.type === "video" ? VideoIcon : PhoneIcon;
  const DirectionIcon = entry.direction === "incoming" ? ArrowDownLeftIcon : ArrowUpRightIcon;

  return (
    <span
      className={`relative grid size-7 shrink-0 place-items-center rounded-full bg-current/10 ${className}`}
      aria-hidden="true"
    >
      <TypeIcon className="size-4" strokeWidth={2.25} />
      <span className="absolute -bottom-0.5 -right-0.5 grid size-3.5 place-items-center rounded-full bg-background text-foreground ring-1 ring-border">
        <DirectionIcon className="size-2.5" strokeWidth={3} />
      </span>
    </span>
  );
}

function callDescription(entry) {
  return entry.type === "video" ? "Video call" : "Voice call";
}

function dateTimeLabel(value) {
  const label = dateLabel(value);
  const date = new Date(value);
  const displayDate =
    label === "Today" || label === "Yesterday"
      ? label
      : date.toLocaleDateString(undefined, { month: "long", day: "numeric" });
  return `${displayDate}, ${timeLabel(value).replace(/\s+/g, " ").toLowerCase()}`;
}

export function CallMessage({
  entry,
  isSelectionMode,
  isSelected,
  onToggleSelected,
  onStartSelection,
}) {
  return (
    <CallHistoryDetail
      entry={entry}
      inChat
      isSelectionMode={isSelectionMode}
      isSelected={isSelected}
      onToggleSelected={onToggleSelected}
      onStartSelection={onStartSelection}
    />
  );
}

function CallHistoryDetail({
  entry,
  inChat = false,
  isSelectionMode = false,
  isSelected = false,
  onToggleSelected,
  onStartSelection,
}) {
  const status = callStatusLabel(entry.status);
  const unsuccessful = isUnsuccessful(entry);
  const [localSelected, setLocalSelected] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState({ x: 0, y: 0 });
  const holdTimer = useRef(null);
  const remove = async () => {
    try {
      if (entry.id && !String(entry.id).startsWith("local-")) {
        try {
          await axiosInstance.delete(`/auth/calls/${entry.id}`);
        } catch {
          /* Cached records may not exist on server */
        }
      }
      const history = readCallHistory().filter((item) => item.id !== entry.id);
      localStorage.setItem("lark-call-history", JSON.stringify(history));
      window.dispatchEvent(new Event("lark:call-history"));
    } catch {
      return;
    }
  };
  const selected = inChat ? isSelected : localSelected;
  const selectFromHold = () => {
    if (inChat) onStartSelection?.(entry.id);
    else setLocalSelected(true);
    setMenuOpen(false);
  };
  const startHold = () => {
    holdTimer.current = window.setTimeout(selectFromHold, 500);
  };
  const clearHold = () => {
    if (holdTimer.current) window.clearTimeout(holdTimer.current);
  };
  const showMenu = (event) => {
    event.preventDefault();
    if (inChat && isSelectionMode) {
      onToggleSelected?.(entry.id);
      return;
    }
    setMenuPosition({
      x: Math.min(event.clientX, window.innerWidth - 220),
      y: Math.min(event.clientY, window.innerHeight - 140),
    });
    setMenuOpen(true);
  };
  const handleClick = () => {
    if (inChat && isSelectionMode) onToggleSelected?.(entry.id);
  };
  const outgoing = inChat && entry.direction === "outgoing";
  const iconTone = unsuccessful
    ? "text-danger"
    : outgoing
    ? "text-accent-foreground"
    : "text-foreground";
  const detailTone = unsuccessful
    ? "text-danger"
    : outgoing
    ? "text-accent-foreground/85"
    : "text-muted";
  const hasDuration = status === "Completed" && entry.duration;
  const metadataLabel = hasDuration ? "Duration" : status;
  const metadataValue = hasDuration ? formatCallDuration(entry.duration) : null;

  return (
    <div
      className={`relative flex w-full py-0.5 ${
        inChat
          ? entry.direction === "outgoing"
            ? "justify-end"
            : "justify-start"
          : "justify-center"
      } ${selected ? "rounded-xl bg-accent/10" : ""}`}
      onClick={handleClick}
      onPointerDown={startHold}
      onPointerUp={clearHold}
      onPointerLeave={clearHold}
      onContextMenu={showMenu}
    >
      <div
        className={`flex w-fit max-w-[min(90%,28rem)] items-start gap-2.5 rounded-2xl px-3 py-2.5 text-xs shadow-sm sm:max-w-[min(75%,28rem)] ${
          outgoing
            ? "rounded-br-md bg-accent text-accent-foreground"
            : "rounded-bl-md bg-surface"
        }`}
      >
        <CombinedCallIcon entry={entry} className={iconTone} />
        <span className="min-w-0">
          <span
            className={`block break-words text-[13px] font-semibold leading-5 ${
              outgoing ? "text-accent-foreground" : "text-foreground"
            }`}
          >
            {callDescription(entry)}
          </span>
          <span
            className={`mt-1 flex min-w-[9.5rem] items-baseline justify-between gap-4 tabular-nums ${detailTone}`}
          >
            <span className="min-w-0">
              <span className="font-medium">{metadataLabel}</span>
              {metadataValue ? (
                <span className="ml-1.5 font-semibold">{metadataValue}</span>
              ) : null}
            </span>
            <time className="shrink-0 text-[11px]" dateTime={entry.createdAt}>
              {timeLabel(entry.createdAt)}
            </time>
          </span>
        </span>
        {selected && !inChat ? (
          <button
            type="button"
            aria-label="Delete selected call"
            title="Delete call"
            onClick={remove}
            className="text-danger hover:text-danger/80"
          >
            <Trash2Icon className="size-3.5" />
          </button>
        ) : null}
      </div>
      {menuOpen ? (
        <CallLogContextMenu
          position={menuPosition}
          onClose={() => setMenuOpen(false)}
          onSelect={selectFromHold}
          onDelete={remove}
        />
      ) : null}
    </div>
  );
}

function CallLogContextMenu({ position, onClose, onSelect, onDelete }) {
  return (
    <>
      <button
        type="button"
        aria-label="Close call menu"
        className="fixed inset-0 z-40 cursor-default"
        onClick={onClose}
      />
      <div
        className="fixed z-50 w-44 rounded-xl border border-border bg-background p-1.5 shadow-2xl"
        style={{ top: position.y, left: position.x }}
      >
        <button
          type="button"
          className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-surface"
          onClick={onSelect}
        >
          Select
        </button>
        <button
          type="button"
          className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-danger hover:bg-danger/10"
          onClick={onDelete}
        >
          <Trash2Icon className="size-4" />
          Delete
        </button>
      </div>
    </>
  );
}

export function ConversationCallHistory({ peerId }) {
  const history = useChatStore((state) => state.callHistory);

  useEffect(() => {
    const refresh = () => {
      const local = readCallHistory();
      useChatStore.setState((state) => ({
        callHistory: mergeCallHistory(state.callHistory, local),
      }));
    };
    window.addEventListener("lark:call-history", refresh);
    return () => window.removeEventListener("lark:call-history", refresh);
  }, []);

  return (
    <>
      {history
        .filter((entry) => String(entry.peerId) === String(peerId))
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
        .map((entry) => (
          <CallHistoryDetail key={entry.id} entry={entry} inChat />
        ))}
    </>
  );
}

export function CallPanel() {
  const socket = useAuthStore((state) => state.socket);
  const authUser = useAuthStore((state) => state.authUser);
  const users = useChatStore((state) => state.users);

  const [call, setCall] = useState(null);
  const [minimized, setMinimized] = useState(false);
  const [maximized, setMaximized] = useState(false);
  const [muted, setMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(false);
  const [speakerOn, setSpeakerOn] = useState(true);
  const [facingMode, setFacingMode] = useState("user");
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [swappedVideo, setSwappedVideo] = useState(false);
  const [statusText, setStatusText] = useState("");
  const [seconds, setSeconds] = useState(0);

  const secondsRef = useRef(0);
  const callRef = useRef(null);
  const peerRef = useRef(null);
  const localStreamRef = useRef(null);
  const remoteStreamRef = useRef(null);
  const screenStreamRef = useRef(null);
  const candidateQueueRef = useRef([]);
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const remoteAudioRef = useRef(null);
  const ringAudioRef = useRef(null);
  const callWindowRef = useRef(null);

  const setCurrentCall = (value) => {
    callRef.current = value;
    setCall(value);
  };

  const showMediaError = (error) => {
    if (error.name === "NotAllowedError") {
      setStatusText("Camera or microphone permission was denied.");
    } else if (error.name === "NotFoundError") {
      setStatusText("No camera or microphone was found on this device.");
    } else {
      setStatusText(error.message || "Camera or microphone is unavailable.");
    }
  };

  const attachRemote = (stream) => {
    remoteStreamRef.current = stream;
    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = stream;
      remoteVideoRef.current.play().catch(() => setStatusText("Click screen to enable audio."));
    }
    if (remoteAudioRef.current) {
      remoteAudioRef.current.srcObject = stream;
      remoteAudioRef.current.play().catch(() => setStatusText("Click screen to enable audio."));
    }
    debug("remote stream assigned", stream.getTracks().map((track) => track.kind));
  };

  const flushCandidates = async (connection) => {
    for (const candidate of candidateQueueRef.current.splice(0)) {
      await connection.addIceCandidate(candidate);
    }
  };

  const createPeer = (peer) => {
    const connection = new RTCPeerConnection({
      iceServers: [{ urls: STUN }],
      iceCandidatePoolSize: 4,
      bundlePolicy: "max-bundle",
    });
    peerRef.current = connection;

    connection.onicecandidate = ({ candidate }) => {
      if (candidate) {
        socket?.emit("call:signal", {
          receiverId: peer.id,
          callId: callRef.current?.id,
          signal: { candidate },
        });
      }
    };

    connection.ontrack = ({ streams, track }) => {
      const stream = streams[0] || remoteStreamRef.current || new MediaStream();
      if (!streams[0] && !stream.getTracks().includes(track)) {
        stream.addTrack(track);
      }
      attachRemote(stream);
      debug("remote track", track.kind);
    };

    connection.onconnectionstatechange = () => {
      debug("connection state", connection.connectionState);
      if (connection.connectionState === "connected") {
        setCurrentCall({ ...callRef.current, status: "connected" });
      } else if (connection.connectionState === "disconnected") {
        setCurrentCall({ ...callRef.current, status: "reconnecting" });
      } else if (connection.connectionState === "failed") {
        setStatusText("Connection lost. Please try the call again.");
      }
    };

    localStreamRef.current?.getTracks().forEach((track) => {
      tuneSender(connection.addTrack(track, localStreamRef.current));
    });

    return connection;
  };

  const finish = (status = "completed") => {
    const current = callRef.current;
    if (!current) return;

    addCallHistory({
      callId: current.id,
      peerId: current.peer.id,
      peerName: current.peer.name,
      peerAvatar: current.peer.avatar,
      type: current.type,
      direction: current.incoming ? "incoming" : "outgoing",
      status,
      duration: secondsRef.current,
    });

    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    screenStreamRef.current?.getTracks().forEach((track) => track.stop());
    peerRef.current?.close();

    if (ringAudioRef.current) {
      ringAudioRef.current.pause();
      ringAudioRef.current.currentTime = 0;
    }

    candidateQueueRef.current = [];
    localStreamRef.current = null;
    remoteStreamRef.current = null;
    screenStreamRef.current = null;
    peerRef.current = null;

    setCurrentCall(null);
    setMinimized(false);
    setMaximized(false);
    secondsRef.current = 0;
    setSeconds(0);
    setMuted(false);
    setCameraOff(false);
    setIsScreenSharing(false);
    setSwappedVideo(false);
  };

  const startCall = async (user, type) => {
    if (callRef.current || !socket) return;
    const peer = {
      id: user._id,
      name: user.fullName,
      avatar: user.profilePic,
      initials: getInitials(user.fullName),
    };
    const callId = crypto.randomUUID();

    try {
      localStreamRef.current = await navigator.mediaDevices.getUserMedia(constraints(type));
      setCurrentCall({ id: callId, peer, type, status: "calling", outgoing: true });
      createPeer(peer);
      socket.emit("call:initiate", {
        receiverId: peer.id,
        callId,
        callType: type,
        caller: { name: authUser.fullName, avatar: authUser.profilePic },
      });
      debug("initiating call", callId);
    } catch (error) {
      showMediaError(error);
      finish("failed");
    }
  };

  useEffect(() => {
    const listener = (event) => startCall(event.detail.user, event.detail.type);
    window.addEventListener("lark:start-call", listener);
    return () => window.removeEventListener("lark:start-call", listener);
  }, []);

  useEffect(() => {
    if (!socket) return undefined;

    const invite = ({ callerId, callType, caller, callId }) => {
      if (callRef.current) return socket.emit("call:reject", { receiverId: callerId, callId });
      const user = users.find((item) => String(item._id) === String(callerId));
      setCurrentCall({
        id: callId,
        peer: {
          id: callerId,
          name: caller?.name || user?.fullName || "Lark user",
          avatar: caller?.avatar || user?.profilePic,
          initials: getInitials(caller?.name || user?.fullName),
        },
        type: callType,
        status: "ringing",
        incoming: true,
      });
      socket.emit("call:ringing", { receiverId: callerId, callId });
    };

    const ringing = ({ userId, callId }) => {
      if (callRef.current?.id === callId && String(callRef.current.peer.id) === String(userId)) {
        setCurrentCall({ ...callRef.current, status: "ringing" });
      }
    };

    const accepted = async ({ userId, callId }) => {
      if (callRef.current?.id !== callId || String(callRef.current.peer.id) !== String(userId))
        return;
      setCurrentCall({ ...callRef.current, status: "connecting" });
      const connection = peerRef.current || createPeer(callRef.current.peer);
      const offer = await connection.createOffer();
      await connection.setLocalDescription(offer);
      socket.emit("call:signal", {
        receiverId: userId,
        callId,
        signal: { description: connection.localDescription },
      });
    };

    const signal = async ({ userId, callId, signal: payload }) => {
      if (callRef.current?.id !== callId) return;
      const connection = peerRef.current || createPeer(callRef.current.peer);
      try {
        if (payload.candidate) {
          if (connection.remoteDescription) await connection.addIceCandidate(payload.candidate);
          else candidateQueueRef.current.push(payload.candidate);
          return;
        }
        if (!payload.description) return;
        await connection.setRemoteDescription(payload.description);
        await flushCandidates(connection);
        if (payload.description.type === "offer") {
          const answer = await connection.createAnswer();
          await connection.setLocalDescription(answer);
          socket.emit("call:signal", {
            receiverId: userId,
            callId,
            signal: { description: connection.localDescription },
          });
          setCurrentCall({ ...callRef.current, status: "connecting", incoming: false });
        }
      } catch (error) {
        debug("signaling error", error);
        setStatusText("The call connection could not be established.");
      }
    };

    const rejected = ({ callId }) => {
      if (callRef.current?.id === callId) finish("rejected");
    };

    const ended = ({ callId }) => {
      if (callRef.current?.id === callId) finish("completed");
    };

    const failed = ({ callId, message }) => {
      if (callRef.current?.id === callId) {
        setStatusText(message || "This call is no longer available.");
        finish("failed");
      }
    };

    socket.on("call:ring", invite);
    socket.on("call:ringing", ringing);
    socket.on("call:accept", accepted);
    socket.on("call:reject", rejected);
    socket.on("call:end", ended);
    socket.on("call:signal", signal);
    socket.on("call:failed", failed);

    return () => {
      socket.off("call:ring", invite);
      socket.off("call:ringing", ringing);
      socket.off("call:accept", accepted);
      socket.off("call:reject", rejected);
      socket.off("call:end", ended);
      socket.off("call:signal", signal);
      socket.off("call:failed", failed);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket, users]);

  useEffect(() => {
    if (call?.status !== "connected") return undefined;
    const timer = window.setInterval(() => {
      setSeconds((value) => {
        const next = value + 1;
        secondsRef.current = next;
        return next;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [call?.status]);

  useEffect(() => {
    if (call?.status !== "calling" && call?.status !== "ringing") return undefined;
    const audio = ringAudioRef.current;
    audio?.play().catch(() => {});
    return () => {
      if (audio) {
        audio.pause();
        audio.currentTime = 0;
      }
    };
  }, [call?.status]);

  useEffect(() => {
    if (localVideoRef.current && localStreamRef.current) {
      localVideoRef.current.srcObject = localStreamRef.current;
    }
  }, [call, isScreenSharing]);

  const accept = async () => {
    try {
      localStreamRef.current = await navigator.mediaDevices.getUserMedia(constraints(call.type));
      createPeer(call.peer);
      socket.emit("call:accept", { receiverId: call.peer.id, callId: call.id });
      setCurrentCall({ ...callRef.current, status: "connecting", incoming: false });
    } catch (error) {
      showMediaError(error);
    }
  };

  useEffect(() => {
    const handleNotificationAction = async ({ detail }) => {
      const { action, call: pendingCall } = detail || {};
      window.__larkPendingCallAction = null;
      if (!pendingCall || callRef.current || !socket) return;
      const peer = {
        id: pendingCall.caller._id,
        name: pendingCall.caller.fullName,
        avatar: pendingCall.caller.profilePic,
        initials: getInitials(pendingCall.caller.fullName),
      };
      if (action === "decline") {
        socket.emit("call:reject", { receiverId: peer.id, callId: pendingCall.callId });
        return;
      }
      if (action !== "accept") return;
      try {
        localStreamRef.current = await navigator.mediaDevices.getUserMedia(
          constraints(pendingCall.callType)
        );
        setCurrentCall({
          id: pendingCall.callId,
          peer,
          type: pendingCall.callType,
          status: "connecting",
          incoming: false,
        });
        createPeer(peer);
        socket.emit("call:accept", { receiverId: peer.id, callId: pendingCall.callId });
      } catch (error) {
        showMediaError(error);
      }
    };
    window.addEventListener("lark:notification-call-action", handleNotificationAction);
    if (window.__larkPendingCallAction) {
      const pendingAction = window.__larkPendingCallAction;
      window.__larkPendingCallAction = null;
      handleNotificationAction({ detail: pendingAction });
    }
    return () => window.removeEventListener("lark:notification-call-action", handleNotificationAction);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket]);

  const end = (status = "completed") => {
    if (callRef.current) {
      socket?.emit("call:end", {
        receiverId: callRef.current.peer.id,
        callId: callRef.current.id,
      });
    }
    finish(status);
  };

  const toggleMute = () => {
    const next = !muted;
    localStreamRef.current?.getAudioTracks().forEach((track) => {
      track.enabled = !next;
    });
    setMuted(next);
  };

  const toggleCamera = () => {
    const next = !cameraOff;
    localStreamRef.current?.getVideoTracks().forEach((track) => {
      track.enabled = !next;
    });
    setCameraOff(next);
  };

  const switchCamera = async () => {
    if (call?.type !== "video" || isScreenSharing) return;
    const nextFacingMode = facingMode === "user" ? "environment" : "user";
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: nextFacingMode }, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      const newTrack = stream.getVideoTracks()[0];
      const sender = peerRef.current?.getSenders().find((item) => item.track?.kind === "video");
      if (!newTrack || !sender) throw new Error("Video track is unavailable");
      await sender.replaceTrack(newTrack);
      await tuneSender(sender);
      const oldTrack = localStreamRef.current?.getVideoTracks()[0];
      const nextStream = new MediaStream([
        ...(localStreamRef.current?.getAudioTracks() || []),
        newTrack,
      ]);
      oldTrack?.stop();
      localStreamRef.current = nextStream;
      setFacingMode(nextFacingMode);
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = nextStream;
        await localVideoRef.current.play().catch(() => {});
      }
    } catch {
      stream?.getTracks().forEach((track) => track.stop());
      setStatusText("The target camera is not available on this device.");
    }
  };

  const toggleScreenShare = async () => {
    if (isScreenSharing) {
      try {
        screenStreamRef.current?.getTracks().forEach((t) => t.stop());
        const cameraStream = await navigator.mediaDevices.getUserMedia(constraints("video", facingMode));
        const camTrack = cameraStream.getVideoTracks()[0];
        const sender = peerRef.current?.getSenders().find((item) => item.track?.kind === "video");
        if (sender && camTrack) {
          await sender.replaceTrack(camTrack);
          await tuneSender(sender);
        }
        localStreamRef.current = cameraStream;
        if (localVideoRef.current) localVideoRef.current.srcObject = cameraStream;
        setIsScreenSharing(false);
      } catch (err) {
        debug("Reverting screen share error", err);
      }
    } else {
      try {
        const screenStream = await navigator.mediaDevices.getDisplayMedia({
          video: { cursor: "always" },
          audio: false,
        });
        screenStreamRef.current = screenStream;
        const screenTrack = screenStream.getVideoTracks()[0];
        const sender = peerRef.current?.getSenders().find((item) => item.track?.kind === "video");
        if (sender && screenTrack) {
          await sender.replaceTrack(screenTrack);
        }
        screenTrack.onended = () => {
          toggleScreenShare();
        };
        if (localVideoRef.current) localVideoRef.current.srcObject = screenStream;
        setIsScreenSharing(true);
      } catch {
        setStatusText("Screen sharing was cancelled or unavailable.");
      }
    }
  };

  const togglePiP = async () => {
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
      } else if (remoteVideoRef.current && remoteVideoRef.current.readyState >= 2) {
        await remoteVideoRef.current.requestPictureInPicture();
      }
    } catch {
      setStatusText("Picture-in-picture mode is not supported by your browser.");
    }
  };

  const toggleFullscreen = () => {
    if (minimized) setMinimized(false);
    setMaximized((value) => !value);
  };

  const statusSubtext = useMemo(() => {
    if (!call) return "";
    switch (call.status) {
      case "calling":
        return "Calling...";
      case "ringing":
        return call.incoming ? "Incoming call..." : "Ringing...";
      case "connecting":
        return "Connecting...";
      case "reconnecting":
        return "Reconnecting...";
      case "connected":
        return `${call.type === "video" ? "Video call" : "Voice call"} · ${formatCallDuration(seconds)}`;
      default:
        return "Call in progress";
    }
  }, [call, seconds]);

  if (!call) {
    return statusText ? (
      <div className="fixed bottom-5 left-1/2 z-[60] flex max-w-[calc(100vw-2rem)] -translate-x-1/2 items-center gap-3 rounded-full bg-danger/90 px-4 py-3 text-sm text-white shadow-2xl backdrop-blur-md">
        <span>{statusText}</span>
        <button
          type="button"
          aria-label="Dismiss call error"
          onClick={() => setStatusText("")}
          className="rounded-full p-1 hover:bg-white/20"
        >
          <XIcon className="size-4" />
        </button>
      </div>
    ) : null;
  }

  return (
    <>
      <audio ref={ringAudioRef} src="/ring.mp3" loop preload="auto" aria-hidden="true" />
      {statusText ? (
        <div className="fixed top-5 left-1/2 z-[70] flex max-w-[calc(100vw-2rem)] -translate-x-1/2 items-center gap-3 rounded-full bg-danger/90 px-4 py-2.5 text-xs sm:text-sm font-medium text-white shadow-2xl backdrop-blur-md">
          <span>{statusText}</span>
          <button
            type="button"
            aria-label="Dismiss message"
            onClick={() => setStatusText("")}
            className="rounded-full p-1 hover:bg-white/20"
          >
            <XIcon className="size-4" />
          </button>
        </div>
      ) : null}

      {minimized ? (
        /* WhatsApp-style Floating Minimized Widget */
        <div className="fixed bottom-5 right-5 z-[60] flex items-center gap-3 rounded-full border border-white/10 bg-zinc-900/95 p-2 pr-4 shadow-2xl backdrop-blur-xl animate-in fade-in slide-in-from-bottom-5">
          <div className="relative">
            <Avatar className="size-11 ring-2 ring-emerald-500/50">
              <Avatar.Image alt={call.peer.name} src={call.peer.avatar} />
              <Avatar.Fallback>{call.peer.initials}</Avatar.Fallback>
            </Avatar>
            {call.status === "connected" && (
              <span className="absolute bottom-0 right-0 size-3 rounded-full bg-emerald-500 ring-2 ring-zinc-900" />
            )}
          </div>

          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-semibold text-white">{call.peer.name}</p>
            <p className="text-[11px] text-zinc-400">{statusSubtext}</p>
          </div>

          <div className="flex items-center gap-1.5 border-l border-white/10 pl-2">
            <Button
              isIconOnly
              size="sm"
              variant="ghost"
              className="size-8 rounded-full text-zinc-300 hover:bg-white/10"
              onPress={toggleMute}
              aria-label="Toggle Mute"
            >
              {muted ? <MicOffIcon className="size-4 text-red-400" /> : <MicIcon className="size-4" />}
            </Button>
            <Button
              isIconOnly
              size="sm"
              variant="ghost"
              className="size-8 rounded-full text-zinc-300 hover:bg-white/10"
              onPress={() => setMinimized(false)}
              aria-label="Maximize Call"
            >
              <Maximize2Icon className="size-4" />
            </Button>
            <Button
              isIconOnly
              size="sm"
              className="size-8 rounded-full bg-red-600 text-white hover:bg-red-700"
              onPress={() => end()}
              aria-label="End Call"
            >
              <PhoneOffIcon className="size-4" />
            </Button>
          </div>
        </div>
      ) : (
        /* Full Calling Viewport (Mobile Native App + Desktop responsive WhatsApp styling) */
        <div
          className={`fixed inset-0 z-[60] flex flex-col justify-between bg-zinc-950 text-white font-sans ${
            maximized ? "p-0" : "sm:p-4 sm:bg-black/80 sm:backdrop-blur-md"
          }`}
        >
          <div
            ref={callWindowRef}
            className={`relative flex size-full flex-col overflow-hidden bg-gradient-to-b from-zinc-900 via-zinc-950 to-black ${
              maximized ? "rounded-none" : "sm:max-w-5xl sm:max-h-[92dvh] sm:mx-auto sm:rounded-3xl sm:border sm:border-white/10 sm:shadow-2xl"
            }`}
          >
            {/* Top WhatsApp Style Navigation Bar */}
            <div className="absolute top-0 inset-x-0 z-30 flex items-center justify-between bg-gradient-to-b from-black/80 via-black/40 to-transparent px-4 py-4 sm:px-6">
              <div className="flex items-center gap-3 min-w-0">
                <AppLogo size={28} className="rounded-lg shadow-sm" alt="Lark" />
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h2 className="truncate text-base font-semibold tracking-tight text-white">
                      {call.peer.name}
                    </h2>
                    <span className="hidden sm:inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-400 border border-emerald-500/20">
                      <ShieldCheckIcon className="size-3" />
                      Encrypted
                    </span>
                  </div>
                  <p className="flex items-center gap-1.5 text-xs text-zinc-300/90 font-medium">
                    {statusSubtext}
                  </p>
                </div>
              </div>

              {/* Action Window Controls */}
              <div className="flex items-center gap-1.5 bg-zinc-900/60 p-1 rounded-full border border-white/10 backdrop-blur-md">
                <Button
                  isIconOnly
                  size="sm"
                  variant="ghost"
                  className="size-8 rounded-full text-zinc-300 hover:bg-white/10"
                  aria-label="Minimize Call"
                  onPress={() => setMinimized(true)}
                >
                  <MinusIcon className="size-4" />
                </Button>
                <Button
                  isIconOnly
                  size="sm"
                  variant="ghost"
                  className="size-8 rounded-full text-zinc-300 hover:bg-white/10"
                  aria-label="Fullscreen Toggle"
                  onPress={toggleFullscreen}
                >
                  {maximized ? <Minimize2Icon className="size-4" /> : <Maximize2Icon className="size-4" />}
                </Button>
              </div>
            </div>

            {/* Main Stage View (Video Stream or Audio Waveform Avatar) */}
            <div className="relative flex-1 bg-zinc-950 flex items-center justify-center overflow-hidden">
              {call.type === "video" ? (
                /* Video Call Display */
                <div className="relative size-full grid place-items-center bg-black">
                  {/* Remote Video Stream */}
                  <video
                    ref={remoteVideoRef}
                    autoPlay
                    playsInline
                    className={`size-full ${swappedVideo ? "object-cover scale-x-[-1]" : "object-cover"}`}
                  />

                  {/* Remote Camera Disabled / Audio Only Fallback */}
                  {(!remoteStreamRef.current || remoteStreamRef.current.getVideoTracks().length === 0) && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-zinc-950/90 gap-4">
                      <div className="relative flex items-center justify-center">
                        <span className="absolute size-36 rounded-full bg-emerald-500/20 animate-ping" />
                        <span className="absolute size-28 rounded-full bg-emerald-500/30 animate-pulse" />
                        <Avatar className="size-24 ring-4 ring-emerald-500/40 shadow-2xl">
                          <Avatar.Image alt={call.peer.name} src={call.peer.avatar} />
                          <Avatar.Fallback className="text-2xl">{call.peer.initials}</Avatar.Fallback>
                        </Avatar>
                      </div>
                      <p className="text-sm font-medium text-zinc-400">
                        {call.status === "connected" ? "Camera is off" : statusSubtext}
                      </p>
                    </div>
                  )}

                  {/* Local Camera Floating Thumbnail (Picture-in-Picture Box) */}
                  <div
                    onClick={() => setSwappedVideo((prev) => !prev)}
                    className="absolute bottom-24 right-4 sm:bottom-28 sm:right-6 z-20 h-36 w-28 sm:h-44 sm:w-32 cursor-pointer overflow-hidden rounded-2xl border-2 border-white/20 bg-zinc-900 shadow-2xl transition-all duration-300 hover:scale-105 active:scale-95 group"
                    title="Tap to swap screens"
                  >
                    <video
                      ref={localVideoRef}
                      autoPlay
                      muted
                      playsInline
                      className={`size-full object-cover ${isScreenSharing ? "" : "scale-x-[-1]"} ${
                        cameraOff ? "hidden" : "block"
                      }`}
                    />
                    {cameraOff && (
                      <div className="flex size-full flex-col items-center justify-center bg-zinc-800 p-2">
                        <Avatar className="size-12">
                          <Avatar.Image alt={authUser?.fullName} src={authUser?.profilePic} />
                          <Avatar.Fallback>{getInitials(authUser?.fullName || "Me")}</Avatar.Fallback>
                        </Avatar>
                        <span className="mt-1 text-[10px] text-zinc-400">Camera Off</span>
                      </div>
                    )}
                    {muted && (
                      <span className="absolute top-2 right-2 rounded-full bg-red-600/90 p-1 text-white shadow-md">
                        <MicOffIcon className="size-3" />
                      </span>
                    )}
                    <span className="absolute bottom-1 left-1.5 text-[9px] font-medium text-white/80 bg-black/60 px-1.5 py-0.5 rounded-full backdrop-blur-xs">
                      You
                    </span>
                  </div>
                </div>
              ) : (
                /* WhatsApp Voice Call Audio Screen with Animated Pulse Ripples */
                <div className="relative flex flex-col items-center justify-center size-full gap-8 px-4 text-center">
                  <div className="relative flex items-center justify-center my-4">
                    {/* Concentric Animated Pulse Rings */}
                    <div className="absolute size-64 sm:size-72 rounded-full border border-emerald-500/20 animate-ping opacity-40 duration-1000" />
                    <div className="absolute size-52 sm:size-60 rounded-full border border-emerald-500/30 animate-pulse duration-700" />
                    <div className="absolute size-40 sm:size-48 rounded-full bg-gradient-to-tr from-emerald-600/20 to-teal-500/20 blur-xl" />

                    <Avatar className="size-28 sm:size-36 ring-4 ring-emerald-500/40 shadow-2xl">
                      <Avatar.Image alt={call.peer.name} src={call.peer.avatar} />
                      <Avatar.Fallback className="text-3xl font-bold">
                        {call.peer.initials}
                      </Avatar.Fallback>
                    </Avatar>
                  </div>

                  <div className="space-y-2">
                    <h3 className="text-2xl font-bold text-white tracking-tight">{call.peer.name}</h3>
                    <p className="text-sm font-medium text-emerald-400/90">{statusSubtext}</p>
                    <div className="flex items-center justify-center gap-1.5 text-xs text-zinc-400 pt-1">
                      <ShieldCheckIcon className="size-3.5 text-emerald-400" />
                      <span>End-to-end encrypted voice call</span>
                    </div>
                  </div>

                  {/* Equalizer Audio Waves Animation when connected */}
                  {call.status === "connected" && (
                    <div className="flex items-center gap-1.5 h-6">
                      <span className="w-1 bg-emerald-500 rounded-full h-3 animate-bounce" />
                      <span className="w-1 bg-emerald-400 rounded-full h-5 animate-bounce [animation-delay:0.2s]" />
                      <span className="w-1 bg-teal-400 rounded-full h-4 animate-bounce [animation-delay:0.4s]" />
                      <span className="w-1 bg-emerald-500 rounded-full h-6 animate-bounce [animation-delay:0.1s]" />
                      <span className="w-1 bg-emerald-400 rounded-full h-3 animate-bounce [animation-delay:0.3s]" />
                    </div>
                  )}
                </div>
              )}
              <audio ref={remoteAudioRef} autoPlay />
            </div>

            {/* Bottom Floating Control Bar (WhatsApp Mobile/Web Floating Dock) */}
            <div className="shrink-0 pb-[calc(1.25rem+env(safe-area-inset-bottom))] pt-3 px-4 flex justify-center bg-gradient-to-t from-black via-zinc-950/80 to-transparent z-30">
              {call.incoming && call.status === "ringing" ? (
                /* Incoming Call Accept / Reject dock */
                <div className="flex items-center gap-6 bg-zinc-900/90 border border-white/10 px-8 py-3.5 rounded-full shadow-2xl backdrop-blur-2xl">
                  <Button
                    className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-full px-6 py-3 shadow-lg hover:scale-105 active:scale-95 transition-all"
                    onPress={accept}
                  >
                    <PhoneIcon className="size-5 fill-current" />
                    Accept
                  </Button>
                  <Button
                    className="flex items-center gap-2 bg-red-600 hover:bg-red-500 text-white font-semibold rounded-full px-6 py-3 shadow-lg hover:scale-105 active:scale-95 transition-all"
                    onPress={() => end("rejected")}
                  >
                    <PhoneOffIcon className="size-5" />
                    Decline
                  </Button>
                </div>
              ) : (
                /* Connected / Calling Action Bar */
                <div className="flex items-center gap-3 sm:gap-4 bg-zinc-900/90 border border-white/10 px-4 sm:px-6 py-3 rounded-full shadow-2xl backdrop-blur-2xl">
                  {/* Audio Mute */}
                  <Button
                    isIconOnly
                    className={`size-12 sm:size-13 rounded-full transition-all ${
                      muted ? "bg-red-600/90 text-white" : "bg-zinc-800 text-white hover:bg-zinc-700"
                    }`}
                    aria-label="Mute microphone"
                    onPress={toggleMute}
                  >
                    {muted ? <MicOffIcon className="size-5" /> : <MicIcon className="size-5" />}
                  </Button>

                  {/* Video Toggle (If Video Call) */}
                  {call.type === "video" && (
                    <>
                      <Button
                        isIconOnly
                        className={`size-12 sm:size-13 rounded-full transition-all ${
                          cameraOff ? "bg-red-600/90 text-white" : "bg-zinc-800 text-white hover:bg-zinc-700"
                        }`}
                        aria-label="Toggle camera"
                        onPress={toggleCamera}
                      >
                        {cameraOff ? <VideoOffIcon className="size-5" /> : <VideoIcon className="size-5" />}
                      </Button>

                      <Button
                        isIconOnly
                        className="size-12 sm:size-13 rounded-full bg-zinc-800 text-white hover:bg-zinc-700 transition-all hidden sm:flex"
                        aria-label="Flip camera"
                        onPress={switchCamera}
                      >
                        <RefreshCwIcon className="size-5" />
                      </Button>

                      <Button
                        isIconOnly
                        className={`size-12 sm:size-13 rounded-full transition-all hidden sm:flex ${
                          isScreenSharing ? "bg-emerald-600 text-white" : "bg-zinc-800 text-white hover:bg-zinc-700"
                        }`}
                        aria-label="Share screen"
                        onPress={toggleScreenShare}
                      >
                        {isScreenSharing ? <ScreenShareOffIcon className="size-5" /> : <ScreenShareIcon className="size-5" />}
                      </Button>

                      <Button
                        isIconOnly
                        className="size-12 sm:size-13 rounded-full bg-zinc-800 text-white hover:bg-zinc-700 transition-all hidden md:flex"
                        aria-label="Picture in Picture"
                        onPress={togglePiP}
                      >
                        <PictureInPicture2Icon className="size-5" />
                      </Button>
                    </>
                  )}

                  {/* Speaker Toggle */}
                  <Button
                    isIconOnly
                    className={`size-12 sm:size-13 rounded-full transition-all ${
                      speakerOn ? "bg-zinc-800 text-white hover:bg-zinc-700" : "bg-zinc-800/50 text-zinc-400"
                    }`}
                    aria-label="Toggle speaker"
                    onPress={async () => {
                      if (remoteAudioRef.current?.setSinkId) {
                        try {
                          await remoteAudioRef.current.setSinkId(speakerOn ? "communications" : "default");
                        } catch {
                          /* Device fallback */
                        }
                      }
                      setSpeakerOn((val) => !val);
                    }}
                  >
                    {speakerOn ? <Volume2Icon className="size-5" /> : <VolumeXIcon className="size-5" />}
                  </Button>

                  {/* End Call Button */}
                  <Button
                    isIconOnly
                    className="size-12 sm:size-13 rounded-full bg-red-600 hover:bg-red-500 text-white shadow-lg hover:scale-105 active:scale-95 transition-all"
                    aria-label="End call"
                    onPress={() => end()}
                  >
                    <PhoneOffIcon className="size-5" />
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
