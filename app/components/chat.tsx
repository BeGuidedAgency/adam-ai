"use client";

import React, { useState, useEffect, useRef } from "react";
import Markdown from "react-markdown";
import { AssistantStream } from "openai/lib/AssistantStream";
// @ts-expect-error - no types for this yet
import { AssistantStreamEvent } from "openai/resources/beta/assistants/assistants";
import { RequiredActionFunctionToolCall } from "openai/resources/beta/threads/runs/runs";

type MessageRole = "user" | "assistant" | "code";

type Message = {
  role: MessageRole;
  text: string;
};

type ChatProps = {
  threadId?: string; // passed in from ChatShell
  functionCallHandler?: (
    toolCall: RequiredActionFunctionToolCall
  ) => Promise<string>;
};

const Chat: React.FC<ChatProps> = ({
  threadId,
  functionCallHandler = () => Promise.resolve(""),
}) => {
  const [userInput, setUserInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputDisabled, setInputDisabled] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };
  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // when switching sessions, clear local messages
  useEffect(() => {
    setMessages([]);
    setUserInput("");
    setInputDisabled(false);
  }, [threadId]);

  const appendMessage = (role: MessageRole, text: string) => {
    setMessages((prev) => [...prev, { role, text }]);
  };

  const appendToLastMessage = (text: string) => {
    setMessages((prev) => {
      if (prev.length === 0) return prev;
      const last = prev[prev.length - 1];
      const updated = { ...last, text: last.text + text };
      return [...prev.slice(0, -1), updated];
    });
  };

  const annotateLastMessage = (annotations: any[]) => {
    setMessages((prev) => {
      if (prev.length === 0) return prev;
      const last = prev[prev.length - 1];
      let newText = last.text;

      annotations.forEach((annotation) => {
        if (annotation.type === "file_path") {
          newText = newText.replaceAll(
            annotation.text,
            `/api/files/${annotation.file_path.file_id}`
          );
        }
      });

      const updated = { ...last, text: newText };
      return [...prev.slice(0, -1), updated];
    });
  };

  const handleTextCreated = () => {
    appendMessage("assistant", "");
  };

  const handleTextDelta = (delta: any) => {
    if (delta.value != null) {
      appendToLastMessage(delta.value);
    }
    if (delta.annotations != null) {
      annotateLastMessage(delta.annotations);
    }
  };

  const handleImageFileDone = (image: { file_id: string }) => {
    appendToLastMessage(`\n![${image.file_id}](/api/files/${image.file_id})\n`);
  };

  const toolCallCreated = (toolCall: any) => {
    if (toolCall.type !== "code_interpreter") return;
    appendMessage("code", "");
  };

  const toolCallDelta = (delta: any) => {
    if (delta.type !== "code_interpreter") return;
    if (!delta.code_interpreter.input) return;
    appendToLastMessage(delta.code_interpreter.input);
  };

  const handleRequiresAction = async (
    event: AssistantStreamEvent.ThreadRunRequiresAction
  ) => {
    if (!threadId) return;

    const runId = event.data.id;
    const toolCalls =
      event.data.required_action.submit_tool_outputs.tool_calls;

    const toolCallOutputs = await Promise.all(
      toolCalls.map(async (toolCall: any) => {
        const result = await functionCallHandler(toolCall);
        return { output: result, tool_call_id: toolCall.id };
      })
    );

    setInputDisabled(true);

    const response = await fetch(
      `/api/assistants/threads/${threadId}/actions`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ runId, toolCallOutputs }),
      }
    );

    const stream = AssistantStream.fromReadableStream(response.body);
    handleReadableStream(stream);
  };

  const handleRunCompleted = () => {
    setInputDisabled(false);
  };

  const handleReadableStream = (stream: AssistantStream) => {
    stream.on("textCreated", handleTextCreated);
    stream.on("textDelta", handleTextDelta);

    stream.on("imageFileDone", handleImageFileDone);

    stream.on("toolCallCreated", toolCallCreated);
    stream.on("toolCallDelta", toolCallDelta);

    stream.on("event", (event: AssistantStreamEvent) => {
      if (event.event === "thread.run.requires_action") {
        handleRequiresAction(event as any);
      }
      if (event.event === "thread.run.completed") {
        handleRunCompleted();
      }
    });
  };

  const sendMessage = async (text: string) => {
    if (!threadId) return;

    const response = await fetch(
      `/api/assistants/threads/${threadId}/messages`,
      {
        method: "POST",
        body: JSON.stringify({ content: text }),
      }
    );

    const stream = AssistantStream.fromReadableStream(response.body);
    handleReadableStream(stream);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userInput.trim() || !threadId) return;

    appendMessage("user", userInput);
    setInputDisabled(true);
    const toSend = userInput;
    setUserInput("");

    await sendMessage(toSend);
  };

  return (
    <div className="flex flex-col gap-4 h-[60vh] md:h-[70vh]">
      {/* Conversation area */}
      <div className="flex-1 overflow-y-auto rounded-2xl border border-border/40 bg-background/80 px-4 py-4 md:px-5 md:py-5">
        {messages.length === 0 && (
          <div className="h-full flex items-center justify-center text-sm text-muted-foreground text-center">
            <p>
              I’m Adam. Tell me what feels off in your world — money, work, or
              care — and we’ll look at the system behind it together.
            </p>
          </div>
        )}

        <div className="space-y-4">
          {messages.map((msg, index) => (
            <div
              key={index}
              className={`flex ${
                msg.role === "user" ? "justify-end" : "justify-start"
              }`}
            >
              <div
                className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm leading-relaxed shadow-sm
                  ${
                    msg.role === "user"
                      ? "bg-foreground text-background"
                      : "bg-card text-card-foreground"
                  }`}
              >
                {msg.role === "assistant" ? (
                  <Markdown className="prose prose-sm prose-invert max-w-none">
                    {msg.text}
                  </Markdown>
                ) : (
                  msg.text
                )}
              </div>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input */}
      <form
        onSubmit={handleSubmit}
        className="flex items-center gap-3 rounded-full border border-border/50 bg-background/90 px-4 py-2 shadow-sm"
      >
        <input
          type="text"
          className="flex-1 bg-transparent text-sm focus:outline-none"
          placeholder={
            threadId
              ? "Ask Adam what feels broken — in money, work, or care…"
              : "Create or select a session to start talking to Adam…"
          }
          value={userInput}
          onChange={(e) => setUserInput(e.target.value)}
          disabled={inputDisabled || !threadId}
        />
        <button
          type="submit"
          disabled={inputDisabled || !threadId}
          className="px-3 py-1.5 text-xs font-medium rounded-full border border-foreground/40 hover:bg-foreground hover:text-background transition disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Send
        </button>
      </form>
    </div>
  );
};

export default Chat;
