import { Inter } from "next/font/google";
import "./globals.css";
import Warnings from "./components/warnings";
import { assistantId } from "./assistant-config";

const inter = Inter({ subsets: ["latin"] });

export const metadata = {
  title: "Assistants API Quickstart",
  description: "A quickstart template using the Assistants API with OpenAI",
  icons: {
    icon: "/openai.svg",
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        {/* ElevenLabs Voice Widget Script */}
        <script
          src="https://unpkg.com/@elevenlabs/convai-widget-embed"
          async
          type="text/javascript"
        ></script>
      </head>
      <body className={inter.className}>
        {assistantId ? children : <Warnings />}
        <img className="logo" src="/openai.svg" alt="OpenAI Logo" />

        {/* ElevenLabs Voice Widget Button */}
        <elevenlabs-convai
          agent-id="agent_8701k9wp90h8fxdbrqcnbpvd26vz"
          style={{
            position: "fixed",
            bottom: "24px",
            right: "24px",
            zIndex: 9999,
          }}
        ></elevenlabs-convai>
      </body>
    </html>
  );
}
