## Inspiration

Communication is a fundamental human right, yet millions of Deaf and hard-of-hearing individuals face daily barriers when interacting with people who don’t know sign language. We were inspired by real stories from sign language users who struggle in everyday situations like ordering coffee, attending meetings, or having casual conversations — moments where real-time interpretation isn’t available or affordable.

This is a **systemic accessibility bias**: most environments are built **audio-first**, where spoken language is treated as the default and silence is treated as absence — even though sign language is a complete language.

We wanted to create something that bridges this gap instantly and respectfully. The vision was simple but powerful: what if anyone could understand sign language through their phone or computer, enabling communication **in real time**, at the point of need?

---

## What it does

**Silent Speak** is a real-time Sign Language translator that uses computer vision and machine learning to detect and interpret hand gestures instantly through a webcam. Users show their signs to the camera, and Silent Speak:

- Detects hand landmarks using MediaPipe’s computer vision pipeline
- Recognizes signs using a custom-trained neural network
- Translates signs to text in real time with visual feedback
- Builds sentences by stringing together detected signs
- Speaks aloud using text-to-speech, enabling voice communication for Deaf users
- Supports bidirectional communication as the long-term goal (sign ↔ text/speech)
- Runs fully in the browser for ML inference (privacy-first, low-latency)

## The application supports both alphabet letters and common words/phrases, with an interface that shows confidence and provides immediate feedback.

## How to use it

Silent Speak supports **two modes** of communication.

By default, the app opens in **Sign → Text/Speech** mode. You can switch anytime by clicking **Switch Mode**.

### Mode 1 (Default) — Sign → Text / Speech

1. Open the web app and allow **camera access** when prompted.
2. Show a supported sign clearly in front of the webcam.
3. The app displays the **predicted sign + confidence** in real time.
4. Detected signs are appended to form a sentence.
5. Enable **text-to-speech** to speak the translated output aloud.
6. Use **Clear/Reset** to start a new phrase.

### Mode 2 — Text / Speech → Sign

1. Click **Switch Mode** to change to **Text/Speech → Sign**.
2. Click the microphone button and **speak clearly**.
3. The app converts your speech into a **Sign Language output video**.
4. Replay the video or speak again to translate a new sentence.

---

## Who it’s for (Everyday Use)

Silent Speak is designed for both individuals and public-facing environments:

- **Deaf and hard-of-hearing users** who want smoother communication in daily interactions
- **Hearing users** who want to understand sign language in real time
- **Public service touchpoints** like student services, reception desks, clinics, libraries, and help kiosks

The goal is to support everyday moments — not just staged demos — where communication should be immediate and inclusive.

---

## Business Model & Sustainability

Silent Speak follows a **mission-driven, sustainable model**: it delivers accessibility as infrastructure while remaining financially viable to maintain, improve, and scale long-term.

### Adoption Considerations

Accessibility tools can face adoption friction — especially when cost and workflow changes are involved. Silent Speak reduces this by being lightweight to deploy and easy to pilot.

- **Institution-first pricing (not user-paid):** the primary customers are organizations (universities, clinics, public offices), so individuals access the service without personal payment.
- **Low integration overhead:** can run as a web app or be placed on kiosks/tablets at service points.
- **Pilot-friendly rollout:** start small (one desk or department), then expand after proving value.
- **Operational ROI:** reduces repeated communication breakdowns and delays when interpreters are unavailable.

### Sustainability

Silent Speak scales accessibility in a practical and ethical way.

- **Reduces interpreter bottlenecks (without replacing them):** supports routine, high-frequency interactions so interpreters remain available for high-stakes conversations.
- **Scales without linear cost growth:** once deployed, one system can support many interactions across multiple locations.
- **Improves over time:** coverage expands by growing vocabulary/phrases and supporting more sign language variants and datasets.
- **B2B funding supports long-term maintenance:** revenue enables hosting, performance improvements, and reliable support.

**Revenue Streams (B2B):**

- Institution licensing (SaaS)
- API access tiers for developers/platforms
- Custom deployments (kiosk mode, enterprise integrations)
- Accessibility compliance support (reporting/configuration where needed)


## Extra Credits:

