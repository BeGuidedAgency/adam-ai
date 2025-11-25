import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import Warnings from "./components/warnings";
import { assistantId } from "./assistant-config";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Adam AI – Systemic Guide",
  description:
    "Have a text or voice conversation with Adam AI about money, work, care, and the systems shaping your life.",
  icons: {
    icon: "/openai.svg", // can swap later for an Adam logo
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        {/* ElevenLabs Voice Widget script */}
        <script
          src="https://unpkg.com/@elevenlabs/convai-widget-embed"
          async
          type="text/javascript"
        />
      </head>
      <body className={inter.className}>
        {/* Main app content – your Magic UI page.tsx */}
        <div className="min-h-screen">
          {assistantId ? children : <Warnings />}
        </div>

        {/* ElevenLabs widget element (Adam voice button) */}
        <div
          dangerouslySetInnerHTML={{
            __html:
              '<elevenlabs-convai agent-id="agent_8701k9wp90h8fxdbrqcnbpvd26vz" style="position: fixed; bottom: 24px; right: 24px; z-index: 9999;"></elevenlabs-convai>',
          }}
        />
      </body>
    </html>
  );
}
