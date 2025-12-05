import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import Warnings from "./components/warnings";
import { assistantId } from "./assistant-config";

// NEW
import { ThemeProvider } from "next-themes";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Adam AI – Systemic Guide",
  description:
    "Have a text or voice conversation with Adam AI about money, work, care, and the systems shaping your life.",
  icons: {
    icon: "/openai.svg",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    // ⬇️ ADD THIS: suppressHydrationWarning + THEME ATTRIBUTE
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* ElevenLabs Voice Widget script */}
        
      </head>

      {/*
        ⬇️ WRAP THE ENTIRE BODY WITH ThemeProvider
        NOTHING ELSE CHANGES
      */}
      <body className={inter.className}>
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          enableSystem={false}
        >
          <div className="min-h-screen">
            {assistantId ? children : <Warnings />}
          </div>
        </ThemeProvider>
      </body>
    </html>
  );
}
