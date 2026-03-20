'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuthStore } from '@/store/useAuthStore';

// 1. 권한 공통코드 상수 정의
const ROLE_CODE = {
  SUPERADMIN: '001001',
  ADMIN: '001002',
  USER: '001003',
  DRIVER: '001004', // 배송기사 코드
  GUEST: '001005',
};

// 🌟 이메일 마스킹 유틸리티 함수
const maskEmail = (email: string) => {
  const [id, domain] = email.split('@');
  if (id.length <= 2) return `${id}*@${domain}`;
  return `${id.substring(0, 2)}${'*'.repeat(id.length - 2)}@${domain}`;
};

// 1. 실시간 하이픈 포맷팅 함수 (연락처 입력 시 호출)
const formatPhoneNumber = (value: string) => {
  if (!value) return value;
  const phoneNumber = value.replace(/[^\d]/g, ''); // 숫자만 남기기
  const cpLen = phoneNumber.length;

  if (cpLen < 4) return phoneNumber;
  if (cpLen < 7) return `${phoneNumber.slice(0, 3)}-${phoneNumber.slice(3)}`;
  if (cpLen < 11) return `${phoneNumber.slice(0, 3)}-${phoneNumber.slice(3, 6)}-${phoneNumber.slice(6)}`;
  return `${phoneNumber.slice(0, 3)}-${phoneNumber.slice(3, 7)}-${phoneNumber.slice(7, 11)}`;
};

