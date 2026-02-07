import type { Metadata } from "next";
import { Geist_Mono } from "next/font/google";
import "./globals.css";
import { Nav } from "@/components/Nav";

const mono = Geist_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "GriftFinder",
  description: "Follow the money. It's all public record.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className={`${mono.variable} font-mono antialiased bg-black text-green-400`}>
        <Nav />
        <main className="min-h-screen">{children}</main>
      </body>
    </html>
  );
}
