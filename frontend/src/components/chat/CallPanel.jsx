import { Avatar, Button } from "@heroui/react";
import { ArrowDownLeftIcon, ArrowUpRightIcon, Maximize2Icon, MicIcon, MicOffIcon, PhoneIcon, PhoneIncomingIcon, PhoneOutgoingIcon, PhoneOffIcon, Trash2Icon, VideoIcon, VideoOffIcon, Volume2Icon, VolumeXIcon, XIcon, MinusIcon, RefreshCwIcon } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { AppLogo } from "../AppLogo";
import { getInitials } from "../../hooks/useSelectedConversation";
import { useAuthStore } from "../../store/useAuthStore";
import { useChatStore } from "../../store/useChatStore";

const STUN = "stun:stun.l.google.com:19302";
const constraints = (type, facingMode = "user") => ({
  audio: {
    echoCancellation: { ideal: true }, noiseSuppression: { ideal: true }, autoGainControl: { ideal: true },
    sampleRate: { ideal: 48000 }, channelCount: { ideal: 1 }, latency: { ideal: 0.02 },
  },
  video: type === "video" ? {
    facingMode: { ideal: facingMode }, width: { ideal: 1920, max: 1920 }, height: { ideal: 1080, max: 1080 },
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
  } catch { /* Browsers/network stacks that do not expose sender tuning use their defaults. */ }
}
const debug = (...args) => { if (import.meta.env.DEV) console.debug("[WEBRTC]", ...args); };

import { addCallHistory, callStatusLabel, dateLabel, formatCallDuration, groupCallHistory, mergeCallHistory, normalizeCallRecord, readCallHistory, timeLabel } from "../../lib/callHistory";
import { axiosInstance } from "../../lib/axios";
export function CallHistory() {
  const users = useChatStore((state) => state.users);
  const searchQuery = useChatStore((state) => state.searchQuery);
  const authUser = useAuthStore((state) => state.authUser);
  const [history, setHistory] = useState(() => readCallHistory());
  const [expandedKey, setExpandedKey] = useState(null);
  useEffect(() => { const refresh = () => setHistory((current) => mergeCallHistory(current, readCallHistory())); window.addEventListener("lark:call-history", refresh); return () => window.removeEventListener("lark:call-history", refresh); }, []);
  useEffect(() => { axiosInstance.get("/auth/calls").then((response) => setHistory((current) => mergeCallHistory(current, response.data.map((record) => normalizeCallRecord(record, authUser?._id))))).catch(() => {}); }, [authUser?._id]);
  const groups = useMemo(() => {
    const grouped = groupCallHistory(history);
    const query = searchQuery.trim().toLowerCase();
    if (!query) return grouped;
    const matchingUserIds = new Set(users
      .filter((user) => user.username?.toLowerCase().includes(query))
      .map((user) => String(user._id)));
    return grouped.filter((group) => matchingUserIds.has(String(group.peerId)));
  }, [history, searchQuery, users]);
  const matchingUsers = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return [];
    return users.filter((user) => user.username?.toLowerCase().includes(query));
  }, [searchQuery, users]);
  return <div className="mx-auto w-full max-w-2xl space-y-1 p-2 sm:p-3">
    {matchingUsers.length > 0 ? <div className="mb-2 border-b border-border pb-2"><p className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-muted">People</p>{matchingUsers.map((user) => <CallUserSearchRow key={user._id} user={user} />)}</div> : null}
    {groups.length === 0 ? <p className="px-3 py-8 text-center text-sm text-muted">{searchQuery.trim() ? (matchingUsers.length > 0 ? "No call history for these users." : "No users match your search.") : "No calls yet"}</p> : groups.map((group) => {
    const latest = group.latest;
    const user = users.find((item) => String(item._id) === String(group.peerId));
    const expanded = expandedKey === group.key;
    return <div key={group.key} className="overflow-hidden border-b border-border/70 last:border-b-0">
      <button type="button" className="flex w-full items-center gap-3 px-2 py-3 text-left transition-colors hover:bg-surface/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary sm:px-3" onClick={() => setExpandedKey(expanded ? null : group.key)} aria-expanded={expanded}>
        <Avatar className="size-11 shrink-0"><Avatar.Image alt={latest.peerName} src={user?.profilePic || latest.peerAvatar} /><Avatar.Fallback>{getInitials(latest.peerName)}</Avatar.Fallback></Avatar>
        <span className="min-w-0 flex-1"><span className="block truncate text-[15px] font-semibold text-foreground">{latest.peerName}{group.entries.length > 1 ? ` (${group.entries.length})` : ""}</span><span className={`mt-0.5 flex items-center gap-1.5 truncate text-xs ${isUnsuccessful(latest) ? "text-danger" : "text-muted"}`}><CallDirectionIcon entry={latest} />{dateTimeLabel(latest.createdAt)}</span></span>
        <CallActionButton entry={latest} />
      </button>
      {expanded ? <div className="space-y-3 border-t border-border/50 bg-surface/30 px-14 py-3 sm:px-16">{group.entries.map((entry) => <CallHistoryDetail key={entry.id} entry={entry} />)}</div> : null}
    </div>;
  })}</div>;
}

