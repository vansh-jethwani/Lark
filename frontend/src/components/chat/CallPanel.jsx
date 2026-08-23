import { Avatar, Button } from "@heroui/react";
import { Maximize2Icon, MicIcon, MicOffIcon, PhoneIcon, PhoneOffIcon, VideoIcon, VideoOffIcon, Volume2Icon, VolumeXIcon, XIcon, MinusIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { AppLogo } from "../AppLogo";
import { getInitials } from "../../hooks/useSelectedConversation";
import { useAuthStore } from "../../store/useAuthStore";
import { useChatStore } from "../../store/useChatStore";
import { addCallHistory, formatCallDuration, readCallHistory } from "../../lib/callHistory";

function contact(user) {
  return { id: user._id, name: user.fullName, avatar: user.profilePic, initials: getInitials(user.fullName), isOnline: user.isOnline };
}

export function CallHistory({ onCall }) {
  const users = useChatStore((state) => state.users);
  const [history, setHistory] = useState(readCallHistory);
  useEffect(() => {
    const refresh = () => setHistory(readCallHistory());
    window.addEventListener("lark:call-history", refresh);
    return () => window.removeEventListener("lark:call-history", refresh);
  }, []);
  return <div className="space-y-1 p-2">{history.length === 0 ? <p className="px-3 py-8 text-center text-sm text-muted">No call history yet.</p> : history.map((entry) => {
    const user = users.find((item) => String(item._id) === String(entry.peerId));
    return <div key={entry.id} className="flex items-center gap-3 rounded-xl px-3 py-3 hover:bg-accent-soft"><Avatar className="size-10"><Avatar.Image alt={entry.peerName} src={user?.profilePic || entry.peerAvatar} /><Avatar.Fallback>{getInitials(entry.peerName)}</Avatar.Fallback></Avatar><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{entry.peerName}</p><p className="truncate text-xs text-muted">{entry.type === "video" ? "Video" : "Voice"} call · {entry.direction === "incoming" ? "Received" : "Sent"} · {entry.status === "missed" ? "Missed" : formatCallDuration(entry.duration)}</p><p className="text-[11px] text-muted">{new Date(entry.createdAt).toLocaleString()}</p></div><Button isIconOnly variant="ghost" aria-label={`Call ${entry.peerName}`} onPress={() => user && onCall(user, entry.type)}>{entry.type === "video" ? <VideoIcon className="size-4" /> : <PhoneIcon className="size-4" />}</Button></div>;
  })}</div>;
}

export function ConversationCallHistory({ peerId }) {
  const [history, setHistory] = useState(readCallHistory);
  useEffect(() => {
    const refresh = () => setHistory(readCallHistory());
    window.addEventListener("lark:call-history", refresh);
    return () => window.removeEventListener("lark:call-history", refresh);
  }, []);
  return <>{history.filter((entry) => String(entry.peerId) === String(peerId)).map((entry) => <div key={entry.id} className="my-2 flex justify-center"><div className="flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1.5 text-xs text-muted"><span>{entry.type === "video" ? "Video" : "Voice"} call</span><span>·</span><span>{entry.direction === "incoming" ? "Received" : "Sent"}</span><span>·</span><span>{entry.status === "missed" ? "Missed" : formatCallDuration(entry.duration)}</span><span>·</span><span>{new Date(entry.createdAt).toLocaleString()}</span></div></div>)}</>;
}

export function CallPanel() {
  const socket = useAuthStore((state) => state.socket);
  const authUser = useAuthStore((state) => state.authUser);
  const users = useChatStore((state) => state.users);
  const [call, setCall] = useState(null);
  const [minimized, setMinimized] = useState(false);
  const [error, setError] = useState("");
  const [muted, setMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(false);
  const [speakerOn, setSpeakerOn] = useState(true);
  const [seconds, setSeconds] = useState(0);
  const peerRef = useRef(null);
  const streamRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const localVideoRef = useRef(null);
  const remoteAudioRef = useRef(null);
  const callWindowRef = useRef(null);
  const ringAudioRef = useRef(null);

  const cleanup = (save = true, status = "completed") => {
    if (!call) return;
    if (ringAudioRef.current) {
      ringAudioRef.current.pause();
      ringAudioRef.current.currentTime = 0;
    }
    if (save) addCallHistory({ peerId: call.peer.id, peerName: call.peer.name, peerAvatar: call.peer.avatar, type: call.type, direction: call.incoming ? "incoming" : "outgoing", status, duration: seconds });
    streamRef.current?.getTracks().forEach((track) => track.stop());
    peerRef.current?.close();
    streamRef.current = null;
    peerRef.current = null;
    setCall(null);
    setMinimized(false);
    setSeconds(0);
  };

  const start = async (user, type) => {
    if (call || !socket) return;
    try {
      const peer = contact(user);
      streamRef.current = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: type === "video" });
      setCall({ peer, type, status: "calling", outgoing: true });
      socket.emit("call:initiate", { receiverId: peer.id, callId: crypto.randomUUID(), callType: type, caller: { name: authUser.fullName, avatar: authUser.profilePic } });
    } catch (err) {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      setError(err.name === "NotAllowedError" ? "Camera or microphone permission was denied." : "Camera or microphone is unavailable.");
    }
  };

  useEffect(() => {
    const handleStart = (event) => start(event.detail.user, event.detail.type);
    window.addEventListener("lark:start-call", handleStart);
    return () => window.removeEventListener("lark:start-call", handleStart);
  });

  useEffect(() => {
    if (!socket) return undefined;
    const invite = ({ callerId, callType, caller, callId }) => {
      if (call) return socket.emit("call:reject", { receiverId: callerId, callId });
      const user = users.find((item) => String(item._id) === String(callerId));
      setCall({ id: callId, peer: { id: callerId, name: caller?.name || user?.fullName || "Lark user", avatar: caller?.avatar || user?.profilePic, initials: getInitials(caller?.name || user?.fullName) }, type: callType, status: "ringing", incoming: true });
      socket.emit("call:ringing", { receiverId: callerId, callId });
    };
    const ringing = ({ userId }) => {
      if (call?.outgoing && String(call.peer.id) === String(userId)) setCall((current) => ({ ...current, status: "ringing" }));
    };
    const accepted = ({ userId }) => { if (call?.peer.id === userId) setCall((current) => ({ ...current, status: "connected" })); };
    const rejected = () => cleanup(true, "rejected");
    const ended = () => cleanup(true, "completed");
    socket.on("call:ring", invite); socket.on("call:ringing", ringing); socket.on("call:accept", accepted); socket.on("call:reject", rejected); socket.on("call:end", ended);
    return () => { socket.off("call:ring", invite); socket.off("call:ringing", ringing); socket.off("call:accept", accepted); socket.off("call:reject", rejected); socket.off("call:end", ended); };
  // The socket listener intentionally captures current call state for cleanup.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket, users, call]);

  useEffect(() => {
    if (call?.status !== "connected") return undefined;
    const timer = setInterval(() => setSeconds((value) => value + 1), 1000);
    return () => clearInterval(timer);
  }, [call?.status]);

  useEffect(() => {
    if (call?.status !== "calling" && call?.status !== "ringing") return undefined;
    const audio = ringAudioRef.current;
    if (!audio) return undefined;
    audio.play().catch(() => {});
    return () => {
      audio.pause();
      audio.currentTime = 0;
    };
  }, [call?.status]);

  useEffect(() => {
    if (localVideoRef.current && streamRef.current) localVideoRef.current.srcObject = streamRef.current;
  }, [call]);

  const accept = async () => {
    try {
      streamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true, video: call.type === "video" });
      socket.emit("call:accept", { receiverId: call.peer.id, callId: call.id });
      setCall((current) => ({ ...current, status: "connected", incoming: false }));
    } catch { setError("Camera or microphone permission was denied."); }
  };
  const end = (status = "completed") => { socket?.emit("call:end", { receiverId: call?.peer.id, callId: call?.id }); cleanup(true, status); };
  const toggleMute = () => { const next = !muted; streamRef.current?.getAudioTracks().forEach((track) => { track.enabled = !next; }); setMuted(next); };
  const toggleCamera = () => { const next = !cameraOff; streamRef.current?.getVideoTracks().forEach((track) => { track.enabled = !next; }); setCameraOff(next); };
  const toggleSpeaker = async () => {
    const next = !speakerOn;
    if (remoteAudioRef.current?.setSinkId) {
      try { await remoteAudioRef.current.setSinkId(next ? "default" : "communications"); } catch { setError("Speaker control is not supported by this browser."); return; }
    }
    setSpeakerOn(next);
  };
  const toggleFullscreen = () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else callWindowRef.current?.requestFullscreen?.();
  };

  const view = call ? <div className={`fixed z-50 ${minimized ? "bottom-4 right-4 w-72" : "inset-0 grid place-items-center bg-black/70 p-4"}`}><div ref={callWindowRef} className="w-full max-w-2xl overflow-hidden rounded-2xl border border-border bg-zinc-950 text-white shadow-2xl"><div className="flex items-center justify-between border-b border-white/10 px-4 py-3"><div className="flex items-center gap-2"><AppLogo size={30} className="rounded-lg" alt="Lark" /><div><p className="text-sm font-semibold">{call.peer.name}</p><p className="text-xs text-zinc-400">{call.status === "calling" ? "Calling..." : call.status === "ringing" ? "Ringing..." : `${call.type === "video" ? "Video" : "Voice"} call · ${formatCallDuration(seconds)}`}</p></div></div><div className="flex gap-1"><Button isIconOnly variant="ghost" aria-label="Minimize call" onPress={() => setMinimized((value) => !value)}><MinusIcon className="size-4 text-white" /></Button><Button isIconOnly variant="ghost" aria-label="Dismiss call panel" onPress={() => end("cancelled")}><XIcon className="size-4 text-white" /></Button></div></div>{!minimized ? <><div className="relative aspect-video bg-black">{call.type === "video" && !cameraOff ? <video ref={remoteVideoRef} autoPlay playsInline className="size-full object-contain" /> : <div className="grid size-full place-items-center"><Avatar className="size-24"><Avatar.Image alt={call.peer.name} src={call.peer.avatar} /><Avatar.Fallback className="text-2xl">{call.peer.initials}</Avatar.Fallback></Avatar></div>}{call.type === "video" ? <video ref={localVideoRef} autoPlay muted playsInline className="absolute bottom-3 right-3 h-24 w-32 rounded-lg bg-zinc-800 object-cover" /> : null}<audio ref={remoteAudioRef} autoPlay /></div><div className="flex items-center justify-center gap-3 p-4">{call.incoming && call.status === "ringing" ? <><Button className="bg-emerald-600 text-white" onPress={accept}><PhoneIcon /> Accept</Button><Button variant="danger" onPress={() => end("missed")}><PhoneOffIcon /> Reject</Button></> : <><Button isIconOnly className="size-11 rounded-full bg-zinc-700 text-white" aria-label="Mute" onPress={toggleMute}>{muted ? <MicOffIcon /> : <MicIcon />}</Button>{call.type === "video" ? <Button isIconOnly className="size-11 rounded-full bg-zinc-700 text-white" aria-label="Camera" onPress={toggleCamera}>{cameraOff ? <VideoOffIcon /> : <VideoIcon />}</Button> : null}<Button isIconOnly className="size-11 rounded-full bg-zinc-700 text-white" aria-label={speakerOn ? "Turn speaker off" : "Turn speaker on"} onPress={toggleSpeaker}>{speakerOn ? <Volume2Icon /> : <VolumeXIcon />}</Button><Button isIconOnly className="size-11 rounded-full bg-zinc-700 text-white" aria-label="Fullscreen" onPress={toggleFullscreen}><Maximize2Icon /></Button><Button isIconOnly variant="danger" className="size-11 rounded-full" aria-label="End call" onPress={() => end()}><PhoneOffIcon /></Button></>}</div></> : <div className="flex items-center justify-between px-4 py-2 text-xs text-zinc-400"><span>{call.type === "video" ? "Video" : "Voice"} call in progress</span><span>{formatCallDuration(seconds)}</span></div>}</div></div> : null;

  return <><audio ref={ringAudioRef} src="/ring.mp3" loop preload="auto" aria-hidden="true" />{error ? <div className="fixed bottom-5 left-1/2 z-[60] flex -translate-x-1/2 items-center gap-3 rounded-lg bg-danger px-4 py-3 text-sm text-danger-foreground shadow-lg">{error}<button type="button" aria-label="Dismiss error" onClick={() => setError("")}><XIcon className="size-4" /></button></div> : null}{view}</>;
}
