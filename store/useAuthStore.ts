// ks-project/my-admin-web/store/useAuthStore.ts
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

interface AuthState {
  user: any | null;
  role: string | null;      // ks_users 테이블의 권한 정보 (예: '001001', '001004')
  isLoggedIn: boolean;
  setAuth: (user: any, role: string) => void;
  clearAuth: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      role: null,
      isLoggedIn: false,
      // 로그인 성공 시 사용자 정보와 권한을 저장하고 로그인 상태를 true로 변경
      setAuth: (user, role) => set({ 
        user, 
        role, 
        isLoggedIn: true 
      }),
      // 로그아웃 시 모든 정보를 초기화
      clearAuth: () => set({ 
        user: null, 
        role: null, 
        isLoggedIn: false 
      }),
    }),
    {
      name: 'ks-auth-storage', // 브라우저 로컬스토리지에 저장될 키 이름
      storage: createJSONStorage(() => localStorage), // 명시적으로 localStorage 사용 설정
    }
  )
);