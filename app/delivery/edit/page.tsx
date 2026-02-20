'use client';

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import Script from 'next/script';
import { useAuth } from '@/hook/useAuth';

export default function DeliveryEditTablePage() {
  // 1. 커스텀 훅을 통한 권한 정보 추출
  const { user, isLocalManager, userCenterList, canEdit, isDriver, isMaster } = useAuth();
  const COMPLETE_STATUS = '002003';
  const isRowEditable = (item: any) => {
    if (!canEdit) return false; // 기본 권한 없으면 차단 [cite: 43]
    if (isMaster) return true;  // 슈퍼관리자(001001), 관리자(001002)는 무조건 허용
  
    // 그 외 권한은 배송완료 상태가 아닐 때만 수정 가능
    return item.cust_devstatus !== COMPLETE_STATUS;
  };

  // 2. 권한 보안: 기사(001004)나 비로그인 사용자가 URL 직접 접근 시 차단
  if (!user || isDriver) {
    return (
      <div className="flex items-center justify-center h-screen bg-slate-50">
        <div className="text-center p-10 bg-white rounded-2xl shadow-lg border border-slate-200">
          <p className="text-slate-500 font-bold">접근 권한이 없거나 세션이 만료되었습니다.</p>
        </div>
      </div>
    );
  }

  // --- 조회 조건 상태 관리 ---
  const [searchDate, setSearchDate] = useState(''); 
  const [reqDate, setReqDate] = useState('');       
  const [gubun, setGubun] = useState('전체');        
  const [searchDevcenter, setSearchDevcenter] = useState('전체'); 
  const [searchStatus, setSearchStatus] = useState('전체'); 
  const [custName, setCustName] = useState('');     
  const [hp, setHp] = useState('');                 
  const [address, setAddress] = useState('');       
  const [driver, setDriver] = useState('');         

  const [deliveryData, setDeliveryData] = useState<any[]>([]);
  const [originalData, setOriginalData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  
  // --- 목록 및 마스터 데이터 관리 ---
  const [selectedRows, setSelectedRows] = useState<string[]>([]);
  const [drivers, setDrivers] = useState<any[]>([]); 
  const [devcenterList, setDevcenterList] = useState<any[]>([]);
  const [statusList, setStatusList] = useState<any[]>([]); 
  const [selectedTargetDriver, setSelectedTargetDriver] = useState(''); 

  const [showTopBtn, setShowTopBtn] = useState(false);

  // --- [핵심] 권한별 물류사 필터링 로직 ---
  const filteredDevcenterList = useMemo(() => {
  // 관리자가 아니면(즉, 001003 권한이면) 필터링 진행
    if (isLocalManager) {
      return devcenterList.filter(dc => 
        userCenterList.map(String).includes(String(dc.comm_ccode).trim())
    );
  }
  // 그 외(001001, 001002 등)는 전체 노출
      return devcenterList;
  }, [devcenterList, isLocalManager, userCenterList]);

  // 배송기사 일괄변경 해당물류 배송기사 조회 처리
  const filteredDriverList = useMemo(() => {
  // 🌟 001003(USER) 권한인 경우 본인 센터 기사만 필터링
  if (isLocalManager) {
    return drivers.filter(d => 
      userCenterList.map(String).includes(String(d.driver_center).trim())
    );
  }
  // 슈퍼관리자 등은 전체 기사 노출
  return drivers;
}, [drivers, isLocalManager, userCenterList]);

  // --- 스크롤 동기화 Ref ---
  const topScrollRef = useRef<HTMLDivElement>(null); 
  const mainScrollRef = useRef<HTMLDivElement>(null); 

  // --- 컬럼 너비 조절 상태 ---
  const [columnWidths, setColumnWidths] = useState<{ [key: string]: number }>({
    no: 50, save: 60, chk: 40, devstatus_name: 110, cust_gubun: 90, ordno: 130, devcenter: 150, 
    devdate: 110, reqdate: 110, cust_devdelaydate: 130, name: 100, hp1: 150, hp2: 150, address: 250, 
    detail_addr: 200, cust_memo: 180, driver_name: 100, driver_hpno: 150, 
    cust_setname: 150, cust_inte: 150, cost: 120, memo: 150, user_name: 100,
  });

  const stickyLeft = useMemo(() => ({
    no: 0,
    save: columnWidths.no,
    chk: columnWidths.no + columnWidths.save
  }), [columnWidths.no, columnWidths.save]);

  const totalTableWidth = useMemo(() => {
    return Object.values(columnWidths).reduce((acc, curr) => acc + curr, 0);
  }, [columnWidths]);

  // --- 스크롤 동기화 로직 ---
  const onTopScroll = () => {
    if (topScrollRef.current && mainScrollRef.current) {
      if (mainScrollRef.current.scrollLeft !== topScrollRef.current.scrollLeft) {
        mainScrollRef.current.scrollLeft = topScrollRef.current.scrollLeft;
      }
    }
  };

  const onMainScroll = () => {
    if (topScrollRef.current && mainScrollRef.current) {
      if (topScrollRef.current.scrollLeft !== mainScrollRef.current.scrollLeft) {
        topScrollRef.current.scrollLeft = mainScrollRef.current.scrollLeft;
      }
      setShowTopBtn(mainScrollRef.current.scrollTop > 200);
    }
  };

  const resizingRef = useRef<{ field: string; startX: number; startWidth: number } | null>(null);

  // --- [권한 제약] 초기값 자동 설정 ---
  useEffect(() => {
    // 001003 권한이고 관리 센터가 딱 1개라면, 조회 조건을 '전체'가 아닌 해당 센터로 강제 고정
    if (isLocalManager && userCenterList.length === 1) {
      setSearchDevcenter(userCenterList[0]);
    }
  }, [isLocalManager, userCenterList]);

  // --- 공통 코드 및 초기 세팅 로드 ---
  useEffect(() => {
    const today = new Date();
    setSearchDate(today.toISOString().split('T')[0]);
    
    const fetchCommonData = async () => {
      // 기사 목록 로드
      const { data: drv } = await supabase.from('ks_driver').select('driver_id, driver_name, driver_email, driver_center').order('driver_name');
      if (drv) setDrivers(drv);
      // 물류사 코드(004) 로드
      const { data: dc } = await supabase.from('ks_common').select('comm_ccode, comm_text1').eq('comm_mcode', '004').order('comm_ccode');
      if (dc) setDevcenterList(dc);
      // 배송 상태 코드(002) 로드
      const { data: st } = await supabase.from('ks_common').select('comm_ccode, comm_text1, comm_hex').eq('comm_mcode', '002').order('comm_ccode');
      if (st) setStatusList(st);
    };
    fetchCommonData();
  }, []);

  const scrollToTop = () => {
    if (mainScrollRef.current) mainScrollRef.current.scrollTo({ top: 0, behavior: 'smooth' });
  };

// --- 배송 데이터 조회 (RPC 호출) ---
  const fetchDeliveryData = useCallback(async () => {
    // 1. 권한 정보가 로드될 때까지 대기 (방어 로직)
    if (!user?.user_role || !userCenterList) {
      console.log("⏳ 사용자 권한 정보 로딩 대기 중...");
      return;
    }

    setLoading(true);

    // 2. 전달할 파라미터 정리
    const rpcParams = {
      p_devdate: searchDate.trim(),
      p_reqdate: reqDate.trim() || '%',
      p_gubun: gubun === '전체' ? '%' : gubun,
      p_name: custName.trim() ? `%${custName.trim()}%` : '%',
      p_hp: hp.trim() ? `%${hp.trim()}%` : '%',
      p_address: address.trim() ? `%${address.trim()}%` : '%',
      p_driver: driver.trim() ? `%${driver.trim()}%` : '%',
      p_devcenter: searchDevcenter === '전체' ? '%' : searchDevcenter,
      p_status: searchStatus === '전체' ? '%' : searchStatus,
      p_user_role: user.user_role, 
      p_user_center_list: userCenterList.join(',')
    };

    console.log('--- [RPC 호출 파라미터 확인] ---');
    console.table(rpcParams);

    try {
      const { data, error } = await supabase.rpc('get_delivery_edit_list', rpcParams);

      if (error) throw error;
      
      const initializedData = (data || []).map((item: any) => ({
        ...item, 
        display_addr: item.cust_address || '', 
        detail_addr: item.cust_address2 || '', 
        cust_hpno1: item.cust_hpno1 || '', 
        cust_hpno2: item.cust_hpno2 || '',
        driver_email: item.driver_email || '',
        driver_id: item.driver_id || '',
        cust_devcenter: item.cust_devcenter || '',
        cust_devstatus: item.cust_devstatus || '' 
      }));

      setDeliveryData(initializedData);
      setOriginalData(JSON.parse(JSON.stringify(initializedData)));
      setSelectedRows([]);
    } catch (err) {
      console.error('Fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [searchDate, reqDate, gubun, searchDevcenter, searchStatus, custName, hp, address, driver, user, userCenterList]);
  // ↑ useCallback의 중괄호와 대괄호가 여기서 정확히 닫혀야 합니다.

  // --- 자동 조회를 위한 useEffect (함수 밖으로 완전히 분리) ---
  useEffect(() => {
  // 현재 어떤 값이 들어와 있는지 상세 출력
  // console.log('--- [권한 로딩 상태 체크] ---');
  // console.log('1. user 객체 존재 여부:', !!user);
  // console.log('2. user_role 값:', user?.user_role);
  // console.log('3. userCenterList 배열:', userCenterList);
  // console.log('4. userCenterList 길이:', userCenterList?.length);

  if (user?.user_role && userCenterList && userCenterList.length > 0) {
    console.log("✅ 모든 정보 확인됨! fetchDeliveryData 실행");
    fetchDeliveryData();
  } else {
    console.log("⏳ 조건 미충족: 아직 기다리는 중...");
  }
}, [user, userCenterList, searchDate, reqDate, gubun, searchDevcenter, searchStatus, userCenterList]);

  // --- 기사 일괄 변경 로직 ---
  const handleBulkDriverUpdate = async () => {
    if (!canEdit) return alert('변경 권한이 없습니다.');
    if (selectedRows.length === 0 || !selectedTargetDriver) return alert('항목과 기사를 선택해주세요.');
    const targetDriver = drivers.find(d => d.driver_id === selectedTargetDriver);
    if (!targetDriver || !confirm(`선택한 ${selectedRows.length}건을 [${targetDriver.driver_name}]님으로 일괄 변경하시겠습니까?`)) return;

    setLoading(true);
    try {
      const { error } = await supabase.from('ks_devcustm').update({
        cust_devid: targetDriver.driver_id,
        cust_devemail: targetDriver.driver_email
      }).in('cust_ordno', selectedRows);

      if (error) throw error;
      alert(`✅ 변경되었습니다.`);
      await fetchDeliveryData();
    } catch (err: any) {
      alert('변경 실패: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => { if (e.key === 'Enter') fetchDeliveryData(); };

  // --- 컬럼 리사이징 핸들러 ---
  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!resizingRef.current) return;
    const { field, startX, startWidth } = resizingRef.current;
    const deltaX = e.clientX - startX;
    setColumnWidths((prev) => ({ ...prev, [field]: Math.max(40, startWidth + deltaX) }));
  }, []);

  const stopResizing = useCallback(() => {
    resizingRef.current = null;
    setIsResizing(false);
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup', stopResizing);
    document.body.style.cursor = 'default';
  }, [handleMouseMove]);

  const startResizing = (field: string, e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
    resizingRef.current = { field, startX: e.clientX, startWidth: columnWidths[field] };
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', stopResizing);
    document.body.style.cursor = 'col-resize';
  };

  // --- 데이터 수정 처리 ---
  const handleInputChange = (index: number, field: string, value: string) => {
    if (!canEdit) return; // 수정 권한이 없으면 무시
    const newData = [...deliveryData];
    if (field === 'cust_devstatus') {
      const selectedStatus = statusList.find(s => s.comm_ccode === value);
      newData[index].devstatus_color = selectedStatus?.comm_hex || '#64748b';
      newData[index].devstatus_name = selectedStatus?.comm_text1 || '';
    }
    newData[index] = { ...newData[index], [field]: value };
    setDeliveryData(newData);
  };

  const checkIfDirty = (index: number) => {
    const current = deliveryData[index];
    const original = originalData[index];
    return JSON.stringify(current) !== JSON.stringify(original);
  };

  // --- 카카오 주소 검색 연동 ---
  const handleAddressSearch = (index: number) => {
    if (!canEdit) return; 
    if (!(window as any).kakao) return;
    new (window as any).kakao.Postcode({
      oncomplete: function(data: any) {
        let fullAddr = data.userSelectedType === 'R' ? data.roadAddress : data.jibunAddress;
        const newData = [...deliveryData];
        newData[index].display_addr = fullAddr;
        setDeliveryData(newData);
        setTimeout(() => document.getElementById(`detail-addr-${index}`)?.focus(), 100);
      }
    }).open();
  };

  // --- 개별 행 저장 ---
  const handleSaveRow = async (item: any, index: number) => {
    if (!canEdit) return alert('저장 권한이 없습니다.');
    try {
      const { error } = await supabase.from('ks_devcustm').update({
        cust_devdate: item.cust_devdate,
        cust_reqdate: item.cust_reqdate,
        cust_name: item.cust_name,
        cust_hpno1: item.cust_hpno1,      
        cust_hpno2: item.cust_hpno2, 
        cust_address: item.display_addr,
        cust_address2: item.detail_addr,
        cust_devcost: item.cust_devcost,
        cust_devmemo: item.cust_devmemo,
        cust_memo: item.cust_memo,      
        cust_inte: item.cust_inte,
        cust_devemail: item.driver_email, 
        cust_devid: item.driver_id,
        cust_devcenter: item.cust_devcenter,
        cust_devstatus: item.cust_devstatus 
      }).eq('cust_ordno', item.cust_ordno);
      
      if (error) throw error;
      alert(`✅ 저장되었습니다.`);
      const newOriginalData = [...originalData];
      newOriginalData[index] = JSON.parse(JSON.stringify(item));
      setOriginalData(newOriginalData);
    } catch (err: any) { alert('저장 실패: ' + err.message); }
  };

  // --- 스타일 정의 ---
  const inputStyle = "w-full bg-transparent px-2 py-1 focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none border-none transition-all font-bold text-slate-700 rounded text-sm disabled:cursor-default disabled:focus:bg-transparent";
  const readOnlyStyle = "w-full px-2 py-1 text-sm font-medium text-slate-500 bg-transparent truncate text-center select-none cursor-default";
  const dateInputStyle = "w-full bg-transparent px-1 py-1 focus:bg-white focus:ring-1 focus:ring-blue-400 outline-none border border-slate-200 rounded text-[11px] font-bold text-slate-600 cursor-pointer disabled:border-transparent";
  const headerStyle = "sticky top-0 z-20 bg-slate-900 relative p-3 text-xs font-black text-slate-400 uppercase tracking-wider border-r border-slate-800 last:border-none whitespace-nowrap text-center select-none";
  const cellStyle = "p-1 border-r border-slate-100 last:border-none overflow-hidden";
  const editableHeaderStyle = (field: string) => `${headerStyle} ${canEdit ? 'decoration-slate-600/50 underline underline-offset-4 decoration-1' : ''}`;
  const filterInputStyle = "border border-slate-200 bg-slate-50 rounded-lg px-2 py-1.5 text-xs font-bold outline-none focus:bg-white focus:ring-2 focus:ring-blue-500 transition-all";

  const ResizeHandle = ({ field }: { field: string }) => (
    <div onMouseDown={(e) => startResizing(field, e)} className="absolute right-0 top-0 h-full w-2 cursor-col-resize hover:bg-blue-500/50 transition-colors z-30" style={{ transform: 'translateX(50%)' }} />
  );

  return (
    <div className="h-[100dvh] max-h-[100dvh] bg-slate-100 p-2 md:p-3 pb-12 font-sans text-slate-900 flex flex-col overflow-hidden relative">
      {/* 우편번호 서비스 스크립트 */}
      <Script src="//t1.kakaocdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js" strategy="afterInteractive" />

      <div className="max-w-[1920px] w-full mx-auto flex flex-col h-full min-h-0">
        
        {/* 상단 필터 및 액션 영역 */}
        <div className="flex flex-wrap items-center justify-between mb-3 gap-3 shrink-0 bg-white p-4 rounded-xl shadow-sm border border-slate-200">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-3 shrink-0">
            {/* 배송상태 필터 */}
            <div className="flex items-center gap-1.5">
              <span className="text-[12px] font-black text-slate-400 uppercase">배송상태</span>
              <select value={searchStatus} onChange={(e) => setSearchStatus(e.target.value)} className={`${filterInputStyle} border-blue-200 bg-blue-50/30 text-blue-700`}>
                <option value="전체">전체</option>
                {statusList.map((st) => (<option key={st.comm_ccode} value={st.comm_ccode}>{st.comm_text1}</option>))}
              </select>
            </div>

            {/* 배송구분 필터 */}
            <div className="flex items-center gap-1.5">
              <span className="text-[12px] font-black text-slate-400 uppercase">배송구분</span>
              <select value={gubun} onChange={(e) => setGubun(e.target.value)} className={filterInputStyle}>
                <option value="전체">전체</option>
                <option value="오프라인">오프라인</option>
                <option value="온라인">온라인</option>
              </select>
            </div>

            {/* [수정] 물류사 조회 조건 (001003 권한 제약 적용) */}
            <div className="flex items-center gap-1.5 sm:border-l sm:pl-4 border-slate-200">
              <span className="text-[12px] font-black text-slate-400 uppercase">물류사</span>
              <select 
                value={searchDevcenter} 
                onChange={(e) => setSearchDevcenter(e.target.value)} 
                disabled={isLocalManager && userCenterList.length === 1} // 관리센터가 1개인 경우 고정
                className={`${filterInputStyle} ${(isLocalManager && userCenterList.length === 1) ? 'bg-slate-100 text-slate-500 cursor-not-allowed' : ''}`}
              >
                {/* 001003이고 센터가 1개면 '전체' 옵션을 아예 제거 */}
                {(!isLocalManager || userCenterList.length > 1) && <option value="전체">전체</option>}
                {filteredDevcenterList.map((dc) => (
                  <option key={dc.comm_ccode} value={dc.comm_ccode}>{dc.comm_text1}</option>
                ))}
              </select>
            </div>

            {/* 배송일 필터 */}
            <div className="flex items-center gap-1.5">
              <span className="text-[12px] font-black text-slate-400 uppercase">배송일</span>
              <input type="date" value={searchDate} onChange={(e) => setSearchDate(e.target.value)} className={filterInputStyle} />
            </div>

            {/* 고객명 필터 */}
            <div className="flex items-center gap-1.5">
              <span className="text-[12px] font-black text-slate-400 uppercase">고객명</span>
              <input 
                type="text" 
                value={custName} 
                onChange={(e) => setCustName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && fetchDeliveryData()}
                className={`${filterInputStyle} w-24`} 
              />
            </div>            

            {/* 연락처 필터 */}
            <div className="flex items-center gap-1.5">
              <span className="text-[12px] font-black text-slate-400 uppercase">핸드폰번호</span>
              <input 
                type="text" 
                value={hp} 
                onChange={(e) => setHp(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && fetchDeliveryData()}
                className={`${filterInputStyle} w-24`} 
              />
            </div>

            {/* 배송주소 필터 */}
            <div className="flex items-center gap-1.5">
              <span className="text-[12px] font-black text-slate-400 uppercase">배송주소</span>
              <input type="text" value={address} onChange={(e) => setAddress(e.target.value)} onKeyDown={handleKeyDown} className={`${filterInputStyle} w-24`} />
            </div>

            {/* 배송기사 필터 추가 */}
            <div className="flex items-center gap-1.5">
              <span className="text-[12px] font-black text-slate-400 uppercase">배송기사</span>
              <input 
                type="text" 
                value={driver} 
                onChange={(e) => setDriver(e.target.value)} 
                onKeyDown={handleKeyDown} 
                className={`${filterInputStyle} w-24 border-blue-100 focus:border-blue-500`} 
              />
            </div>

            {/* 기사 일괄 배정 영역 */}
            <div className="flex flex-wrap items-center gap-1.5 sm:border-l sm:pl-4 border-slate-200">
              <span className="text-[12px] font-black text-blue-500 uppercase">변경기사</span>
              <select 
                value={selectedTargetDriver} 
                onChange={(e) => setSelectedTargetDriver(e.target.value)} 
                disabled={!canEdit}
                className={`${filterInputStyle} border-blue-200 bg-blue-50/50 text-blue-700 min-w-[120px] disabled:opacity-50`}
              >
                <option value="">기사 선택</option>
                {filteredDriverList.map((d) => (<option key={d.driver_id} value={d.driver_id}>[{d.driver_center}] {d.driver_name}</option>))}
              </select>
              <button 
                onClick={handleBulkDriverUpdate} 
                disabled={loading || selectedRows.length === 0 || !selectedTargetDriver || !canEdit} 
                className="bg-blue-600 text-white px-3 py-1.5 rounded-lg font-black text-xs hover:bg-blue-700 disabled:opacity-30 shadow-md transition-all active:scale-95"
              >
                일괄적용
              </button>
            </div>
          </div>

          {/* 조회 버튼 */}
          <button onClick={fetchDeliveryData} disabled={loading} className="bg-slate-900 text-white px-5 py-2 rounded-xl font-black text-xs hover:bg-blue-600 transition-all disabled:opacity-50 flex items-center gap-2 shadow-lg">
            {loading ? '조회 중...' : '조회하기'}
            {!loading && <span className="bg-white/20 px-1.5 py-0.5 rounded text-[10px]">{deliveryData.length}</span>}
          </button>
        </div>

        {/* 상단 가로 스크롤 동기화용 더미 바 */}
        <div 
          ref={topScrollRef} 
          onScroll={onTopScroll}
          className="overflow-x-auto overflow-y-hidden custom-scrollbar bg-white border-x border-t border-slate-200 rounded-t-xl" 
          style={{ height: '18px', minHeight: '18px' }}
        >
          <div style={{ width: `${totalTableWidth}px`, height: '1px' }}></div>
        </div>

        {/* 메인 테이블 컨테이너 */}
        <div className="bg-white rounded-b-xl shadow-xl border border-slate-200 flex-1 min-h-0 text-slate-700 overflow-hidden flex flex-col mb-4">
          <div 
            ref={mainScrollRef} 
            onScroll={onMainScroll}
            className="force-show-scroll flex-1 custom-scrollbar relative"
          >
            <table className="border-collapse border-spacing-0" style={{ tableLayout: 'fixed', width: `${totalTableWidth}px` }}>
              <thead>
                <tr className="bg-slate-900">
                  <th className={`${headerStyle} sticky left-0 z-50`} style={{ width: columnWidths.no, left: stickyLeft.no }}>No <ResizeHandle field="no" /></th>
                  <th className={`${headerStyle} sticky z-50`} style={{ width: columnWidths.save, left: stickyLeft.save }}>저장 <ResizeHandle field="save" /></th>
                  <th className={`${headerStyle} sticky z-50`} style={{ width: columnWidths.chk, left: stickyLeft.chk }}>
                    <input 
                      type="checkbox" 
                      className="w-4 h-4 accent-blue-500 cursor-pointer" 
                      checked={deliveryData.length > 0 && selectedRows.length === deliveryData.length} 
                      onChange={(e) => setSelectedRows(e.target.checked ? deliveryData.map(i => i.cust_ordno) : [])} 
                    />
                    <ResizeHandle field="chk" />
                  </th>
                  <th className={editableHeaderStyle('devstatus_name')} style={{ width: columnWidths.devstatus_name }}>배송상태 <ResizeHandle field="devstatus_name" /></th>
                  <th className={headerStyle} style={{ width: columnWidths.cust_gubun }}>배송구분 <ResizeHandle field="cust_gubun" /></th>
                  <th className={headerStyle} style={{ width: columnWidths.ordno }}>주문번호 <ResizeHandle field="ordno" /></th>
                  <th className={editableHeaderStyle('devcenter')} style={{ width: columnWidths.devcenter }}>물류사 <ResizeHandle field="devcenter" /></th>
                  <th className={editableHeaderStyle('devdate')} style={{ width: columnWidths.devdate }}>배송일 <ResizeHandle field="devdate" /></th>
                  <th className={editableHeaderStyle('reqdate')} style={{ width: columnWidths.reqdate }}>요청일 <ResizeHandle field="reqdate" /></th>
                  <th className={headerStyle} style={{ width: columnWidths.cust_devdelaydate }}>연기일자 <ResizeHandle field="cust_devdelaydate" /></th>
                  <th className={editableHeaderStyle('name')} style={{ width: columnWidths.name }}>고객명 <ResizeHandle field="name" /></th>
                  <th className={editableHeaderStyle('hp1')} style={{ width: columnWidths.hp1 }}>연락처1 <ResizeHandle field="hp1" /></th>
                  <th className={editableHeaderStyle('hp2')} style={{ width: columnWidths.hp2 }}>연락처2 <ResizeHandle field="hp2" /></th>
                  <th className={editableHeaderStyle('address')} style={{ width: columnWidths.address }}>배송주소 <ResizeHandle field="address" /></th>
                  <th className={editableHeaderStyle('detail_addr')} style={{ width: columnWidths.detail_addr }}>상세주소 <ResizeHandle field="detail_addr" /></th>
                  <th className={editableHeaderStyle('cust_memo')} style={{ width: columnWidths.cust_memo }}>고객요청 <ResizeHandle field="cust_memo" /></th>
                  <th className={editableHeaderStyle('driver_name')} style={{ width: columnWidths.driver_name }}>배송기사 <ResizeHandle field="driver_name" /></th>
                  <th className={headerStyle} style={{ width: columnWidths.driver_hpno }}>기사연락처 <ResizeHandle field="driver_hpno" /></th>
                  <th className={headerStyle} style={{ width: columnWidths.cust_setname }}>세트정보 <ResizeHandle field="cust_setname" /></th>
                  <th className={editableHeaderStyle('cust_inte')} style={{ width: columnWidths.cust_inte }}>시공정보 <ResizeHandle field="cust_inte" /></th>
                  <th className={editableHeaderStyle('cost')} style={{ width: columnWidths.cost }}>배송비고 <ResizeHandle field="cost" /></th>
                  <th className={editableHeaderStyle('memo')} style={{ width: columnWidths.memo }}>배송메모 <ResizeHandle field="memo" /></th>
                  <th className={headerStyle} style={{ width: columnWidths.user_name }}>담당 <ResizeHandle field="user_name" /></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {deliveryData.map((item, idx) => {
                  const isDirty = checkIfDirty(idx);
                  const isSelected = selectedRows.includes(item.cust_ordno);
                  const stickyCellBg = isSelected ? 'bg-blue-50' : isDirty ? 'bg-blue-100' : 'bg-white';
                  
                  return (
                    <tr key={item.cust_ordno} className={`transition-colors hover:bg-slate-50 ${isSelected ? 'bg-blue-50' : isDirty ? 'bg-blue-50/50' : 'bg-white'}`}>
                      {/* 고정 열 1: 번호 */}
                      <td className={`sticky left-0 z-20 p-2 text-center border-r border-slate-100 ${stickyCellBg}`} style={{ left: stickyLeft.no }}>
                        <div className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-[10px] font-black ${isDirty ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-400'}`}>{idx + 1}</div>
                      </td>
                      
                      {/* 고정 열 2: 저장 버튼 (권한 체크) */}
                      <td className={`sticky z-20 p-0 text-center align-middle border-r border-slate-100 ${stickyCellBg}`} style={{ left: stickyLeft.save }}>
                        <button 
                          onClick={() => handleSaveRow(item, idx)} 
                          disabled={!isRowEditable(item)}
                          className={`p-1.5 transition-all ${!canEdit ? 'opacity-20 cursor-default' : isDirty ? 'text-blue-600 bg-blue-50 shadow-sm' : 'text-slate-300 hover:text-blue-600'}`}
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path><polyline points="17 21 17 13 7 13 7 21"></polyline><polyline points="7 3 7 8 15 8"></polyline></svg>
                        </button>
                      </td>

                      {/* 고정 열 3: 체크박스 */}
                      <td className={`sticky z-20 p-0 text-center align-middle border-r border-slate-100 ${stickyCellBg}`} style={{ left: stickyLeft.chk }}>
                        <input type="checkbox" className="w-4 h-4 accent-blue-600 cursor-pointer" checked={isSelected} onChange={() => setSelectedRows(prev => prev.includes(item.cust_ordno) ? prev.filter(id => id !== item.cust_ordno) : [...prev, item.cust_ordno])} />
                      </td>

                      {/* 배송상태 */}
                      <td className={cellStyle}>
                        <select 
                          disabled={!canEdit || isLocalManager}
                          value={item.cust_devstatus || ''} 
                          onChange={(e) => handleInputChange(idx, 'cust_devstatus', e.target.value)} 
                          className={`${inputStyle} text-center font-black ${!canEdit ? 'appearance-none' : ''}`} 
                          style={{ color: item.devstatus_color || '#64748b' }}
                        >
                          {statusList.map((st) => (<option key={st.comm_ccode} value={st.comm_ccode} style={{ color: st.comm_hex }}>{st.comm_text1}</option>))}
                        </select>
                      </td>

                      <td className={cellStyle}><div className={readOnlyStyle}>{item.cust_gubun}</div></td>
                      <td className={cellStyle}><div className={readOnlyStyle}>{item.cust_ordno}</div></td>

                      {/* 물류사 선택 */}
                      <td className={cellStyle}>
                        <select 
                          disabled={!canEdit || isLocalManager}
                          value={item.cust_devcenter || ''} 
                          onChange={(e) => handleInputChange(idx, 'cust_devcenter', e.target.value)} 
                          className={`${inputStyle} text-center ${!canEdit ? 'appearance-none' : ''}`}
                        >
                          {devcenterList.map((dc) => (<option key={dc.comm_ccode} value={dc.comm_ccode}>{dc.comm_text1}</option>))}
                        </select>
                      </td>

                      {/* 날짜 입력들 */}
                      <td className={cellStyle}><input type="date" disabled={!canEdit || isLocalManager} value={item.cust_devdate || ''} onChange={(e) => handleInputChange(idx, 'cust_devdate', e.target.value)} className={dateInputStyle} /></td>
                      <td className={cellStyle}><input type="date" disabled={!canEdit || isLocalManager} value={item.cust_reqdate || ''} onChange={(e) => handleInputChange(idx, 'cust_reqdate', e.target.value)} className={dateInputStyle} /></td>
                      
                      {/* 연기일자 (조회전용) */}
                      <td className={cellStyle}>
                        <div className={readOnlyStyle} style={{ color: item.devstatus_color || '#64748b', fontWeight: 'bold' }}>
                          {item.cust_devdelaydate || ''}
                        </div>
                      </td>

                      {/* 고객 정보 및 연락처 */}
                      <td className={cellStyle}><input type="text" disabled={!canEdit} value={item.cust_name || ''} onChange={(e) => handleInputChange(idx, 'cust_name', e.target.value)} className={inputStyle} /></td>
                      <td className={cellStyle}><input type="text" disabled={!canEdit} value={item.cust_hpno1 || ''} onChange={(e) => handleInputChange(idx, 'cust_hpno1', e.target.value)} className={inputStyle} /></td>
                      <td className={cellStyle}><input type="text" disabled={!canEdit} value={item.cust_hpno2 || ''} onChange={(e) => handleInputChange(idx, 'cust_hpno2', e.target.value)} className={inputStyle} /></td>
                      
                      {/* 주소 (카카오 주소 연동) */}
                      <td className={cellStyle}>
                        <div 
                          onClick={() => handleAddressSearch(idx)} 
                          className={`px-2 py-1 text-sm font-bold truncate ${canEdit ? 'text-blue-600 cursor-pointer hover:bg-blue-50 rounded' : 'text-slate-500 cursor-default'}`}
                        >
                          {item.display_addr}
                        </div>
                      </td>
                      <td className={cellStyle}><input id={`detail-addr-${idx}`} type="text" disabled={!canEdit} value={item.detail_addr || ''} onChange={(e) => handleInputChange(idx, 'detail_addr', e.target.value)} className={inputStyle} /></td>
                      
                      {/* 비고 및 기타 정보 */}
                      <td className={cellStyle}><input type="text" disabled={!canEdit} value={item.cust_memo || ''} onChange={(e) => handleInputChange(idx, 'cust_memo', e.target.value)} className={inputStyle} /></td>
                      <td className={cellStyle}><input type="text" disabled={!canEdit} value={item.driver_name || ''} onChange={(e) => handleInputChange(idx, 'driver_name', e.target.value)} className={inputStyle} /></td>
                      <td className={cellStyle}><div className={readOnlyStyle}>{item.driver_hpno}</div></td>
                      <td className={cellStyle}><div className={readOnlyStyle}>{item.cust_setname}</div></td>
                      <td className={cellStyle}><input type="text" disabled={!canEdit} value={item.cust_inte || ''} onChange={(e) => handleInputChange(idx, 'cust_inte', e.target.value)} className={inputStyle} /></td>
                      <td className={cellStyle}><input type="text" disabled={!canEdit} value={item.cust_devcost || ''} onChange={(e) => handleInputChange(idx, 'cust_devcost', e.target.value)} className={inputStyle} /></td>
                      <td className={cellStyle}><input type="text" disabled={!canEdit} value={item.cust_devmemo || ''} onChange={(e) => handleInputChange(idx, 'cust_devmemo', e.target.value)} className={inputStyle} /></td>
                      <td className={cellStyle}><div className={readOnlyStyle}>{item.user_name}</div></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* 상단 이동 버튼 */}
      <div className={`fixed bottom-20 right-8 z-[999] transition-all duration-300 ${showTopBtn ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10 pointer-events-none'}`}>
        <button onClick={scrollToTop} className="flex flex-col items-center justify-center w-16 h-16 bg-slate-900 text-white rounded-full shadow-2xl hover:bg-blue-600 transition-all active:scale-90">
          <span className="text-2xl font-bold">▲</span>
          <span className="text-[10px] font-black uppercase tracking-tighter">TOP</span>
        </button>
      </div>

      <style jsx global>{`
        html, body { overflow: hidden !important; height: 100dvh !important; }
        .force-show-scroll { overflow-x: scroll !important; overflow-y: auto !important; }
        .custom-scrollbar::-webkit-scrollbar { width: 12px; height: 18px; } 
        .custom-scrollbar::-webkit-scrollbar-track { background: #f1f5f9; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #94a3b8; border-radius: 10px; border: 3px solid #f1f5f9; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #64748b; }
        thead th { box-shadow: inset 0 -1px 0 #1e293b; }
      `}</style>
    </div>
  );
}