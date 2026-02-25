'use client'
// import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import LayoutContent from "./components/LayoutContent"; // 기존 로직 컴포넌트
import AuthHydration from "@/components/AuthHydration"; // 우리가 만든 하이드레이션 컴포넌트
import SessionGuard from '@/components/SessionGuard';
import { useAuthStore } from '@/store/useAuthStore';
import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// export const metadata: Metadata = {
//   title: "KS Logistics",
//   description: "배송 관리 시스템",
// };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const [isInitialized, setIsInitialized] = useState(false);
  const { user, role } = useAuthStore();
  const [loading, setLoading] = useState(true);
  const pathname = usePathname();
  const router = useRouter();
  
  useEffect(() => {
    // 앱이 처음 켜질 때 세션 확인이 끝날 때까지 화면을 안 보여줌
    const check = async () => {
      
      // 로컬스토리지나 세션 확인 로직...
      setIsInitialized(true);
    };
    check();
  }, []);
  // if (!isInitialized) {
  if (!isInitialized) {  
    return (
      <html lang="ko">
        <body className="bg-white" /> 
      </html>
    );
  }
  return (
    <html lang="ko" suppressHydrationWarning>
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased bg-slate-50 text-slate-900`}>
        {/* 1. AuthHydration이 가장 먼저 브라우저 저장소의 로그인 정보를 복원합니다. */}
        <AuthHydration>
          {/* 2. 그 다음 기존의 LayoutContent(경로 감지 로직 등)가 실행됩니다. */}
          <LayoutContent>
            <SessionGuard />
            {children}

          </LayoutContent>
        </AuthHydration>
      </body>
    </html>
  );
}

// export default function RootLayout({ children }: { children: React.ReactNode }) {
//   return (
//     <html lang="ko">
//       <body>
//         {/* ✅ 브라우저 종료 감시자를 여기에 배치 */}
//         <SessionGuard />
//         {children}
//       </body>
//     </html>
//   );
// }