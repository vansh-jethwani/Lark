import { Avatar, Button } from "@heroui/react";
import { Maximize2Icon, MicIcon, MicOffIcon, PhoneIcon, PhoneOffIcon, VideoIcon, VideoOffIcon, Volume2Icon, VolumeXIcon, XIcon, MinusIcon, RefreshCwIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { AppLogo } from "../AppLogo";
import { getInitials } from "../../hooks/useSelectedConversation";
import { useAuthStore } from "../../store/useAuthStore";
import { useChatStore } from "../../store/useChatStore";

const STUN = "stun:stun.l.google.com:19302";
const constraints = (type, facingMode = "user") => ({
  audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
  video: type === "video" ? { facingMode, width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } } : false,
});
const debug = (...args) => { if (import.meta.env.DEV) console.debug("[WEBRTC]", ...args); };

import { addCallHistory, dateLabel, formatCallDuration, localDateKey, normalizeCallRecord, readCallHistory, timeLabel } from "../../lib/callHistory";
import { axiosInstance } from "../../lib/axios";
export function CallHistory() {
  const users = useChatStore((state) => state.users);
  const authUser = useAuthStore((state) => state.authUser);
  const [history, setHistory] = useState(() => readCallHistory());
  useEffect(() => { const refresh = () => setHistory(readCallHistory()); window.addEventListener("lark:call-history", refresh); return () => window.removeEventListener("lark:call-history", refresh); }, []);
  useEffect(() => { axiosInstance.get("/auth/calls").then((response) => setHistory(response.data.map((record) => normalizeCallRecord(record, authUser?._id)))).catch(() => {}); }, [authUser?._id]);
  const groups = history.reduce((map, entry) => { const key = `${entry.peerId}:${localDateKey(entry.createdAt)}`; map.set(key, [...(map.get(key) || []), entry]); return map; }, new Map());
  return <div className="space-y-3 p-2">{groups.size === 0 ? <p className="px-3 py-8 text-center text-sm text-muted">No call history yet.</p> : [...groups.values()].map((entries) => { const sorted = entries.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)); const first = sorted[sorted.length - 1]; const user = users.find((item) => String(item._id) === String(first.peerId)); return <div key={`${first.peerId}:${localDateKey(first.createdAt)}`} className="rounded-xl border border-border bg-surface/40 p-3"><div className="flex items-center gap-3"><Avatar className="size-10"><Avatar.Image alt={first.peerName} src={user?.profilePic || first.peerAvatar} /><Avatar.Fallback>{getInitials(first.peerName)}</Avatar.Fallback></Avatar><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{first.peerName}</p><p className="text-xs text-muted">{entries.length === 1 ? "Call" : `Calls (${entries.length})`} · {dateLabel(first.createdAt)}</p></div></div><div className="mt-2 space-y-1">{sorted.map((entry) => <div key={entry.id} className="flex items-center gap-2 text-xs text-muted"><span>{entry.direction === "incoming" ? "↙ Incoming" : "↗ Outgoing"} {entry.type === "video" ? "video" : "audio"}</span><span className="flex-1">· {entry.status === "missed" ? "Missed" : entry.status === "rejected" ? "Rejected" : entry.status === "cancelled" ? "Cancelled" : entry.status === "failed" ? "Failed" : entry.status === "accepted" ? "Accepted" : "Completed"}{entry.duration ? ` · ${formatCallDuration(entry.duration)}` : ""}</span><span>{timeLabel(entry.createdAt)}</span></div>)}</div></div>; })}</div>;
}

export function ConversationCallHistory({ peerId }) {
  const authUser = useAuthStore((state) => state.authUser);
  const [history, setHistory] = useState(() => readCallHistory());
  useEffect(() => { const refresh = () => setHistory(readCallHistory()); window.addEventListener("lark:call-history", refresh); return () => window.removeEventListener("lark:call-history", refresh); }, []);
  useEffect(() => { axiosInstance.get("/auth/calls").then((response) => setHistory(response.data.map((record) => normalizeCallRecord(record, authUser?._id)))).catch(() => {}); }, [authUser?._id]);
  return <>{history.filter((entry) => String(entry.peerId) === String(peerId)).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).map((entry) => <div key={entry.id} className="my-2 flex justify-center"><div className="rounded-full border border-border bg-surface px-3 py-1.5 text-xs text-muted">{entry.direction === "incoming" ? "↙ Incoming" : "↗ Outgoing"} {entry.type === "video" ? "video" : "audio"} call · {entry.status === "missed" ? "Missed" : entry.status === "rejected" ? "Rejected" : entry.status === "cancelled" ? "Cancelled" : entry.status === "completed" ? formatCallDuration(entry.duration) : entry.status} · {timeLabel(entry.createdAt)}</div></div>)}</>;
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
    const connection = new RTCPeerConnection({ iceServers: [{ urls: STUN }] });
    peerRef.current = connection;
    connection.onicecandidate = ({ candidate }) => { if (candidate) socket?.emit("call:signal", { receiverId: peer.id, callId: callRef.current?.id, signal: { candidate } }); };
    connection.ontrack = ({ streams, track }) => { const stream = streams[0] || remoteStreamRef.current || new MediaStream(); if (!streams[0] && !stream.getTracks().includes(track)) stream.addTrack(track); attachRemote(stream); debug("remote track", track.kind); };
    connection.onconnectionstatechange = () => { debug("connection state", connection.connectionState); if (connection.connectionState === "connected") setCurrentCall({ ...callRef.current, status: "connected" }); if (connection.connectionState === "disconnected") setCurrentCall({ ...callRef.current, status: "reconnecting" }); if (connection.connectionState === "failed") setStatusText("Connection lost. Please try the call again."); };
    connection.oniceconnectionstatechange = () => debug("ICE state", connection.iceConnectionState);
    localStreamRef.current?.getTracks().forEach((track) => connection.addTrack(track, localStreamRef.current));
    return connection;
  };
  const finish = (status = "completed") => {
    const current = callRef.current; if (!current) return;
    addCallHistory({ peerId: current.peer.id, peerName: current.peer.name, peerAvatar: current.peer.avatar, type: current.type, direction: current.incoming ? "incoming" : "outgoing", status, duration: seconds });
    localStreamRef.current?.getTracks().forEach((track) => track.stop()); peerRef.current?.close();
    if (ringAudioRef.current) { ringAudioRef.current.pause(); ringAudioRef.current.currentTime = 0; }
    candidateQueueRef.current = []; localStreamRef.current = null; remoteStreamRef.current = null; peerRef.current = null; setCurrentCall(null); setMinimized(false); setMaximized(false); setSeconds(0); setMuted(false); setCameraOff(false);
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
    socket.on("call:ring", invite); socket.on("call:ringing", ringing); socket.on("call:accept", accepted); socket.on("call:reject", rejected); socket.on("call:end", ended); socket.on("call:signal", signal);
    return () => { socket.off("call:ring", invite); socket.off("call:ringing", ringing); socket.off("call:accept", accepted); socket.off("call:reject", rejected); socket.off("call:end", ended); socket.off("call:signal", signal); };
  // Handlers intentionally use ref-backed call state and stable media helpers.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket, users]);
  useEffect(() => { if (call?.status !== "connected") return undefined; const timer = window.setInterval(() => setSeconds((value) => value + 1), 1000); return () => window.clearInterval(timer); }, [call?.status]);
  useEffect(() => { if (call?.status !== "calling" && call?.status !== "ringing") return undefined; const audio = ringAudioRef.current; audio?.play().catch(() => {}); return () => { if (audio) { audio.pause(); audio.currentTime = 0; } }; }, [call?.status]);
  useEffect(() => { if (localVideoRef.current && localStreamRef.current) localVideoRef.current.srcObject = localStreamRef.current; }, [call]);
  const accept = async () => { try { localStreamRef.current = await navigator.mediaDevices.getUserMedia(constraints(call.type)); createPeer(call.peer); socket.emit("call:accept", { receiverId: call.peer.id, callId: call.id }); setCurrentCall({ ...callRef.current, status: "connecting", incoming: false }); } catch (error) { showMediaError(error); } };
  const end = (status = "completed") => { if (callRef.current) socket?.emit("call:end", { receiverId: callRef.current.peer.id, callId: callRef.current.id }); finish(status); };
  const toggleMute = () => { const next = !muted; localStreamRef.current?.getAudioTracks().forEach((track) => { track.enabled = !next; }); setMuted(next); };
  const toggleCamera = () => { const next = !cameraOff; localStreamRef.current?.getVideoTracks().forEach((track) => { track.enabled = !next; }); setCameraOff(next); };
  const switchCamera = async () => { if (call?.type !== "video") return; const nextFacingMode = facingMode === "user" ? "environment" : "user"; let stream; try { stream = await navigator.mediaDevices.getUserMedia(constraints("video", nextFacingMode)); const newTrack = stream.getVideoTracks()[0]; const sender = peerRef.current?.getSenders().find((item) => item.track?.kind === "video"); if (!sender) throw new Error("No video sender"); await sender.replaceTrack(newTrack); localStreamRef.current?.getVideoTracks().forEach((track) => track.stop()); localStreamRef.current = stream; setFacingMode(nextFacingMode); if (localVideoRef.current) localVideoRef.current.srcObject = stream; } catch { stream?.getTracks().forEach((track) => track.stop()); setStatusText("Rear camera is not available on this device."); } };
  const toggleFullscreen = () => { if (minimized) setMinimized(false); setMaximized((value) => !value); };
  const view = call ? <div className={`fixed z-50 ${minimized ? "bottom-4 right-4 w-[min(22rem,calc(100vw-2rem))]" : maximized ? "inset-0 grid place-items-center bg-black p-0" : "inset-0 grid place-items-center bg-black/70 p-4"}`}><div ref={callWindowRef} className={`w-full overflow-hidden border-border bg-zinc-950 text-white shadow-2xl ${minimized ? "max-w-sm rounded-2xl border" : maximized ? "h-full rounded-none" : "max-w-4xl rounded-2xl border"}`}><div className="flex items-center justify-between border-b border-white/10 px-4 py-3"><div className="flex items-center gap-2"><AppLogo size={30} className="rounded-lg" alt="Lark" /><div><p className="text-sm font-semibold">{call.peer.name}</p><p className="text-xs text-zinc-400">{call.status === "calling" ? "Calling..." : call.status === "ringing" ? "Ringing..." : call.status === "reconnecting" ? "Reconnecting..." : call.status === "connecting" ? "Connecting..." : `${call.type === "video" ? "Video" : "Voice"} call · ${formatCallDuration(seconds)}`}</p></div></div><div className="flex gap-1"><Button isIconOnly variant="ghost" aria-label="Minimize or restore call" onPress={() => { setMinimized((value) => !value); setMaximized(false); }}><MinusIcon className="size-4 text-white" /></Button><Button isIconOnly variant="ghost" aria-label="End call" onPress={() => end("cancelled")}><XIcon className="size-4 text-white" /></Button></div></div>{!minimized ? <><div className={`relative bg-black ${maximized ? "h-[calc(100vh-8rem)]" : "aspect-video"}`}>{call.type === "video" ? <video ref={remoteVideoRef} autoPlay playsInline className="size-full object-contain" /> : <div className="grid size-full place-items-center"><Avatar className="size-24"><Avatar.Image alt={call.peer.name} src={call.peer.avatar} /><Avatar.Fallback className="text-2xl">{call.peer.initials}</Avatar.Fallback></Avatar></div>}<video ref={localVideoRef} autoPlay muted playsInline className={`absolute bottom-3 right-3 h-24 w-32 rounded-lg bg-zinc-800 object-cover ${call.type === "video" ? "" : "hidden"}`} /><audio ref={remoteAudioRef} autoPlay /></div><div className="flex flex-wrap items-center justify-center gap-3 px-4 py-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">{call.incoming && call.status === "ringing" ? <><Button className="bg-emerald-600 text-white" onPress={accept}><PhoneIcon /> Accept</Button><Button variant="danger" onPress={() => end("missed")}><PhoneOffIcon /> Reject</Button></> : <><Button isIconOnly className="size-11 rounded-full bg-zinc-700 text-white" aria-label="Mute microphone" onPress={toggleMute}>{muted ? <MicOffIcon /> : <MicIcon />}</Button>{call.type === "video" ? <><Button isIconOnly className="size-11 rounded-full bg-zinc-700 text-white" aria-label="Toggle camera" onPress={toggleCamera}>{cameraOff ? <VideoOffIcon /> : <VideoIcon />}</Button><Button isIconOnly className="size-11 rounded-full bg-zinc-700 text-white" aria-label="Switch camera" onPress={switchCamera}><RefreshCwIcon /></Button></> : null}<Button isIconOnly className="size-11 rounded-full bg-zinc-700 text-white" aria-label="Toggle speaker" onPress={async () => { if (remoteAudioRef.current?.setSinkId) await remoteAudioRef.current.setSinkId(speakerOn ? "communications" : "default"); setSpeakerOn((value) => !value); }}>{speakerOn ? <Volume2Icon /> : <VolumeXIcon />}</Button><Button isIconOnly className="size-11 rounded-full bg-zinc-700 text-white" aria-label={maximized ? "Restore call" : "Maximize call"} onPress={toggleFullscreen}><Maximize2Icon /></Button><Button isIconOnly variant="danger" className="size-11 rounded-full" aria-label="End call" onPress={() => end()}><PhoneOffIcon /></Button></>}</div></> : <div className="flex items-center justify-between px-4 py-2 text-xs text-zinc-400"><span>{call.type === "video" ? "Video" : "Voice"} call</span><span>{formatCallDuration(seconds)}</span></div>}</div></div> : null;
  return <>{statusText ? <div className="fixed bottom-5 left-1/2 z-[60] flex max-w-[calc(100vw-2rem)] -translate-x-1/2 items-center gap-3 rounded-lg bg-danger px-4 py-3 text-sm text-danger-foreground shadow-lg">{statusText}<button type="button" aria-label="Dismiss call message" onClick={() => setStatusText("")}><XIcon className="size-4" /></button></div> : null}<audio ref={ringAudioRef} src="/ring.mp3" loop preload="auto" aria-hidden="true" />{view}</>;
}
