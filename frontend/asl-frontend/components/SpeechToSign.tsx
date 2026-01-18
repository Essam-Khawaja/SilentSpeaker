"use client";

import { useEffect, useRef, useState } from "react";
import { Mic, Volume2, Trash2 } from "lucide-react";

const API_BASE =
  process.env.NEXT_PUBLIC_SIGN_API_BASE ||
  "http://localhost:8000" ||
  "https://silentspeaker.onrender.com";

type WebSpeechRecognition = any;

export default function SpeechToSign() {
  const [sentence, setSentence] = useState<string[]>([]);
  const [transcript, setTranscript] = useState<string>("");
  const [isListening, setIsListening] = useState<boolean>(false);

  const recognitionRef = useRef<WebSpeechRecognition | null>(null);

  const transcriptRef = useRef<string>("");

  // When we stop listening, we want to generate video AFTER onend fires
  const shouldGenerateOnEndRef = useRef<boolean>(false);

  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [translatedWords, setTranslatedWords] = useState<string[]>([]);
  const [skippedWords, setSkippedWords] = useState<string[]>([]);
  const [isGenerating, setIsGenerating] = useState<boolean>(false);

  const [statusMsg, setStatusMsg] = useState<string>("");
  const [errorMsg, setErrorMsg] = useState<string>("");

  async function generateSignVideo(text: string) {
    const cleaned = (text || "").trim();

    if (!cleaned) {
      setStatusMsg("Nothing to translate yet.");
      setErrorMsg("");
      setIsGenerating(false);
      return;
    }

    setIsGenerating(true);
    setStatusMsg("Translating to sign video...");
    setErrorMsg("");
    setVideoUrl(null);
    setTranslatedWords([]);
    setSkippedWords([]);

    try {
      const res = await fetch(
        `${API_BASE}/translate?text=${encodeURIComponent(cleaned)}`,
        { method: "GET" },
      );

      if (!res.ok) {
        throw new Error(`Backend error: ${res.status} ${res.statusText}`);
      }

      const data = await res.json();

      const tw: string[] = data?.translated_words || [];
      const sw: string[] = data?.skipped_words || [];

      setTranslatedWords(tw);
      setSkippedWords(sw);

      if (data?.success && data?.video_url) {
        // cache-bust so new mp4 always loads
        const url = `${API_BASE}${data.video_url}?t=${Date.now()}`;
        setVideoUrl(url);
        setStatusMsg("Video generated ✅");
        setErrorMsg("");
      } else {
        setVideoUrl(null);
        setStatusMsg("No video generated.");
        setErrorMsg(data?.error || "No translatable words found.");
      }
    } catch (e: any) {
      console.error(e);
      setVideoUrl(null);
      setStatusMsg("Translation failed ❌");
      setErrorMsg(String(e?.message || e));
    } finally {
      setIsGenerating(false);
    }
  }

  useEffect(() => {
    if (typeof window === "undefined") return;

    const SpeechRecognition =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setErrorMsg("SpeechRecognition not supported in this browser.");
      return;
    }

    const rec: WebSpeechRecognition = new SpeechRecognition();
    rec.continuous = true;
    rec.interimResults = true;

    rec.onresult = (event: any) => {
      let finalTranscript = "";

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const chunk = event.results[i][0].transcript as string;
        if (event.results[i].isFinal) finalTranscript += chunk + " ";
      }

      if (!finalTranscript) return;

      // Update ref immediately (no React delay)
      transcriptRef.current = (
        transcriptRef.current +
        " " +
        finalTranscript
      ).trim();
      setTranscript(transcriptRef.current);
    };

    rec.onerror = (e: any) => {
      setIsListening(false);
      setStatusMsg("Stopped listening.");
      setErrorMsg(e?.error ? `Mic error: ${e.error}` : "");
      shouldGenerateOnEndRef.current = false;
    };

    rec.onend = async () => {
      // Recognition ends asynchronously; generate here if we requested it.
      setIsListening(false);

      if (shouldGenerateOnEndRef.current) {
        shouldGenerateOnEndRef.current = false;

        // tiny delay lets some browsers flush last final chunk
        await new Promise((r) => setTimeout(r, 250));

        const textToTranslate = (
          transcriptRef.current ||
          transcript ||
          ""
        ).trim();
        console.log("SENDING TO BACKEND:", textToTranslate);

        await generateSignVideo(textToTranslate);
      }
    };

    recognitionRef.current = rec;

    // cleanup
    return () => {
      try {
        rec.onresult = null;
        rec.onerror = null;
        rec.onend = null;
        rec.stop?.();
      } catch {}
    };
  }, []);

  const startListening = () => {
    if (!recognitionRef.current) return;

    // Reset state
    setTranscript("");
    transcriptRef.current = "";
    setSentence([]);

    setVideoUrl(null);
    setTranslatedWords([]);
    setSkippedWords([]);
    setStatusMsg("");
    setErrorMsg("");

    shouldGenerateOnEndRef.current = false;

    recognitionRef.current.start();
    setIsListening(true);
  };

  const stopListeningAndGenerate = () => {
    if (!recognitionRef.current) return;

    // Tell onend() to generate
    shouldGenerateOnEndRef.current = true;

    setStatusMsg("Stopping… preparing translation.");
    setErrorMsg("");

    recognitionRef.current.stop();
    setIsListening(false);
  };

  const toggleListening = () => {
    if (isGenerating) return;

    if (isListening) stopListeningAndGenerate();
    else startListening();
  };

  const clearAll = () => {
    setSentence([]);
    setTranscript("");
    transcriptRef.current = "";

    setVideoUrl(null);
    setTranslatedWords([]);
    setSkippedWords([]);

    setStatusMsg("");
    setErrorMsg("");
  };

  const speakOut = () => {
    const text = (transcriptRef.current || transcript || "").trim();
    if ("speechSynthesis" in window && text.length > 0) {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 0.9;
      window.speechSynthesis.speak(utterance);
    }
  };

  return (
    <div className="grid lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2 space-y-6">
        <div className="bg-card border border-border rounded-2xl p-8">
          <div className="text-center mb-8">
            <div
              className={`w-24 h-24 mx-auto mb-6 rounded-full flex items-center justify-center ${
                isListening ? "bg-red-500/20 animate-pulse" : "bg-primary/20"
              }`}
            >
              <Mic
                className={`w-12 h-12 ${
                  isListening ? "text-red-500" : "text-primary"
                }`}
              />
            </div>

            <button
              onClick={toggleListening}
              disabled={isGenerating}
              className={`px-8 py-4 rounded-xl font-semibold text-lg transition-all ${
                isListening
                  ? "bg-red-600 hover:bg-red-700 text-white"
                  : "bg-primary hover:opacity-90 text-primary-foreground"
              } ${isGenerating ? "opacity-60 cursor-not-allowed" : ""}`}
            >
              {isListening ? "Stop Listening" : "Start Speaking"}
            </button>
          </div>

          {transcript && (
            <div className="bg-secondary/50 rounded-xl p-6 border border-border/50">
              <p className="text-sm text-muted-foreground mb-2">
                Live Transcript:
              </p>
              <p className="text-xl text-foreground">{transcript}</p>
            </div>
          )}
        </div>

        <div className="bg-card border border-border rounded-2xl p-6">
          <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-4">
            Generated Signs
          </h3>

          {(statusMsg || errorMsg) && (
            <div className="mb-3">
              {statusMsg && (
                <p className="text-sm text-muted-foreground">{statusMsg}</p>
              )}
              {errorMsg && (
                <p className="text-sm text-red-400 mt-1">{errorMsg}</p>
              )}
            </div>
          )}

          <div className="bg-secondary/50 rounded-xl p-4 mb-4 border border-border/50">
            {isGenerating ? (
              <p className="text-muted-foreground">Generating video...</p>
            ) : videoUrl ? (
              <div className="space-y-3">
                <video
                  key={videoUrl}
                  src={videoUrl}
                  controls
                  autoPlay
                  playsInline
                  className="w-full rounded-xl"
                />
                <p className="text-xs text-muted-foreground break-all">
                  Video URL: {videoUrl}
                </p>
              </div>
            ) : (
              <p className="text-muted-foreground">
                Stop listening to generate a stitched sign video.
              </p>
            )}
          </div>

          <div className="space-y-2 mb-4">
            <p className="text-sm text-muted-foreground">
              <span className="font-medium text-foreground">Translated:</span>{" "}
              {translatedWords.length ? translatedWords.join(", ") : "None"}
            </p>
            <p className="text-sm text-muted-foreground">
              <span className="font-medium text-foreground">Skipped:</span>{" "}
              {skippedWords.length ? skippedWords.join(", ") : "None"}
            </p>

            {sentence.length > 0 && (
              <p className="text-xs text-muted-foreground">
                (debug letters): {sentence.join("")}
              </p>
            )}
          </div>

          <div className="flex gap-2">
            <button
              onClick={clearAll}
              className="flex items-center gap-2 px-4 py-2.5 bg-secondary text-secondary-foreground rounded-xl font-medium text-sm transition-all hover:bg-destructive/20 hover:text-destructive"
            >
              <Trash2 className="w-4 h-4" />
              Clear
            </button>

            <button
              onClick={speakOut}
              disabled={!transcript || transcript.trim().length === 0}
              className="flex items-center gap-2 px-4 py-2.5 bg-accent/20 text-accent rounded-xl font-medium text-sm transition-all hover:bg-accent/30 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Volume2 className="w-4 h-4" />
              Speak
            </button>
          </div>
        </div>
      </div>

      <div className="space-y-6">
        <div className="bg-card border border-border rounded-2xl p-6">
          <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-4">
            How to Use
          </h3>
          <ul className="space-y-3 text-sm text-muted-foreground">
            <li className="flex gap-3">
              <span className="text-primary">01</span>
              <span>Click "Start Speaking" button</span>
            </li>
            <li className="flex gap-3">
              <span className="text-primary">02</span>
              <span>Allow microphone access</span>
            </li>
            <li className="flex gap-3">
              <span className="text-primary">03</span>
              <span>Speak clearly into your microphone</span>
            </li>
            <li className="flex gap-3">
              <span className="text-primary">04</span>
              <span>Click "Stop Listening" to generate the sign video</span>
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