function CallActionButton({ entry }) {
  const Icon = entry.type === "video" ? VideoIcon : PhoneIcon;
  const startCall = (event) => {
    event.stopPropagation();
    window.dispatchEvent(new CustomEvent("lark:start-call", {
      detail: { type: entry.type, user: { _id: entry.peerId, fullName: entry.peerName, profilePic: entry.peerAvatar } },
    }));
  };
  return <span role="button" tabIndex={0} aria-label={`${entry.type === "video" ? "Video" : "Audio"} call ${entry.peerName}`} title={`${entry.type === "video" ? "Video" : "Audio"} call`} onClick={startCall} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") startCall(event); }} className="grid size-9 shrink-0 place-items-center rounded-full text-success transition-colors hover:bg-success/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"><Icon className="size-5" /></span>;
}

function CallUserSearchRow({ user }) {
  const startCall = (type) => window.dispatchEvent(new CustomEvent("lark:start-call", {
    detail: { type, user: { _id: user._id, fullName: user.fullName, profilePic: user.profilePic, isOnline: user.isOnline } },
  }));
  return <div className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-surface/60">
    <Avatar className="size-10 shrink-0"><Avatar.Image alt={user.fullName} src={user.profilePic} /><Avatar.Fallback>{getInitials(user.fullName)}</Avatar.Fallback></Avatar>
    <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{user.fullName}</p><p className="truncate text-xs text-muted">@{user.username}</p></div>
    <div className="flex shrink-0 gap-1"><Button isIconOnly size="sm" variant="ghost" aria-label={`Audio call ${user.fullName}`} onPress={() => startCall("audio")}><PhoneIcon className="size-4" /></Button><Button isIconOnly size="sm" variant="ghost" aria-label={`Video call ${user.fullName}`} onPress={() => startCall("video")}><VideoIcon className="size-4" /></Button></div>
  </div>;
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

  return <span className={`relative grid size-7 shrink-0 place-items-center rounded-full bg-current/10 ${className}`} aria-hidden="true">
    <TypeIcon className="size-4" strokeWidth={2.25} />
    <span className="absolute -bottom-0.5 -right-0.5 grid size-3.5 place-items-center rounded-full bg-background text-foreground ring-1 ring-border">
      <DirectionIcon className="size-2.5" strokeWidth={3} />
    </span>
  </span>;
}

function callDescription(entry) {
  return entry.type === "video" ? "Video call" : "Voice call";
}

function dateTimeLabel(value) {
  const label = dateLabel(value);
  const date = new Date(value);
  const displayDate = label === "Today" || label === "Yesterday"
    ? label
    : date.toLocaleDateString(undefined, { month: "long", day: "numeric" });
  return `${displayDate}, ${timeLabel(value).replace(/\s+/g, " ").toLowerCase()}`;
}

export function CallMessage({ entry, isSelectionMode, isSelected, onToggleSelected, onStartSelection }) {
  return <CallHistoryDetail entry={entry} inChat isSelectionMode={isSelectionMode} isSelected={isSelected} onToggleSelected={onToggleSelected} onStartSelection={onStartSelection} />;
}

