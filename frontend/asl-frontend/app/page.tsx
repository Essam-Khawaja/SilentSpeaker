// app/page.tsx
import ASLDetector from "../components/ASLDetector";

export default function Home() {
  return (
    <main className="min-h-screen bg-gradient-to-br from-purple-600 via-indigo-600 to-blue-600">
      <ASLDetector />
    </main>
  );
}
