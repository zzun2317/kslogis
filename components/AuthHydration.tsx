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
      // 1. Supabase 현재 세션 가져오기
      const { data: { session } } = await supabase.auth.getSession();
      
      if (session) {
        // 2. 세션이 있다면 저장소(sessionStorage)에서 권한 정보 확인
        const user_role = sessionStorage.getItem('user_role');
        const user_center = sessionStorage.getItem('user_center');
        const user_name = sessionStorage.getItem('user_name') || '사용자'; // driver_name

        if (!user_role) {
          const user = session.user;
          const user_role = user.user_metadata?.user_role;
          const user_center = user.user_metadata?.user_center;
          const user_name = user.user_metadata?.user_name;
        }

        if (user_role) {
          // 스토어에 데이터 복구 -> 이 작업이 완료되어야 메뉴가 뜹니다!
          setAuth({
            id: session.user.id,
            email: session.user.email,
            userName: user_name,
            user_center: user_center,
          }, user_role);
        } else {
          // 세션은 있는데 권한 정보가 없다면 다시 로그인 시키거나 정보를 새로 불러와야 함
          console.warn("세션은 존재하나 권한 정보가 없어 초기화합니다.");
          await supabase.auth.signOut();

          const authKeys = [
            'is_logged_in', 
            'user_role', 
            'user_id', 
            'user_center', 
            'driver_email' // 로그아웃 시 지워야 할 인증 데이터들
          ];
          
          authKeys.forEach(key => localStorage.removeItem(key));
          // localStorage.clear(); // 로그인 된 이메일 정보까 삭제 된다
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

  //  하이드레이션(데이터 복구)이 끝나기 전에는 아무것도 안 그리거나 로딩 바를 표시
  if (!isHydrated) return <div className="loading-screen">로딩 중...</div>;

  return <>{children}</>;
}