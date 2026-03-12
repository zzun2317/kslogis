// ks-project/my-admin-web/store/useAuthStore.ts
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

interface User {
  id: string;
  email: string;
  user_name: string;
  user_id: string;
  user_center: string;
  user_level: number; 
  [key: string]: any; // 기존 데이터 유지를 위한 확장성
}

interface AuthState {
  user: User | null;
  role: string | null;      // ks_users 테이블의 권한 정보 (예: '001001', '001004')
  isLoggedIn: boolean;
  setAuth: (user: User, role: string) => void;
  clearAuth: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      role: null,
      isLoggedIn: false,
      setAuth: (user, role) => set({ 
        user, 
        role, 
        isLoggedIn: true 
      }),
      clearAuth: () => set({ 
        user: null, 
        role: null, 
        isLoggedIn: false 
      }),
    }),
    {
      name: 'ks-auth-storage',
      // ✅ localStorage 대신 sessionStorage로 변경하세요!
      // 이렇게 하면 브라우저 탭이나 창을 닫을 때 데이터가 자동으로 삭제됩니다.
      storage: createJSONStorage(() => sessionStorage), 
    }
  )
);