function CallHistoryDetail({ entry, inChat = false, isSelectionMode = false, isSelected = false, onToggleSelected, onStartSelection }) {
  const status = callStatusLabel(entry.status);
  const unsuccessful = isUnsuccessful(entry);
  const [localSelected, setLocalSelected] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState({ x: 0, y: 0 });
  const holdTimer = useRef(null);
  const remove = async () => {
    try {
      if (entry.id && !String(entry.id).startsWith("local-")) {
        try { await axiosInstance.delete(`/auth/calls/${entry.id}`); } catch { /* Cached records may not exist on the server. */ }
      }
      const history = readCallHistory().filter((item) => item.id !== entry.id);
      localStorage.setItem("lark-call-history", JSON.stringify(history));
      window.dispatchEvent(new Event("lark:call-history"));
    } catch {
      return;
    }
  };
  const selected = inChat ? isSelected : localSelected;
  const selectFromHold = () => { if (inChat) onStartSelection?.(entry.id); else setLocalSelected(true); setMenuOpen(false); };
  const startHold = () => { holdTimer.current = window.setTimeout(selectFromHold, 500); };
  const clearHold = () => { if (holdTimer.current) window.clearTimeout(holdTimer.current); };
  const showMenu = (event) => { event.preventDefault(); if (inChat && isSelectionMode) { onToggleSelected?.(entry.id); return; } setMenuPosition({ x: Math.min(event.clientX, window.innerWidth - 220), y: Math.min(event.clientY, window.innerHeight - 140) }); setMenuOpen(true); };
  const handleClick = () => { if (inChat && isSelectionMode) onToggleSelected?.(entry.id); };
  const outgoing = inChat && entry.direction === "outgoing";
  const iconTone = unsuccessful ? "text-danger" : outgoing ? "text-accent-foreground" : "text-foreground";
  const detailTone = unsuccessful ? "text-danger" : outgoing ? "text-accent-foreground/85" : "text-muted";
  const hasDuration = status === "Completed" && entry.duration;
  const metadataLabel = hasDuration ? "Duration" : status;
  const metadataValue = hasDuration ? formatCallDuration(entry.duration) : null;

  return <div className={`relative flex w-full py-0.5 ${inChat ? (entry.direction === "outgoing" ? "justify-end" : "justify-start") : "justify-center"} ${selected ? "rounded-xl bg-accent/10" : ""}`} onClick={handleClick} onPointerDown={startHold} onPointerUp={clearHold} onPointerLeave={clearHold} onContextMenu={showMenu}><div className={`flex w-fit max-w-[min(90%,28rem)] items-start gap-2.5 rounded-2xl px-3 py-2.5 text-xs shadow-sm sm:max-w-[min(75%,28rem)] ${outgoing ? "rounded-br-md bg-accent text-accent-foreground" : "rounded-bl-md bg-surface"}`}><CombinedCallIcon entry={entry} className={iconTone} /><span className="min-w-0"><span className={`block break-words text-[13px] font-semibold leading-5 ${outgoing ? "text-accent-foreground" : "text-foreground"}`}>{callDescription(entry)}</span><span className={`mt-1 flex min-w-[9.5rem] items-baseline justify-between gap-4 tabular-nums ${detailTone}`}><span className="min-w-0"><span className="font-medium">{metadataLabel}</span>{metadataValue ? <span className="ml-1.5 font-semibold">{metadataValue}</span> : null}</span><time className="shrink-0 text-[11px]" dateTime={entry.createdAt}>{timeLabel(entry.createdAt)}</time></span></span>{selected && !inChat ? <button type="button" aria-label="Delete selected call" title="Delete call" onClick={remove} className="text-danger hover:text-danger/80"><Trash2Icon className="size-3.5" /></button> : null}</div>{menuOpen ? <CallLogContextMenu position={menuPosition} onClose={() => setMenuOpen(false)} onSelect={selectFromHold} onDelete={remove} /> : null}</div>;
}

function CallLogContextMenu({ position, onClose, onSelect, onDelete }) {
  return <><button type="button" aria-label="Close call menu" className="fixed inset-0 z-40 cursor-default" onClick={onClose} /><div className="fixed z-50 w-44 rounded-xl border border-border bg-background p-1.5 shadow-2xl" style={{ top: position.y, left: position.x }}><button type="button" className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-surface" onClick={onSelect}>Select</button><button type="button" className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-danger hover:bg-danger/10" onClick={onDelete}><Trash2Icon className="size-4" />Delete</button></div></>;
}

