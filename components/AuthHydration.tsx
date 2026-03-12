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
          // 1. 메타데이터에서 안전하게 값 추출 (기본값 설정)
          const meta = session.user.user_metadata || {};
          const user_name = meta.user_name || '이름없음';
          const user_id = meta.user_id || '';
          const user_center_meta = meta.user_center || '';
          const user_level = Number(meta.user_level || 0);

          // 2. 스토어(useAuthStore)의 User 인터페이스 규격에 완벽히 맞춤
          setAuth({
            id: session.user.id,
            email: session.user.email || '',
            user_name: user_name,       // userName -> user_name 으로 수정
            user_id: user_id,           // 추가 (Store 필수값)
            user_center: user_center || user_center_meta, // 기존 변수 혹은 메타데이터 사용
            user_level: user_level,     // 추가 (Store 필수값)
          }, user_role|| '001003');
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