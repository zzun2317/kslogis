'use client';

import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';

interface CodeItem {
  comm_ccode: string;
  comm_text1: string;
}

export default function UserRegisterPage() {
  const [formData, setFormData] = useState({
    userId: '',
    emailId: '',
    emailDomain: '',
    password: '',
    userName: '',
    userHpno: '',
    userCarno: '', 
    selectedCenter: '',
    selectedRole: '', // 여기에는 '001001', '001004' 등이 담깁니다.
  });

  const [domainList, setDomainList] = useState<CodeItem[]>([]);
  const [centerList, setCenterList] = useState<CodeItem[]>([]);
  const [roleList, setRoleList] = useState<CodeItem[]>([]); 
  const [isCustomDomain, setIsCustomDomain] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const [idSuccess, setIdSuccess] = useState(false);
  const [emailSuccess, setEmailSuccess] = useState(false);

  const refs = {
    userId: useRef<HTMLInputElement>(null),
    emailId: useRef<HTMLInputElement>(null),
    userName: useRef<HTMLInputElement>(null),
    userHpno: useRef<HTMLInputElement>(null),
    userCarno: useRef<HTMLInputElement>(null), 
    password: useRef<HTMLInputElement>(null),
  };

  // 기사 권한 코드 정의 (공통코드 값에 맞게 수정)
  const DRIVER_ROLE_CODE = '001004'; 

  useEffect(() => {
    const fetchCodes = async () => {
      try {
        const { data: allCodes, error } = await supabase
          .from('ks_common')
          .select('comm_mcode, comm_ccode, comm_text1')
          .in('comm_mcode', ['001', '003', '004'])
          .order('comm_sort', { ascending: true });

        if (error) throw error;

        if (allCodes) {
          setRoleList(allCodes.filter(c => c.comm_mcode === '001'));
          const domains = allCodes.filter(c => c.comm_mcode === '003');
          setDomainList([...domains, { comm_ccode: 'custom', comm_text1: '직접 입력' }]);
          if (domains.length > 0) setFormData(prev => ({ ...prev, emailDomain: domains[0].comm_text1 }));
          setCenterList(allCodes.filter(c => c.comm_mcode === '004'));
        }
      } catch (err) {
        console.error('코드 로드 실패:', err);
      }
    };
    fetchCodes();
  }, []);

  const handleHpnoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/[^0-9]/g, '');
    let formatted = value;
    if (value.length > 3 && value.length <= 7) formatted = `${value.slice(0, 3)}-${value.slice(3)}`;
    else if (value.length > 7) formatted = `${value.slice(0, 3)}-${value.slice(3, 7)}-${value.slice(7, 11)}`;
    setFormData({ ...formData, userHpno: formatted });
  };

  const checkIdDuplicate = async () => {
    if (!formData.userId) return alert('아이디를 입력하세요.');
    const { data } = await supabase.from('ks_users').select('user_id').eq('user_id', formData.userId.trim()).maybeSingle();
    if (data) { alert('이미 사용 중인 아이디입니다.'); setIdSuccess(false); }
    else { alert('사용 가능한 아이디입니다.'); setIdSuccess(true); }
  };

  const checkEmailDuplicate = async () => {
    const fullEmail = `${formData.emailId}@${formData.emailDomain}`;
    if (!formData.emailId) return alert('이메일을 입력하세요.');
    const { data } = await supabase.from('ks_users').select('user_email').eq('user_email', fullEmail.trim()).maybeSingle();
    if (data) { alert('이미 등록된 이메일입니다.'); setEmailSuccess(false); }
    else { alert('사용 가능한 이메일입니다.'); setEmailSuccess(true); }
  };

  const handleSave = async () => {
    if (!formData.userId) { refs.userId.current?.focus(); return alert('아이디를 입력하세요.'); }
    if (!idSuccess) { refs.userId.current?.focus(); return alert('아이디 중복확인을 해주세요.'); }
    if (!formData.emailId) { refs.emailId.current?.focus(); return alert('이메일을 입력하세요.'); }
    if (!emailSuccess) { return alert('이메일 중복확인을 해주세요.'); }
    if (!formData.userName) { refs.userName.current?.focus(); return alert('성명을 입력하세요.'); }
    if (!formData.password || formData.password.length < 6) { refs.password.current?.focus(); return alert('비밀번호를 숫자+영문 6자 이상 입력하세요.'); }
    if (!formData.userHpno) { refs.userHpno.current?.focus(); return alert('연락처를 입력하세요.'); }
    
    // ✨ 수정한 체크 로직: DRIVER_ROLE_CODE 인 경우 체크
    if (formData.selectedRole === DRIVER_ROLE_CODE && !formData.userCarno) {
      refs.userCarno.current?.focus();
      return alert('기사님 차량번호를 입력하세요.');
    }

    if (!formData.selectedCenter) { return alert('물류센터를 선택하세요.'); }
    if (!formData.selectedRole) { return alert('권한을 선택하세요.'); }

    // --- 🚀 [디버깅 추가] 데이터 확인용 콘솔 ---
    const fullEmail = `${formData.emailId}@${formData.emailDomain}`;
    const roleToSubmit = formData.selectedRole === DRIVER_ROLE_CODE ? 'driver' : 'superuser';

    const debugData = {
      user_id: formData.userId.trim(),
      user_name: formData.userName.trim(),
      user_hpno: formData.userHpno.trim(),
      user_role: roleToSubmit,          // 트리거가 받는 값 ('driver' 등)
      user_role_code: formData.selectedRole, // 원래 코드값 ('001004' 등)
      user_center: formData.selectedCenter,  // 원래 센터코드 ('004001' 등)
      user_car_no: formData.userCarno.trim(),
      full_email: fullEmail.trim()
    };

    // console.log("------- 💾 저장 요청 데이터 확인 -------");
    // console.table(debugData); 
    // ------------------------------------------

    setLoading(true);
    try {
      const fullEmail = `${formData.emailId}@${formData.emailDomain}`;
      
      // ✨ 트리거가 'driver'라는 텍스트를 기대한다면, 코드값 대신 텍스트로 변환해서 보낼지 확인 필요
      // 만약 트리거 로직을 수정하기 어렵다면 여기서 'driver'로 매핑해서 보냅니다.
      const roleCode = formData.selectedRole;

      const { data, error } = await supabase.auth.signUp({
        email: fullEmail.trim(),
        password: formData.password.trim(),
        options: {
          data: {
            user_id: formData.userId.trim(),
            user_name: formData.userName.trim(),
            user_hpno: formData.userHpno.trim(),
            user_role: roleCode, // 트리거가 인식할 수 있는 'driver' 또는 'superuser' 전송
            user_center: formData.selectedCenter,
            user_car_no: formData.userCarno.trim()
          }
        }
      });

      if (error) throw error;
      alert('사용자 등록이 완료되었습니다!');
      window.location.reload(); 
    } catch (error: any) {
      alert('등록 실패: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const labelStyle = "block text-sm font-black text-slate-800 mb-1";
  const inputStyle = "flex-1 border border-slate-300 p-2.5 rounded bg-white text-black font-bold text-sm focus:border-blue-500 outline-none transition-colors";
  const btnStyle = "px-4 py-2 bg-slate-700 text-white rounded font-bold text-xs hover:bg-black transition-all shadow-sm";

  return (
    <div className="max-w-3xl mx-auto p-10 bg-white shadow-2xl rounded-2xl mt-12 border border-slate-100 mb-10">
      <h2 className="text-2xl font-black mb-10 text-slate-900 border-b-4 border-blue-500 pb-4 inline-block">신규 사용자 등록 관리</h2>

      <div className="grid grid-cols-1 gap-6">
        {/* 아이디 */}
        <div className="flex flex-col gap-1">
          <label className={labelStyle}>아이디 (영문/숫자)</label>
          <div className="flex gap-2">
            <input ref={refs.userId} type="text" className={inputStyle} value={formData.userId} onChange={(e) => { setFormData({...formData, userId: e.target.value}); setIdSuccess(false); }} />
            <button onClick={checkIdDuplicate} className={btnStyle}>아이디 중복확인</button>
          </div>
        </div>

        {/* 이메일 */}
        <div className="flex flex-col gap-1">
          <label className={labelStyle}>이메일 주소</label>
          <div className="flex gap-2">
            <input ref={refs.emailId} type="text" className={inputStyle} value={formData.emailId} onChange={(e) => { setFormData({...formData, emailId: e.target.value}); setEmailSuccess(false); }} />
            <div className="flex items-center">
              <span className="font-bold text-slate-900">@</span>
            </div>
            <input 
              type="text" 
              className={inputStyle} 
              value={formData.emailDomain} 
              disabled={!isCustomDomain} 
              onChange={(e) => {
                setFormData({ ...formData, emailDomain: e.target.value });
                setEmailSuccess(false); // 도메인이 바뀌면 다시 중복확인하게 유도
              }}
              placeholder={isCustomDomain ? "도메인 입력" : ""}
            />
            <select 
              className={inputStyle + " cursor-pointer"}
              onChange={(e) => {
                const val = e.target.value;
                if(val === 'custom') { setIsCustomDomain(true); setFormData({...formData, emailDomain: ''}); }
                else { setIsCustomDomain(false); setFormData({...formData, emailDomain: val}); }
                setEmailSuccess(false);
              }}
            >
              {domainList.map(d => <option key={d.comm_ccode} value={d.comm_ccode === 'custom' ? 'custom' : d.comm_text1}>{d.comm_text1}</option>)}
            </select>
            <button onClick={checkEmailDuplicate} className={btnStyle}>이메일 중복확인</button>
          </div>
        </div>

        {/* 성명 & 비밀번호 */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelStyle}>성명</label>
            <input ref={refs.userName} type="text" className={inputStyle + " w-full"} value={formData.userName} onChange={(e) => setFormData({...formData, userName: e.target.value})} />
          </div>
          <div>
            <label className={labelStyle}>비밀번호 (6자 이상 영문+숫자 조합)</label>
            <div className="relative">
              <input ref={refs.password} type={showPassword ? 'text' : 'password'} className={inputStyle + " w-full"} value={formData.password} onChange={(e) => setFormData({...formData, password: e.target.value})} />
              <button 
                type="button" 
                onMouseDown={() => setShowPassword(true)} onMouseUp={() => setShowPassword(false)} onMouseLeave={() => setShowPassword(false)}
                className="absolute right-2 top-2 text-[10px] bg-slate-200 px-2 py-1 rounded font-bold hover:bg-slate-300"
              >확인</button>
            </div>
          </div>
        </div>

        {/* 핸드폰 & 센터 & 권한 */}
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className={labelStyle}>핸드폰 번호</label>
            <input ref={refs.userHpno} type="text" className={inputStyle + " w-full"} value={formData.userHpno} onChange={handleHpnoChange} maxLength={13} placeholder="010-0000-0000" />
          </div>
          <div>
            <label className={labelStyle}>소속 물류센터</label>
            <select className={inputStyle + " w-full cursor-pointer"} onChange={(e) => setFormData({...formData, selectedCenter: e.target.value})}>
              <option value="">선택하세요</option>
              {centerList.map(c => <option key={c.comm_ccode} value={c.comm_ccode}>{c.comm_text1}</option>)}
            </select>
          </div>
          <div>
            <label className={labelStyle}>권한 설정</label>
            <select 
                className={inputStyle + " w-full cursor-pointer"} 
                value={formData.selectedRole}
                onChange={(e) => setFormData({...formData, selectedRole: e.target.value})}
            >
              <option value="">선택하세요</option>
              {roleList.map(r => <option key={r.comm_ccode} value={r.comm_ccode}>{r.comm_text1}</option>)}
            </select>
          </div>
        </div>

        {/* ✨ 코드값(001004)으로 체크하도록 수정 */}
        {formData.selectedRole === DRIVER_ROLE_CODE && (
          <div className="bg-blue-50 p-4 rounded-xl border border-blue-100 animate-in fade-in duration-300">
            <label className={labelStyle + " text-blue-700"}>🚚 기사 차량번호 (필수)</label>
            <input 
              ref={refs.userCarno}
              type="text" 
              placeholder="예: 12가 3456" 
              className={inputStyle + " w-full border-blue-300 focus:border-blue-500"} 
              value={formData.userCarno} 
              onChange={(e) => setFormData({...formData, userCarno: e.target.value})} 
            />
          </div>
        )}

        <button 
          onClick={handleSave}
          disabled={loading}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white font-black py-5 rounded-xl mt-6 text-xl shadow-[0_10px_20px_-10px_rgba(37,99,235,0.5)] transition-all disabled:bg-slate-400"
        >
          {loading ? '데이터 처리 중...' : '신규 사용자 등록 확정'}
        </button>
      </div>
    </div>
  );
}