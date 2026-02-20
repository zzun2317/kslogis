// hook/useAuth.ts 수정본
import { useAuthStore } from '@/store/useAuthStore';
import { useMemo, useEffect } from 'react';
import { useRouter } from 'next/navigation';

export const useAuth = () => {
  // 1. 스토어에서 user와 role을 각각 가져옵니다.
  const user = useAuthStore((state) => state.user);
  const storedRole = useAuthStore((state) => state.role); // 추가

  const router = useRouter();

  const ROLE_CODE = {
    SUPERADMIN: '001001',
    ADMIN: '001002',
    USER: '001003',
    DRIVER: '001004', 
    GUEST: '001005',
  };

  const authInfo = useMemo(() => {
    // 2. 이제 user.user_role이 아니라 스토어의 role을 사용합니다.
    const role = storedRole || ''; 
    const rawCenter = user?.user_center || ''; // user 객체 안에 center가 있는지 확인 필요

    const isSuperAdmin = role === ROLE_CODE.SUPERADMIN;
    const isAdmin = role === ROLE_CODE.ADMIN;
    const isUser = role === ROLE_CODE.USER;
    const isDriver = role === ROLE_CODE.DRIVER;
    const isGuest = role === ROLE_CODE.GUEST;

    const userCenterList: string[] = typeof rawCenter === 'string' 
      ? rawCenter.split(',').map((c: string) => c.trim()).filter(Boolean) 
      : [];

    const canAccessWeb = user && !isDriver; 

    return {
      user: { ...user, user_role: role }, // page.tsx에서 user.user_role을 쓰므로 이렇게 합쳐줍니다.
      roleCode: role,
      userCenter: rawCenter, 
      userCenterList,
      isSuperAdmin,
      isAdmin,
      isUser,
      isLocalManager: isUser,        
      isDriver,
      isGuest,
      isMaster: isSuperAdmin || isAdmin,
      canEdit: isSuperAdmin || isAdmin || isUser,
      canAccessWeb
    };
  }, [user, storedRole]); // storedRole 의존성 추가
 
  return authInfo;
};