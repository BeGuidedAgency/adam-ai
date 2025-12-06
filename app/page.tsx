"use client";

import React, { useState, useRef, useEffect } from "react";
import { createClient } from "@supabase/supabase-js";
import Markdown from "react-markdown";
import { ThemeToggle } from "../components/theme-toggle";
import {
  VoiceBubble,
  type VoiceBubbleStatus,
} from "./components/voice-bubble";

// ===============================
// BRAND TOOLTIP COMPONENT
// ===============================
const Tooltip = ({
  children,
  text,
}: {
  children: React.ReactNode;
  text: string;
}) => (
  <div className="relative group inline-flex">
    {children}
    <div
      className="
        absolute bottom-full left-1/2 -translate-x-1/2 mb-2
        whitespace-nowrap rounded-md bg-[#001f3e] text-[#f2fdff]
        px-2 py-1 text-[10px] opacity-0 group-hover:opacity-100
        transition-opacity shadow-md pointer-events-none
      "
    >
      {text}
    </div>
  </div>
);

// ===============================
// TYPES
// ===============================
type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

type ConversationSummary = {
  id: string;
  title: string | null;
};

type SupabaseUser = {
  id: string;
  email?: string | null;
};

// ===============================
// SUPABASE CLIENT
// ===============================
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

// ===============================
// MAIN PAGE COMPONENT
// ===============================
export default function Page() {
  const [user, setUser] = useState<SupabaseUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");

  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [activeConversationId, setActiveConversationId] =
    useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [speakingId, setSpeakingId] = useState<string | null>(null);

  // Voice state
  const [isRecording, setIsRecording] = useState(false);
  const [voiceSession, setVoiceSession] = useState(false);
  const [voiceModeType, setVoiceModeType] = useState<
    "voice_text" | "voice_only"
  >("voice_text");
  const [voiceModeMenuOpen, setVoiceModeMenuOpen] = useState(false);

  const [editingConversationId, setEditingConversationId] = useState<
    string | null
  >(null);
  const [editingTitle, setEditingTitle] = useState("");
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const chatContainerRef = useRef<HTMLDivElement | null>(null);

  const hasMessages = messages.length > 0;
  const isVoiceOnlyActive = voiceSession && voiceModeType === "voice_only";

  const voiceStatus: VoiceBubbleStatus =
    speakingId != null
      ? "speaking"
      : isRecording
      ? "listening"
      : loading
      ? "thinking"
      : "idle";

  const voiceStatusLabel =
    speakingId != null
      ? "Adam is speaking…"
      : isRecording
      ? "Listening…"
      : loading
      ? "Thinking…"
      : "Ready";

  // ──────────────────────────
  // AUTH INIT
  // ──────────────────────────
  useEffect(() => {
    const initAuth = async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (session?.user) {
          setUser({
            id: session.user.id,
            email: session.user.email,
          });
        }

        supabase.auth.onAuthStateChange((_event, session) => {
          if (session?.user) {
            setUser({ id: session.user.id, email: session.user.email });
          } else {
            setUser(null);
          }
        });
      } catch (err) {
        console.error("Auth init error:", err);
      } finally {
        setAuthLoading(false);
      }
    };

    initAuth();
  }, []);

  // ──────────────────────────
  // LOAD CONVERSATIONS WHEN USER CHANGES
  // ──────────────────────────
  useEffect(() => {
    if (!user) {
      setConversations([]);
      setActiveConversationId(null);
      setMessages([]);
      setVoiceSession(false);
      return;
    }
    loadConversations(user.id);
  }, [user]);

  // auto-scroll chat
  useEffect(() => {
    if (!chatContainerRef.current) return;
    const el = chatContainerRef.current;
    el.scrollTop = el.scrollHeight;
  }, [messages, loading]);

  // ──────────────────────────
  // AUTH HANDLERS
  // ──────────────────────────
  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault();
    setAuthError(null);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: authEmail.trim(),
        password: authPassword,
      });
      if (error) setAuthError(error.message);
    } catch (err) {
      console.error("Sign-in error:", err);
      setAuthError("Failed to sign in");
    }
  }

  async function handleSignUp(e: React.FormEvent) {
    e.preventDefault();
    setAuthError(null);
    try {
      const { error } = await supabase.auth.signUp({
        email: authEmail.trim(),
        password: authPassword,
      });
      if (error) setAuthError(error.message);
      else setAuthError("Check your email to confirm your account.");
    } catch (err) {
      console.error("Sign-up error:", err);
      setAuthError("Failed to sign up");
    }
  }

  async function handleGoogleLogin() {
    setAuthError(null);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo:
            typeof window !== "undefined" ? window.location.origin : undefined,
        },
      });
      if (error) {
        console.error("Google login error:", error.message);
        setAuthError(error.message);
      }
    } catch (err) {
      console.error("Google login error:", err);
      setAuthError("Failed to start Google sign-in");
    }
  }

  async function handleSignOut() {
    try {
      await supabase.auth.signOut();
      setUser(null);
      setConversations([]);
      setActiveConversationId(null);
      setMessages([]);
      setVoiceSession(false);
    } catch (err) {
      console.error("Sign-out error:", err);
    }
  }

  // ──────────────────────────
  // DATA LOADING
  // ──────────────────────────
  async function loadConversations(userId: string) {
    try {
      const res = await fetch(`/api/conversations?userId=${userId}`);
      if (!res.ok) {
        console.error("Failed to load conversations:", await res.text());
        return;
      }
      const data = await res.json();
      setConversations(data.conversations ?? []);
    } catch (err) {
      console.error("loadConversations error:", err);
    }
  }

  async function loadMessages(conversationId: string) {
    try {
      setMessages([]);

      const res = await fetch(`/api/conversations/${conversationId}/messages`);
      if (!res.ok) {
        console.error(
          "Failed to load messages:",
          res.status,
          await res.text()
        );
        return;
      }

      const data = await res.json();
      const msgs: Message[] = (data.messages ?? []).map((m: any) => ({
        id: m.id,
        role: m.role as "user" | "assistant",
        content: m.content,
      }));

      setMessages(msgs);
    } catch (err) {
      console.error("loadMessages error:", err);
    }
  }

  async function ensureConversation(): Promise<string> {
    if (!user) throw new Error("Not authenticated");
    if (activeConversationId) return activeConversationId;

    const res = await fetch("/api/conversations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: user.id }),
    });

    if (!res.ok) throw new Error("Failed to create conversation");

    const data = await res.json();
    const newId: string = data.id;

    setActiveConversationId(newId);
    setConversations(prev => [
      { id: newId, title: data.title ?? "New chat" },
      ...prev,
    ]);

    return newId;
  }

  // ──────────────────────────
  // CHAT / SEND MESSAGE
  // ──────────────────────────
  async function sendMessage(
    question: string,
    opts?: { autoVoice?: boolean }
  ) {
    if (!user) return;

    const q = question.trim();
    if (!q || loading) return;

    setLoading(true);
    const convId = await ensureConversation();

    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: q,
    };

    const assistantId = crypto.randomUUID();
    const historyForApi = [...messages, userMessage];
    const isFirstMessage = messages.length === 0;

    // For voice-only we still keep a text history in state, just not shown.
    setMessages([
      ...historyForApi,
      { id: assistantId, role: "assistant", content: "" },
    ]);

    let finalAssistantText = "";

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId: convId,
          isFirstMessage,
          messages: historyForApi.map(m => ({
            role: m.role,
            content: m.content,
          })),
        }),
      });

      if (!res.ok) {
        console.error("Chat API error:", res.status, await res.text());
        throw new Error("No response from /api/chat");
      }

      const data = await res.json();
      finalAssistantText =
        data?.message?.content ??
        "Adam couldn't form a response. Check /api/chat.";

      setMessages(prev =>
        prev.map(m =>
          m.id === assistantId ? { ...m, content: finalAssistantText } : m
        )
      );

      // Voice output: both modes use the same backend.
      if ((opts?.autoVoice || voiceSession) && finalAssistantText.trim()) {
        await speakMessage(assistantId, finalAssistantText, {
          onEnded: () => {
            // In voice-only mode, automatically start listening again
            if (voiceSession && voiceModeType === "voice_only" && !isRecording) {
              startRecording().catch(err =>
                console.error("startRecording after reply failed:", err)
              );
            }
          },
        });
      }

      if (user) {
        loadConversations(user.id);
      }
    } catch (err) {
      console.error("sendMessage error:", err);
      setMessages(prev =>
        prev.map(m =>
          m.id === assistantId
            ? {
                ...m,
                content:
                  "Something went wrong talking to Adam’s brain. Check the /api/chat route or RAG config.",
              }
            : m
        )
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim()) return;
    const q = input.trim();
    setInput("");
    await sendMessage(q);
  }

  // ──────────────────────────
  // VOICE: TTS (ElevenLabs)
