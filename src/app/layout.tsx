import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Sleepy Crawler",
  description: "새벽 시간대 인터넷 커뮤니티의 이상하고 엉뚱한 글을 AI가 골라 보여줍니다.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko" className="h-full antialiased">
      <body className="min-h-full flex flex-col bg-slate-950 text-slate-100">{children}</body>
    </html>
  );
}
