'use client';

import { usePathname } from 'next/navigation';
import Navbar from './Navbar';

export default function LayoutContent({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  // 로그인과 회원가입, 로그인 변경 페이지에서는 Navbar를 아예 렌더링하지 않음
  //const isAuthPage = pathname === '/login' || pathname === '/signup' || pathname === '/reset-password';
  // 제한 페이지가 많아질 경우를 대비해 수정처리
  const AUTH_PAGES = ['/login', '/signup', '/reset-password'];
  const isAuthPage = AUTH_PAGES.includes(pathname);

  return (
    <>
      {!isAuthPage && <Navbar />}
      <main className={isAuthPage ? "" : "min-h-screen"}>
        {children}
      </main>
    </>
  );
}