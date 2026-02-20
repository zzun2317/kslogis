'use client';

import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';

// 공통코드 타입 정의
interface CodeItem {
  comm_ccode: string;
  comm_text1: string;
}

export default function SignUpPage() {
  const [emailId, setEmailId] = useState('');
  // ✅ [수정] 초기 도메인 및 리스트 상태 추가
  const [emailDomain, setEmailDomain] = useState('');
  const [domainList, setDomainList] = useState<CodeItem[]>([]);
  const [isCustomDomain, setIsCustomDomain] = useState(false);
  
  const [password, setPassword] = useState('');
  const [userId, setUserId] = useState('');
  const [userName, setUserName] = useState('');
  const [userHpno, setUserHpno] = useState(''); 
  
  const [selectedCenter, setSelectedCenter] = useState(''); 
  const [centerList, setCenterList] = useState<CodeItem[]>([]);
  
  const [agreed, setAgreed] = useState(false); 
  
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const userIdRef = useRef<HTMLInputElement>(null);
  const emailIdRef = useRef<HTMLInputElement>(null);
  const userNameRef = useRef<HTMLInputElement>(null);
  const userHpnoRef = useRef<HTMLInputElement>(null); 
  const passwordRef = useRef<HTMLInputElement>(null);
  const agreeRef = useRef<HTMLInputElement>(null);

  const [idError, setIdError] = useState('');
  const [idSuccess, setIdSuccess] = useState('');
  const [emailError, setEmailError] = useState('');
  const [emailSuccess, setEmailSuccess] = useState('');
  
  const [errors, setErrors] = useState({
    userId: false,
    emailId: false,
    userName: false,
    userHpno: false,
    password: false,
    agreed: false 
  });

  const fullEmail = `${emailId}@${emailDomain}`;

  // ✅ [수정] 물류사 및 이메일 도메인 데이터를 공통코드에서 통합 조회
  useEffect(() => {
    const fetchCommonCodes = async () => {
      try {
        // 1. 물류사 리스트 조회 (004)
        const { data: centers } = await supabase
          .from('ks_common')
          .select('comm_ccode, comm_text1')
          .eq('comm_mcode', '004')
          .order('comm_sort', { ascending: true });

        if (centers && centers.length > 0) {
          setCenterList(centers);
          setSelectedCenter(centers[0].comm_ccode);
        }

        // 2. 이메일 도메인 리스트 조회 (003)
        const { data: domains } = await supabase
          .from('ks_common')
          .select('comm_ccode, comm_text1')
          .eq('comm_mcode', '003')
          .order('comm_sort', { ascending: true });

        if (domains && domains.length > 0) {
          // 마지막에 직접입력 추가 (ccode는 식별용으로 'custom' 부여)
          const finalDomains = [...domains, { comm_ccode: 'custom', comm_text1: '직접 입력' }];
          setDomainList(finalDomains);
          setEmailDomain(domains[0].comm_text1); // 첫 번째 도메인 기본 선택
        }
      } catch (err) {
        console.error('코드 로드 실패:', err);
      }
    };

    fetchCommonCodes();
  }, []);

  useEffect(() => {
    setEmailSuccess('');
  }, [emailId, emailDomain]);

  const handleHpnoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/[^0-9]/g, ''); 
    let formattedValue = '';

    if (value.length <= 3) {
      formattedValue = value;
    } else if (value.length <= 7) {
      formattedValue = `${value.slice(0, 3)}-${value.slice(3)}`;
    } else {
      formattedValue = `${value.slice(0, 3)}-${value.slice(3, 7)}-${value.slice(7, 11)}`;
    }

    setUserHpno(formattedValue);
    setErrors(prev => ({ ...prev, userHpno: false }));
  };

  const handleIdChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setUserId(value);
    setIdSuccess('');
    setErrors(prev => ({ ...prev, userId: false }));
    const idRegex = /^[a-zA-Z0-9]*$/;
    if (!idRegex.test(value)) setIdError('아이디는 영문과 숫자만 입력 가능합니다.');
    else if (value.length > 0 && value.length < 4) setIdError('아이디는 4자 이상이어야 합니다.');
    else setIdError('');
  };

  const checkIdDuplicate = async () => {
    if (!userId || idError) return;
    const { data } = await supabase.from('ks_users').select('user_id').eq('user_id', userId.trim()).maybeSingle();
    if (data) { setIdError('이미 사용 중인 아이디입니다.'); setIdSuccess(''); }
    else { setIdError(''); setIdSuccess('사용 가능한 아이디입니다.'); }
  };

  const checkEmailDuplicate = async () => {
    if (!emailId || !emailDomain) {
      setEmailError('이메일을 입력해주세요.');
      return;
    }
    const { data } = await supabase.from('ks_users').select('user_email').eq('user_email', fullEmail.trim()).maybeSingle();
    if (data) { setEmailError('이미 등록된 이메일입니다.'); setEmailSuccess(''); }
    else { setEmailError(''); setEmailSuccess('사용 가능한 이메일입니다.'); }
  };

  const isPasswordValid = password.length >= 6;
  const isPasswordTouched = password.length > 0;

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();

    const newErrors = {
      userId: !userId.trim(),
      emailId: !emailId.trim(),
      userName: !userName.trim(),
      userHpno: !userHpno.trim() || userHpno.length < 12,
      password: !password.trim(),
      agreed: !agreed 
    };
    setErrors(newErrors);

    if (newErrors.userId) { alert('아이디를 입력해주세요.'); userIdRef.current?.focus(); return; }
    if (newErrors.emailId) { alert('이메일 계정을 입력해주세요.'); emailIdRef.current?.focus(); return; }
    if (newErrors.userName) { alert('이름을 입력해주세요.'); userNameRef.current?.focus(); return; }
    if (newErrors.userHpno) { alert('정확한 연락처를 입력해주세요.'); userHpnoRef.current?.focus(); return; }
    if (newErrors.password) { alert('비밀번호를 입력해주세요.'); passwordRef.current?.focus(); return; }
    if (newErrors.agreed) { alert('개인정보 수집 및 이용에 동의해야 가입이 가능합니다.'); agreeRef.current?.focus(); return; }

    if (!idSuccess) { alert('아이디 중복 확인이 필요합니다.'); userIdRef.current?.focus(); return; }
    if (!emailSuccess) { alert('이메일 중복 확인이 필요합니다.'); emailIdRef.current?.focus(); return; }
    if (!isPasswordValid) { alert('비밀번호는 숫자+영문 6자 이상이어야 합니다.'); passwordRef.current?.focus(); return; }

    setLoading(true);
    try {
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: fullEmail.trim(),
        password: password.trim(),
        options: {
          data: {
            user_id: userId.trim(),
            user_name: userName.trim(),
            user_hpno: userHpno.trim(),
            user_role: 'user', 
            user_center: selectedCenter 
          }
        }
      });

      if (authError) throw authError;

      if (authData) {
        await supabase.auth.signOut();
        
        if (typeof window !== 'undefined') {
          localStorage.removeItem('supabase.auth.token');
        }

        alert('회원가입이 완료되었습니다! 로그인 페이지에서 로그인해 주세요.');
        window.location.href = '/login';
      }
      
    } catch (error: any) {
      alert('회원가입 실패: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const inputStyle = {
    padding: '8px 10px',
    borderRadius: '4px',
    backgroundColor: '#ffffff',
    color: '#000000',
    fontWeight: 'bold' as const,
    outline: 'none',
    border: '1px solid #ccc',
    fontSize: '13px',
    transition: 'border-color 0.2s'
  };

  const checkButtonStyle = {
    padding: '8px 10px',
    borderRadius: '4px',
    border: 'none',
    backgroundColor: '#6c757d',
    color: '#fff',
    fontSize: '11px',
    fontWeight: 'bold',
    cursor: 'pointer',
    whiteSpace: 'nowrap' as const,
    height: '36px'
  };

  return (
    <div style={{ backgroundColor: '#f9f9f9', minHeight: '100vh', padding: '50px 20px' }}>
      <div style={{ maxWidth: '550px', margin: '0 auto', padding: '30px', border: '1px solid #eee', borderRadius: '12px', backgroundColor: '#ffffff', boxShadow: '0 4px 6px rgba(0,0,0,0.1)' }}>
        <h2 style={{ textAlign: 'center', marginBottom: '25px', color: '#333', fontWeight: '900' }}>회원가입</h2>
        <form onSubmit={handleSignUp} noValidate style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
          
          <div>
            <label style={{ fontSize: '13px', fontWeight: 'bold', color: '#333' }}>아이디</label>
            <div style={{ display: 'flex', gap: '8px', marginTop: '5px' }}>
              <input ref={userIdRef} type="text" placeholder="아이디 입력" value={userId} onChange={handleIdChange} style={{ ...inputStyle, flex: 1, borderColor: errors.userId ? '#dc3545' : (idError ? '#dc3545' : idSuccess ? '#28a745' : '#ccc') }} />
              <button type="button" onClick={checkIdDuplicate} style={checkButtonStyle}>중복 확인</button>
            </div>
            {idError && <span style={{ color: '#dc3545', fontSize: '11px', marginTop: '4px', display: 'block' }}>{idError}</span>}
            {idSuccess && <span style={{ color: '#28a745', fontSize: '11px', marginTop: '4px', display: 'block' }}>{idSuccess}</span>}
          </div>

          <div>
            <label style={{ fontSize: '13px', fontWeight: 'bold', color: '#333' }}>이메일</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginTop: '5px' }}>
              <input ref={emailIdRef} type="text" placeholder="이메일" value={emailId} onChange={(e) => { setEmailId(e.target.value); setErrors(prev => ({ ...prev, emailId: false })); }} style={{ ...inputStyle, flex: 2, minWidth: '80px', borderColor: errors.emailId ? '#dc3545' : '#ccc' }} />
              <span>@</span>
              <input type="text" value={emailDomain} onChange={(e) => setEmailDomain(e.target.value)} disabled={!isCustomDomain} placeholder="도메인" style={{ ...inputStyle, flex: 2, minWidth: '80px', backgroundColor: isCustomDomain ? '#fff' : '#f4f4f4' }} />
              
              {/* ✅ [수정] domainList를 map으로 돌려 드롭다운 생성 및 직접입력 처리 */}
              <select 
                value={isCustomDomain ? 'custom' : emailDomain}
                onChange={(e) => { 
                  if (e.target.value === 'custom') { 
                    setIsCustomDomain(true); 
                    setEmailDomain(''); 
                  } else { 
                    setIsCustomDomain(false); 
                    setEmailDomain(e.target.value); 
                  } 
                }} 
                style={{ ...inputStyle, flex: 2, minWidth: '90px', cursor: 'pointer' }}
              >
                {domainList.map((domain) => (
                  <option key={domain.comm_ccode} value={domain.comm_ccode === 'custom' ? 'custom' : domain.comm_text1}>
                    {domain.comm_text1}
                  </option>
                ))}
              </select>
              <button type="button" onClick={checkEmailDuplicate} style={checkButtonStyle}>중복 확인</button>
            </div>
            {emailError && <span style={{ color: '#dc3545', fontSize: '11px', marginTop: '4px', display: 'block' }}>{emailError}</span>}
            {emailSuccess && <span style={{ color: '#28a745', fontSize: '11px', marginTop: '4px', display: 'block' }}>{emailSuccess}</span>}
          </div>

          <div style={{ display: 'flex', gap: '15px' }}>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: '13px', fontWeight: 'bold', color: '#333' }}>이름</label>
              <input ref={userNameRef} type="text" placeholder="실명 입력" value={userName} onChange={(e) => { setUserName(e.target.value); setErrors(prev => ({ ...prev, userName: false })); }} style={{ ...inputStyle, width: '100%', marginTop: '5px', borderColor: errors.userName ? '#dc3545' : '#ccc' }} />
            </div>
            <div style={{ flex: 1.5 }}>
              <label style={{ fontSize: '13px', fontWeight: 'bold', color: '#333' }}>연락처</label>
              <input ref={userHpnoRef} type="text" maxLength={13} placeholder="010-0000-0000" value={userHpno} onChange={handleHpnoChange} style={{ ...inputStyle, width: '100%', marginTop: '5px', borderColor: errors.userHpno ? '#dc3545' : '#ccc' }} />
              <span style={{ color: '#666', fontSize: '11px', marginTop: '4px', display: 'block' }}>숫자만 입력해주세요.</span>
            </div>
          </div>

          <div>
            <label style={{ fontSize: '13px', fontWeight: 'bold', color: '#333' }}>비밀번호</label>
            <div style={{ position: 'relative', marginTop: '5px' }}>
              <input ref={passwordRef} type={showPassword ? "text" : "password"} placeholder="6자 이상 입력" value={password} onChange={(e) => { setPassword(e.target.value); setErrors(prev => ({ ...prev, password: false })); }} style={{ ...inputStyle, width: '100%', paddingRight: '40px', border: '2px solid', borderColor: errors.password ? '#dc3545' : (!isPasswordTouched ? '#ccc' : isPasswordValid ? '#28a745' : '#dc3545') }} />
              <button type="button" onClick={() => setShowPassword(!showPassword)} style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center' }}>
                {showPassword ? (
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#666" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#666" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                )}
              </button>
            </div>
          </div>

          <div>
            <label style={{ fontSize: '13px', fontWeight: 'bold', color: '#333' }}>소속 물류센터</label>
            <select 
              value={selectedCenter} 
              onChange={(e) => setSelectedCenter(e.target.value)} 
              style={{ ...inputStyle, width: '100%', marginTop: '5px', cursor: 'pointer' }}
            >
              {centerList.length > 0 ? (
                centerList.map((center) => (
                  <option key={center.comm_ccode} value={center.comm_ccode}>
                    {center.comm_text1}
                  </option>
                ))
              ) : (
                <option value="">물류사를 불러오는 중...</option>
              )}
            </select>
          </div>

          <div style={{ 
            marginTop: '5px', padding: '12px', borderRadius: '4px', 
            backgroundColor: errors.agreed ? '#fff5f5' : '#f8f9fa', 
            border: errors.agreed ? '1px solid #dc3545' : '1px solid #eee',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between' 
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <input ref={agreeRef} type="checkbox" id="privacy-agree" checked={agreed} onChange={(e) => { setAgreed(e.target.checked); setErrors(prev => ({ ...prev, agreed: false })); }} style={{ cursor: 'pointer', width: '16px', height: '16px' }} />
              <label htmlFor="privacy-agree" style={{ fontSize: '13px', color: '#333', cursor: 'pointer' }}>개인정보 수집 및 이용 동의 <span style={{ color: '#dc3545' }}>(필수)</span></label>
            </div>
            <a href="/privacy" target="_blank" rel="noopener noreferrer" style={{ fontSize: '12px', color: '#007bff', textDecoration: 'underline', fontWeight: 'bold' }}>내용 보기</a>
          </div>

          <button type="submit" disabled={loading} style={{ padding: '14px', borderRadius: '8px', border: 'none', backgroundColor: '#007bff', color: '#fff', cursor: loading ? 'not-allowed' : 'pointer', marginTop: '10px', fontWeight: 'bold', fontSize: '16px', opacity: loading ? 0.6 : 1 }}>
            {loading ? '처리 중...' : '가입하기'}
          </button>
        </form>
      </div>
    </div>
  );
}