import { useCallback, useEffect, useRef, useState } from "react";
import {
  Bot,
  LoaderCircle,
  Mic,
  MicOff,
  RefreshCw,
  Send,
  Sparkles,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import type { Candle } from "../../services/schemas.ts";
import {
  AiServiceError,
  checkAiService,
  requestAiAnalysis,
  type AiChartPoint,
  type AiChatMessage,
} from "../../services/ai-analysis.ts";

interface AiAnalysisPanelProps {
  visible: boolean;
  symbol: string;
  timeframe: string;
  candles: Candle[];
  onPointsChange: (points: AiChartPoint[]) => void;
}

interface SpeechRecognitionResultItem {
  transcript: string;
}
interface SpeechRecognitionResult extends ArrayLike<SpeechRecognitionResultItem> {
  isFinal: boolean;
}
interface SpeechRecognitionEvent extends Event {
  resultIndex: number;
  results: ArrayLike<SpeechRecognitionResult>;
}
interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: Event) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
}
type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;
type SpeechWindow = Window & {
  SpeechRecognition?: SpeechRecognitionConstructor;
  webkitSpeechRecognition?: SpeechRecognitionConstructor;
};

type ConnectionState = "checking" | "ready" | "missing" | "offline";

const QUICK_PROMPTS = [
  "Summarise the recent price action",
  "What levels stand out on this chart?",
  "Explain the latest candles in simple terms",
];
const AUTO_ANALYZE_PROMPT = "Analyse the current chart briefly. Explain the recent price action, call out up to five notable chart points, and state what remains uncertain.";
const MAX_VISIBLE_MESSAGES = 24;

function connectionLabel(state: ConnectionState): string {
  if (state === "ready") return "AI service ready";
  if (state === "checking") return "Checking service…";
  if (state === "missing") return "AI service needs setup";
  return "AI service offline";
}

function connectionColor(state: ConnectionState): string {
  if (state === "ready") return "bg-emerald-500";
  if (state === "checking") return "bg-amber-400";
  return "bg-rose-500";
}

