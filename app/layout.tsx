import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Massing",
  description: "A cinematic real-time city simulator on real Toronto data.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </head>
      <body>{children}</body>
    </html>
  );
}