export function ConversationCallHistory({ peerId }) {
  const authUser = useAuthStore((state) => state.authUser);
  const [history, setHistory] = useState(() => readCallHistory());
  useEffect(() => { const refresh = () => setHistory(readCallHistory()); window.addEventListener("lark:call-history", refresh); return () => window.removeEventListener("lark:call-history", refresh); }, []);
  useEffect(() => { axiosInstance.get("/auth/calls").then((response) => setHistory(response.data.map((record) => normalizeCallRecord(record, authUser?._id)))).catch(() => {}); }, [authUser?._id]);
  return <>{history.filter((entry) => String(entry.peerId) === String(peerId)).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).map((entry) => <CallHistoryDetail key={entry.id} entry={entry} inChat />)}</>;
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
  const [statusText, setStatusText] = useState("");
  const [seconds, setSeconds] = useState(0);
  const secondsRef = useRef(0);
  const callRef = useRef(null);
  const peerRef = useRef(null);
  const localStreamRef = useRef(null);
  const remoteStreamRef = useRef(null);
  const candidateQueueRef = useRef([]);
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const remoteAudioRef = useRef(null);
  const ringAudioRef = useRef(null);
  const callWindowRef = useRef(null);

  useEffect(() => {
    if (!callWindowRef.current || !call) return undefined;
    const mediaQuery = window.matchMedia("(min-width: 640px)");
    const applyWindowSize = () => {
      callWindowRef.current.style.height = mediaQuery.matches && !maximized ? "auto" : "100dvh";
      callWindowRef.current.style.maxHeight = mediaQuery.matches && !maximized ? "calc(100dvh - 2rem)" : "100dvh";
    };
    applyWindowSize();
    mediaQuery.addEventListener("change", applyWindowSize);
    return () => mediaQuery.removeEventListener("change", applyWindowSize);
  }, [call, maximized]);

  const setCurrentCall = (value) => { callRef.current = value; setCall(value); };
  const showMediaError = (error) => setStatusText(error.name === "NotAllowedError" ? "Camera or microphone permission was denied." : error.name === "NotFoundError" ? "No camera or microphone was found." : "Camera or microphone is unavailable.");
  const attachRemote = (stream) => {
    remoteStreamRef.current = stream;
    if (remoteVideoRef.current) { remoteVideoRef.current.srcObject = stream; remoteVideoRef.current.play().catch(() => setStatusText("Click the call window to enable audio.")); }
    if (remoteAudioRef.current) { remoteAudioRef.current.srcObject = stream; remoteAudioRef.current.play().catch(() => setStatusText("Click the call window to enable audio.")); }
    debug("remote stream assigned", stream.getTracks().map((track) => track.kind));
  };
  const flushCandidates = async (connection) => { for (const candidate of candidateQueueRef.current.splice(0)) await connection.addIceCandidate(candidate); };
  const createPeer = (peer) => {
    const connection = new RTCPeerConnection({ iceServers: [{ urls: STUN }], iceCandidatePoolSize: 4, bundlePolicy: "max-bundle" });
    peerRef.current = connection;
    connection.onicecandidate = ({ candidate }) => { if (candidate) socket?.emit("call:signal", { receiverId: peer.id, callId: callRef.current?.id, signal: { candidate } }); };
    connection.ontrack = ({ streams, track }) => { const stream = streams[0] || remoteStreamRef.current || new MediaStream(); if (!streams[0] && !stream.getTracks().includes(track)) stream.addTrack(track); attachRemote(stream); debug("remote track", track.kind); };
    connection.onconnectionstatechange = () => { debug("connection state", connection.connectionState); if (connection.connectionState === "connected") setCurrentCall({ ...callRef.current, status: "connected" }); if (connection.connectionState === "disconnected") setCurrentCall({ ...callRef.current, status: "reconnecting" }); if (connection.connectionState === "failed") setStatusText("Connection lost. Please try the call again."); };
    connection.oniceconnectionstatechange = () => debug("ICE state", connection.iceConnectionState);
    localStreamRef.current?.getTracks().forEach((track) => tuneSender(connection.addTrack(track, localStreamRef.current)));
    return connection;
  };
  const finish = (status = "completed") => {
    const current = callRef.current; if (!current) return;
    addCallHistory({ callId: current.id, peerId: current.peer.id, peerName: current.peer.name, peerAvatar: current.peer.avatar, type: current.type, direction: current.incoming ? "incoming" : "outgoing", status, duration: secondsRef.current });
    localStreamRef.current?.getTracks().forEach((track) => track.stop()); peerRef.current?.close();
    if (ringAudioRef.current) { ringAudioRef.current.pause(); ringAudioRef.current.currentTime = 0; }
    candidateQueueRef.current = []; localStreamRef.current = null; remoteStreamRef.current = null; peerRef.current = null; setCurrentCall(null); setMinimized(false); setMaximized(false); secondsRef.current = 0; setSeconds(0); setMuted(false); setCameraOff(false);
  };
  const startCall = async (user, type) => {
    if (callRef.current || !socket) return;
    const peer = { id: user._id, name: user.fullName, avatar: user.profilePic, initials: getInitials(user.fullName) }; const callId = crypto.randomUUID();
    try { localStreamRef.current = await navigator.mediaDevices.getUserMedia(constraints(type)); setCurrentCall({ id: callId, peer, type, status: "calling", outgoing: true }); createPeer(peer); socket.emit("call:initiate", { receiverId: peer.id, callId, callType: type, caller: { name: authUser.fullName, avatar: authUser.profilePic } }); debug("initiating", callId); } catch (error) { showMediaError(error); finish("failed"); }
  };
  useEffect(() => { const listener = (event) => startCall(event.detail.user, event.detail.type); window.addEventListener("lark:start-call", listener); return () => window.removeEventListener("lark:start-call", listener); });
  useEffect(() => {
    if (!socket) return undefined;
    const invite = ({ callerId, callType, caller, callId }) => { if (callRef.current) return socket.emit("call:reject", { receiverId: callerId, callId }); const user = users.find((item) => String(item._id) === String(callerId)); setCurrentCall({ id: callId, peer: { id: callerId, name: caller?.name || user?.fullName || "Lark user", avatar: caller?.avatar || user?.profilePic, initials: getInitials(caller?.name || user?.fullName) }, type: callType, status: "ringing", incoming: true }); socket.emit("call:ringing", { receiverId: callerId, callId }); };
    const ringing = ({ userId, callId }) => { if (callRef.current?.id === callId && String(callRef.current.peer.id) === String(userId)) setCurrentCall({ ...callRef.current, status: "ringing" }); };
    const accepted = async ({ userId, callId }) => { if (callRef.current?.id !== callId || String(callRef.current.peer.id) !== String(userId)) return; setCurrentCall({ ...callRef.current, status: "connecting" }); const connection = peerRef.current || createPeer(callRef.current.peer); const offer = await connection.createOffer(); await connection.setLocalDescription(offer); socket.emit("call:signal", { receiverId: userId, callId, signal: { description: connection.localDescription } }); };
    const signal = async ({ userId, callId, signal: payload }) => { if (callRef.current?.id !== callId) return; const connection = peerRef.current || createPeer(callRef.current.peer); try { if (payload.candidate) { if (connection.remoteDescription) await connection.addIceCandidate(payload.candidate); else candidateQueueRef.current.push(payload.candidate); return; } if (!payload.description) return; await connection.setRemoteDescription(payload.description); await flushCandidates(connection); if (payload.description.type === "offer") { const answer = await connection.createAnswer(); await connection.setLocalDescription(answer); socket.emit("call:signal", { receiverId: userId, callId, signal: { description: connection.localDescription } }); setCurrentCall({ ...callRef.current, status: "connecting", incoming: false }); } } catch (error) { debug("signaling error", error); setStatusText("The call connection could not be established."); } };
    const rejected = ({ callId }) => { if (callRef.current?.id === callId) finish("rejected"); }; const ended = ({ callId }) => { if (callRef.current?.id === callId) finish("completed"); };
    const failed = ({ callId, message }) => { if (callRef.current?.id === callId) { setStatusText(message || "This call is no longer available."); finish("failed"); } };
    socket.on("call:ring", invite); socket.on("call:ringing", ringing); socket.on("call:accept", accepted); socket.on("call:reject", rejected); socket.on("call:end", ended); socket.on("call:signal", signal); socket.on("call:failed", failed);
    return () => { socket.off("call:ring", invite); socket.off("call:ringing", ringing); socket.off("call:accept", accepted); socket.off("call:reject", rejected); socket.off("call:end", ended); socket.off("call:signal", signal); socket.off("call:failed", failed); };
  // Handlers intentionally use ref-backed call state and stable media helpers.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket, users]);
  useEffect(() => { if (call?.status !== "connected") return undefined; const timer = window.setInterval(() => setSeconds((value) => { const next = value + 1; secondsRef.current = next; return next; }), 1000); return () => window.clearInterval(timer); }, [call?.status]);
  useEffect(() => { if (call?.status !== "calling" && call?.status !== "ringing") return undefined; const audio = ringAudioRef.current; audio?.play().catch(() => {}); return () => { if (audio) { audio.pause(); audio.currentTime = 0; } }; }, [call?.status]);
  useEffect(() => { if (localVideoRef.current && localStreamRef.current) localVideoRef.current.srcObject = localStreamRef.current; }, [call]);
  const accept = async () => { try { localStreamRef.current = await navigator.mediaDevices.getUserMedia(constraints(call.type)); createPeer(call.peer); socket.emit("call:accept", { receiverId: call.peer.id, callId: call.id }); setCurrentCall({ ...callRef.current, status: "connecting", incoming: false }); } catch (error) { showMediaError(error); } };
  useEffect(() => {
    const handleNotificationAction = async ({ detail }) => {
      const { action, call: pendingCall } = detail || {};
      window.__larkPendingCallAction = null;
      if (!pendingCall || callRef.current || !socket) return;
      const peer = { id: pendingCall.caller._id, name: pendingCall.caller.fullName, avatar: pendingCall.caller.profilePic, initials: getInitials(pendingCall.caller.fullName) };
      if (action === "decline") { socket.emit("call:reject", { receiverId: peer.id, callId: pendingCall.callId }); return; }
      if (action !== "accept") return;
      try {
        localStreamRef.current = await navigator.mediaDevices.getUserMedia(constraints(pendingCall.callType));
        setCurrentCall({ id: pendingCall.callId, peer, type: pendingCall.callType, status: "connecting", incoming: false });
        createPeer(peer);
        socket.emit("call:accept", { receiverId: peer.id, callId: pendingCall.callId });
      } catch (error) { showMediaError(error); }
    };
    window.addEventListener("lark:notification-call-action", handleNotificationAction);
    if (window.__larkPendingCallAction) {
      const pendingAction = window.__larkPendingCallAction;
      window.__larkPendingCallAction = null;
      handleNotificationAction({ detail: pendingAction });
    }
    return () => window.removeEventListener("lark:notification-call-action", handleNotificationAction);
  // Call actions deliberately use ref-backed state and existing signaling helpers.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket]);
  const end = (status = "completed") => { if (callRef.current) socket?.emit("call:end", { receiverId: callRef.current.peer.id, callId: callRef.current.id }); finish(status); };
  const toggleMute = () => { const next = !muted; localStreamRef.current?.getAudioTracks().forEach((track) => { track.enabled = !next; }); setMuted(next); };
  const toggleCamera = () => { const next = !cameraOff; localStreamRef.current?.getVideoTracks().forEach((track) => { track.enabled = !next; }); setCameraOff(next); };
  const switchCamera = async () => {
    if (call?.type !== "video") return;
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
      const nextStream = new MediaStream([...(localStreamRef.current?.getAudioTracks() || []), newTrack]);
      oldTrack?.stop();
      localStreamRef.current = nextStream;
      setFacingMode(nextFacingMode);
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = nextStream;
        await localVideoRef.current.play().catch(() => {});
      }
    } catch {
      stream?.getTracks().forEach((track) => track.stop());
      setStatusText("The other camera is not available on this device.");
    }
  };
  const toggleFullscreen = () => { if (minimized) setMinimized(false); setMaximized((value) => !value); };
    const view = call ? <div className={`fixed z-50 ${minimized ? "bottom-4 right-4 w-[min(22rem,calc(100vw-2rem))]" : maximized ? "inset-0 grid place-items-center bg-black p-0" : "inset-0 bg-black sm:grid sm:place-items-center sm:bg-black/70 sm:p-4"}`}><div ref={callWindowRef} className={`flex w-full flex-col overflow-hidden border-border bg-zinc-950 text-white shadow-2xl ${minimized ? "max-w-sm rounded-2xl border" : maximized ? "h-dvh rounded-none" : "h-dvh rounded-none sm:max-h-[calc(100dvh-2rem)] sm:max-w-4xl sm:rounded-2xl sm:border"}`}><div className="flex shrink-0 items-center justify-between border-b border-white/10 px-3 py-3 sm:px-4"><div className="flex min-w-0 items-center gap-2"><AppLogo size={30} className="rounded-lg" alt="Lark" /><div className="min-w-0"><p className="truncate text-sm font-semibold">{call.peer.name}</p><p className="text-xs text-zinc-400">{call.status === "calling" ? "Calling..." : call.status === "ringing" ? "Ringing..." : call.status === "reconnecting" ? "Reconnecting..." : call.status === "connecting" ? "Connecting..." : `${call.type === "video" ? "Video" : "Voice"} call Â· ${formatCallDuration(seconds)}`}</p></div></div><div className="flex gap-1"><Button isIconOnly variant="ghost" aria-label="Minimize or restore call" onPress={() => { setMinimized((value) => !value); setMaximized(false); }}><MinusIcon className="size-4 text-white" /></Button><Button isIconOnly variant="ghost" aria-label="End call" onPress={() => end("cancelled")}><XIcon className="size-4 text-white" /></Button></div></div>{!minimized ? <><div className={`relative min-h-0 flex-1 bg-black sm:flex-none ${maximized ? "sm:h-[calc(100dvh-8rem)]" : "sm:aspect-video"}`}>{call.type === "video" ? <video ref={remoteVideoRef} autoPlay playsInline className="size-full object-contain" /> : <div className="grid size-full place-items-center"><Avatar className="size-24"><Avatar.Image alt={call.peer.name} src={call.peer.avatar} /><Avatar.Fallback className="text-2xl">{call.peer.initials}</Avatar.Fallback></Avatar></div>}<video ref={localVideoRef} autoPlay muted playsInline className={`absolute bottom-3 right-3 h-24 w-32 rounded-lg bg-zinc-800 object-cover sm:bottom-4 sm:right-4 ${call.type === "video" ? "" : "hidden"}`} /><audio ref={remoteAudioRef} autoPlay /></div><div className="flex shrink-0 flex-wrap items-center justify-center gap-2 px-3 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] sm:gap-3 sm:px-4 sm:py-4">{call.incoming && call.status === "ringing" ? <><Button className="bg-emerald-600 text-white" onPress={accept}><PhoneIcon /> Accept</Button><Button variant="danger" onPress={() => end("missed")}><PhoneOffIcon /> Reject</Button></> : <><Button isIconOnly className="size-11 rounded-full bg-zinc-700 text-white" aria-label="Mute microphone" onPress={toggleMute}>{muted ? <MicOffIcon /> : <MicIcon />}</Button>{call.type === "video" ? <><Button isIconOnly className="size-11 rounded-full bg-zinc-700 text-white" aria-label="Toggle camera" onPress={toggleCamera}>{cameraOff ? <VideoOffIcon /> : <VideoIcon />}</Button><Button isIconOnly className="size-11 rounded-full bg-zinc-700 text-white" aria-label="Switch camera" onPress={switchCamera}><RefreshCwIcon /></Button></> : null}<Button isIconOnly className="size-11 rounded-full bg-zinc-700 text-white" aria-label="Toggle speaker" onPress={async () => { if (remoteAudioRef.current?.setSinkId) await remoteAudioRef.current.setSinkId(speakerOn ? "communications" : "default"); setSpeakerOn((value) => !value); }}>{speakerOn ? <Volume2Icon /> : <VolumeXIcon />}</Button><Button isIconOnly className="size-11 rounded-full bg-zinc-700 text-white" aria-label={maximized ? "Restore call" : "Maximize call"} onPress={toggleFullscreen}><Maximize2Icon /></Button><Button isIconOnly variant="danger" className="size-11 rounded-full" aria-label="End call" onPress={() => end()}><PhoneOffIcon /></Button></>}</div></> : <div className="flex items-center justify-between px-4 py-2 text-xs text-zinc-400"><span>{call.type === "video" ? "Video" : "Voice"} call</span><span>{formatCallDuration(seconds)}</span></div>}</div></div> : null;
  return <>{statusText ? <div className="fixed bottom-5 left-1/2 z-[60] flex max-w-[calc(100vw-2rem)] -translate-x-1/2 items-center gap-3 rounded-lg bg-danger px-4 py-3 text-sm text-danger-foreground shadow-lg">{statusText}<button type="button" aria-label="Dismiss call message" onClick={() => setStatusText("")}><XIcon className="size-4" /></button></div> : null}<audio ref={ringAudioRef} src="/ring.mp3" loop preload="auto" aria-hidden="true" />{view}</>;
}