export default function LoginPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [password, setPassword] = useState('');
  const [email, setEmail] = useState<string>('');
  const { setAuth } = useAuthStore();

  // 🌟 아이디 찾기 모달 관련 상태
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [findInfo, setFindInfo] = useState({ name: '', phone: '' });
  const [foundEmail, setFoundEmail] = useState<string | null>(null);

  // 🌟 회원탈퇴 모달 관련 상태 추가
  const [isWithdrawalModalOpen, setIsWithdrawalModalOpen] = useState(false);
  const [withdrawalInfo, setWithdrawalInfo] = useState({ name: '', email: '', phone: '' });
  const [isWithdrawalSubmitting, setIsWithdrawalSubmitting] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedEmail = localStorage.getItem('remembered_email');
      if (savedEmail) {
        setEmail(savedEmail);
      }
    }
  }, []);

  // 🌟 아이디 찾기 처리 함수
  const handleFindId = async () => {
    if (!findInfo.name || !findInfo.phone) {
      alert("이름과 연락처를 모두 입력해주세요.");
      return;
    }

    // 1. 입력값에서 하이픈 제거 (01056103736)
  const pureInputPhone = findInfo.phone.replace(/[^\d]/g, '');

  try {
      // 2. rpc를 쓰지 않고도 filter를 활용해 숫자만 비교하는 방식
      // .or()이나 .filter()를 쓰기보다 가장 확실한 'raw' 쿼리 느낌의 필터링을 시도합니다.
      const { data, error } = await supabase
        .from('ks_users')
        .select('user_email')
        .eq('user_name', findInfo.name.trim())
        // ⭐ 핵심: DB의 user_hpno 컬럼에서 하이픈(-)을 제거한 값과 입력한 숫자를 비교
        .filter('user_hpno', 'cs', pureInputPhone) 
        // 만약 위 filter가 안먹힌다면 아래 eq를 사용하세요 (하이픈 포함 비교)
        // .eq('user_hpno', findInfo.phone.trim()) 
        .maybeSingle();

      // --- 만약 위 방식이 안되면 최후의 수단 (두 가지 경우 다 체크) ---
      if (!data) {
        const { data: retryData } = await supabase
          .from('ks_users')
          .select('user_email')
          .eq('user_name', findInfo.name.trim())
          .or(`user_hpno.eq.${pureInputPhone},user_hpno.eq.${findInfo.phone.trim()}`)
          .maybeSingle();
          
        if (retryData) {
          setFoundEmail(`찾으시는 아이디는 [ ${maskEmail(retryData.user_email)} ] 입니다.`);
          return;
        }
        setFoundEmail("회원 정보가 없습니다.");
      } else {
        setFoundEmail(`찾으시는 아이디는 [ ${maskEmail(data.user_email)} ] 입니다.`);
      }
    } catch (err) {
      setFoundEmail("시스템 오류가 발생했습니다.");
    }
  };

  // 🌟 비밀번호 재설정 관련 상태
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
  const [resetStep, setResetStep] = useState(1); // 1: 발송전, 2: OTP인증, 3: 비번변경
  const [confirmPassword, setConfirmPassword] = useState("");

  // 🌟 비밀번호 재설정 처리 함수
  const handleResetPassword = async () => {
    if (!email) {
      alert("이메일을 입력해 주세요. 해당 이메일로 인증번호를 보내드립니다.");
      return;
    }

    const { error } = await supabase.auth.resetPasswordForEmail(email.trim());

    if (error) {
      alert("오류: " + error.message);
    } else {
      alert("입력하신 이메일로 6자리 인증번호가 발송되었습니다.");
      setResetStep(2); // 💡 웹에서도 인증번호 입력 칸을 보여주기 위한 상태 변경
      setIsPasswordModalOpen(true);
    }
  };
  // 🌟 인증번호 검증 처리 함수
  const [otp, setOtp] = useState("");
  const handleVerifyOtp = async () => {
    const { data, error } = await supabase.auth.verifyOtp({
      email: email.trim(),
      token: otp,
      type: 'recovery', // 💡 앱과 동일하게 recovery 타입을 사용합니다.
    });

    if (error) {
      alert("인증번호가 일치하지 않습니다: " + error.message);
    } else if (data.session) {
      alert("인증 성공! 이제 새 비밀번호를 입력해 주세요.");
      setResetStep(3); // 💡 비밀번호 변경 입력 칸으로 이동
    }
  };
  // 🌟 새 비밀번호 입력 및 업데이트 처리 함수
  const [newPassword, setNewPassword] = useState("");
  const handleUpdatePassword = async () => {

    // 💡 일치 여부 체크 추가
    if (newPassword !== confirmPassword) {
      alert("비밀번호가 일치하지 않습니다.");
      return;
    }

    const { error } = await supabase.auth.updateUser({
      password: newPassword,
    });

    if (error) {
      alert("변경 실패: " + error.message);
    } else {
      alert("비밀번호가 성공적으로 변경되었습니다.");
      setIsPasswordModalOpen(false);
      setResetStep(1);
      setOtp("");
      setNewPassword("");
      setConfirmPassword("");
      // router.push("/login"); // 로그인 페이지로 이동
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    console.log("🚀 [1] handleLogin 시작됨!");
    if (loading) return; 
    setLoading(true);

    try {
      console.log("🚀 [2] Supabase 인증 시도 중... Email:", email.trim());
      // 1. Supabase 인증 시도
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password: password.trim(),
      });

      if (authError) {
        // console.error("❌ [Error] Supabase 인증 실패:", authError.message);
        alert('로그인 실패: ' + authError.message);
        setLoading(false);
        return;
      }

      if (authData?.user?.email) {
        // 2. 백엔드 사용자 권한/정보 확인
        let userData = { user_role: ROLE_CODE.GUEST, user_name: '사용자', user_id: '', user_center: '', user_level: 1 };

        try {
          const response = await fetch('/api/auth/login-check', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: authData.user.email.trim() }),
          });
          console.log("🚀 [6] 백엔드 응답 도착! 상태코드:", response.status);

          if (response.ok) {
            const fetchedData = await response.json();

            // 🌟 탈퇴 계정(user_active === false) 체크 로직
            // DB에서 가져온 user_active 값이 false이면 로그인을 중단시킵니다.
            if (fetchedData.user_active === false || fetchedData.user_active === 'false') {
              alert('탈퇴 처리된 계정입니다. 관리자에게 문의하세요.');
              await supabase.auth.signOut(); // 세션 파기
              setLoading(false);
              return; 
            }

            console.log("🏢 [Center Code Raw]:", fetchedData.user_center);
            const userLevel = Number(fetchedData.user_level || 0);
            const userCenter = fetchedData.user_center
            // if (fetchedData) userData = fetchedData;
            userData = {
              ...fetchedData,
              user_role: fetchedData.user_role || fetchedData.role, 
              user_center: fetchedData.user_center
            };
            setAuth(
              {
                id: authData.user.id,        // 필요하다면 유지
                user_id: userData.user_id || '', // ✅ 추가 (인터페이스의 user_id)
                email: authData.user.email,
                user_name: userData.user_name || '사용자', // ✅ userName 대신 user_name
                user_center: fetchedData.user_center,
                user_level: userLevel,
              },
              userData.user_role
            );

            // 4. 로컬 데이터 저장
            localStorage.setItem('last_logged_in_email', email.trim());
            localStorage.setItem('user_email', email.trim()); // driver_email로 키 이름 변경
            localStorage.setItem('user_name', userData.user_name || ''); // driver_name로 키 이름 변경
            localStorage.setItem('user_id', userData.user_id || '');
            localStorage.setItem('user_role', userData.user_role);
            localStorage.setItem('user_center', fetchedData.user_center || '');
            localStorage.setItem('remembered_email', email.trim());
            localStorage.setItem('user_level', String(userLevel));
            

            sessionStorage.setItem('user_id', userData.user_id || '');
            sessionStorage.setItem('user_role', userData.user_role);
            sessionStorage.setItem('user_center', fetchedData.user_center || '');
            sessionStorage.setItem('is_logged_in', 'true');
            sessionStorage.setItem('user_uuid', authData.user.id);
            sessionStorage.setItem('user_level', String(userLevel));

          }
        } catch (fetchErr) {
          console.error("❌ [Error] 백엔드 서버 연결 실패:", fetchErr);
        }
        // console.log("📝 [Step 2] 가공된 userData 상태:", userData);
        const isDriver = String(userData.user_role) === ROLE_CODE.DRIVER;
        const userLevel = Number(userData.user_level || 0);
        const WEB_ACCESS_MIN_LEVEL = 30; // 웹 접근 가능한 최소 레벨
        console.log("📝 [Step 3] 최종 레벨 판정:", { 
          isDriver, 
          userLevel, 
          levelType: typeof userLevel,
          rawLevelFromUserData: userData.user_level 
        });

        // [권한 필터링] 배송기사(001004) 권한 웹 로그인 차단
        if (isDriver && userLevel < WEB_ACCESS_MIN_LEVEL) {
          alert('웹 접근 권한이 없는 배송기사 계정입니다. 관리자에게 문의하세요.');
          await supabase.auth.signOut();
          localStorage.removeItem('is_logged_in');
          localStorage.removeItem('user_role');
          localStorage.removeItem('user_level');
          localStorage.removeItem('user_uuid');
          document.cookie = "sb-access-token=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
          document.cookie = "my-auth-token=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
          setLoading(false);
          window.location.reload();
          return; 
        }
        // console.log("📝 [Step 4] Zustand 저장 직전 데이터:", {
        //     user_id: userData.user_id,
        //     user_name: userData.user_name,
        //     user_level: userLevel
        // });

        // 3. Zustand 글로벌 스토어 저장
        // setAuth(
        //   {
        //     id: authData.user.id,        // 필요하다면 유지
        //     user_id: userData.user_id || '', // ✅ 추가 (인터페이스의 user_id)
        //     email: authData.user.email,
        //     user_name: userData.user_name || '사용자', // ✅ userName 대신 user_name
        //     user_center: userData.user_center,
        //     user_level: userLevel,
        //   },
        //   userData.user_role
        // );

        // 4. 로컬 데이터 저장
        // localStorage.setItem('last_logged_in_email', email.trim());
        // localStorage.setItem('user_email', email.trim()); // driver_email로 키 이름 변경
        // localStorage.setItem('user_name', userData.user_name || ''); // driver_name로 키 이름 변경
        // localStorage.setItem('user_id', userData.user_id || '');
        // localStorage.setItem('user_role', userData.user_role);
        // localStorage.setItem('user_center', userData.user_center || '');
        // localStorage.setItem('remembered_email', email.trim());
        // localStorage.setItem('user_level', String(userLevel));

        // sessionStorage.setItem('user_id', userData.user_id || '');
        // sessionStorage.setItem('user_role', userData.user_role);
        // sessionStorage.setItem('user_center', userData.user_center || '');
        // sessionStorage.setItem('is_logged_in', 'true');
        // sessionStorage.setItem('user_uuid', authData.user.id);
        // sessionStorage.setItem('user_level', String(userLevel));
        
        /*
        if (authData?.session) {
          const { access_token, refresh_token } = authData.session;
          const PROJECT_ID = 'zomgwapjremdlsyevhem';
          document.cookie = `sb-${PROJECT_ID}-auth-token=${access_token}; path=/; SameSite=Lax;`;
          // document.cookie = `sb-access-token=${access_token}; path=/; SameSite=Lax;`;
          document.cookie = `sb-refresh-token=${refresh_token}; path=/; SameSite=Lax;`;
          // 1. 아이디(이메일)는 창을 닫아도 기억해야 하므로 LocalStorage에 저장
          localStorage.setItem('saved_email', email); 
          
          // 2. 로그인 상태(is_logged_in)는 창을 닫으면 날아가야 하므로 SessionStorage에 저장 🚀
          sessionStorage.setItem('is_logged_in', 'true');
          
          // 나머지 정보들(역할 등)도 보안을 위해 SessionStorage로 옮기는 것이 좋습니다.
          sessionStorage.setItem('user_role', userData.user_role);
          //sessionStorage.setItem('driver_email', userData.driver_email);
          alert(`${userData.user_name}님, 환영합니다!`);
          window.location.replace('/delivery');
          // setTimeout(() => {
          //   window.location.href = '/delivery';
          // }, 100);
        }
        */

        if (authData?.session) {
          alert(`${userData.user_name}님, 환영합니다!`);
          if (userData.user_role === '001004' && userLevel >= 30) {
            window.location.replace('/drivers');
          } else {
            // 그 외는 기존 배송 리스트로 이동
            window.location.replace('/delivery');
          }
          // window.location.replace('/delivery');
        }
        setLoading(false);
      }
    } catch (error: any) {
      console.error("❌ [Critical Error] 로그인 프로세스 중 예외 발생:", error);
      alert("로그인 처리 중 에러가 발생했습니다.");
      setLoading(false);
    }
  };

  // 🌟 회원탈퇴 신청 처리 함수
  const handleWithdrawalRequest = async () => {
    if (!withdrawalInfo.name || !withdrawalInfo.email || !withdrawalInfo.phone) {
      alert("모든 정보를 입력해주세요.");
      return;
    }

    if (!confirm("정말로 회원탈퇴를 신청하시겠습니까? 신청 후 관리자 확인을 거쳐 계정이 삭제됩니다.")) {
      return;
    }

    setIsWithdrawalSubmitting(true);
    try {
      // 1. 해당 정보와 일치하는 유저가 있는지 확인 및 상태 업데이트
      const purePhone = withdrawalInfo.phone.replace(/[^\d]/g, '');
      const searchPattern = `%${purePhone.slice(0, 3)}%${purePhone.slice(3, 7)}%${purePhone.slice(7, 11)}%`;
      
      const { data, error, count } = await supabase
        .from('ks_users')
        .update({ 
          user_active: false,
          user_withdrawnat: new Date().toISOString()
        }, { count: 'exact' }) // ⭐ 중요: 수정된 행의 개수를 파악하기 위해 추가
        .eq('user_email', withdrawalInfo.email.trim())
        .eq('user_name', withdrawalInfo.name.trim())
        .ilike('user_hpno', searchPattern);

      if (error) throw error;

      // count가 0이면 매칭되는 사용자가 없다는 뜻입니다.
      if (count === 0) {
        alert("입력하신 정보와 일치하는 회원을 찾을 수 없습니다.");
        return;
      }

      alert("회원탈퇴 신청이 완료되었습니다. 보안을 위해 관리자 확인 후 7일 이내에 영구 삭제됩니다.");
      setIsWithdrawalModalOpen(false);
      setWithdrawalInfo({ name: '', email: '', phone: '' });
    } catch (err) {
      alert("정보가 일치하는 회원을 찾을 수 없거나 시스템 오류가 발생했습니다.");
    } finally {
      setIsWithdrawalSubmitting(false);
    }
  };

  return (
    <div className="relative min-h-screen flex items-center justify-center p-4 overflow-hidden">
      <div 
        className="absolute inset-0 -z-10 w-full h-full bg-cover bg-center bg-no-repeat"
        style={{ 
          backgroundImage: "url('/images/login_img.jpg')",
          filter: "brightness(0.5)"
        }}
      />
      <div className="w-full max-w-md bg-white/95 backdrop-blur-md p-10 rounded-[2.5rem] shadow-2xl border border-white/20">
        <div className="text-center mb-10">
          <h1 className="text-3xl font-black text-blue-600 tracking-tighter mb-1">KS Logistics</h1>
          <p className="text-slate-500 text-sm font-bold uppercase tracking-widest">Login System</p>
        </div>
        <form onSubmit={handleLogin} className="flex flex-col gap-5">
          <div className="space-y-1">
            <label className="text-xs font-black text-slate-600 ml-2">이메일 계정</label>
            <input 
              type="email" 
              placeholder="example@gmail.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required 
              className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl text-slate-900 font-bold outline-none focus:ring-2 focus:ring-blue-500 transition-all"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-black text-slate-600 ml-2">비밀번호</label>
            <input 
              type="password" 
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl text-slate-900 font-bold outline-none focus:ring-2 focus:ring-blue-500 transition-all"
            />
          </div>
          <button 
            type="submit" 
            disabled={loading}
            className="w-full py-4 mt-4 bg-blue-600 text-white rounded-2xl font-black text-lg shadow-lg hover:bg-blue-700 active:scale-[0.98] transition-all disabled:bg-slate-400"
          >
            {loading ? '인증 확인 중...' : '로그인'}
          </button>
        </form>
        <div className="mt-8 flex flex-col gap-3 text-center">
          {/* 아이디 찾기 버튼 추가 */}
          <button 
            onClick={() => { setIsModalOpen(true); setFoundEmail(null); }}
            className="text-sm text-blue-600 hover:text-blue-800 font-bold underline underline-offset-4 transition-all"
          >
            아이디를 잊으셨나요?
          </button>
          
          <button 
            onClick={handleResetPassword}
            className="text-sm text-slate-400 hover:text-blue-600 font-bold underline underline-offset-4 transition-all"
          >
            비밀번호를 잊으셨나요?
          </button>
          <div className="h-px bg-slate-100 w-1/2 mx-auto my-1" />
          <p className="text-sm text-slate-500 font-medium">
            아직 계정이 없으신가요?{' '}
            <Link 
              href="/signup" 
              className="text-blue-600 hover:text-blue-800 font-black underline underline-offset-4 transition-all"
            >
              회원가입 하러가기
            </Link>
          </p>
          {/* 🌟 회원탈퇴 링크 추가 */}
          <button 
            onClick={() => setIsWithdrawalModalOpen(true)}
            className="text-xs text-slate-400 hover:text-red-500 font-bold underline underline-offset-4 mt-2 transition-all"
          >
            계정 삭제(회원탈퇴)가 필요하신가요?
          </button>
        </div>
      </div>

      {/* 🌟 아이디 찾기 모달 UI */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
          <div className="bg-white p-8 rounded-[2rem] w-full max-w-md shadow-2xl">
            <h2 className="text-2xl font-black text-slate-800 mb-2">아이디 찾기</h2>
            <p className="text-sm text-slate-500 mb-6 font-medium">등록된 이름과 연락처를 입력해주세요.</p>
            
            <div className="space-y-4">
              {/* 이름 입력창 */}
              <input
                type="text"
                placeholder="사용자 이름"
                value={findInfo.name}
                className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl font-bold outline-none focus:ring-2 focus:ring-blue-500 text-slate-900 placeholder:text-slate-400" // text-slate-900 추가
                onChange={(e) => setFindInfo({ ...findInfo, name: e.target.value })}
              />

              {/* 연락처 입력창 */}
              <input
                type="text"
                placeholder="연락처 (예: 010-0000-0000)"
                value={findInfo.phone}
                maxLength={13}
                className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl font-bold outline-none focus:ring-2 focus:ring-blue-500 text-slate-900 placeholder:text-slate-400" // text-slate-900 추가
                onChange={(e) => {
                  const formatted = formatPhoneNumber(e.target.value);
                  setFindInfo({ ...findInfo, phone: formatted });
                }}
              />
            </div>

            {foundEmail && (
              <div className="mt-6 p-4 bg-blue-50 text-blue-700 rounded-xl text-center font-bold border border-blue-100 animate-in fade-in zoom-in duration-300">
                {foundEmail}
              </div>
            )}

            <div className="flex gap-3 mt-8">
              <button 
                onClick={() => setIsModalOpen(false)}
                className="flex-1 py-4 bg-slate-100 text-slate-600 rounded-xl font-black hover:bg-slate-200 transition-all"
              >
                닫기
              </button>
              <button 
                onClick={handleFindId}
                className="flex-1 py-4 bg-blue-600 text-white rounded-xl font-black hover:bg-blue-700 shadow-lg transition-all"
              >
                아이디 확인
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 🌟 비밀번호 재설정 모달 UI */}
      {isPasswordModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
          <div className="bg-white p-8 rounded-[2rem] w-full max-w-md shadow-2xl transition-all duration-300">
            <h2 className="text-2xl font-black text-slate-800 mb-2">비밀번호 재설정</h2>
            <p className="text-sm text-slate-500 mb-6 font-medium">
              {resetStep === 2 
                ? "이메일로 전송된 인증번호 6자리를 입력해주세요." 
                : "새로운 비밀번호를 입력해주세요."}
            </p>
            
            <div className="space-y-4">
              {/* 2단계: OTP 입력창 (6칸 또는 단일창 선택 가능하지만, 스타일 통일을 위해 단일창 구성) */}
              <div className="relative">
                <input
                  type="text"
                  placeholder="인증번호 6자리"
                  value={otp}
                  maxLength={6}
                  disabled={resetStep > 2}
                  className={`w-full p-4 rounded-xl font-bold outline-none border transition-all text-center text-2xl tracking-[0.5em] 
                    ${resetStep > 2 
                      ? "bg-slate-100 border-slate-200 text-slate-400" 
                      : "bg-slate-50 border-slate-200 text-slate-900 focus:ring-2 focus:ring-blue-500"}`}
                  onChange={(e) => setOtp(e.target.value)}
                />
              </div>

              {/* 3단계: 비밀번호 입력 섹션 (step이 3일 때만 애니메이션과 함께 등장) */}
              {resetStep === 3 && (
                <div className="space-y-4 pt-4 border-t border-slate-100 animate-in slide-in-from-top-4 duration-500">
                  <div className="space-y-2">
                    <input
                      type="password"
                      placeholder="새 비밀번호 (6자리 이상 숫자+영문)"
                      value={newPassword}
                      className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl font-bold outline-none focus:ring-2 focus:ring-blue-500 text-slate-900 placeholder:text-slate-400"
                      onChange={(e) => setNewPassword(e.target.value)}
                    />
                    <input
                      type="password"
                      placeholder="비밀번호 확인"
                      value={confirmPassword}
                      className={`w-full p-4 bg-slate-50 border rounded-xl font-bold outline-none transition-all text-slate-900 placeholder:text-slate-400
                        ${confirmPassword === "" 
                          ? "border-slate-200 focus:ring-2 focus:ring-blue-500" 
                          : newPassword === confirmPassword 
                            ? "border-green-500 ring-2 ring-green-500/20" 
                            : "border-red-500 ring-2 ring-red-500/20"}`}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                    />
                  </div>
                </div>
              )}
            </div>

            <div className="flex gap-3 mt-8">
              <button 
                onClick={() => {
                  setIsPasswordModalOpen(false);
                  setResetStep(2); // 모달 닫을 때 스텝 초기화
                }}
                className="flex-1 py-4 bg-slate-100 text-slate-600 rounded-xl font-black hover:bg-slate-200 transition-all"
              >
                {resetStep === 3 ? "취소" : "닫기"}
              </button>
              <button 
                onClick={resetStep === 2 ? handleVerifyOtp : handleUpdatePassword}
                className="flex-1 py-4 bg-blue-600 text-white rounded-xl font-black hover:bg-blue-700 shadow-lg transition-all"
              >
                {resetStep === 2 ? "인증 확인" : "비밀번호 변경"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 🌟 회원탈퇴 신청 모달 UI 추가 */}
      {isWithdrawalModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
          <div className="bg-white p-8 rounded-[2rem] w-full max-w-md shadow-2xl">
            <h2 className="text-2xl font-black text-red-600 mb-2">계정 삭제 요청</h2>
            <p className="text-sm text-slate-500 mb-6 font-medium">본인 확인을 위해 등록된 정보를 입력해주세요.</p>
            
            <div className="space-y-4">
              <input
                type="text"
                placeholder="사용자 이름"
                value={withdrawalInfo.name}
                className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl font-bold outline-none focus:ring-2 focus:ring-red-500 text-slate-900"
                onChange={(e) => setWithdrawalInfo({ ...withdrawalInfo, name: e.target.value })}
              />
              <input
                type="email"
                placeholder="등록된 이메일"
                value={withdrawalInfo.email}
                className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl font-bold outline-none focus:ring-2 focus:ring-red-500 text-slate-900"
                onChange={(e) => setWithdrawalInfo({ ...withdrawalInfo, email: e.target.value })}
              />
              <input
                type="text"
                placeholder="연락처 (하이픈 포함)"
                value={withdrawalInfo.phone}
                maxLength={13}
                className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl font-bold outline-none focus:ring-2 focus:ring-red-500 text-slate-900"
                onChange={(e) => setWithdrawalInfo({ ...withdrawalInfo, phone: formatPhoneNumber(e.target.value) })}
              />
            </div>

            <div className="mt-6 p-4 bg-red-50 text-red-700 rounded-xl text-xs font-medium border border-red-100">
              ※ 탈퇴 신청 시 즉시 계정이 비활성화되며, 모든 배송 데이터 및 개인정보는 관리자 확인 후 영구 삭제되어 복구가 불가능합니다.
            </div>

            <div className="flex gap-3 mt-8">
              <button 
                onClick={() => setIsWithdrawalModalOpen(false)}
                className="flex-1 py-4 bg-slate-100 text-slate-600 rounded-xl font-black hover:bg-slate-200"
              >
                닫기
              </button>
              <button 
                onClick={handleWithdrawalRequest}
                disabled={isWithdrawalSubmitting}
                className="flex-1 py-4 bg-red-600 text-white rounded-xl font-black hover:bg-red-700 shadow-lg disabled:bg-slate-400"
              >
                {isWithdrawalSubmitting ? "처리 중..." : "삭제 요청"}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}