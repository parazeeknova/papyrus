import type { Metadata } from "next";
import { Nunito_Sans } from "next/font/google";
// biome-ignore lint/suspicious/noTsIgnore: vercel build fix for css imports
// @ts-ignore - this is a css file, but next doesn't know how to handle it
import "./globals.css";
import { TooltipProvider } from "@/web/components/ui/tooltip";
import { cn } from "@/web/lib/utils";

const nunitoSans = Nunito_Sans({ variable: "--font-sans" });
export const metadata: Metadata = {
  title: "Papyrus",
  description: "Spreadsheets, live!",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html className={cn("font-sans", nunitoSans.variable)} lang="en">
      <body className={`${nunitoSans.variable} antialiased`}>
        <TooltipProvider>{children}</TooltipProvider>
      </body>
    </html>
  );
}
