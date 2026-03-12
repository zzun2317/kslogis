'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/useAuthStore';

export default function AuthHydration({ children }: { children: React.ReactNode }) {
  const [isHydrated, setIsHydrated] = useState(false);
  const setAuth = useAuthStore((state) => state.setAuth);
  const clearAuth = useAuthStore((state) => state.clearAuth);

  useEffect(() => {
    const initAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (session) {
        // ✨ 중요: sessionStorage보다 session.user의 최신 메타데이터를 우선 사용합니다.
        const meta = session.user.user_metadata || {};
        const metaRole = meta.user_role;
        const storageRole = sessionStorage.getItem('user_role');
        const storageCenter = sessionStorage.getItem('user_center');
        const storageLevel = sessionStorage.getItem('user_level');
        const finalLevel = storageLevel ? Number(storageLevel) : Number(meta.user_level || 0);
        // const user_role = meta.user_role || sessionStorage.getItem('user_role');
        

        if (storageRole) {
          // 1. 스토어 업데이트 (메뉴 렌더링의 핵심)
          setAuth({
            id: session.user.id,
            email: session.user.email || '',
            user_name: meta.user_name || '사용자',
            user_id: meta.user_id || '',
            user_center: storageCenter || '',
            user_level: finalLevel,
          }, storageRole);

          // 2. sessionStorage와 동기화 (새로고침 대비)
          if (!sessionStorage.getItem('user_role')) {
            sessionStorage.setItem('user_role', storageRole);
            sessionStorage.setItem('user_name', meta.user_name || '');
            sessionStorage.setItem('user_level', String(meta.user_level || 0));
          }
        } else {
          // 권한 정보가 아예 없는 경우
          await supabase.auth.signOut();
          sessionStorage.clear();
          clearAuth();
          window.location.href = '/login';
          return;
        }
      } else {
        clearAuth();
      }
      setIsHydrated(true);
    };

    initAuth();
  }, [setAuth, clearAuth]);

  if (!isHydrated) return <div className="loading-screen">메뉴 구성 중...</div>;

  return <>{children}</>;
}