// ──────────────────────────
  async function speakMessage(
    id: string,
    text: string,
    opts?: { onEnded?: () => void }
  ) {
    if (!text.trim()) return;

    try {
      setSpeakingId(id);

      if (audioRef.current) {
        audioRef.current.pause();
        URL.revokeObjectURL(audioRef.current.src);
        audioRef.current = null;
      }

      const res = await fetch("/api/voice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });

      if (!res.ok) throw new Error("Voice request failed");

      const arrayBuf = await res.arrayBuffer();
      const blob = new Blob([arrayBuf], { type: "audio/mpeg" });
      const url = URL.createObjectURL(blob);

      const audio = new Audio(url);
      audioRef.current = audio;

      audio.onended = () => {
        setSpeakingId(current => (current === id ? null : current));
        URL.revokeObjectURL(url);
        if (opts?.onEnded) {
          opts.onEnded();
        }
      };

      audio.play().catch(err => {
        console.error("Audio play error:", err);
        setSpeakingId(current => (current === id ? null : current));
      });
    } catch (err) {
      console.error("speakMessage error:", err);
      setSpeakingId(current => (current === id ? null : current));
    }
  }

  // ──────────────────────────
  // VOICE: HOLD TO TALK (mic → /api/transcribe)
  // ──────────────────────────
  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = event => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        chunksRef.current = [];
        stream.getTracks().forEach(t => t.stop());
        await handleAudioBlob(blob);
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (err) {
      console.error("Error accessing microphone:", err);
      setIsRecording(false);
    }
  }

  function stopRecording() {
    if (
      mediaRecorderRef.current &&
      mediaRecorderRef.current.state !== "inactive"
    ) {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
  }

  async function handleAudioBlob(blob: Blob) {
    if (!blob.size) return;

    try {
      const file = new File([blob], "voice.webm", { type: "audio/webm" });
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/transcribe", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) throw new Error("Transcription failed");

      const data = await res.json();
      const text = (data.text as string).trim();
      if (!text) return;

      // Voice-only and voice+text both route through here
      await sendMessage(text, { autoVoice: true });
    } catch (err) {
      console.error("handleAudioBlob error:", err);
    }
  }

  async function handleMicDown(e: React.MouseEvent | React.TouchEvent) {
    e.preventDefault();
    if (isRecording || !user) return;
    await startRecording();
  }

  function handleMicUp(e: React.MouseEvent | React.TouchEvent) {
    e.preventDefault();
    if (!isRecording) return;
    stopRecording();
  }

  function handleMicCancel() {
    if (!isRecording) return;
    stopRecording();
  }

  // ──────────────────────────
  // VOICE SESSION BUTTON (Use voice mode / End)
  // ──────────────────────────
  async function handleVoiceButtonClick() {
    // If already in voice mode → end it
    if (voiceSession) {
      setVoiceSession(false);

      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = "";
        audioRef.current = null;
      }

      if (isRecording) {
        stopRecording();
      }

      return;
    }

    // Start voice mode
    setVoiceSession(true);

    try {
      await ensureConversation();

      const greeting =
        "What brings you here? Are you exploring what's broken about current systems, curious about alternatives, or working through a specific question?";

      const id = crypto.randomUUID();
      const greetingMsg: Message = {
        id,
        role: "assistant",
        content: greeting,
      };

      // Show intro only in voice + text mode
      if (voiceModeType === "voice_text") {
        setMessages(prev => [...prev, greetingMsg]);
      }

      // Speak intro in both modes, and auto-start listening in voice-only
      await speakMessage(id, greeting, {
        onEnded: () => {
          if (voiceModeType === "voice_only" && voiceSession && !isRecording) {
            startRecording().catch(err =>
              console.error("startRecording after greeting failed:", err)
            );
          }
        },
      });
    } catch (err) {
      console.error("Error starting voice session:", err);
      setVoiceSession(false);
    }
  }

  // ──────────────────────────
  // SIDEBAR ACTIONS
  // ──────────────────────────
  function handleNewChat() {
    setActiveConversationId(null);
    setMessages([]);
    setInput("");
    setEditingConversationId(null);
    setEditingTitle("");
    setOpenMenuId(null);
    setVoiceSession(false);
  }

  async function handleSelectConversation(id: string) {
    setActiveConversationId(id);
    setEditingConversationId(null);
    setOpenMenuId(null);
    setVoiceSession(false);
    await loadMessages(id);
  }

  async function handleDeleteConversation(
    e: React.MouseEvent,
    id: string
  ) {
    e.stopPropagation();
    const confirmed = window.confirm("Delete this conversation?");
    if (!confirmed) return;

    try {
      const url =
        user != null
          ? `/api/conversations/${id}?userId=${user.id}`
          : `/api/conversations/${id}`;

      const res = await fetch(url, {
        method: "DELETE",
      });

      if (!res.ok) {
        console.error("Failed to delete conversation");
        return;
      }

      setConversations(prev => prev.filter(c => c.id !== id));

      if (activeConversationId === id) {
        setActiveConversationId(null);
        setMessages([]);
      }

      if (editingConversationId === id) {
        setEditingConversationId(null);
        setEditingTitle("");
      }

      if (openMenuId === id) {
        setOpenMenuId(null);
      }
    } catch (err) {
      console.error("handleDeleteConversation error:", err);
    }
  }

  function startEditingConversation(conv: ConversationSummary) {
    setEditingConversationId(conv.id);
    setEditingTitle(conv.title || "Untitled conversation");
    setOpenMenuId(null);
  }

  async function commitConversationTitle() {
    if (!user || !editingConversationId) {
      setEditingConversationId(null);
      return;
    }

    const trimmed = editingTitle.trim();
    if (!trimmed) {
      setEditingConversationId(null);
      setEditingTitle("");
      return;
    }

    try {
      const res = await fetch(`/api/conversations/${editingConversationId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: trimmed, userId: user.id }),
      });

      if (!res.ok) {
        console.error(
          "Failed to rename conversation:",
          res.status,
          await res.text()
        );
        return;
      }

      const data = await res.json();

      setConversations(prev =>
        prev.map(c =>
          c.id === editingConversationId ? { ...c, title: data.title } : c
        )
      );
    } catch (err) {
      console.error("commitConversationTitle error:", err);
    } finally {
      setEditingConversationId(null);
      setEditingTitle("");
    }
  }

  function cancelConversationTitleEdit() {
    setEditingConversationId(null);
    setEditingTitle("");
  }

  // ──────────────────────────
  // AUTH SCREENS
  // ──────────────────────────
  if (authLoading) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-slate-950 text-slate-50">
        <div className="rounded-xl border border-slate-800 bg-slate-900/80 px-4 py-3 text-sm text-slate-200 shadow-lg">
          Loading Adam…
        </div>
      </div>
    );
  }

  if (!user) {
    // NEW BACKGROUND IMAGE + GLASS LOGIN
    return (
      <div className="relative flex min-h-screen w-screen items-center justify-center overflow-hidden bg-black text-white">
        {/* Background image */}
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: "url('/adaim.ai.login.page.png')",
            backgroundSize: "cover",
            backgroundPosition: "center",
          }}
        />
        {/* Slight dark overlay for contrast */}
        <div className="absolute inset-0 bg-black/35" />

        {/* Theme toggle */}
        <div className="absolute right-6 top-6 z-20">
          <ThemeToggle />
        </div>

        {/* Glass card */}
        <div className="relative z-10 flex w-full max-w-5xl justify-center px-4">
          <div className="w-full max-w-3xl rounded-[40px] border border-white/12 bg-white/10 px-10 py-10 text-sm text-white shadow-[0_40px_120px_rgba(0,0,0,0.85)] backdrop-blur-2xl md:px-14 md:py-12">
            {/* Header */}
            <div className="mb-8 text-center">
              <div className="text-xs tracking-[0.4em] text-white/75">
                ADAM AI · ACCESS
              </div>
              <p className="mt-2 text-[11px] text-white/65">
                Sign in to keep your conversations and systemic insights in one place.
              </p>
            </div>

            {/* Form */}
            <form className="space-y-5" onSubmit={handleSignIn}>
              {/* Email */}
              <div className="space-y-1 text-left">
                <label className="text-[11px] text-white/80">Email</label>
                <div className="rounded-full bg-white/14 px-4 py-3 shadow-inner shadow-black/40 ring-1 ring-white/20">
                  <input
                    type="email"
                    className="w-full bg-transparent text-[12px] text-white outline-none placeholder:text-white/55"
                    value={authEmail}
                    onChange={e => setAuthEmail(e.target.value)}
                    placeholder="you@example.com"
                  />
                </div>
              </div>

              {/* Password */}
              <div className="space-y-1 text-left">
                <label className="text-[11px] text-white/80">Password</label>
                <div className="rounded-full bg-white/14 px-4 py-3 shadow-inner shadow-black/40 ring-1 ring-white/20">
                  <input
                    type="password"
                    className="w-full bg-transparent text-[12px] text-white outline-none placeholder:text-white/55"
                    value={authPassword}
                    onChange={e => setAuthPassword(e.target.value)}
                    placeholder="••••••••"
                  />
                </div>
              </div>

              {/* Error */}
              {authError && (
                <div className="rounded-xl border border-rose-400/60 bg-rose-500/25 px-3 py-2 text-[11px] text-rose-50">
                  {authError}
                </div>
              )}

              {/* Login button */}
              <button
                type="submit"
                className="mt-2 flex h-10 w-full items-center justify-center rounded-full bg-gradient-to-r from-[#da5bff] via-[#a66bff] to-[#5b7dff] text-[11px] font-semibold tracking-[0.22em] text-white shadow-[0_18px_55px_rgba(0,0,0,0.85)] hover:brightness-110"
              >
                LOGIN
              </button>

              {/* Links */}
              <div className="mt-2 flex items-center justify-between text-[11px] text-white/75">
                <button
                  type="button"
                  className="underline underline-offset-2 hover:text-white"
                >
                  Forgot password?
                </button>
                <button
                  type="button"
                  onClick={handleSignUp}
                  className="underline underline-offset-2 hover:text-white"
                >
                  Sign up
                </button>
              </div>
            </form>

            {/* Divider */}
            <div className="mt-7 flex items-center gap-3 text-[10px] uppercase tracking-[0.24em] text-white/60">
              <div className="h-px flex-1 bg-white/20" />
              <span>Or login with</span>
              <div className="h-px flex-1 bg-white/20" />
            </div>

            {/* Google login */}
            <div className="mt-4">
              <button
                type="button"
                onClick={handleGoogleLogin}
                className="flex h-10 w-full items-center justify-center gap-2 rounded-full bg-black/55 text-[12px] font-medium text-white/85 ring-1 ring-white/22 hover:bg-black/75"
              >
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-white">
                  <span className="text-[13px] font-semibold text-[#db4437]">
                    G
                  </span>
                </span>
                <span>Continue with Google</span>
              </button>
            </div>

            {/* Footer copy */}
            <p className="mt-6 text-center text-[10px] text-white/70">
              Adam AI is a truth-seeking conversational intelligence for money, work, and care.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ──────────────────────────
  // MAIN LIGHT / DARK UI (CHAT)
  // ──────────────────────────
  const renderVoiceModeSelector = () => (
    <div className="relative inline-flex">
      <button
        type="button"
        onClick={handleVoiceButtonClick}
        className={`flex h-8 items-center justify-center gap-1 rounded-full border px-3 text-[11px] font-medium transition ${
          voiceSession
            ? "border-[#001f3e] bg-[#001f3e] text-[#f2fdff] dark:bg-[#b9a8fe] dark:border-[#b9a8fe] dark:text-[#212121]"
            : "border-[#c7d0f0] bg-[#eaeffb] text-[#001f3e] hover:bg-[#d8e0f7] dark:bg-transparent dark:border-[#b9a8fe] dark:text-[#b9a8fe]"
        }`}
      >
        <svg viewBox="0 0 24 24" className="h-4 w-4 text-[#b9a8fe]">
          <line
            x1="6"
            y1="18"
            x2="6"
            y2="10"
            stroke="currentColor"
            strokeWidth="1.6"
          />
          <line
            x1="12"
            y1="18"
            x2="12"
            y2="6"
            stroke="currentColor"
            strokeWidth="1.6"
          />
          <line
            x1="18"
            y1="18"
            x2="18"
            y2="12"
            stroke="currentColor"
            strokeWidth="1.6"
          />
        </svg>
        <span>{voiceSession ? "End" : "Use voice mode"}</span>
        <span
          className="ml-1 cursor-pointer text-[10px] opacity-80"
          onClick={e => {
            e.stopPropagation();
            setVoiceModeMenuOpen(prev => !prev);
          }}
        >
          ▼
        </span>
      </button>

      {voiceModeMenuOpen && (
        <div className="absolute bottom-10 right-0 z-30 w-40 rounded-xl border border-[#c7d0f0] bg-white text-[11px] text-slate-700 shadow-md dark:border-[#333] dark:bg-[#181818] dark:text-slate-200">
          <button
            type="button"
            className={`flex w-full items-center justify-between px-3 py-2 hover:bg-[#f2fdff] dark:hover:bg-[#262626] ${
              voiceModeType === "voice_text" ? "font-semibold" : ""
            }`}
            onClick={() => {
              setVoiceModeType("voice_text");
              setVoiceModeMenuOpen(false);
            }}
          >
            <span>Voice + text</span>
            {voiceModeType === "voice_text" && <span>✓</span>}
          </button>
          <button
            type="button"
            className={`flex w-full items-center justify-between px-3 py-2 hover:bg-[#f2fdff] dark:hover:bg-[#262626] ${
              voiceModeType === "voice_only" ? "font-semibold" : ""
            }`}
            onClick={() => {
              setVoiceModeType("voice_only");
              setVoiceModeMenuOpen(false);
            }}
          >
            <span>Voice only</span>
            {voiceModeType === "voice_only" && <span>✓</span>}
          </button>
        </div>
      )}
    </div>
  );

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#e9f2ff] text-slate-900 dark:bg-[#212121] dark:text-[#f2fdff]">
      {/* Sidebar */}
      <aside className="fixed left-0 top-0 flex h-screen w-64 flex-col border-r border-[#d5dff5] bg-[linear-gradient(to_top,#b9a8fe,#f2fdff)] px-5 py-6 dark:border-[#262626] dark:bg-[#181818] dark:bg-none">
        {/* Logo / brand */}
        <div className="mb-8 flex items-center gap-2 pl-[2px]">
          <img
            src="/new-adam-ai-logo.png"
            alt="Adam AI"
            className="block h-[4.7rem] w-auto dark:hidden"
          />
          <img
            src="/adam-ai-logo-dark.png"
            alt="Adam AI dark"
            className="hidden h-[4.7rem] w-auto dark:block"
          />
        </div>

        {/* New chat button */}
        <button
          type="button"
          onClick={handleNewChat}
          className="mb-6 inline-flex items-center gap-2 text-xs font-medium text-slate-800 hover:text-[#4f46e5] dark:text-[#b9a8fe]"
        >
          <span className="flex h-6 w-6 items-center justify-center rounded-md border border-[#b9a8fe] text-base leading-none text-[#b9a8fe]">
            +
          </span>
          <span>New chat</span>
        </button>

        {/* Chats label */}
        <div className="mb-2 text-[11px] font-semibold tracking-wide text-slate-500 dark:text-slate-300">
          Chats
        </div>

        {/* Chats list */}
        <div className="no-scrollbar flex-1 max-h-screen overflow-y-scroll">
          {conversations.length === 0 && (
            <div className="rounded-lg border border-dashed border-[#c7d0f0] bg-white/70 px-3 py-3 text-[11px] text-slate-500 dark:border-[#333] dark:bg-[#212121] dark:text-slate-300">
              No conversations yet. Start by asking Adam anything.
            </div>
          )}

          {conversations.map(conv => {
            const isActive = conv.id === activeConversationId;
            const isEditing = conv.id === editingConversationId;
            const isMenuOpen = conv.id === openMenuId;

            return (
              <div key={conv.id} className="relative">
                <div
                  className={`flex cursor-pointer items-center justify-between rounded-full px-3 py-1.5 text-[13px] transition ${
                    isActive
                      ? "bg-white text-slate-900 shadow-sm dark:bg-[#2b2b2b] dark:text-[#f2fdff]"
                      : "bg-transparent text-slate-700 dark:text-slate-300"
                  } hover:bg-[#b9a8fe] hover:text-[#001f3e] dark:hover:bg-[#333]`}
                  onClick={() => handleSelectConversation(conv.id)}
                >
                  {isEditing ? (
                    <input
                      className="flex-1 rounded-md border border-[#b8c3e8] bg-white px-2 py-1 text-[12px] outline-none focus:border-[#8b5cf6] dark:border-[#444] dark:bg-[#181818] dark:text-[#f2fdff]"
                      value={editingTitle}
                      autoFocus
                      onChange={e => setEditingTitle(e.target.value)}
                      onBlur={commitConversationTitle}
                      onKeyDown={e => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          commitConversationTitle();
                        } else if (e.key === "Escape") {
                          e.preventDefault();
                          cancelConversationTitleEdit();
                        }
                      }}
                    />
                  ) : (
                    <span className="flex-1 truncate">
                      {conv.title || "Untitled conversation"}
                    </span>
                  )}

                  {!isEditing && (
                    <button
                      type="button"
                      onClick={e => {
                        e.stopPropagation();
                        setOpenMenuId(isMenuOpen ? null : conv.id);
                      }}
                      className="ml-2 rounded-full px-1 text-[18px] leading-none text-slate-400 hover:text-slate-700 dark:text-slate-500 dark:hover:text-slate-300"
                      title="More"
                    >
                      ⋯
                    </button>
                  )}
                </div>

                {isMenuOpen && !isEditing && (
                  <div className="absolute right-0 top-8 z-20 w-32 rounded-xl border border-[#c7d0f0] bg-white text-[11px] text-slate-700 shadow-md dark:border-[#333] dark:bg-[#181818] dark:text-slate-200">
                    <button
                      type="button"
                      className="flex w-full items-center gap-2 px-3 py-2 hover:bg-[#f2fdff] dark:hover:bg-[#262626]"
                      onClick={() => startEditingConversation(conv)}
                    >
                      <img
                        src="/icon-pencil.png"
                        alt="Rename"
                        className="h-3.5 w-3.5"
                      />
                      <span>Rename</span>
                    </button>
                    <button
                      type="button"
                      className="flex w-full items-center gap-2 px-3 py-2 text-rose-600 hover:bg-[#fef2f2] dark:hover:bg-[#3b1212]"
                      onClick={e => handleDeleteConversation(e, conv.id)}
                    >
                      <img
                        src="/icon-trash.png"
                        alt="Delete"
                        className="h-3.5 w-3.5"
                      />
                      <span>Delete</span>
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* User info footer */}
        <div className="mt-4 border-t border-[#d5dff5] pt-3 text-[11px] text-slate-600 dark:border-[#333] dark:text-slate-300">
          <div className="font-medium">
            {user.email ?? `User ${user.id.slice(0, 6)}`}
          </div>
          <div className="mt-1 text-[10px] text-slate-500 dark:text-slate-400">
            <button
              type="button"
              onClick={handleSignOut}
              className="underline underline-offset-2 hover:text-slate-700 dark:hover:text-slate-200"
            >
              Log out
            </button>
          </div>
        </div>
      </aside>

      {/* Main content area */}
      <main className="ml-64 flex h-screen min-h-0 flex-1 flex-col">
        {/* Top bar */}
        <div className="flex items-center justify-between bg-[#f2fdff] px-10 py-4 dark:border-b dark:border-[#333] dark:bg-[#212121]">
          <div className="text-sm font-semibold text-slate-700 dark:text-[#f2fdff]">
            Adam ai <span className="text-xs font-normal">1.0 v</span>
          </div>
          <div className="flex items-center gap-3">
            <ThemeToggle />
          </div>
        </div>

        {/* Content */}
        <div className="relative flex min-h-0 flex-1 flex-col">
          {isVoiceOnlyActive ? (
            // VOICE-ONLY SCREEN
            <div className="flex flex-1 flex-col items-center justify-between bg-transparent px-10 py-10">
              <div className="flex flex-1 items-center justify-center">
                <VoiceBubble status={voiceStatus} label={voiceStatusLabel} />
              </div>

              {/* Bottom mic bar + End button */}
              <div className="w-full max-w-3xl">
                <div className="flex items-center gap-3 rounded-full border border-[#c7d0f0] bg-white px-5 py-3 text-sm shadow-sm dark:border-[#b9a8fe] dark:bg-transparent">
                  <div className="flex-1 text-xs text-slate-500 dark:text-slate-300">
                    {isRecording
                      ? "Listening…"
                      : speakingId
                      ? "Adam is speaking…"
                      : "Say anything…"}
                  </div>
                  {/* Mic – hold to speak */}
                  <Tooltip text="Hold while speaking">
                    <button
                      type="button"
                      onMouseDown={handleMicDown}
                      onMouseUp={handleMicUp}
                      onMouseLeave={handleMicCancel}
                      onTouchStart={handleMicDown}
                      onTouchEnd={handleMicUp}
                      className="flex h-8 w-8 items-center justify-center rounded-full bg-[#eaeffb] hover:bg-[#d8e0f7] dark:border dark:border-[#b9a8fe] dark:bg-transparent"
                    >
                      <svg
                        viewBox="0 0 24 24"
                        className="h-4 w-4 text-[#b9a8fe]"
                      >
                        <rect
                          x="9"
                          y="5"
                          width="6"
                          height="10"
                          rx="3"
                          ry="3"
                          stroke="currentColor"
                          fill="none"
                          strokeWidth="1.6"
                        />
                        <path
                          d="M5 11a 7 7 0 0 0 14 0"
                          stroke="currentColor"
                          fill="none"
                          strokeWidth="1.6"
                        />
                        <line
                          x1="12"
                          y1="18"
                          x2="12"
                          y2="21"
                          stroke="currentColor"
                          strokeWidth="1.6"
                        />
                        <line
                          x1="9"
                          y1="21"
                          x2="15"
                          y2="21"
                          stroke="currentColor"
                          strokeWidth="1.6"
                        />
                      </svg>
                    </button>
                  </Tooltip>
                  {/* End voice mode */}
                  <button
                    type="button"
                    onClick={handleVoiceButtonClick}
                    className="flex h-8 items-center justify-center rounded-full border border-[#c7d0f0] bg-[#eaeffb] px-3 text-[11px] font-medium text-[#001f3e] dark:border-[#b9a8fe] dark:bg-transparent dark:text-[#b9a8fe]"
                  >
                    End
                  </button>
                </div>
              </div>
            </div>
          ) : !hasMessages && !activeConversationId ? (
            // HERO STATE
            <div className="flex flex-1 flex-col items-center justify-center bg-transparent px-10">
              <div className="text-center">
                <h1
                  className="text-3xl font-semibold tracking-tight text-[#9d8be3] md:text-4xl"
                  style={{
                    fontFamily: "Arial, system-ui, -apple-system, sans-serif",
                  }}
                >
                  What would you like to know?
                </h1>
                <p
                  className="mx-auto mt-4 max-w-xl text-sm text-slate-600 dark:text-slate-300"
                  style={{
                    fontFamily: "Arial, system-ui, -apple-system, sans-serif",
                  }}
                >
                  Adam AI is a truth-seeking conversational intelligence
                  designed to help people explore what’s broken about money,
                  work, and care – and imagine how regenerative systems could
                  function instead.
                </p>
              </div>

              <button
                type="button"
                onClick={handleVoiceButtonClick}
                className="mt-4 text-xs text-[#b9a8fe] underline"
              >
                Voice
              </button>

              {/* Big input pill */}
              <form
                onSubmit={handleSubmit}
                className="mt-10 flex w-full max-w-3xl items-center gap-3 rounded-full border border-[#c7d0f0] bg-white px-5 py-3 text-sm shadow-sm dark:border-[#b9a8fe] dark:bg-transparent"
              >
                <input
                  className="flex-1 border-none bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400 dark:text-[#f2fdff] dark:placeholder-[#b9a8fe]"
                  placeholder="Ask anything..."
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  style={{
                    fontFamily: "Arial, system-ui, -apple-system, sans-serif",
                  }}
                />
                {/* Mic – dictation */}
                <Tooltip text="Hold while speaking">
                  <button
                    type="button"
                    onMouseDown={handleMicDown}
                    onMouseUp={handleMicUp}
                    onMouseLeave={handleMicCancel}
                    onTouchStart={handleMicDown}
                    onTouchEnd={handleMicUp}
                    className="flex h-8 w-8 items-center justify-center rounded-full bg-[#eaeffb] hover:bg-[#d8e0f7] dark:border dark:border-[#b9a8fe] dark:bg-transparent"
                  >
                    <svg
                      viewBox="0 0 24 24"
                      className="h-4 w-4 text-[#b9a8fe]"
                    >
                      <rect
                        x="9"
                        y="5"
                        width="6"
                        height="10"
                        rx="3"
                        ry="3"
                        stroke="currentColor"
                        fill="none"
                        strokeWidth="1.6"
                      />
                      <path
                        d="M5 11a 7 7 0 0 0 14 0"
                        stroke="currentColor"
                        fill="none"
                        strokeWidth="1.6"
                      />
                      <line
                        x1="12"
                        y1="18"
                        x2="12"
                        y2="21"
                        stroke="currentColor"
                        strokeWidth="1.6"
                      />
                      <line
                        x1="9"
                        y1="21"
                        x2="15"
                        y2="21"
                        stroke="currentColor"
                        strokeWidth="1.6"
                      />
                    </svg>
                  </button>
                </Tooltip>

                {/* Voice mode selector */}
                {renderVoiceModeSelector()}

                {/* Send */}
                <button
                  type="submit"
                  disabled={loading}
                  className="flex h-8 w-8 items-center justify-center rounded-full bg-[#eaeffb] hover:bg-[#d8e0f7] disabled:opacity-50 dark:border dark:border-[#b9a8fe] dark:bg-transparent"
                >
                  <svg
                    viewBox="0 0 24 24"
                    className="h-4 w-4 text-[#b9a8fe]"
                  >
                    <path
                      d="M5 12L19 5L15 19L11 13L5 12Z"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      strokeLinejoin="round"
                    />
                  </svg>
                </button>
              </form>
            </div>
          ) : (
            // NORMAL CHAT VIEW (Voice + Text)
            <div className="flex h-full min-h-0 flex-col">
              {/* Messages */}
              <div
                ref={chatContainerRef}
                className="no-scrollbar flex-1 overflow-y-auto bg-[#f2fdff] px-10 py-6 dark:bg-[#212121]"
              >
                <div className="mx-auto flex max-w-3xl flex-col gap-3">
                  {messages.map(m => {
                    const isUser = m.role === "user";
                    return (
                      <div
                        key={m.id}
                        className={`flex ${
                          isUser ? "justify-end" : "justify-start"
                        }`}
                      >
                        {isUser ? (
                          <div className="max-w-[80%] whitespace-pre-wrap rounded-2xl border border-[#c7d0f0] bg-white px-4 py-2 text-[15px] leading-relaxed text-[#001f3e] shadow-sm dark:border-[#b9a8fe] dark:bg-transparent dark:text-[#f2fdff]">
                            {m.content}
                          </div>
                        ) : (
                          <div className="max-w-[80%] text-[15px] leading-relaxed text-[#001f3e] dark:text-[#f2fdff]">
                            <Markdown
                              components={{
                                h1: ({ children }) => (
                                  <p className="mb-1 font-semibold">
                                    {children}
                                  </p>
                                ),
                                h2: ({ children }) => (
                                  <p className="mb-1 font-semibold">
                                    {children}
                                  </p>
                                ),
                                h3: ({ children }) => (
                                  <p className="mb-1 font-semibold">
                                    {children}
                                  </p>
                                ),
                                p: ({ children }) => (
                                  <p className="mb-1">{children}</p>
                                ),
                                ol: ({ children }) => (
                                  <ol className="mb-1 ml-4 list-decimal space-y-0.5">
                                    {children}
                                  </ol>
                                ),
                                li: ({ children }) => (
                                  <li className="mb-0.5">{children}</li>
                                ),
                                ul: ({ children }) => (
                                  <ul className="mb-1 ml-4 list-disc space-y-0.5">
                                    {children}
                                  </ul>
                                ),
                              }}
                            >
                              {m.content}
                            </Markdown>

                            {m.content && (
                              <button
                                type="button"
                                onClick={() => speakMessage(m.id, m.content)}
                                className="mt-1 text-[11px] text-[#001f3e] underline underline-offset-2 dark:text-[#b9a8fe]"
                              >
                                {speakingId === m.id ? "Playing…" : "Voice"}
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {loading && (
                    <div className="flex justify-start">
                      <div className="rounded-full border border-[#d7e0fa] bg-white px-4 py-1.5 text-[12px] text-slate-600 shadow-sm dark:border-[#333] dark:bg-[#181818] dark:text-slate-200">
                        Thinking…
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Input at bottom */}
              <form
                onSubmit={handleSubmit}
                className="border-t border-[#d5dff5] bg-[#f2fdff] px-10 py-4 dark:border-[#333] dark:bg-[#212121]"
              >
                <div className="mx-auto flex w-full max-w-3xl items-center gap-3 rounded-full border border-[#c7d0f0] bg-white px-5 py-3 text-sm shadow-sm dark:border-[#b9a8fe] dark:bg-transparent">
                  <input
                    className="flex-1 border-none bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400 dark:text-[#f2fdff] dark:placeholder-[#b9a8fe]"
                    placeholder="Ask Adam about what’s really going on…"
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    style={{
                      fontFamily:
                        "Arial, system-ui, -apple-system, sans-serif",
                    }}
                  />
                  {/* Mic – dictation */}
                  <Tooltip text="Hold while speaking">
                    <button
                      type="button"
                      onMouseDown={handleMicDown}
                      onMouseUp={handleMicUp}
                      onMouseLeave={handleMicCancel}
                      onTouchStart={handleMicDown}
                      onTouchEnd={handleMicUp}
                      className="flex h-8 w-8 items-center justify-center rounded-full bg-[#eaeffb] hover:bg-[#d8e0f7] dark:border dark:border-[#b9a8fe] dark:bg-transparent"
                    >
                      <svg
                        viewBox="0 0 24 24"
                        className="h-4 w-4 text-[#b9a8fe]"
                      >
                        <rect
                          x="9"
                          y="5"
                          width="6"
                          height="10"
                          rx="3"
                          ry="3"
                          stroke="currentColor"
                          fill="none"
                          strokeWidth="1.6"
                        />
                        <path
                          d="M5 11a 7 7 0 0 0 14 0"
                          stroke="currentColor"
                          fill="none"
                          strokeWidth="1.6"
                        />
                        <line
                          x1="12"
                          y1="18"
                          x2="12"
                          y2="21"
                          stroke="currentColor"
                          strokeWidth="1.6"
                        />
                        <line
                          x1="9"
                          y1="21"
                          x2="15"
                          y2="21"
                          stroke="currentColor"
                          strokeWidth="1.6"
                        />
                      </svg>
                    </button>
                  </Tooltip>
                  {/* Voice mode selector */}
                  {renderVoiceModeSelector()}
                  {/* Send */}
                  <button
                    type="submit"
                    disabled={loading}
                    className="flex h-8 w-8 items-center justify-center rounded-full bg-[#eaeffb] hover:bg-[#d8e0f7] disabled:opacity-50 dark:border dark:border-[#b9a8fe] dark:bg-transparent"
                  >
                    <svg
                      viewBox="0 0 24 24"
                      className="h-4 w-4 text-[#b9a8fe]"
                    >
                      <path
                        d="M5 12L19 5L15 19L11 13L5 12Z"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.6"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
