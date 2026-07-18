import type { Metadata } from "next";
import { Geist, Geist_Mono, Inter } from "next/font/google";
import "./globals.css";
import { cn } from "@/lib/utils";
import { SocketProvider } from "@/components/socket-provider";
import { Toaster } from "@/components/ui/sonner";

const inter = Inter({subsets:['latin'],variable:'--font-sans'});

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "SoundSync - Real-time Synchronized Music Room",
  description: "Create synchronized rooms to listen to YouTube videos, playlists, or local audio files in perfect real-time sync.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={cn("h-full dark", "antialiased", geistSans.variable, geistMono.variable, "font-sans", inter.variable)}
      style={{ colorScheme: 'dark' }}
    >
      <body className="min-h-full flex flex-col bg-zinc-950 text-zinc-100">
        <SocketProvider>
          {children}
          <Toaster position="top-center" richColors theme="dark" />
        </SocketProvider>
      </body>
    </html>
  );
}

