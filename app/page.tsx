"use client";

import React, { useState, useRef, useEffect } from "react";
import { createClient } from "@supabase/supabase-js";

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

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const supabase = createClient(supabaseUrl, supabaseAnonKey);

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
  const [isRecording, setIsRecording] = useState(false);

  // inline rename state
  const [editingConversationId, setEditingConversationId] = useState<
    string | null
  >(null);
  const [editingTitle, setEditingTitle] = useState("");

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const chatContainerRef = useRef<HTMLDivElement | null>(null);

  // ──────────────────────────
  // AUTH: load session on mount
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

  // Load conversations whenever user changes
  useEffect(() => {
    if (!user) {
      setConversations([]);
      setActiveConversationId(null);
      setMessages([]);
      return;
    }
    loadConversations(user.id);
  }, [user]);

  // Auto-scroll when messages change
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
      if (error) {
        setAuthError(error.message);
      }
    } catch (err: any) {
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
      if (error) {
        setAuthError(error.message);
      } else {
        setAuthError("Check your email to confirm your account.");
      }
    } catch (err: any) {
      console.error("Sign-up error:", err);
      setAuthError("Failed to sign up");
    }
  }

  async function handleSignOut() {
    try {
      await supabase.auth.signOut();
      setUser(null);
      setConversations([]);
      setActiveConversationId(null);
      setMessages([]);
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

      const res = await fetch(
        `/api/conversations/${conversationId}/messages`
      );
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

    if (!res.ok) {
      throw new Error("Failed to create conversation");
    }

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
  // CORE SEND MESSAGE (with isFirstMessage → auto-titles)
  // ──────────────────────────
  async function sendMessage(question: string, opts?: { autoVoice?: boolean }) {
    if (!user) {
      console.warn("Tried to send message while not logged in");
      return;
    }

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

      if (!res.ok || !res.body) {
        throw new Error("No response from /api/chat");
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        if (!chunk) continue;

        finalAssistantText += chunk;

        setMessages(prev =>
          prev.map(m =>
            m.id === assistantId ? { ...m, content: finalAssistantText } : m
          )
        );
      }

      if (opts?.autoVoice && finalAssistantText.trim()) {
        await speakMessage(assistantId, finalAssistantText);
      }

      loadConversations(user.id);
    } catch (err) {
      console.error(err);
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
    await sendMessage(q, { autoVoice: false });
  }

  // ──────────────────────────
  // VOICE: TTS
  // ──────────────────────────
  async function speakMessage(id: string, text: string) {
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

      if (!res.ok) {
        throw new Error("Voice request failed");
      }

      const arrayBuf = await res.arrayBuffer();
      const blob = new Blob([arrayBuf], { type: "audio/mpeg" });
      const url = URL.createObjectURL(blob);

      const audio = new Audio(url);
      audioRef.current = audio;

      audio.onended = () => {
        setSpeakingId(current => (current === id ? null : current));
        URL.revokeObjectURL(url);
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
  // VOICE: HOLD-TO-TALK
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

      if (!res.ok) {
        throw new Error("Transcription failed");
      }

      const data = await res.json();
      const text = (data.text as string).trim();
      if (!text) return;

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
  // SIDEBAR ACTIONS (inline rename)
  // ──────────────────────────
  function handleNewChat() {
    setActiveConversationId(null);
    setMessages([]);
    setInput("");
    setEditingConversationId(null);
    setEditingTitle("");
  }

  async function handleSelectConversation(id: string) {
    setActiveConversationId(id);
    setEditingConversationId(null);
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
    } catch (err) {
      console.error("handleDeleteConversation error:", err);
    }
  }

  function startEditingConversation(conv: ConversationSummary) {
    setEditingConversationId(conv.id);
    setEditingTitle(conv.title || "Untitled conversation");
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

  const hasMessages = messages.length > 0;

  // ──────────────────────────
  // AUTH GATE UI
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
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-slate-50">
        <div className="relative w-full max-w-sm overflow-hidden rounded-3xl border border-slate-800/70 bg-slate-900/80 px-6 py-6 shadow-[0_0_80px_rgba(56,189,248,0.25)] backdrop-blur-xl">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h1 className="text-lg font-semibold tracking-tight">
                Adam AI · Access
              </h1>
              <p className="text-[11px] text-slate-400 mt-1">
                Sign in to keep your conversations and insights in one place.
              </p>
            </div>
            <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-sky-500/10 text-xs text-sky-300 border border-sky-500/30">
              A
            </div>
          </div>

          <form className="space-y-3" onSubmit={handleSignIn}>
            <div className="space-y-1">
              <label className="text-[11px] text-slate-400">Email</label>
              <input
                type="email"
                className="w-full rounded-xl border border-slate-700 bg-slate-950/80 px-3 py-2 text-xs outline-none focus:border-sky-500"
                value={authEmail}
                onChange={e => setAuthEmail(e.target.value)}
                placeholder="you@example.com"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[11px] text-slate-400">Password</label>
              <input
                type="password"
                className="w-full rounded-xl border border-slate-700 bg-slate-950/80 px-3 py-2 text-xs outline-none focus:border-sky-500"
                value={authPassword}
                onChange={e => setAuthPassword(e.target.value)}
                placeholder="••••••••"
              />
            </div>

            {authError && (
              <div className="rounded-md border border-red-500/40 bg-red-500/10 px-2 py-1 text-[11px] text-red-200">
                {authError}
              </div>
            )}

            <div className="flex items-center justify-between gap-2 pt-2">
              <button
                type="submit"
                className="flex-1 rounded-xl border border-sky-500 bg-sky-500 px-3 py-2 text-xs font-medium text-white shadow-[0_0_20px_rgba(56,189,248,0.5)] hover:bg-sky-400"
              >
                Sign in
              </button>
              <button
                type="button"
                onClick={handleSignUp}
                className="flex-1 rounded-xl border border-slate-600 bg-slate-900 px-3 py-2 text-xs font-medium text-slate-100 hover:border-slate-500"
              >
                Create account
              </button>
            </div>
          </form>

          <div className="mt-4 border-t border-slate-800 pt-3 text-[10px] text-slate-500">
            Adam helps you explore money, work and care as systems – not just
            personal problems.
          </div>
        </div>
      </div>
    );
  }

  // ──────────────────────────
  // MAIN APP UI (AUTHED)
  // ──────────────────────────
  return (
    <div className="flex h-screen w-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-slate-50">
      {/* Sidebar */}
      <aside className="flex h-full w-64 flex-col border-r border-slate-800/70 bg-slate-950/60 px-3 py-4 backdrop-blur-xl">
        <button
          type="button"
          onClick={handleNewChat}
          className="mb-4 flex items-center justify-between rounded-2xl border border-slate-700/70 bg-slate-900/80 px-3 py-2 text-xs font-medium text-slate-100 hover:border-sky-500/70 hover:bg-slate-900 shadow-sm"
        >
          <span className="flex items-center gap-1">
            <span className="text-base leading-none">＋</span>
            New conversation
          </span>
        </button>

        <div className="mb-4 flex items-center justify-between rounded-2xl border border-slate-800 bg-slate-950/80 px-3 py-2 text-[11px]">
          <div>
            <div className="flex items-center gap-1">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400" />
              <span className="text-slate-200">Adam is online</span>
            </div>
            <div className="mt-1 text-[10px] text-slate-500">
              Signed in as{" "}
              <span className="text-slate-200">
                {user.email ?? user.id.slice(0, 6)}
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={handleSignOut}
            className="rounded-full border border-slate-700 bg-slate-900 px-2 py-1 text-[10px] text-slate-300 hover:border-slate-500"
          >
            Log out
          </button>
        </div>

        <div className="flex-1 space-y-1 overflow-y-auto pr-1">
          {conversations.length === 0 && (
            <div className="rounded-xl border border-dashed border-slate-700/60 bg-slate-950/60 px-3 py-3 text-[11px] text-slate-500">
              No conversations yet. Start a session with voice or text to see
              them here.
            </div>
          )}

          {conversations.map(conv => {
            const isActive = conv.id === activeConversationId;
            const isEditing = conv.id === editingConversationId;

            return (
              <div
                key={conv.id}
                className={`flex items-center justify-between rounded-2xl px-2 py-2 text-[11px] transition ${
                  isActive
                    ? "bg-slate-100 text-slate-900 shadow-sm"
                    : "bg-slate-900/40 text-slate-300 hover:bg-slate-900/80"
                }`}
              >
                {isEditing ? (
                  <input
                    className="flex-1 rounded-md border border-slate-500 bg-slate-950/90 px-2 py-1 text-[11px] outline-none focus:border-sky-500"
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
                  <button
                    type="button"
                    onClick={() => handleSelectConversation(conv.id)}
                    onDoubleClick={() => startEditingConversation(conv)}
                    className="flex-1 text-left truncate"
                    title={conv.title || "Untitled conversation"}
                  >
                    <span className="font-medium">
                      {conv.title || "Untitled conversation"}
                    </span>
                  </button>
                )}

                {!isEditing && (
                  <div className="ml-2 flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => startEditingConversation(conv)}
                      className={`rounded-full px-1.5 py-0.5 text-[10px] ${
                        isActive
                          ? "text-slate-700 hover:bg-slate-200"
                          : "text-slate-400 hover:bg-slate-800"
                      }`}
                      title="Rename"
                    >
                      ✏️
                    </button>

                    <button
                      type="button"
                      onClick={e => handleDeleteConversation(e, conv.id)}
                      className={`rounded-full px-1.5 py-0.5 text-[10px] ${
                        isActive
                          ? "text-red-500 hover:bg-red-100"
                          : "text-red-400 hover:bg-slate-800"
                      }`}
                      title="Delete"
                    >
                      🗑
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </aside>

      {/* Main area */}
      <div className="flex h-full flex-1 flex-col px-6 py-6">
        <div className="mx-auto flex h-full w-full max-w-4xl flex-col rounded-[32px] border border-slate-700/60 bg-slate-950/70 p-5 shadow-[0_0_80px_rgba(15,23,42,0.8)] backdrop-blur-xl">
          <header className="mb-4 flex items-center justify-between gap-3 border-b border-slate-800/80 pb-3">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-sky-500/15 text-sm font-semibold text-sky-300 border border-sky-500/40">
                A
              </div>
              <div>
                <h1 className="text-base font-semibold tracking-tight">
                  Adam AI · Systemic Guide
                </h1>
                <p className="text-[11px] text-slate-400">
                  Ask about money, work, care, and the systems shaping your
                  life. Adam responds with calm, structural insight.
                </p>
              </div>
            </div>

            <button
              type="button"
              onMouseDown={handleMicDown}
              onMouseUp={handleMicUp}
              onMouseLeave={handleMicCancel}
              onTouchStart={handleMicDown}
              onTouchEnd={handleMicUp}
              className={`flex items-center gap-1 rounded-full border px-3 py-1.5 text-[11px] shadow-sm transition ${
                isRecording
                  ? "border-red-500/70 bg-red-600 text-white shadow-[0_0_25px_rgba(248,113,113,0.7)]"
                  : "border-sky-500/80 bg-slate-900 text-sky-200 hover:bg-sky-500/10"
              }`}
            >
              <span className="text-base leading-none">
                {isRecording ? "●" : "🎙"}
              </span>
              {isRecording ? "Listening… release to send" : "Hold to talk"}
            </button>
          </header>

          {/* Main chat area */}
          {!hasMessages && !activeConversationId ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-8 py-4">
              <div className="text-center space-y-2">
                <p className="text-sm text-slate-200">
                  Start a conversation with Adam.
                </p>
                <p className="text-[11px] text-slate-500 max-w-sm mx-auto">
                  Speak or type. Adam will help you see the patterns beneath
                  your money, work, and care stories — not just surface tips.
                </p>
              </div>

              <button
                type="button"
                onMouseDown={handleMicDown}
                onMouseUp={handleMicUp}
                onMouseLeave={handleMicCancel}
                onTouchStart={handleMicDown}
                onTouchEnd={handleMicUp}
                className={`relative flex h-24 w-24 items-center justify-center rounded-full border-2 text-2xl transition ${
                  isRecording
                    ? "border-red-400 bg-red-600 text-white shadow-[0_0_40px_rgba(248,113,113,0.9)] animate-pulse"
                    : "border-sky-400 bg-sky-600 text-white shadow-[0_0_40px_rgba(56,189,248,0.9)] hover:scale-[1.02]"
                }`}
              >
                🎙
                <span
                  className={`absolute -inset-3 rounded-full border border-sky-500/40 ${
                    isRecording ? "animate-ping" : "opacity-0"
                  }`}
                />
              </button>

              <div className="h-10 flex items-end gap-1">
                {Array.from({ length: 16 }).map((_, i) => (
                  <div
                    key={i}
                    className={`w-1 rounded-full bg-sky-400/70 ${
                      isRecording
                        ? "animate-[pulse_1s_ease-in-out_infinite]"
                        : "opacity-30"
                    }`}
                    style={{
                      height: `${6 + ((i * 9) % 30)}px`,
                      animationDelay: `${(i * 70) % 400}ms`,
                    }}
                  />
                ))}
              </div>

              <div className="text-[11px] text-slate-500">
                Or type below if you prefer text.
              </div>
            </div>
          ) : (
            <div
              ref={chatContainerRef}
              className="mb-3 h-0 flex-1 space-y-2 overflow-y-auto rounded-3xl border border-slate-800/80 bg-gradient-to-b from-slate-950/90 via-slate-950/40 to-slate-950/90 p-4 text-sm"
            >
              {messages.map(m => {
                const isUser = m.role === "user";
                return (
                  <div
                    key={m.id}
                    className={`flex ${
                      isUser ? "justify-end" : "justify-start"
                    }`}
                  >
                    <div
                      className={`flex max-w-[80%] items-start gap-2 ${
                        isUser ? "flex-row-reverse" : "flex-row"
                      }`}
                    >
                      <div
                        className={`mt-0.5 flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-medium ${
                          isUser
                            ? "bg-sky-500 text-white"
                            : "bg-slate-800 text-slate-100"
                        }`}
                      >
                        {isUser ? "You" : "A"}
                      </div>

                      <div
                        className={`rounded-2xl px-3 py-2 text-xs leading-relaxed whitespace-pre-wrap border ${
                          isUser
                            ? "border-sky-500/60 bg-sky-600 text-white shadow-[0_0_22px_rgba(56,189,248,0.5)]"
                            : "border-slate-700/80 bg-slate-900/90 text-slate-50"
                        }`}
                      >
                        <div className="flex items-start gap-2">
                          <span className="flex-1">{m.content}</span>

                          {m.role === "assistant" && m.content && (
                            <button
                              type="button"
                              onClick={() => speakMessage(m.id, m.content)}
                              className="mt-0.5 text-[10px] text-sky-300 hover:text-sky-100"
                              title="Play as voice"
                            >
                              {speakingId === m.id ? "▶︎" : "🔊"}
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}

              {loading && (
                <div className="flex justify-start">
                  <div className="inline-flex items-center gap-2 rounded-2xl border border-slate-700 bg-slate-900/90 px-3 py-1.5 text-xs text-slate-300">
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-sky-400" />
                    Thinking…
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Input bar */}
          <form
            onSubmit={handleSubmit}
            className="mt-2 flex items-end gap-2 rounded-2xl border border-slate-700/80 bg-slate-950/80 px-3 py-2 shadow-inner"
          >
            <textarea
              className="max-h-24 min-h-[36px] flex-1 resize-none rounded-xl bg-transparent px-2 py-1 text-xs text-slate-100 outline-none placeholder:text-slate-500"
              value={input}
              placeholder="Ask Adam about how the system really works, not just how to cope with it…"
              onChange={e => setInput(e.target.value)}
            />

            <button
              type="submit"
              disabled={loading}
              className="inline-flex items-center gap-1 rounded-xl border border-sky-500 bg-sky-500 px-3 py-1.5 text-[11px] font-medium text-white shadow-[0_0_24px_rgba(56,189,248,0.6)] hover:bg-sky-400 disabled:opacity-50"
            >
              <span>Send</span>
              <span className="text-xs">↩︎</span>
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
