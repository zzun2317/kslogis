'use client';

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import Script from 'next/script';
import { useAuth } from '@/hook/useAuth';

export default function DeliveryEditTablePage() {
  // 1. 커스텀 훅을 통한 권한 정보 추출
  const { user, isLocalManager, userCenterList, canEdit, isDriver, isMaster, userLevel } = useAuth();
  const COMPLETE_STATUS = '002003'; // 배송완료 상태 코드
  
  const isRowEditable = (item: any) => {
    if (!canEdit) return false; // 기본 권한 없으면 차단
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
  // const [searchDate, setSearchDate] = useState(''); 
  const today = new Date().toISOString().split('T')[0];
  const [startDate, setStartDate] = useState(today); // 시작일
  const [endDate, setEndDate] = useState(today);     // 종료일
  const [isCalendarOpen, setIsCalendarOpen] = useState(false); // 달력 모달 제어
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
  const [isDataLimitReached, setIsDataLimitReached] = useState(false); // 1000건 이상 조회 시 경고 메시지 표시 여부
  const [dateSearchType, setDateSearchType] = useState<'DEV' | 'ORD'>('ORD'); // 배송일자 검색 기준 선택 (DEV: 배송일자, ORD: 수주일자)
  // --- 상세품목 모달 상태 관리 ---
  const [isItemModalOpen, setIsItemModalOpen] = useState(false);
  const [selectedOrderForItems, setSelectedOrderForItems] = useState<any>(null);
  // --- [상태 추가] 상세 품목 데이터 저장 ---
  const [itemDetails, setItemDetails] = useState<any[]>([]);
  const [isItemLoading, setIsItemLoading] = useState(false);
  
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
    no: 50, save: 60, chk: 40, devstatus_name: 110, cust_gubun: 90, ordno: 130, devcenter: 150, cust_orddate: 120,
    devdate: 110, reqdate: 110, cust_devdelaydate: 130, name: 100, hp1: 150, hp2: 150, cust_postno: 100, address: 300, 
    detail_addr: 200, cust_memo: 180, driver_name: 100, driver_hpno: 150, tems_btn: 100,
    cust_setname: 300, cust_inte: 150, cost: 120, memo: 150, user_name: 100, addr_oarea: 100, area_driver_id: 120, area_driver_uuid: 200, area_driver_name: 120
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
  // useEffect(() => {
  //   const today = new Date();
  //   // setSearchDate(today.toISOString().split('T')[0]);
    
  //   const fetchCommonData = async () => {
  //     // 기사 목록 로드
  //     const { data: drv } = await supabase.from('ks_driver').select('driver_id, driver_name, driver_email, driver_center, driver_uuid, driver_carno').order('driver_name');
  //     if (drv) setDrivers(drv);
  //     // 물류사 코드(004) 로드
  //     const { data: dc } = await supabase.from('ks_common').select('comm_ccode, comm_text1').eq('comm_mcode', '004').order('comm_ccode');
  //     if (dc) setDevcenterList(dc);
  //     // 배송 상태 코드(002) 로드
  //     const { data: st } = await supabase.from('ks_common').select('comm_ccode, comm_text1, comm_hex').eq('comm_mcode', '002').order('comm_ccode');
  //     if (st) setStatusList(st);
  //   };
  //   fetchCommonData();
  // }, []);

  useEffect(() => {
    const fetchCommonData = async () => {
      try {
        // 1. 기사 목록 로드 (기존 유지 혹은 별도 API가 있다면 변경 가능)
        const { data: drv } = await supabase
          .from('ks_driver')
          .select('driver_id, driver_name, driver_email, driver_center, driver_uuid, driver_carno')
          .order('driver_name');
        if (drv) setDrivers(drv);

        // 2. 물류사 코드(004) 로드 - 작성하신 API 호출
        // 물류사 코드(004) 로드
        const resCenter = await fetch('/api/common/codes?mcode=004');
        if (resCenter.ok) {
          const result = await resCenter.json();
          // result가 { success: true, data: [...] } 구조이므로 result.data를 세팅
          if (result.success) {
            setDevcenterList(result.data); 
          }
        }

        // 3. 배송 상태 코드(002) 로드 - 작성하신 API 호출
        const resStatus = await fetch('/api/common/codes?mcode=002');
        if (resStatus.ok) {
          const result = await resStatus.json();
          if (result.success) {
            setStatusList(result.data);
          }
        }
      } catch (error) {
        console.error('공통 코드 로드 실패:', error);
      }
    };

    fetchCommonData();
  }, []);

  const scrollToTop = () => {
    if (mainScrollRef.current) mainScrollRef.current.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // 날짜 설정 핸들러 (오늘, 어제, 1개월)
  const setDateRange = (type: 'today' | 'yesterday' | 'month') => {
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    
    let from = todayStr;
    let to = todayStr;

    if (type === 'yesterday') {
      const yesterday = new Date();
      yesterday.setDate(now.getDate() - 1);
      from = yesterday.toISOString().split('T')[0];
    } else if (type === 'month') {
      const lastMonth = new Date();
      lastMonth.setMonth(now.getMonth() - 1);
      from = lastMonth.toISOString().split('T')[0];
    }

    setStartDate(from);
    setEndDate(to);
    
    // 날짜 변경 후 즉시 조회를 원하시면 fetch 함수를 호출하세요.
    // 예: fetchDeliveryData();
  };

  // --- 배송 데이터 조회 (RPC 호출) ---
  const fetchDeliveryData = useCallback(async () => {
    // 1. 권한 정보가 로드될 때까지 대기 (방어 로직)
    if (!user?.user_role || !userCenterList) {
      console.log("⏳ 사용자 권한 정보 로딩 대기 중...");
      return;
    }

    setLoading(true);
    setIsDataLimitReached(false);

    // 2. 전달할 파라미터 정리
    const rpcParams = {
      // p_devdate: searchDate.trim(),
      p_start_date: startDate,
      p_end_date: endDate,
      p_date_type: dateSearchType,
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

      if (data && data.length > 0) {
        console.log('--- [RPC 결과 데이터 샘플] ---');
        console.log(data[0]); 
      }

      // [추가] 조회된 데이터가 1000건 이상이면 알림 활성화
      if (data && data.length >= 1000) {
        setIsDataLimitReached(true);
      }
      
      const initializedData = (data || []).map((item: any) => ({
        ...item, 
        display_addr: item.cust_address || '', 
        detail_addr: item.cust_address2 || '', 
        cust_hpno1: item.cust_hpno1 || '', 
        cust_hpno2: item.cust_hpno2 || '',
        driver_email: item.driver_email || '',
        driver_id: item.driver_id || '',
        cust_devcenter: item.cust_devcenter || '',
        cust_devstatus: item.cust_devstatus || '',
        addr_oarea: item.addr_oarea || '-',
        area_driver_id: item.area_driver_id || '-',
        area_driver_uuid: item.area_driver_uuid || null,
        area_driver_name: item.area_driver_name || '-' 
      }));

      setDeliveryData(initializedData);
      setOriginalData(JSON.parse(JSON.stringify(initializedData)));
      setSelectedRows([]);
    } catch (err) {
      console.error('Fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [dateSearchType, startDate, endDate, reqDate, gubun, searchDevcenter, searchStatus, custName, hp, address, driver, user, userCenterList]);
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
}, [user, userCenterList, reqDate, gubun, searchDevcenter, searchStatus, userCenterList]);

  // --- 기사 일괄 변경 로직 ---
  const handleBulkDriverUpdate = async () => {
    if (!canEdit) return alert('변경 권한이 없습니다.');
    if (selectedRows.length === 0 || !selectedTargetDriver) return alert('항목과 기사를 선택해주세요.');
    
    const targetDriver = drivers.find(d => d.driver_id === selectedTargetDriver);
    if (!targetDriver || !confirm(`선택한 ${selectedRows.length}건을 [${targetDriver.driver_name}]님으로 일괄 변경하시겠습니까?`)) return;

    setLoading(true);
    try {
      const now = new Date().toISOString();

      // 1. 선택된 주문번호들에 해당하는 전체 데이터 추출
      const selectedItems = deliveryData.filter(item => selectedRows.includes(item.cust_ordno));

      // 2. 온라인과 오프라인(그 외) 데이터 분리
      const onlineOrders = selectedItems.filter(item => item.cust_gubun === '온라인').map(item => item.cust_ordno);
      const offlineOrders = selectedItems.filter(item => item.cust_gubun !== '온라인').map(item => item.cust_ordno);

      const updatePromises = [];

      // 3. 온라인 건 업데이트 (fix 관련 컬럼 제외)
      if (onlineOrders.length > 0) {
        updatePromises.push(
          supabase.from('ks_devcustm').update({
            cust_devid: targetDriver.driver_id,
            cust_devuuid: targetDriver.driver_uuid,
            cust_devemail: targetDriver.driver_email,
            cust_devstatus: '002006'
          }).in('cust_ordno', onlineOrders)
        );
      }

      // 4. 오프라인 건 업데이트 (fix 관련 컬럼 포함)
      if (offlineOrders.length > 0) {
        updatePromises.push(
          supabase.from('ks_devcustm').update({
            cust_devid: targetDriver.driver_id,
            cust_devuuid: targetDriver.driver_uuid,
            cust_devemail: targetDriver.driver_email,
            cust_devstatus: '002006',
            cust_devdatefix: true,
            cust_devdatefixtz: now
          }).in('cust_ordno', offlineOrders)
        );
      }

      // 5. 모든 업데이트 실행
      const results = await Promise.all(updatePromises);
      const firstError = results.find(r => r.error)?.error;
      if (firstError) throw firstError;

      alert(`✅ 변경되었습니다.`);
      await fetchDeliveryData();
    } catch (err: any) {
      alert('변경 실패: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  // --- 온라인 배송기사 자동 지정 로직 추가 ---
  const handleAutoAssignOnlineDriver = async () => {
    if (!canEdit) return alert('변경 권한이 없습니다.');
    if (deliveryData.length === 0) return alert('조회된 데이터가 없습니다.');

    // 1. 모든 데이터가 '온라인'인지 확인
    const hasOffline = deliveryData.some(item => item.cust_gubun === '오프라인');
    if (hasOffline) {
      return alert("'온라인' 인 배송건만 조회후 처리 바랍니다");
    }

    if (!confirm(`조회된 ${deliveryData.length}건에 대해 권역별 온라인 기사를 자동 지정하시겠습니까?`)) return;

    setLoading(true);
    try {
      // 2. 각 행별로 업데이트 수행 (Promise.all을 사용하여 병렬 처리)
      const updatePromises = deliveryData.map(item => {
        // 권역 담당 기사 정보가 있는 경우에만 업데이트 시도
        if (item.area_driver_id && item.area_driver_uuid) {
          return supabase
            .from('ks_devcustm')
            .update({
              cust_devid: item.area_driver_id,
              cust_devuuid: item.area_driver_uuid,
              cust_devstatus: '002006' // 배차완료 상태로 변경
            })
            .eq('cust_ordno', item.cust_ordno);
        }
        return Promise.resolve({ error: null });
      });

      const results = await Promise.all(updatePromises);
      const firstError = results.find(r => r.error)?.error;
      
      if (firstError) throw firstError;

      alert('✅ 온라인 배송기사가 자동으로 지정되었습니다.');
      await fetchDeliveryData(); // 화면 갱신
    } catch (err: any) {
      console.error('Auto assign error:', err);
      alert('지정 실패: ' + err.message);
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

  // 주소정제
  const getCoordinates = async (address: string): Promise<{
    lat: number | null, 
    lng: number | null, 
    refinedAddress: string | null, 
    zoneNo: string | null
  }> => {
    return new Promise((resolve) => {
      // 1. kakao 객체 자체가 없을 때 (스크립트 로딩 실패 등)
      if (!window.kakao || !window.kakao.maps) {
        console.error("카카오 맵 스크립트가 로드되지 않았습니다.");
        resolve({ lat: null, lng: null, refinedAddress: null, zoneNo: null });
        return;
      }

      // 2. autoload=false 대응: load 콜백 내부에서 실행
      window.kakao.maps.load(() => {
        // 3. services 라이브러리 존재 확인
        if (!window.kakao.maps.services) {
          console.error("카카오 맵 'services' 라이브러리가 누락되었습니다. (URL 파라미터 확인)");
          resolve({ lat: null, lng: null, refinedAddress: null, zoneNo: null });
          return;
        }

        const geocoder = new window.kakao.maps.services.Geocoder();
        const words = address.trim().split(' ');

        // [기존 재귀 검색 로직 시작]
        const searchAddress = (currentAddress: string, wordCount: number) => {
          geocoder.addressSearch(currentAddress, (result: any, status: any) => {
            if (status === window.kakao.maps.services.Status.OK && result.length > 0) {
              const addrInfo = result[0];
              resolve({ 
                lat: parseFloat(addrInfo.y), 
                lng: parseFloat(addrInfo.x),
                refinedAddress: addrInfo.address_name,
                zoneNo: addrInfo.road_address ? addrInfo.road_address.zone_code : (addrInfo.address ? addrInfo.address.zip_code : null)
              });
            } else if (wordCount > 1) {
              const nextAddress = words.slice(0, wordCount - 1).join(' ');
              searchAddress(nextAddress, wordCount - 1);
            } else {
              resolve({ lat: null, lng: null, refinedAddress: null, zoneNo: null });
            }
          });
        };
        searchAddress(address, words.length);
      });
    });
  };

  // --- 카카오 주소 검색 연동 ---
  const handleAddressSearch = (index: number) => {
    if (!canEdit) return;
    if (!(window as any).kakao) return;

    new (window as any).kakao.Postcode({
      oncomplete: async function (data: any) {
        const fullAddr = data.userSelectedType === 'R' ? data.roadAddress : data.jibunAddress;
        const zoneCode = data.zonecode;

        // 검증 화면에서 썼던 좌표 및 정제 로직 호출
        const coords = await getCoordinates(fullAddr);

        const newData = [...deliveryData];
        
        if (coords.lat && coords.lng && coords.refinedAddress) {
          const refined = coords.refinedAddress.trim();
          const original = fullAddr.trim();
          
          // 상세 주소 분리 로직
          let detailPart = '';
          const startIndex = original.indexOf(refined);
          if (startIndex !== -1) {
            detailPart = original.substring(startIndex + refined.length).trim();
          }

          // 데이터 업데이트
          newData[index].display_addr = refined; // 정제된 도로명/지번
          newData[index].detail_addr = detailPart; // 나머지 상세주소
          newData[index].cust_lat = coords.lat;   // 좌표 저장 (필요시)
          newData[index].cust_lng = coords.lng;
        } else {
          // 좌표 획득 실패 시 기본값
          newData[index].display_addr = fullAddr;
        }

        newData[index].cust_postno = zoneCode;
        setDeliveryData(newData);
        
        setTimeout(() => document.getElementById(`detail-addr-${index}`)?.focus(), 100);
      }
    }).open();
  };

  // --- 개별 행 저장 ---
  const handleSaveRow = async (item: any, index: number) => {
    if (!canEdit) return alert('저장 권한이 없습니다.');

    // 배송상태가 '배차취소'면 기사 정보 초기화, 아니면 기존 기사 정보 유지
    const isCancelAssign = item.cust_devstatus === '002007'; 
    const isOnline = item.cust_gubun === '온라인';

    try {
      const updateData: any = {
        cust_devdate: item.cust_devdate,
        cust_reqdate: item.cust_reqdate,
        cust_name: item.cust_name,
        cust_hpno1: item.cust_hpno1,      
        cust_hpno2: item.cust_hpno2, 
        cust_address: item.display_addr,
        cust_address2: item.detail_addr,
        cust_lat: item.cust_lat,
        cust_lng: item.cust_lng,
        cust_postno: item.cust_postno,
        cust_devcost: item.cust_devcost,
        cust_devmemo: item.cust_devmemo,
        cust_memo: item.cust_memo, 
        cust_setname: item.cust_setname,           
        cust_inte: item.cust_inte,
        cust_devemail: isCancelAssign ? null : item.driver_email,
        cust_devid: isCancelAssign ? null : item.driver_id,
        cust_devuuid: isCancelAssign ? null : item.driver_uuid, 
        // cust_devemail: item.driver_email, 
        // cust_devid: updatedDevId, // 배송상태에 따른 기사 정보 업데이트
        cust_devcenter: item.cust_devcenter,
        cust_devstatus: item.cust_devstatus 
      };

      // 온라인 주문건이 배차취소될 때 고정 상태 해제
      if (isOnline && isCancelAssign) {
        updateData.cust_devdatefix = false;
        // 필요하다면 타임스탬프도 초기화할 수 있습니다.
        // updateData.cust_devdatefixtz = null; 
      }

      const { error } = await supabase
        .from('ks_devcustm')
        .update(updateData)
        .eq('cust_ordno', item.cust_ordno);
      
      if (error) throw error;

      alert(`✅ 저장되었습니다.`);
      const newOriginalData = [...originalData];
      newOriginalData[index] = JSON.parse(JSON.stringify(item));
      setOriginalData(newOriginalData);
    } catch (err: any) { 
      alert('저장 실패: ' + err.message); 
    }
  };

  // 상세품목 모달 오픈 함수
  const openItemModal = async (item: any) => {
    setSelectedOrderForItems(item);
    setIsItemModalOpen(true);
    setIsItemLoading(true);

    try {
      // ks_devcustd 테이블에서 해당 주문번호의 품목 조회
      const { data, error } = await supabase
        .from('ks_devcustd')
        .select('cust_purno, cust_itemcode, cust_itemname, cust_itemqty')
        .eq('cust_ordno', item.cust_ordno)
        .order('cust_purno', { ascending: true });

      if (error) throw error;
      setItemDetails(data || []);
    } catch (err) {
      console.error('품목 조회 실패:', err);
      alert('품목 데이터를 불러오는 중 오류가 발생했습니다.');
    } finally {
      setIsItemLoading(false);
    }
  };

  // 상세 품목 필드 수정 핸들러
  const handleItemChange = (index: number, field: string, value: any) => {
    const updatedItems = [...itemDetails];
    updatedItems[index] = { ...updatedItems[index], [field]: value };
    setItemDetails(updatedItems);
  };

  // 상세 품목 행 삭제 (리스트에서 제거)
  const handleItemDelete = (index: number) => {
    const confirmMessage = "해당 품목을 삭제하시겠습니까?\n삭제 후 저장 버튼을 눌러야 최종 적용됩니다.";
    if (confirm(confirmMessage)) {
      const updatedItems = itemDetails.filter((_, i) => i !== index);
      setItemDetails(updatedItems);
    }
  };

  // 상세 품목 저장 로직 (DB 반영)
  const saveItemDetails = async () => {
    if (!selectedOrderForItems) return;
    if (!selectedOrderForItems || itemDetails.length === 0) {
      alert("저장할 품목이 없습니다.");
      return;
    }
    // 1. 필수 입력 사항 체크 (품명, 수량)
    const invalidItem = itemDetails.find(item => !item.cust_itemname || !item.cust_itemqty);
    if (invalidItem) {
      alert("모든 항목의 '품명'과 '수량'을 입력해주세요.");
      return;
    }

    // 2. 품번 미입력 체크
    const emptyCodeItem = itemDetails.find(item => !item.cust_itemcode);
    if (emptyCodeItem) {
      if (!confirm("품번이 입력되지 않은 항목이 있습니다.\n품번 없이 저장하시겠습니까?")) {
        return;
      }
    }
    
    try {
      // 3. 기존 데이터에서 cust_outwh(출고창고) 값 가져오기 (첫 번째 데이터 기준)
      // 만약 기존 데이터가 하나도 없다면 null이나 기본값 처리
      const { data: existingData } = await supabase
        .from('ks_devcustd')
        .select('cust_outwh')
        .eq('cust_ordno', selectedOrderForItems.cust_ordno)
        .limit(1);
      
      const defaultOutWh = existingData && existingData.length > 0 ? existingData[0].cust_outwh : null;

      // 4. 기존 데이터 삭제 (재등록 방식)
      const { error: deleteError } = await supabase
        .from('ks_devcustd')
        .delete()
        .eq('cust_ordno', selectedOrderForItems.cust_ordno);

      if (deleteError) throw deleteError;

      // 5. 새 데이터 구성 (cust_purno: 인덱스+1 방식)
      const insertData = itemDetails.map((item, idx) => ({
        cust_ordno: selectedOrderForItems.cust_ordno,
        cust_purno: idx + 1, // 순번 자동 생성 (max+1 개념 반영)
        cust_itemcode: item.cust_itemcode,
        cust_itemname: item.cust_itemname,
        cust_itemqty: item.cust_itemqty,
        cust_outwh: defaultOutWh, // 기존 품목과 동일한 창고 코드
        cust_memo: null          // 요청대로 null 처리
      }));

      const { error: insertError } = await supabase
        .from('ks_devcustd')
        .insert(insertData);

      if (insertError) throw insertError;

      alert("상세 품목이 성공적으로 저장되었습니다.");
      setIsItemModalOpen(false);
    } catch (err) {
      console.error("저장 오류:", err);
      alert("저장 중 오류가 발생했습니다.");
    }
  };

  // --- [품목 추가] 새 행 추가 핸들러 ---
  const handleAddItem = () => {
    const newItem = {
      cust_itemcode: '',
      cust_itemname: '',
      cust_itemqty: 1,
      isNew: true // 신규 추가 항목임을 표시
    };
    setItemDetails([...itemDetails, newItem]);
  };

  // 모달 닫기 시 확인 로직 (선택 사항)
  const closeItemModal = () => {
    // 변경사항이 있는지 체크 (간단하게 개수나 데이터 변경 여부 확인)
    // 여기서는 단순히 닫지만, 필요시 "변경사항이 저장되지 않을 수 있습니다" 알림 추가 가능
    setIsItemModalOpen(false);
    setItemDetails([]); // 데이터 초기화
  };

  // --- 스타일 정의 ---
  const inputStyle = "w-full bg-transparent px-2 py-1 focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none border-none transition-all font-bold text-slate-700 rounded text-sm disabled:cursor-default disabled:focus:bg-transparent";
  const readOnlyStyle = "w-full px-2 py-1 text-sm font-medium text-slate-500 bg-transparent truncate text-center select-none cursor-default";
  const dateInputStyle = "w-full bg-transparent px-1 py-1 focus:bg-white focus:ring-1 focus:ring-blue-400 outline-none border border-slate-200 rounded text-[11px] font-bold text-slate-600 cursor-pointer disabled:border-transparent";
  const headerStyle = "sticky top-0 z-20 bg-slate-900 relative p-3 text-xs font-black text-slate-400 uppercase tracking-wider border-r border-slate-800 last:border-none whitespace-nowrap text-center select-none";
  const cellStyle = "p-1 border-r border-slate-100 last:border-none overflow-hidden";
  const editableHeaderStyle = (field: string) => `${headerStyle} ${canEdit ? 'decoration-slate-600/90 underline underline-offset-4 decoration-3' : ''}`;
  const filterInputStyle = "border border-slate-200 bg-slate-50 rounded-lg px-2 py-1.5 text-xs font-bold outline-none focus:bg-white focus:ring-2 focus:ring-blue-500 transition-all";
  const inputBaseStyle = "border-2 border-slate-400 rounded-lg px-2 text-[14px] font-bold text-slate-900 bg-white outline-none focus:border-blue-600 h-[40px] transition-all";

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
          <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
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

            {/* 배송일자 필터 (From-To) - 다른 조건들과 스타일 통일 */}
            {/* 날짜 조회 기준 토글 버튼 */}
            <div className="flex items-center gap-1 mr-1 bg-slate-50 px-2 py-1.5 rounded-full border border-slate-200 shadow-sm">
              <span className={`text-[11px] font-black transition-colors ${dateSearchType === 'DEV' ? 'text-blue-600' : 'text-slate-400'}`}>배송일</span>
              
              <button 
                onClick={() => setDateSearchType(prev => prev === 'DEV' ? 'ORD' : 'DEV')}
                className="relative w-10 h-5 bg-slate-200 rounded-full transition-all duration-300 focus:outline-none hover:bg-slate-300"
              >
                {/* 스위치 핸들 (O 표시 부분) */}
                <div className={`absolute top-1 left-1 w-3 h-3 bg-white rounded-full shadow-md transition-transform duration-300 flex items-center justify-center
                  ${dateSearchType === 'ORD' ? 'translate-x-5 !bg-blue-600' : 'bg-slate-500'}`}
                >
                  <div className="w-1.5 h-1.5 rounded-full bg-white opacity-50"></div>
                </div>
              </button>
              
              <span className={`text-[11px] font-black transition-colors ${dateSearchType === 'ORD' ? 'text-blue-600' : 'text-slate-400'}`}>수주일</span>
            </div>
            <div className="flex items-center gap-1 relative">
              <div 
                onClick={() => setIsCalendarOpen(!isCalendarOpen)}
                /* filterInputStyle을 활용하거나 기존 스타일에서 가로 길이를 맞춤 */
                className={`${inputStyle} w-[195px] px-2 flex items-center justify-between cursor-pointer hover:border-blue-600 group shadow-sm bg-white`}
              >
                <span className="text-[12px] font-bold text-slate-700 tracking-tighter">
                  {startDate.replace(/-/g, '.')} ~ {endDate.replace(/-/g, '.')}
                </span>
                <span className="text-[10px] text-slate-400 group-hover:text-blue-500 ml-1">▼</span>
              </div>

              {/* 기간 선택 모달 (위치는 absolute로 유지) */}
              {isCalendarOpen && (
                <div className="absolute top-[45px] left-0 z-[100] bg-white p-5 rounded-2xl shadow-2xl border-2 border-slate-200 w-[320px]">
                  <div className="flex flex-col gap-4">
                    <div className="flex items-center justify-between border-b pb-2">
                      <span className="text-sm font-black text-slate-900">조회 기간 설정</span>
                      <button onClick={() => setIsCalendarOpen(false)} className="text-slate-400 hover:text-slate-600 text-lg">×</button>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="flex flex-col gap-1">
                        <label className="text-[10px] font-black text-slate-400 uppercase">시작일</label>
                        <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className={`${inputBaseStyle} w-full text-xs`} />
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-[10px] font-black text-slate-400 uppercase">종료일</label>
                        <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className={`${inputBaseStyle} w-full text-xs`} />
                      </div>
                    </div>
                    <button 
                      onClick={() => {
                        if (startDate > endDate) {
                          alert('시작일이 종료일보다 늦을 수 없습니다.');
                          return;
                        }
                        setIsCalendarOpen(false);
                        fetchDeliveryData(); 
                      }}
                      className="w-full py-3 bg-slate-900 text-white rounded-xl font-black text-[13px] hover:bg-blue-600 transition-all shadow-md"
                    >
                      선택 기간으로 데이터 조회하기
                    </button>
                  </div>
                </div>
              )}
            </div>
            {/* ⚡ 날짜 선택 버튼 그룹 */}
            <div className="flex gap-1 bg-slate-200 p-1 rounded-lg">
              <button 
                type="button"
                onClick={() => setDateRange('today')}
                className="px-3 h-[32px] text-[11px] font-black bg-white text-slate-700 rounded-md hover:bg-blue-600 hover:text-white transition-all shadow-sm"
              >
                오늘
              </button>
              <button 
                type="button"
                onClick={() => setDateRange('yesterday')}
                className="px-3 h-[32px] text-[11px] font-black bg-white text-slate-700 rounded-md hover:bg-blue-600 hover:text-white transition-all shadow-sm"
              >
                어제
              </button>
              <button 
                type="button"
                onClick={() => setDateRange('month')}
                className="px-3 h-[32px] text-[11px] font-black bg-white text-slate-700 rounded-md hover:bg-blue-600 hover:text-white transition-all shadow-sm"
              >
                1개월
              </button>
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
                {filteredDriverList.map((d) => (<option key={d.driver_id} value={d.driver_id}>{d.driver_name}[{d.driver_carno}]</option>))}
              </select>
              <button 
                onClick={handleBulkDriverUpdate} 
                disabled={loading || selectedRows.length === 0 || !selectedTargetDriver || !canEdit} 
                className="bg-blue-600 text-white px-3 py-1.5 rounded-lg font-black text-xs hover:bg-blue-700 disabled:opacity-30 shadow-md transition-all active:scale-95"
              >
                일괄적용
              </button>

              {/* 온라인 기사 자동 지정 버튼 추가 */}
              {userCenterList?.map(String).includes('004001') && (
                <button 
                  onClick={handleAutoAssignOnlineDriver} 
                  disabled={loading || deliveryData.length === 0}
                  className="bg-blue-50 text-blue-700 border border-blue-200 px-4 py-2 rounded-xl font-black text-xs hover:bg-blue-600 hover:text-white transition-all disabled:opacity-50 shadow-sm flex items-center gap-2"
                >
                  <span className="text-blue-500">⚡</span> 온라인 배송기사 지정
                </button>
              )}

              {/* 조회 버튼 */}
              <button onClick={fetchDeliveryData} disabled={loading} className="bg-slate-900 text-white px-5 py-2 rounded-xl font-black text-xs hover:bg-blue-600 transition-all disabled:opacity-50 flex items-center gap-2 shadow-lg">
                {loading ? '조회 중...' : '조회하기'}
                {!loading && <span className="bg-white/20 px-1.5 py-0.5 rounded text-[10px]">{deliveryData.length}</span>}
              </button>
            </div>
          </div>

          {/* 1000건 이상조회시 확인 메시지 */}
          {isDataLimitReached && (
            <div className="px-6 py-2">
              <div className="flex items-center justify-between bg-amber-50 border-l-4 border-amber-400 p-3 rounded-r-xl shadow-sm animate-pulse">
                <div className="flex items-center gap-3">
                  <span className="text-xl">⚠️</span>
                  <div>
                    <p className="text-amber-800 font-black text-[13px]">
                      조회된 데이터가 많아 표시되지 않은 데이터가 있을 수 있습니다.
                    </p>
                    <p className="text-amber-700 text-[11px]">
                      정확한 조회를 위해 기간을 줄이거나 상세 조건을 입력해 주세요. (최대 1,000건 출력)
                    </p>
                  </div>
                </div>
                <button 
                  onClick={() => setIsDataLimitReached(false)} 
                  className="text-amber-400 hover:text-amber-600 px-2 font-bold"
                >
                  ✕
                </button>
              </div>
            </div>
          )}

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
        <div className="bg-white rounded-b-xl shadow-xl border border-slate-200 flex-1 min-h-0 text-slate-700 overflow-hidden flex flex-col mb-10">
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
                  <th className={headerStyle} style={{ width: columnWidths.cust_orddate }}>수주일자 <ResizeHandle field="cust_orddate" /></th>
                  <th className={editableHeaderStyle('devdate')} style={{ width: columnWidths.devdate }}>배송요청일 <ResizeHandle field="devdate" /></th>
                  <th className={editableHeaderStyle('reqdate')} style={{ width: columnWidths.reqdate }}>상차요청일 <ResizeHandle field="reqdate" /></th>
                  <th className={headerStyle} style={{ width: columnWidths.cust_devdelaydate }}>연기일자 <ResizeHandle field="cust_devdelaydate" /></th>
                  <th className={editableHeaderStyle('name')} style={{ width: columnWidths.name }}>고객명 <ResizeHandle field="name" /></th>
                  <th className={editableHeaderStyle('hp1')} style={{ width: columnWidths.hp1 }}>연락처1 <ResizeHandle field="hp1" /></th>
                  <th className={editableHeaderStyle('hp2')} style={{ width: columnWidths.hp2 }}>연락처2 <ResizeHandle field="hp2" /></th>
                  <th className={headerStyle} style={{ width: columnWidths.cust_postno }}>우편번호 <ResizeHandle field="cust_postno" /></th>
                  <th className={editableHeaderStyle('address')} style={{ width: columnWidths.address }}>배송주소 <ResizeHandle field="address" /></th>
                  <th className={editableHeaderStyle('detail_addr')} style={{ width: columnWidths.detail_addr }}>상세주소 <ResizeHandle field="detail_addr" /></th>
                  <th className={editableHeaderStyle('cust_memo')} style={{ width: columnWidths.cust_memo }}>고객요청 <ResizeHandle field="cust_memo" /></th>
                  <th className={headerStyle} style={{ width: columnWidths.driver_name }}>배송기사 <ResizeHandle field="driver_name" /></th>
                  <th className={headerStyle} style={{ width: columnWidths.driver_hpno }}>기사연락처 <ResizeHandle field="driver_hpno" /></th>
                  <th className={headerStyle} style={{ width: columnWidths.items_btn }}>상세품목 <ResizeHandle field="items_btn" /></th>
                  <th className={editableHeaderStyle('cust_setname')} style={{ width: columnWidths.cust_setname }}>세트정보 <ResizeHandle field="cust_setname" /></th>
                  <th className={editableHeaderStyle('cust_inte')} style={{ width: columnWidths.cust_inte }}>시공정보 <ResizeHandle field="cust_inte" /></th>
                  <th className={editableHeaderStyle('cost')} style={{ width: columnWidths.cost }}>배송비고 <ResizeHandle field="cost" /></th>
                  <th className={editableHeaderStyle('memo')} style={{ width: columnWidths.memo }}>배송메모 <ResizeHandle field="memo" /></th>
                  <th className={headerStyle} style={{ width: columnWidths.area_driver_name }}>온라인 배송기사 <ResizeHandle field="area_driver_name" /></th>
                  <th className={headerStyle} style={{ width: columnWidths.user_name }}>담당 <ResizeHandle field="user_name" /></th>
                  {/* 1. SuperAdmin 전용 컬럼들 */}
                  {user?.user_role === '001001' && (
                    <>
                      <th className={headerStyle} style={{ width: columnWidths.addr_oarea }}>온라인배송지역 <ResizeHandle field="addr_oarea" /></th>
                      <th className={headerStyle} style={{ width: columnWidths.area_driver_id }}>온라인배송ID <ResizeHandle field="area_driver_id" /></th>
                      <th className={headerStyle} style={{ width: columnWidths.area_driver_uuid }}>온라인배송UUID <ResizeHandle field="area_driver_uuid" /></th>
                    </>
                  )}
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
                      
                      {/* 수주일자 (조회전용) */}
                      <td className={cellStyle}>
                        <div className={readOnlyStyle} style={{ color: item.devstatus_color || '#64748b', fontWeight: 'bold' }}>
                          {item.cust_orddate || ''}
                        </div>
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

                      {/* 우편번호 데이터 출력 (수정 불가) */}
                      {/* <td className={cellStyle}><div className={readOnlyStyle}>{item.cust_postno}</div></td> */}
                      {/* 우편번호 컬럼: 클릭 시 주소 검색 팝업 실행 */}
                      <td className={cellStyle}>
                        <input
                          type="text"
                          value={item.cust_postno || ''}
                          readOnly // 직접 입력은 막음
                          onClick={() => canEdit && handleAddressSearch(idx)} // 우편번호 클릭 시 검색 팝업
                          className={`w-full h-full px-2 py-1 text-sm text-center outline-none transition-all
                            ${canEdit ? 'cursor-pointer hover:bg-blue-50 text-blue-600 font-bold' : 'bg-slate-50 text-slate-500'}`}
                        />
                      </td>
                      
                      {/* 주소 (카카오 주소 연동) */}
                      <td className={cellStyle}>
                          <input 
                            type="text"
                            value={item.display_addr || ''}
                            disabled={!canEdit}
                            // 주소 정제 로직은 유지하되, 사용자가 직접 수정도 가능하게 처리
                            onChange={(e) => handleInputChange(idx, 'display_addr', e.target.value)}
                            className={`${inputStyle} font-bold ${canEdit ? 'text-slate-700' : 'text-slate-500'}`}
                            placeholder="배송주소"
                          />
                        </td>
                      {/* <td className={cellStyle}>
                        <div 
                          onClick={() => handleAddressSearch(idx)} 
                          className={`px-2 py-1 text-sm font-bold truncate ${canEdit ? 'text-blue-600 cursor-pointer hover:bg-blue-50 rounded' : 'text-slate-500 cursor-default'}`}
                        >
                          {item.display_addr}
                        </div>
                      </td> */}
                      <td className={cellStyle}><input id={`detail-addr-${idx}`} type="text" disabled={!canEdit} value={item.detail_addr || ''} onChange={(e) => handleInputChange(idx, 'detail_addr', e.target.value)} className={inputStyle} /></td>
                      
                      {/* 비고 및 기타 정보 */}
                      <td className={cellStyle}><input type="text" disabled={!canEdit} value={item.cust_memo || ''} onChange={(e) => handleInputChange(idx, 'cust_memo', e.target.value)} className={inputStyle} /></td>
                      <td className={cellStyle}><div className={readOnlyStyle}>{item.driver_name}</div></td>
                      <td className={cellStyle}><div className={readOnlyStyle}>{item.driver_hpno}</div></td>
                      {/* --- 상세품목 버튼 셀 --- */}
                      <td className={cellStyle}>
                        <div className="flex justify-center items-center h-full">
                          <button 
                            onClick={() => openItemModal(item)}
                            className="bg-slate-100 hover:bg-blue-600 hover:text-white text-slate-600 px-2 py-1 rounded text-[11px] font-black transition-all border border-slate-200 shadow-sm"
                          >
                            품목보기
                          </button>
                        </div>
                      </td>
                      {/* <td className={cellStyle}><div className={readOnlyStyle}>{item.cust_setname}</div></td> */}
                      <td className={cellStyle}><input type="text" disabled={!canEdit} value={item.cust_setname || ''} onChange={(e) => handleInputChange(idx, 'cust_setname', e.target.value)} className={inputStyle} /></td>
                      <td className={cellStyle}><input type="text" disabled={!canEdit} value={item.cust_inte || ''} onChange={(e) => handleInputChange(idx, 'cust_inte', e.target.value)} className={inputStyle} /></td>
                      <td className={cellStyle}><input type="text" disabled={!canEdit} value={item.cust_devcost || ''} onChange={(e) => handleInputChange(idx, 'cust_devcost', e.target.value)} className={inputStyle} /></td>
                      <td className={cellStyle}><input type="text" disabled={!canEdit} value={item.cust_devmemo || ''} onChange={(e) => handleInputChange(idx, 'cust_devmemo', e.target.value)} className={inputStyle} /></td>
                      <td className={cellStyle}><div className={`${readOnlyStyle} text-blue-600 font-bold bg-blue-50/50`}> {item.area_driver_name || '-'}</div></td>
                      <td className={cellStyle}><div className={readOnlyStyle}>{item.user_name}</div></td>
                      {/* 1. SuperAdmin(001001) 전용 컬럼: 권역 및 온라인 ID 정보 */}
                      {user?.user_role === '001001' && (
                        <>
                          <td className={cellStyle}><div className={readOnlyStyle}>{item.addr_oarea || '-'}</div></td>
                          <td className={cellStyle}><div className={readOnlyStyle}>{item.area_driver_id || '-'}</div></td>
                          <td className={cellStyle}><div className={readOnlyStyle}>{item.area_driver_uuid || '-'}</div></td>
                        </>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* 상세품목 관리 모달 */}
      {isItemModalOpen && selectedOrderForItems && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[85vh] flex flex-col overflow-hidden border border-slate-300">
            
            {/* 헤더 */}
            <div className="bg-slate-900 p-4 flex justify-between items-center shrink-0">
              <h3 className="text-white font-black flex items-center gap-2 text-lg">
                <span className="bg-blue-600 px-2 py-0.5 rounded text-sm uppercase">Detail</span>
                상세 품목 관리
              </h3>
              <button onClick={() => setIsItemModalOpen(false)} className="text-slate-400 hover:text-white text-3xl transition-colors">×</button>
            </div>

            {/* 모달 본문 */}
            <div className="flex-1 overflow-y-auto p-6 bg-slate-50">
              
              {/* 상단 주문 요약 정보 카드 */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6 bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                <div className="space-y-1">
                  <p className="text-[11px] font-black text-slate-400 uppercase">고객 정보</p>
                  <p className="text-sm font-bold text-slate-800">
                    {selectedOrderForItems.cust_name} ({selectedOrderForItems.cust_hpno1 || '연락처 없음'})
                  </p>
                  <p className="text-xs text-slate-500 mt-1">{selectedOrderForItems.display_addr}</p>
                </div>
                <div className="space-y-1 border-x border-slate-100 px-4">
                  <p className="text-[11px] font-black text-slate-400 uppercase">배송 담당</p>
                  <p className="text-sm font-bold text-blue-600">
                    {selectedOrderForItems.driver_name || '-'}
                  </p>
                  <p className="text-[11px] text-slate-400 mt-1">주문번호: {selectedOrderForItems.cust_ordno}</p>
                </div>
                <div className="space-y-1 pl-4">
                  <p className="text-[11px] font-black text-slate-400 uppercase">일정 정보</p>
                  <div className="flex flex-col gap-1">
                    <span className="text-xs font-medium text-slate-600">수주일: <b className="text-slate-900">{selectedOrderForItems.cust_orddate || '-'}</b></span>
                    <span className="text-xs font-medium text-slate-600">배송일: <b className="text-blue-600">{selectedOrderForItems.cust_devdate || '-'}</b></span>
                  </div>
                </div>
              </div>

              {/* 상세 품목 테이블 */}
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="bg-slate-100 border-b border-slate-200">
                      <th className="p-3 text-[11px] font-black text-slate-500 uppercase w-16 text-center">NO</th>
                      <th className="p-3 text-[11px] font-black text-slate-500 uppercase w-40 text-left">품번 (Code)</th>
                      <th className="p-3 text-[11px] font-black text-slate-500 uppercase text-left">품명 (Item Name)</th>
                      <th className="p-3 text-[11px] font-black text-slate-500 uppercase w-24 text-center">수량</th>
                      <th className="p-3 text-[11px] font-black text-slate-500 uppercase w-24 text-center">삭제</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {isItemLoading ? (
                      <tr><td colSpan={5} className="p-20 text-center text-slate-400">로딩 중...</td></tr>
                    ) : itemDetails.length > 0 ? (
                      itemDetails.map((detail, dIdx) => (
                        <tr key={dIdx} className="hover:bg-blue-50/30 transition-colors">
                          <td className="p-3 text-center text-xs font-bold text-slate-400">{dIdx + 1}</td>
                          {/* 품번 수정 */}
                          <td className="p-2">
                            <input 
                              type="text"
                              value={detail.cust_itemcode || ''}
                              onChange={(e) => handleItemChange(dIdx, 'cust_itemcode', e.target.value)}
                              className="w-full border border-slate-200 rounded px-2 py-1 text-xs font-black focus:border-blue-500 outline-none"
                            />
                          </td>
                          {/* 품명 수정 */}
                          <td className="p-2">
                            <input 
                              type="text"
                              value={detail.cust_itemname || ''}
                              onChange={(e) => handleItemChange(dIdx, 'cust_itemname', e.target.value)}
                              className="w-full border border-slate-200 rounded px-2 py-1 text-xs font-bold focus:border-blue-500 outline-none"
                            />
                          </td>
                          {/* 수량 수정 */}
                          <td className="p-2 text-center">
                            <input 
                              type="number"
                              value={detail.cust_itemqty || 0}
                              onChange={(e) => handleItemChange(dIdx, 'cust_itemqty', parseInt(e.target.value))}
                              className="w-16 border border-slate-200 rounded px-2 py-1 text-xs font-black text-center focus:border-blue-500 outline-none"
                            />
                          </td>
                          {/* 삭제 버튼 추가 */}
                          <td className="p-2 text-center">
                            <button 
                              onClick={() => handleItemDelete(dIdx)}
                              className="text-red-400 hover:text-red-600 font-bold text-xs p-1"
                            >
                              삭제
                            </button>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr><td colSpan={5} className="p-20 text-center text-slate-400 font-medium">등록된 품목이 없습니다.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* 푸터 */}
            <div className="p-6 bg-white border-t flex justify-end items-center gap-6 shrink-0">
              {/* 품목 추가 버튼 (저장하기 왼쪽) */}
              <button 
                onClick={handleAddItem}
                className="px-8 py-2.5 bg-emerald-500 text-white rounded-xl font-black text-sm hover:bg-emerald-600 transition-all shadow-md active:scale-95 flex items-center gap-2"
              >
                <span className="text-lg"></span> 품목 추가
              </button>
              <button 
                onClick={saveItemDetails}
                className="px-8 py-2.5 bg-blue-600 text-white rounded-xl font-black text-sm hover:bg-blue-700 transition-all shadow-lg active:scale-95 flex items-center gap-2"
              >
                저장하기
              </button>
              <button 
                onClick={() => setIsItemModalOpen(false)}
                className="px-8 py-2.5 bg-slate-900 text-white rounded-xl font-black text-sm hover:bg-blue-600 transition-all shadow-lg active:scale-95"
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      )}

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