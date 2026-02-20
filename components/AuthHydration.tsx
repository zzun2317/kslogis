'use client';

import { useEffect, useState } from 'react';

export default function AuthHydration({ children }: { children: React.ReactNode }) {
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    // 클라이언트 사이드 렌더링이 시작되면 true로 변경
    setIsHydrated(true);
  }, []);

  // 스토어 데이터가 브라우저와 동기화되기 전까지는 렌더링을 잠시 멈춤
  if (!isHydrated) return null; 

  return <>{children}</>;
}