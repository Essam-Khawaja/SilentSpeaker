// App.jsx - Main component
"use client";

import { useState } from "react";
import Header from "../components/Header";
import SignToSpeech from "../components/SignToSpeech";
import SpeechToSign from "../components/SpeechToSign";

export default function ASLTranslator() {
  const [mode, setMode] = useState("sign-to-speech");
  const [fps, setFps] = useState(0);
  const [model, setModel] = useState(null);
  const [mediaPipeLoaded, setMediaPipeLoaded] = useState(false);

  return (
    <div className="min-h-screen bg-background">
      <Header
        mode={mode}
        setMode={setMode}
        fps={fps}
        model={model}
        mediaPipeLoaded={mediaPipeLoaded}
      />

      <main className="max-w-7xl mx-auto px-6 py-8">
        {mode === "sign-to-speech" ? (
          <SignToSpeech
          // setFps={setFps}
          // setModel={setModel}
          // setMediaPipeLoaded={setMediaPipeLoaded}
          />
        ) : (
          <SpeechToSign />
        )}
      </main>
    </div>
  );
}
