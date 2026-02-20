import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import LayoutContent from "./components/LayoutContent"; // 기존 로직 컴포넌트
import AuthHydration from "@/components/AuthHydration"; // 우리가 만든 하이드레이션 컴포넌트

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "KS Logistics",
  description: "배송 관리 시스템 대시보드",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased bg-slate-50 text-slate-900`}>
        {/* 1. AuthHydration이 가장 먼저 브라우저 저장소의 로그인 정보를 복원합니다. */}
        <AuthHydration>
          {/* 2. 그 다음 기존의 LayoutContent(경로 감지 로직 등)가 실행됩니다. */}
          <LayoutContent>{children}</LayoutContent>
        </AuthHydration>
      </body>
    </html>
  );
}