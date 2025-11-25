"use client";

import React, { useEffect, useState } from "react";
import Chat from "./chat";

type Session = {
  id: string;
  thread_id: string;
  title: string | null;
  created_at: string;
};

const ChatShell: React.FC = () => {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [activeSession, setActiveSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);

  // Load sessions from Supabase
  const loadSessions = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/sessions");
      const data = await res.json();
      if (data.sessions) {
        setSessions(data.sessions);
        if (!activeSession && data.sessions.length > 0) {
          setActiveSession(data.sessions[0]);
        }
      }
    } catch (e) {
      console.error("Failed to load sessions", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadSessions();
  }, []);

  // Create new conversation:
  // 1) create new OpenAI thread
  // 2) create session row in Supabase
  const handleNewConversation = async () => {
    try {
      setCreating(true);

      // 1) create OpenAI thread via existing API
      const threadRes = await fetch("/api/assistants/threads", {
        method: "POST",
      });
      const threadData = await threadRes.json();
      const threadId = threadData.threadId;

      // 2) create session in Supabase
      const sessionRes = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          threadId,
          title: "New conversation",
        }),
      });
      const sessionData = await sessionRes.json();

      if (sessionData.session) {
        const newSession: Session = sessionData.session;
        setSessions((prev) => [newSession, ...prev]);
        setActiveSession(newSession);
      }
    } catch (e) {
      console.error("Failed to create conversation", e);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="flex h-[calc(100vh-140px)] border border-border/40 rounded-3xl overflow-hidden bg-background/80 shadow-[0_24px_80px_rgba(0,0,0,0.25)]">
      {/* LEFT: Sessions */}
      <aside className="hidden md:flex w-64 flex-col border-right border-border/40 bg-background/80">
        <div className="px-4 py-4 border-b border-border/40 flex items-center justify-between gap-2">
          <div>
            <div className="text-[11px] tracking-[0.18em] uppercase opacity-60">
              Sessions
            </div>
            <div className="mt-1 text-sm font-medium">Adam conversations</div>
          </div>
          <button
            onClick={handleNewConversation}
            disabled={creating}
            className="rounded-full border border-border/60 px-2 py-1 text-[11px] uppercase tracking-wide hover:bg-foreground hover:text-background transition disabled:opacity-40"
          >
            +
          </button>
        </div>

        <div className="flex-1 overflow-y-auto text-sm">
          {loading && (
            <div className="px-4 py-3 text-xs opacity-60">
              Loading sessions…
            </div>
          )}
          {!loading && sessions.length === 0 && (
            <div className="px-4 py-3 text-xs opacity-60">
              No sessions yet. Create your first.
            </div>
          )}

          {sessions.map((s) => {
            const isActive = activeSession?.id === s.id;
            return (
              <button
                key={s.id}
                onClick={() => setActiveSession(s)}
                className={`w-full text-left px-4 py-3 border-b border-border/20 text-xs ${
                  isActive
                    ? "bg-foreground text-background"
                    : "hover:bg-foreground/5"
                }`}
              >
                <div className="truncate">
                  {s.title || "Untitled conversation"}
                </div>
                <div className={`mt-1 text-[10px] ${isActive ? "opacity-90" : "opacity-60"}`}>
                  {new Date(s.created_at).toLocaleString()}
                </div>
              </button>
            );
          })}
        </div>
      </aside>

      {/* RIGHT: Chat panel */}
      <section className="flex-1 flex flex-col">
        <header className="px-4 md:px-6 py-3 border-b border-border/40 text-sm flex items-center justify-between">
          <div>
            <div className="font-medium">Adam</div>
            <div className="text-xs opacity-60">
              Ask sharper questions. Get systemic answers.
            </div>
          </div>
          <div className="text-[11px] opacity-60">
            {activeSession ? "Session active" : "No session selected"}
          </div>
        </header>

        <div className="flex-1 min-h-0 p-3 md:p-4">
          {activeSession ? (
            <Chat threadId={activeSession.thread_id} />
          ) : (
            <div className="h-full flex items-center justify-center text-xs opacity-60">
              Create or select a session to start talking to Adam.
            </div>
          )}
        </div>
      </section>
    </div>
  );
};

export default ChatShell;
