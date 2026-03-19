import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "LightningWorks - Account",
  description: "Manage your LightningWorks gaming account. One account for all games.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Open+Sans:wght@400;600;700&display=swap" rel="stylesheet" />
      </head>
      <body className="min-h-full bg-[#0c0b0b] text-[#e4dad1] font-['Open_Sans']">
        {children}
      </body>
    </html>
  );
}
