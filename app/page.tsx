'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/useAuthStore';
import { useRouter } from 'next/navigation';
import DeliveryStatusChart from './components/DeliveryStatusChart';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, LabelList } from 'recharts';

export default function DashboardPage() {
  const router = useRouter();
  const { user, isLoggedIn } = useAuthStore();
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [drivers, setDrivers] = useState<any[]>([]); 
  const [rawData, setRawData] = useState<any[]>([]); // 대시보드 원본 데이터 상태
  const [selectedDriverEmail, setSelectedDriverEmail] = useState<string>('all');
  // 오늘 날짜 구하기 (로컬 타임존 기준)
  const today = useMemo(() => {
    const now = new Date();
    const offset = now.getTimezoneOffset() * 60000;
    return new Date(now.getTime() - offset).toISOString().split('T')[0];
  }, []);
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [deliveries, setDeliveries] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  
  const [selectedAddress, setSelectedAddress] = useState<string | null>(null);
  const [isMapOpen, setIsMapOpen] = useState(false);
  const [weeklyData, setWeeklyData] = useState<any[]>([]);
  const [weekRaw, setWeekRaw] = useState<any[]>([]);
  const [commonCodes, setCommonCodes] = useState<any[]>([]);
  const [driverStats, setDriverStats] = useState<any[]>([]);

  // 물류사별 주간 물량 집계
  const weeklyCenterStats = useMemo(() => {
    // 1. weekRaw 데이터를 물류사 코드로 그룹핑 및 합산
    const centerMap = weekRaw.reduce((acc: any, cur) => {
      const centerCode = cur.cust_devcenter || 'unknown';
      acc[centerCode] = (acc[centerCode] || 0) + 1;
      return acc;
    }, {});

    // 공통 코드 정보를 참조하여 '코드'를 '명칭'으로 변환 (ks_common 참조)
    // ※ commonCodes는 공통코드 004번을 미리 담아둔 상태라고 가정합니다.
    return Object.entries(centerMap).map(([code, count]) => {
      const centerInfo = commonCodes.find(c => c.comm_ccode === code);
      return {
        centerName: centerInfo ? centerInfo.comm_text1 : `미지정(${code})`,
        orderCount: count
      };
    }); // 수량 많은 순 정렬
  }, [weekRaw, commonCodes]);

  const fetchDashboardData = useCallback(async (today: string, commonCodes: any[]) => {
    setLoading(true);
    try {
      // (A) 오늘 현황 요약 데이터
      const { data: rawData } = await supabase
        .from('view_delivery_status_summary')
        .select('*')
        .eq('cust_devdate', today);
      setRawData(rawData || []);

      // (B) 기사 정보 및 센터별 기사 수 집계
      const { data: driverData } = await supabase.from('ks_driver').select('driver_center');
      if (driverData) {
        const driverCounts = driverData.reduce((acc: any, cur) => {
          const center = cur.driver_center || 'unknown';
          acc[center] = (acc[center] || 0) + 1;
          return acc;
        }, {});

        const processedDrivers = Object.entries(driverCounts).map(([code, count]) => {
          const centerInfo = commonCodes.find(c => c.comm_ccode === code);
          return {
            centerName: centerInfo ? centerInfo.comm_text1 : `미지정(${code})`,
            driverCount: count
          };
        });
        setDriverStats(processedDrivers);
      }
    } catch (err) {
      console.error('대시보드 로드 실패:', err);
    } finally {
      setLoading(false);
    }
  }, []); // FetchDashboardData

  useEffect(() => {
    // commonCodes가 실제로 존재할 때만 실행되도록 보장
    if (!isAuthLoading && isLoggedIn && commonCodes.length > 0) {
      fetchDashboardData(today, commonCodes);
    }
  }, [isAuthLoading, isLoggedIn, today, commonCodes, fetchDashboardData]);

  // 1. [인증 체크 및 초기화]
  useEffect(() => {
    const initApp = async () => {
      if (isLoggedIn === undefined) return;
      console.log("📍 [Page Step 1] 메인 페이지 인증 확인 시작...");
      try {
        const { data: { session } } = await supabase.auth.getSession();
        // (1) 로컬스토리지 데이터 확인 (가장 먼저 수행)
        const savedEmail = localStorage.getItem('user_email'); // driver_email
        const savedRole = localStorage.getItem('user_role');
        const isLoggedIn = localStorage.getItem('is_logged_in');

        console.log("📍 [Page Step 2] 로컬 정보:", { savedEmail, savedRole, isLoggedIn });
        if (
          !savedEmail || !savedRole
        ) {
          console.warn("❌ 인증 정보가 누락되어 로그인 페이지로 이동");
          window.location.href = '/login';
          return;
        }
        // 🔥 [추가 로직] Navbar와 공유하기 위해 스토어 및 세션스토리지 업데이트
        if (session && savedRole) {
          // 1. Zustand 스토어 업데이트 (Navbar가 이걸 보고 있음)
          useAuthStore.getState().setAuth(session.user, savedRole);
          
          // 2. 세션스토리지 업데이트 (Navbar의 fetchDynamicMenus 보조용)
          if (!sessionStorage.getItem('user_role')) {
            sessionStorage.setItem('user_role', savedRole);
            sessionStorage.setItem('user_uuid', session.user.id);
          }
        }

        // (2) Supabase 세션 확인
        // const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        console.log("📍 [Page Step 3] Supabase 세션 여부:", !!session);

        // [핵심 로직 수정] 
        // if (!session || isLoggedIn !== 'true') {
        //   console.warn("❌ 인증 만료 또는 창 새로고침 감지 -> 로그인으로 이동");
        //   window.location.href = '/login';
        //   return;
        // }

        // (3) 권한에 따른 초기 필터 설정
        if (savedEmail && (savedRole !== 'admin' && savedRole !== 'user' && savedRole !== '001001')) {
          console.log("📍 [Page Step 4] 기사 권한 감지 - 본인 데이터로 고정");
          setSelectedDriverEmail(savedEmail);
        }

        // (4) 인증 통과 처리
        console.log("✅ [Page Step 5] 인증 통과! 로딩 해제");
        setIsAuthLoading(false);

        // 최근 7일 일자계산
        const labels = [];
          for (let i = 6; i >= 0; i--) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            labels.push(d.toISOString().split('T')[0]);
          }

        const { data: weekRaw, error: weekErr } = await supabase
          .from('ks_devcustm')
          .select('cust_devdate, cust_ordno, cust_devcenter')
          .gte('cust_devdate', labels[0]) // 7일 전부터
          .lte('cust_devdate', labels[6]); // 오늘까지

        if (weekErr) throw weekErr;

        setWeekRaw(weekRaw || []);

        // 날짜별로 건수 집계 (요일 매핑 포함)
        const dayNames = ['일', '월', '화', '수', '목', '금', '토'];
        const processedWeekly = labels.map(date => {
          const count = weekRaw?.filter(item => item.cust_devdate === date).length || 0;
          const dayNum = new Date(date).getDay();
          return {
            date: date.substring(5), // '02-22' 형식
            day: dayNames[dayNum],
            count: count
          };
        });

        setWeeklyData(processedWeekly);

        const { data: codeData, error: codeErr } = await supabase
          .from('ks_common')
          .select('comm_ccode, comm_text1')
          .eq('comm_mcode', '004'); // 물류센터 코드

        const codes = codeData || [];
        setCommonCodes(codes);

        fetchDashboardData(today, codes);
        
        // (5) 기사 목록 로드
        const { data: driverData } = await supabase
          .from('ks_driver')
          .select('driver_email, driver_name')
          .order('driver_name', { ascending: true });
        
        if (driverData) setDrivers(driverData);
      } catch (err) {
        console.error("❌ 초기 로딩 에러:", err);
        window.location.href = '/login';
      }
    };

    initApp();
  }, [today]);

  // 대시보드 데이터 처리 시작
  // 2. 1번 항목을 위한 전체 합산 가공 (상태별)
	const totalStats = useMemo(() => {
    return rawData.reduce((acc: any[], cur) => {
      const existing = acc.find(item => item.name === cur.status_name);
      if (existing) {
        existing.value += cur.count;
      } else {
        acc.push({ 
          name: cur.status_name, 
          value: Number(cur.count), 
          color: cur.status_color 
        });
      }
      return acc;
    }, []);
  }, [rawData]);

  // 2번: 물류사별 현황 가공
  const centerStats = useMemo(() => {
    // 1. 데이터를 물류사(center_name) 기준으로 그룹핑
    const grouped = rawData.reduce((acc: any, cur) => {
      const centerName = cur.center_name || '미지정';
      
      if (!acc[centerName]) {
        acc[centerName] = [];
      }
      
      // 해당 물류사 배열에 상태 데이터 추가
      acc[centerName].push({
        name: cur.status_name,
        value: Number(cur.count),
        color: cur.status_color
      });
      
      return acc;
    }, {});

    // 2. { name: '물류사명', data: [차트데이터] } 형태로 변환
    return Object.entries(grouped).map(([name, data]) => ({
      name,
      data: data as any[]
    }));
  }, [rawData]);

  // 대시보드 데이터 처리 완료

  const handleLogout = async () => {
    if (!confirm("로그아웃 하시겠습니까?")) return;
  
    console.log("📍 [로그아웃] 모든 흔적 삭제 시작...");
  
    try {
      // 1. Supabase 공식 로그아웃
      await supabase.auth.signOut();
  
      // 2. 로컬스토리지 & 세션스토리지 비우기
      localStorage.clear();
      sessionStorage.clear();
  
      // 3. 쿠키 완전 삭제 함수
      const deleteCookie = (name: string) => {
        // 일반 삭제
        document.cookie = name + '=; expires=Thu, 01 Jan 1970 00:00:01 GMT; path=/;';
        // 도메인 포함 삭제 (localhost용)
        document.cookie = name + '=; expires=Thu, 01 Jan 1970 00:00:01 GMT; path=/; domain=' + window.location.hostname + ';';
        // 혹시 모를 닷(.) 도메인 삭제
        document.cookie = name + '=; expires=Thu, 01 Jan 1970 00:00:01 GMT; path=/; domain=.localhost;';
      };
  
      // 우리가 만든 쿠키와 Supabase 쿠키 모두 삭제
      const targetCookies = ['sb-access-token', 'my-auth-token', 'sb-refresh-token'];
      targetCookies.forEach(deleteCookie);
  
      console.log("✅ [로그아웃] 쿠키 청소 완료. 이동합니다.");
  
      // 4. 즉시 로그인 페이지로 강제 이동 (replace 대신 href로 시도하여 히스토리 갱신)
      window.location.href = '/login';
      
    } catch (err) {
      console.error("로그아웃 실패:", err);
      window.location.href = '/login';
    }
  };
  
  // 🚀 최우선 순위: 인증 대기 화면
  if (isAuthLoading) {
    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center">
        <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-4"></div>
        <p className="font-black text-slate-800 text-lg animate-pulse">시스템 보안 확인 중...</p>
      </div>
    );
  }

  // 🚀 추가 안전장치: 인증이 실패하여 리다이렉트 중일 때는 null 반환
  if (!isLoggedIn && typeof window !== 'undefined') {
    return null; 
  }

  return (
    <main className="p-6 bg-gray-50 min-h-screen">
      <h1 className="text-2xl font-semibold mb-6 text-gray-700">배송 관리 전체현황 ({today})</h1>
      
      {/* 대시보드 그리드 레이아웃 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        
        {/* 1번: 전체 배송 현황 */}
        <section className="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
          <h3 className="text-lg font-semibold mb-4 text-gray-700">전체 배송 현황</h3>
          <div className="h-[300px] w-full" style={{ minHeight: '300px' }}>
            <DeliveryStatusChart data={totalStats} />
          </div>
        </section>

        {/* 2번: 물류사별 배송 현황 */}
        <section className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 col-span-1 lg:col-span-2">
          <h3 className="text-lg font-bold mb-6 text-gray-700">물류사별 상세 현황</h3>
          
          {centerStats.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {centerStats.map((center) => (
                <div key={center.name} className="flex flex-col items-center">
                  <p className="font-bold text-slate-600 mb-2">{center.name}</p>
                  <div className="h-[250px] w-full">
                    {/* 기존에 만든 차트 컴포넌트 재사용 */}
                    <DeliveryStatusChart data={center.data} />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="h-[250px] flex items-center justify-center text-slate-400 italic">
              물류사별 데이터가 없습니다.
            </div>
          )}
        </section>

        {/* 일주일별 총 등록 주문 건수 (세로 막대형) */}
        <section className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
          <h3 className="text-lg font-bold mb-4 text-gray-700">주간 주문 등록 현황 (최근 7일)</h3>
          <div className="h-[350px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={weeklyData} // 가공된 주간 데이터
                margin={{ top: 20, right: 30, left: 0, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                
                {/* X축: 요일 (가로) */}
                <XAxis 
                  dataKey="day" 
                  tick={{ fontSize: 13, fontWeight: 'bold', fill: '#64748b' }}
                  axisLine={false}
                  tickLine={false}
                />
                
                {/* Y축: 수량 (세로) */}
                <YAxis 
                  tick={{ fontSize: 12, fill: '#94a3b8' }}
                  axisLine={false}
                  tickLine={false}
                />

                <Tooltip 
                  cursor={{ fill: '#f8fafc' }}
                  contentStyle={{ borderRadius: '10px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }}
                  // TypeScript 에러 방지용 formatter
                  formatter={(value: any) => [`${value}건`, '주문량']}
                  labelFormatter={(label) => `${label}요일`}
                />

                <Bar 
                  dataKey="count" 
                  fill="#4f46e5" 
                  radius={[4, 4, 0, 0]} // 위쪽만 둥글게
                  barSize={40} // 막대 두께 조절
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>

        {/* 물류사별 주간 총 주문 건수 (세로 막대형) */}
        <section className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
          <h3 className="text-lg font-bold mb-4 text-gray-700">물류사별 주간 물량 현황</h3>
          <div className="h-[350px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={weeklyCenterStats} // 물류사별 합산 데이터
                margin={{ top: 20, right: 30, left: 0, bottom: 20 }}
              >
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                
                {/* X축: 물류사 명칭 (가로) */}
                <XAxis 
                  dataKey="centerName" 
                  tick={{ fontSize: 12, fontWeight: 'bold', fill: '#64748b' }}
                  axisLine={false}
                  tickLine={false}
                  // 물류사 이름이 길면 겹칠 수 있으므로 각도 조절 (필요시 사용)
                  // interval={0} 
                  // angle={-15} 
                  // textAnchor="end"
                />
                
                {/* Y축: 수량 (세로) */}
                <YAxis 
                  tick={{ fontSize: 12, fill: '#94a3b8' }}
                  axisLine={false}
                  tickLine={false}
                />

                <Tooltip 
                  cursor={{ fill: '#f8fafc' }}
                  contentStyle={{ borderRadius: '10px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }}
                  formatter={(value: any) => [`${value}건`, '주문량']}
                />

                <Bar 
                  dataKey="orderCount" 
                  fill="#10b981" // 4번은 초록색 계열
                  radius={[4, 4, 0, 0]} 
                  barSize={40}
                >
                  {/* 막대 상단에 수량 표시 */}
                  <LabelList dataKey="orderCount" position="top" offset={10} style={{ fontSize: 12, fill: '#64748b' }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>

        {/* 5번 섹션: 물류사별 배송기사 인원 수 (세로 막대형) */}
        <section className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
          <h3 className="text-lg font-bold mb-4 text-gray-700">물류사별 배송기사 현황</h3>
          <div className="h-[350px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={driverStats} // 🚀 5번 데이터 (기사 인원 통계)
                margin={{ top: 20, right: 30, left: 0, bottom: 20 }}
              >
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                
                <XAxis 
                  dataKey="centerName" 
                  tick={{ fontSize: 12, fontWeight: 'bold', fill: '#64748b' }}
                  axisLine={false}
                  tickLine={false}
                />
                
                <YAxis 
                  tick={{ fontSize: 12, fill: '#94a3b8' }}
                  axisLine={false}
                  tickLine={false}
                />

                <Tooltip 
                  cursor={{ fill: '#f8fafc' }}
                  contentStyle={{ borderRadius: '10px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }}
                  // 🚀 단위를 '명'으로 변경
                  formatter={(value: any) => [`${value}명`, '기사 인원']}
                />

                <Bar 
                  dataKey="driverCount" // 🚀 5번 데이터 키 (기사 수)
                  fill="#f59e0b"        // 🚀 색상을 주황색 계열로 변경 (물량과 구분)
                  radius={[4, 4, 0, 0]} 
                  barSize={40}
                >
                  {/* 🚀 상단 표시 데이터 키 변경 */}
                  <LabelList dataKey="driverCount" position="top" offset={10} style={{ fontSize: 12, fill: '#64748b' }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
        
      </div>
    </main>
  );
}