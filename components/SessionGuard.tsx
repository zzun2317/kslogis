'use client';

import { useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { usePathname } from 'next/navigation';

export default function SessionGuard() {
  const pathname = usePathname();

  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (pathname === '/login' || pathname === '/') return;

      // 1. 공통 키 리스트 정의 (삭제할 항목들)
      const keysToRemove = [
        'is_logged_in',
        'user_email',
        'user_role',
        'user_name',
        'user_id',
        'user_center',
        'driver_email' // handleLogin에서 저장한 키 추가
      ];

      // 2. 개별 키 삭제 (루프 밖에서 안전하게)
      keysToRemove.forEach(key => localStorage.removeItem(key));

      // 3. Supabase 토큰 삭제
      Object.keys(localStorage).forEach(key => {
        if (key.includes('sb-') && key.includes('-auth-token')) {
          localStorage.removeItem(key);
        }
      });

      // 4. 세션스토리지 및 쿠키 정리
      sessionStorage.clear();
      
      const deleteCookie = (name: string) => {
        document.cookie = `${name}=; path=/; expires=Thu, 01 Jan 1970 00:00:01 GMT; path=/;`;
        document.cookie = `${name}=; path=/; expires=Thu, 01 Jan 1970 00:00:01 GMT; domain=${window.location.hostname}; path=/;`;
      };

      const targetCookies = ['sb-access-token', 'my-auth-token', 'sb-refresh-token'];
      targetCookies.forEach(deleteCookie);

      // 5. Supabase 로그아웃 (이건 비동기지만 최대한 시도)
      supabase.auth.signOut();

      // 브라우저 팝업 표시
      e.preventDefault();
      e.returnValue = '';
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [pathname]);

  return null;
}