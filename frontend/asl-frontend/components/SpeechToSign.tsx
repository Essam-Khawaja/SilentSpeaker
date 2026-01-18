import { useState, useRef, useEffect } from "react";
import { Mic, Volume2, Trash2 } from "lucide-react";

const API_BASE =
  process.env.NEXT_PUBLIC_SIGN_API_BASE || "http://localhost:8000";

type WebSpeechRecognition = any;

export default function SpeechToSign() {
  const [sentence, setSentence] = useState<string[]>([]);
  const [transcript, setTranscript] = useState<string>("");
  const [isListening, setIsListening] = useState<boolean>(false);

  // useEffect(() => {
  //   if (typeof window !== "undefined") {
  //     const SpeechRecognition =
  //       window.SpeechRecognition || window.webkitSpeechRecognition;

  //     if (SpeechRecognition) {
  //       recognitionRef.current = new SpeechRecognition();
  //       recognitionRef.current!.continuous = true;
  //       recognitionRef.current!.interimResults = true;

  //       recognitionRef.current!.onresult = (event) => {
  //         let finalTranscript = "";

  //         for (let i = event.resultIndex; i < event.results.length; i++) {
  //           const transcript = event.results[i][0].transcript;
  //           if (event.results[i].isFinal) {
  //             finalTranscript += transcript + " ";
  //           }
  //         }

  //         if (finalTranscript) {
  //           setTranscript((prev) => prev + finalTranscript);
  //           const letters = finalTranscript
  //             .toLowerCase()
  //             .split("")
  //             .filter((char) => /[a-z\s]/.test(char));
  //           setSentence((prev) => [...prev, ...letters]);
  //         }
  //       };

  //       recognitionRef.current!.onerror = () => setIsListening(false);
  //       recognitionRef.current!.onend = () => setIsListening(false);
  //     }
  //   }
  // }, []);

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

    if (isListening) {
      // recognitionRef.current!.stop();
    } else {
      // recognitionRef.current!.start();
      setTranscript("");
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
