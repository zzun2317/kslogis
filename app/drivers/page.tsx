// 기사 등록 페이지
'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

export default function DriverManagementPage() {
  const [driverId, setDriverId] = useState('');
  const [driverName, setDriverName] = useState('');
  const [emailId, setEmailId] = useState('');
  const [emailDomain, setEmailDomain] = useState('naver.com');
  const [isCustomDomain, setIsCustomDomain] = useState(false);
  const [driverHpno, setDriverHpno] = useState('');
  const [driverCarno, setDriverCarno] = useState('');
  // 소속 센터 초기값을 리스트의 첫 번째 항목으로 설정
  const [driverCenter, setDriverCenter] = useState('금성침대');

  const [drivers, setDrivers] = useState<any[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCheckDone, setIsCheckDone] = useState(false);

  const fetchDrivers = async () => {
    const { data } = await supabase.from('ks_driver').select('*').order('created_at', { ascending: false });
    if (data) setDrivers(data);
  };

  useEffect(() => { fetchDrivers(); }, []);

  const checkDuplicate = async () => {
    if (!driverId || !emailId) { alert("아이디와 이메일을 모두 입력해주세요."); return; }
    const fullEmail = `${emailId}@${emailDomain}`;
    const { data } = await supabase.from('ks_driver').select('driver_id, driver_email')
      .or(`driver_id.eq.${driverId},driver_email.eq.${fullEmail}`);

    if (data && data.length > 0) {
      alert("❌ 이미 사용 중인 아이디 또는 이메일입니다.");
      setIsCheckDone(false);
    } else {
      alert("✅ 사용 가능합니다.");
      setIsCheckDone(true);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isCheckDone) { alert("중복 확인을 먼저 해주세요."); return; }
    setIsSubmitting(true);
    const fullEmail = `${emailId}@${emailDomain}`;

    try {
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: fullEmail, password: 'ks-password123!', 
      });
      if (authError) throw authError;

      if (authData.user) {
        const { error: dbError } = await supabase.from('ks_driver').insert([{
          driver_uuid: authData.user.id, driver_id: driverId, driver_name: driverName,
          driver_email: fullEmail, driver_hpno: driverHpno, driver_carno: driverCarno,
          // ✨ 이름을 코드로 변환하여 저장
          driver_center: centerCodeMap[driverCenter] || driverCenter, driver_status: '0'
        }]);
        if (dbError) throw dbError;
        alert(`[${driverName}] 기사 등록 완료!`);

        // 2. ✨ 등록된 기사 목록 즉시 새로고침 (조회 처리)
        await fetchDrivers();

        // ✨ 페이지 화면 초기상태로 되돌리기 (모든 state 초기화)
        setDriverId('');
        setDriverName('');
        setEmailId('');
        setEmailDomain('naver.com'); // 도메인은 기본값으로
        setIsCustomDomain(false);    // 직접입력 해제
        setDriverHpno('');           // 휴대폰 번호 초기화
        setDriverCarno('');          // ⬅️ 요청하신 차량번호 초기화!
        setDriverCenter('금성침대'); // 센터도 기본값으로
        setIsCheckDone(false);       // 중복 확인 상태 초기화
        fetchDrivers();
      }
    } catch (error: any) { alert(error.message); } finally { setIsSubmitting(false); }
  };

  // 풍선 도움말 컴포넌트
  const Tooltip = ({ text, color }: { text: string, color: string }) => (
    <div className={`absolute -top-10 left-2 px-3 py-1.5 rounded-lg text-white text-xs font-black shadow-xl animate-bounce pointer-events-none whitespace-nowrap z-10 ${color}`}>
      {text}
      <div className={`absolute -bottom-1 left-4 w-2 h-2 rotate-45 ${color}`}></div>
    </div>
  );
  
  const centerCodeMap: { [key: string]: string } = {
    '금성침대': 'KS001',
    '제일인테크': 'KS002',
    '글로벌물류': 'KS003'
  };

  // 공통 스타일
  const inputStyle = `border-2 p-3 rounded-xl focus:border-blue-600 outline-none transition-all font-bold text-black placeholder:text-gray-400 w-full`;
  const redAsterisk = <span className="text-red-600 font-black text-lg ml-1">*</span>;

  return (
    <div className="p-8 max-w-6xl mx-auto bg-gray-50 min-h-screen font-sans">
      <header className="mb-10 text-center md:text-left border-b-4 border-blue-600 pb-4 inline-block">
        <h1 className="text-4xl font-black text-gray-900">🚚 기사 관리 시스템</h1>
      </header>

      <section className="bg-white p-8 rounded-2xl shadow-2xl border border-gray-300 mb-12">
        <h2 className="text-2xl font-black mb-10 text-gray-800 flex items-center gap-2">📝 신규 기사 정보 등록</h2>
        
        <form onSubmit={handleRegister} className="space-y-12">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-10 gap-y-14">
            
            {/* 로그인 아이디 */}
            <div className="group relative flex flex-col gap-2">
              <label className="text-md font-black text-gray-800 flex items-center">로그인 아이디 {redAsterisk}</label>
              <input 
                type="text" value={driverId} 
                onChange={e => {setDriverId(e.target.value.toLowerCase().replace(/[^a-z0-9]/g, '')); setIsCheckDone(false);}}
                className={`${inputStyle} ${isCheckDone ? 'border-green-600 bg-green-50' : 'border-gray-400'}`}
                placeholder="영문/숫자 입력"
                required 
              />
              <div className="opacity-0 group-focus-within:opacity-100 transition-opacity">
                <Tooltip text="ℹ️ 영문/숫자 상태를 확인하세요!" color="bg-blue-700" />
              </div>
            </div>

            {/* 기사 성함 */}
            <div className="group relative flex flex-col gap-2">
              <label className="text-md font-black text-gray-800 flex items-center">기사 성함 {redAsterisk}</label>
              <input 
                type="text" value={driverName} 
                onChange={e => setDriverName(e.target.value)} 
                className={`${inputStyle} border-gray-400`}
                placeholder="성함 입력"
                required 
              />
              <div className="opacity-0 group-focus-within:opacity-100 transition-opacity">
                <Tooltip text="ℹ️ 한글 입력 상태를 확인하세요!" color="bg-orange-600" />
              </div>
            </div>

            {/* 이메일 조합 */}
            <div className="group relative flex flex-col gap-2">
              <label className="text-md font-black text-gray-800 flex items-center">이메일 {redAsterisk}</label>
              <div className="flex items-center gap-2">
                <input 
                  type="text" value={emailId} 
                  onChange={e => {setEmailId(e.target.value.toLowerCase().replace(/[^a-z0-9.\-_]/g, '')); setIsCheckDone(false);}}
                  className={`${inputStyle} ${isCheckDone ? 'border-green-600 bg-green-50' : 'border-gray-400'}`}
                  placeholder="아이디"
                  required 
                />
                <span className="font-black text-gray-900">@</span>
                <select 
                  value={isCustomDomain ? 'custom' : emailDomain} 
                  onChange={e => {
                    if (e.target.value === 'custom') setIsCustomDomain(true);
                    else { setIsCustomDomain(false); setEmailDomain(e.target.value); }
                    setIsCheckDone(false);
                  }}
                  className={`${inputStyle} border-gray-400 bg-white cursor-pointer py-[11px]`}
                >
                  <option value="naver.com">naver.com</option>
                  <option value="gmail.com">gmail.com</option>
                  <option value="custom">직접 입력</option>
                </select>
              </div>
              <div className="opacity-0 group-focus-within:opacity-100 transition-opacity">
                <Tooltip text="ℹ️ 영문 상태 확인!" color="bg-blue-700" />
              </div>
              <button type="button" onClick={checkDuplicate} className="mt-3 w-full bg-gray-900 text-white py-3 rounded-xl font-black text-sm hover:bg-black transition-all shadow-md">아이디 & 이메일 중복 확인</button>
            </div>

            {/* 차량번호 */}
            <div className="group relative flex flex-col gap-2">
              <label className="text-md font-black text-gray-800">차량번호</label>
              <input 
                type="text" value={driverCarno} 
                onChange={e => setDriverCarno(e.target.value.replace(/[^ㄱ-ㅎㅏ-ㅣ가-힣0-9\s]/g, ''))}
                className={`${inputStyle} border-gray-400`}
                placeholder="예: 12가 3456"
              />
              <div className="opacity-0 group-focus-within:opacity-100 transition-opacity">
                <Tooltip text="ℹ️ 한글/숫자 상태 확인!" color="bg-orange-600" />
              </div>
            </div>

            {/* 소속 센터 (드롭다운으로 변경) */}
            <div className="flex flex-col gap-2">
              <label className="text-md font-black text-gray-800 ml-1">소속 센터 {redAsterisk}</label>
              <select 
                value={driverCenter} 
                onChange={e => setDriverCenter(e.target.value)}
                className={`${inputStyle} border-gray-400 bg-white cursor-pointer py-[11px]`}
              >
                <option value="금성침대">금성침대</option>
                <option value="제일인테크">제일인테크</option>
                <option value="글로벌물류">글로벌물류</option>
              </select>
            </div>

            {/* 초기 상태 */}
            <div className="flex flex-col gap-2 text-center">
              <label className="text-sm font-black text-gray-800">초기 상태</label>
              <div className="bg-blue-100 text-blue-900 p-3 rounded-xl border-2 border-blue-400 font-black">활성 (즉시 승인)</div>
            </div>
          </div>

          <button type="submit" disabled={isSubmitting} className="w-full bg-blue-700 text-white py-6 rounded-2xl font-black text-2xl shadow-xl hover:bg-blue-800 transition-all disabled:bg-gray-400">
            {isSubmitting ? '정보 처리 중...' : '기사 등록 완료'}
          </button>
        </form>
      </section>

      {/* 목록 테이블 */}
      <section className="bg-white rounded-2xl shadow-xl border border-gray-300 overflow-hidden">
        <div className="p-6 border-b bg-gray-100"><h3 className="font-black text-xl text-gray-900">등록된 기사 목록</h3></div>
        <table className="w-full text-left">
          <thead className="bg-gray-200 text-gray-900 text-sm font-black">
            <tr>
              <th className="p-5">아이디</th><th className="p-5">성함</th><th className="p-5">센터</th><th className="p-5">이메일</th><th className="p-5 text-center">상태</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {drivers.map((d) => (
              <tr key={d.driver_uuid} className="hover:bg-blue-50">
                <td className="p-5 font-black text-blue-700">{d.driver_id}</td>
                <td className="p-5 font-black text-black">{d.driver_name}</td>
                <td className="p-5 font-bold text-gray-700">{d.driver_center}</td>
                <td className="p-5 text-gray-900 font-bold">{d.driver_email}</td>
                <td className="p-5 text-center"><span className="px-4 py-2 rounded-full text-sm font-black bg-green-200 text-green-900">활성</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}