export function AiAnalysisPanel({
  visible,
  symbol,
  timeframe,
  candles,
  onPointsChange,
}: AiAnalysisPanelProps) {
  const [messages, setMessages] = useState<AiChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [connection, setConnection] = useState<ConnectionState>("checking");
  const [speakReplies, setSpeakReplies] = useState(false);
  const [listening, setListening] = useState(false);
  const endOfMessagesRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const messageListRef = useRef<HTMLDivElement>(null);

  const refreshConnection = useCallback(async () => {
    try {
      const { configured } = await checkAiService();
      setConnection(configured ? "ready" : "missing");
    } catch {
      setConnection("offline");
    }
  }, []);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    checkAiService()
      .then(({ configured }) => {
        if (!cancelled) setConnection(configured ? "ready" : "missing");
      })
      .catch(() => {
        if (!cancelled) setConnection("offline");
      });
    return () => {
      cancelled = true;
    };
  }, [visible]);

  useEffect(() => {
    messageListRef.current?.scrollTo({ top: messageListRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, pending]);

  useEffect(() => () => {
    recognitionRef.current?.stop();
    if (typeof window !== "undefined") window.speechSynthesis?.cancel();
  }, []);

  const speak = useCallback((text: string) => {
    if (!("speechSynthesis" in window)) {
      setError("Spoken replies are not available in this browser.");
      return;
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1;
    window.speechSynthesis.speak(utterance);
  }, []);

  const sendMessage = useCallback(async (question: string) => {
    const content = question.trim();
    if (!content || pending) return;
    if (candles.length < 5) {
      setError("At least five chart candles are needed before I can analyse this view.");
      return;
    }
    setError("");
    const userMessage: AiChatMessage = { role: "user", content };
    const nextMessages = [...messages, userMessage].slice(-MAX_VISIBLE_MESSAGES);
    setMessages(nextMessages);
    setDraft("");
    setPending(true);

    try {
      const response = await requestAiAnalysis({
        symbol,
        timeframe,
        candles: candles.slice(-120).map(({ time, open, high, low, close, volume }) => ({
          time,
          open,
          high,
          low,
          close,
          volume,
        })),
        messages: nextMessages.slice(-12),
      });
      const assistantMessage: AiChatMessage = { role: "assistant", content: response.reply };
      setMessages((current) => [...current, assistantMessage].slice(-MAX_VISIBLE_MESSAGES));
      onPointsChange(response.points);
      setConnection("ready");
      if (speakReplies) speak(response.reply);
    } catch (requestError) {
      const message = requestError instanceof AiServiceError
        ? requestError.message
        : "The analysis could not be completed.";
      setError(message);
      if (requestError instanceof AiServiceError && requestError.status === 503) {
        setConnection("missing");
      }
    } finally {
      setPending(false);
    }
  }, [candles, messages, onPointsChange, pending, speak, speakReplies, symbol, timeframe]);

  const startListening = () => {
    const speechWindow = window as SpeechWindow;
    const Recognition = speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition;
    if (!Recognition) {
      setError("Voice input is not supported in this browser. You can still type your question.");
      return;
    }
    setError("");
    const recognition = new Recognition();
    recognition.lang = navigator.language || "en-US";
    recognition.interimResults = false;
    recognition.onresult = (event) => {
      const transcript = Array.from(event.results)
        .filter((result) => result.isFinal)
        .map((result) => result[0]?.transcript ?? "")
        .join(" ")
        .trim();
      if (transcript) setDraft((current) => `${current}${current ? " " : ""}${transcript}`);
    };
    recognition.onerror = () => {
      setError("Voice input stopped. Check microphone permission or type your question instead.");
    };
    recognition.onend = () => {
      recognitionRef.current = null;
      setListening(false);
    };
    recognitionRef.current = recognition;
    setListening(true);
    try {
      recognition.start();
    } catch {
      recognitionRef.current = null;
      setListening(false);
      setError("The browser could not start speech recognition.");
    }
  };

  const stopListening = () => {
    recognitionRef.current?.stop();
    setListening(false);
  };

  const clearConversation = () => {
    setMessages([]);
    setError("");
    onPointsChange([]);
    window.speechSynthesis?.cancel();
  };

  if (!visible) return null;

  return (
    <section
      aria-label="AI chart analysis and conversation"
      className="flex h-[220px] shrink-0 flex-col border-t border-border bg-card/95 text-xs"
    >
      <div className="flex min-h-9 items-center gap-2 border-b border-border px-3 py-1.5">
        <div className="flex h-6 w-6 items-center justify-center rounded-md bg-primary/15 text-primary">
          <Bot className="h-3.5 w-3.5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 font-semibold text-foreground">
            AI chart analysis
            <span className="hidden font-mono text-[10px] font-normal text-muted-foreground sm:inline">
              {symbol} · {timeframe}
            </span>
          </div>
        </div>
        <span className="flex items-center gap-1.5 text-[10px] text-muted-foreground" title={connectionLabel(connection)}>
          <span className={`h-1.5 w-1.5 rounded-full ${connectionColor(connection)}`} />
          <span className="hidden sm:inline">{connectionLabel(connection)}</span>
        </span>
        {(connection === "missing" || connection === "offline") && (
          <button
            type="button"
            onClick={() => void refreshConnection()}
            className="rounded p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
            title="Retry AI service check"
            aria-label="Retry AI service check"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
        )}
        <button
          type="button"
          onClick={() => setSpeakReplies((current) => !current)}
          className={`rounded p-1.5 hover:bg-secondary ${speakReplies ? "text-primary" : "text-muted-foreground"}`}
          title={speakReplies ? "Turn off spoken replies" : "Read new replies aloud"}
          aria-label={speakReplies ? "Turn off spoken replies" : "Read new replies aloud"}
        >
          {speakReplies ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />}
        </button>
        <button
          type="button"
          onClick={clearConversation}
          disabled={pending}
          className="rounded p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground disabled:opacity-40"
          title="Clear conversation and chart points"
          aria-label="Clear conversation and chart points"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <div ref={messageListRef} className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
        {messages.length === 0 && (
          <div className="flex h-full flex-col justify-center gap-2">
            <div className="flex items-start gap-2 text-muted-foreground">
              <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
              <p>
                Ask about this chart or start with a quick read. The assistant receives up to 120 recent candles;
                any chart markers it returns are checked against the displayed data.
              </p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => void sendMessage(AUTO_ANALYZE_PROMPT)}
                disabled={pending || connection === "missing" || connection === "offline"}
                className="rounded-full border border-primary/40 bg-primary/10 px-2.5 py-1 text-[10px] font-medium text-primary hover:bg-primary/15 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <span className="inline-flex items-center gap-1"><Sparkles className="h-3 w-3" /> Analyse chart</span>
              </button>
              {QUICK_PROMPTS.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  onClick={() => void sendMessage(prompt)}
                  disabled={pending || connection === "missing" || connection === "offline"}
                  className="rounded-full border border-border px-2.5 py-1 text-[10px] text-muted-foreground hover:bg-secondary hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((message, index) => (
          <div key={`${index}-${message.role}`} className={`mb-2 flex ${message.role === "user" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[88%] rounded-lg px-2.5 py-1.5 leading-relaxed ${message.role === "user" ? "bg-primary/15 text-foreground" : "bg-secondary/75 text-foreground"}`}>
              <div className="mb-0.5 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
                {message.role === "user" ? "You" : "Chart assistant"}
              </div>
              <p className="whitespace-pre-wrap">{message.content}</p>
              {message.role === "assistant" && (
                <button
                  type="button"
                  onClick={() => speak(message.content)}
                  className="mt-1 inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-primary"
                  aria-label="Speak this reply"
                >
                  <Volume2 className="h-3 w-3" /> Speak
                </button>
              )}
            </div>
          </div>
        ))}
        {pending && (
          <div className="flex items-center gap-2 text-muted-foreground" role="status">
            <LoaderCircle className="h-3.5 w-3.5 animate-spin text-primary" />
            Reviewing {symbol} candles…
          </div>
        )}
        <div ref={endOfMessagesRef} />
      </div>

      <form
        className="flex items-end gap-1.5 border-t border-border px-2.5 py-2"
        onSubmit={(event) => {
          event.preventDefault();
          void sendMessage(draft);
        }}
      >
        <button
          type="button"
          onClick={listening ? stopListening : startListening}
          disabled={pending}
          className={`mb-0.5 rounded-md p-2 hover:bg-secondary disabled:opacity-50 ${listening ? "text-rose-500" : "text-muted-foreground"}`}
          title={listening ? "Stop voice input" : "Speak a question"}
          aria-label={listening ? "Stop voice input" : "Speak a question"}
        >
          {listening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
        </button>
        <textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              void sendMessage(draft);
            }
          }}
          maxLength={1_200}
          rows={1}
          placeholder="Ask why a level matters, or how a pattern formed…"
          aria-label="Ask the chart assistant"
          className="max-h-16 min-h-8 flex-1 resize-none rounded-md border border-border bg-background px-2.5 py-2 text-xs text-foreground outline-none placeholder:text-muted-foreground/70 focus:border-primary/60"
        />
        <button
          type="submit"
          disabled={pending || !draft.trim() || connection === "missing" || connection === "offline"}
          className="mb-0.5 rounded-md bg-primary p-2 text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-40"
          title="Send question"
          aria-label="Send question"
        >
          <Send className="h-4 w-4" />
        </button>
      </form>
      <div className="flex items-center justify-between gap-2 px-3 pb-1.5 text-[9px] text-muted-foreground">
        <span className={error ? "text-rose-500" : "truncate"} role={error ? "alert" : undefined}>
          {error || (connection === "missing"
            ? "Set OPENAI_API_KEY, OPENAI_MODEL, and AUTH_INTROSPECTION_URL in the AI server environment."
            : connection === "offline"
              ? "AI server not reachable. Start it with npm run ai:server, then try opening this layer again."
              : "Educational only—not trading advice. Chart data and questions go to the configured AI service.")}
        </span>
        <span className="hidden shrink-0 sm:inline">Voice input uses your browser speech service.</span>
      </div>
    </section>
  );
}
