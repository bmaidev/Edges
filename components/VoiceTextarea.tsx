"use client";

import { useEffect, useRef, useState } from "react";
import { Mic, MicOff } from "lucide-react";

// A textarea with a big mic button. Uses the Web Speech API for dictation,
// streaming interim transcripts into the value. Falls back to text-only with a
// small notice when the API is unsupported (e.g. some desktop browsers).

type SpeechRecognitionType = any;

function getRecognitionCtor(): SpeechRecognitionType | null {
  if (typeof window === "undefined") return null;
  const w = window as any;
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

export function VoiceTextarea({
  value,
  onChange,
  placeholder,
  disabled = false,
}: {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  const [listening, setListening] = useState(false);
  const [supported, setSupported] = useState(true);
  const [denied, setDenied] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionType | null>(null);
  // Text committed before the current dictation run started, so interim
  // results replace cleanly rather than duplicating.
  const baseTextRef = useRef("");

  useEffect(() => {
    setSupported(getRecognitionCtor() !== null);
    return () => {
      try {
        recognitionRef.current?.stop();
      } catch {
        // ignore
      }
    };
  }, []);

  function startListening() {
    const Ctor = getRecognitionCtor();
    if (!Ctor) {
      setSupported(false);
      return;
    }

    const recognition = new Ctor();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-AU";

    baseTextRef.current = value ? value.replace(/\s*$/, "") + " " : "";

    recognition.onresult = (event: any) => {
      let transcript = "";
      for (let i = 0; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript;
      }
      onChange((baseTextRef.current + transcript).trimStart());
    };

    recognition.onerror = (event: any) => {
      // Distinguish a blocked mic from a normal stop so we can explain it.
      if (event?.error === "not-allowed" || event?.error === "service-not-allowed") {
        setDenied(true);
      }
      setListening(false);
    };
    recognition.onend = () => {
      setListening(false);
    };

    setDenied(false);
    recognition.start();
    recognitionRef.current = recognition;
    setListening(true);
  }

  function stopListening() {
    try {
      recognitionRef.current?.stop();
    } catch {
      // ignore
    }
    setListening(false);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-center">
        <button
          type="button"
          aria-label={listening ? "Stop dictation" : "Start dictation"}
          aria-pressed={listening}
          disabled={disabled || !supported}
          onClick={listening ? stopListening : startListening}
          className={`flex h-20 w-20 items-center justify-center rounded-full transition-all duration-150 disabled:opacity-30 ${
            listening
              ? "bg-accent text-bg animate-pulseSoft"
              : "bg-surface text-accent border border-border active:scale-95"
          }`}
        >
          {listening ? <MicOff size={32} /> : <Mic size={32} />}
        </button>
      </div>

      <p className="text-center text-xs text-muted">
        {!supported
          ? "Voice isn't supported on this browser — just type below."
          : denied
            ? "Microphone access was blocked — allow it in your browser, or just type below."
            : listening
              ? "Listening… tap to stop."
              : "Tap the mic to dictate, or type below."}
      </p>

      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        rows={5}
        className="w-full resize-none rounded-xl border border-border bg-surface px-4 py-3 text-base text-white placeholder:text-muted/80 focus:border-accent focus:outline-none disabled:opacity-50"
      />
    </div>
  );
}
