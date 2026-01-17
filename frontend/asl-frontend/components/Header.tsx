// Header.jsx
import { Hand, ArrowLeftRight } from "lucide-react";

export default function Header({ mode, setMode, fps, model, mediaPipeLoaded }) {
  return (
    <header className="border-b border-border/50 backdrop-blur-sm bg-background/80 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center">
            <Hand className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-foreground tracking-tight">
              ASL Translator
            </h1>
            <p className="text-xs text-muted-foreground">
              {mode === "sign-to-speech" ? "Sign to Speech" : "Speech to Sign"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <button
            onClick={() => {
              setMode(
                mode === "sign-to-speech" ? "speech-to-sign" : "sign-to-speech",
              );
            }}
            className="flex items-center gap-2 px-4 py-2 bg-secondary text-secondary-foreground rounded-xl font-medium text-sm transition-all hover:bg-secondary/80"
          >
            <ArrowLeftRight className="w-4 h-4" />
            Switch Mode
          </button>
          <div className="flex items-center gap-4 text-sm">
            <div className="flex items-center gap-2">
              <div
                className={`w-2 h-2 rounded-full ${model ? "bg-emerald-500" : "bg-muted"}`}
              />
              <span className="text-muted-foreground">Model</span>
            </div>
            {mode === "sign-to-speech" && (
              <div className="flex items-center gap-2">
                <div
                  className={`w-2 h-2 rounded-full ${mediaPipeLoaded ? "bg-emerald-500" : "bg-muted"}`}
                />
                <span className="text-muted-foreground">Camera</span>
              </div>
            )}
            <div className="text-muted-foreground font-mono text-xs bg-secondary px-2 py-1 rounded">
              {fps} FPS
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
