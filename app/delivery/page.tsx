'use client';

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hook/useAuth';

export default function DeliveryAdminPage() {
  const { user, isLocalManager, userCenterList, isDriver, isMaster, canAccessWeb } = useAuth(); // 2. 권한 정보 가져오기
  if (!user || isDriver || !canAccessWeb) {
    return (
      <div className="flex items-center justify-center h-screen bg-slate-50">
        <div className="text-center p-10 bg-white rounded-2xl shadow-lg border border-slate-200">
          <p className="text-slate-500 font-bold">접근 권한이 없습니다.</p>
        </div>
      </div>
    );
  }
  // --- 상태 정의 ---
  const [searchDate, setSearchDate] = useState(new Date().toISOString().split('T')[0]);
  const [searchName, setSearchName] = useState('');
  const [searchHp, setSearchHp] = useState('');
  const [searchDriver, setSearchDriver] = useState('');
  const [searchAddr, setSearchAddr] = useState('');
  const [searchGubun, setSearchGubun] = useState('전체');
  const [deliveryData, setDeliveryData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [isMapOpen, setIsMapOpen] = useState(false);
  const [selectedAddress, setSelectedAddress] = useState('');
  const [statusCodes, setStatusCodes] = useState<any[]>([]); // 상태 공통코드
  const [centerCodes, setCenterCodes] = useState<any[]>([]); // 센터 목록
  const [searchCenter, setSearchCenter] = useState('전체');  // 선택된 센터 코드
  const searchParamsRef = React.useRef({ searchName, searchHp, searchDriver, searchAddr, searchCenter });

  // 입력값이 바뀔 때마다 Ref에 최신값 저장 (이것은 리렌더링이나 함수 재생성을 일으키지 않음)
  React.useEffect(() => {
    searchParamsRef.current = { searchName, searchHp, searchDriver, searchAddr, searchCenter };
  }, [searchName, searchHp, searchDriver, searchAddr, searchCenter]);

  
  const [showTopBtn, setShowTopBtn] = useState(false);

  // --- 스크롤 감시 (상단 이동 버튼용) ---
  useEffect(() => {
    const handleShowButton = () => {
      if (window.scrollY > 300) setShowTopBtn(true);
      else setShowTopBtn(false);
    };
    window.addEventListener("scroll", handleShowButton);
    return () => window.removeEventListener("scroll", handleShowButton);
  }, []);

  const scrollToTop = () => window.scrollTo({ top: 0, behavior: 'smooth' });

  // 배송상태 조회
  useEffect(() => {
  const fetchStatusCodes = async () => {
    try {
      const { data, error } = await supabase
        .from('ks_common')
        .select('comm_ccode, comm_text1, comm_hex')
        .eq('comm_mcode', '002')
        .eq('comm_use', true) // 사용 중인 것만
        .order('comm_sort', { ascending: true }); // 순서 정렬

      if (error) throw error;
      if (data) setStatusCodes(data);
    } catch (err) {
      console.error('상태 코드 로드 실패:', err);
    }
  };
  fetchStatusCodes();
  }, []);

  // 물류센터 조회
  useEffect(() => {
    const fetchCenterCodes = async () => {
      try {
        const { data, error } = await supabase
          .from('ks_common')
          .select('comm_ccode, comm_text1')
          .eq('comm_mcode', '004')
          .eq('comm_use', true) // 사용 중인 센터만
          .order('comm_sort', { ascending: true }); // 정렬 순서 적용

        if (error) throw error;
        if (data) setCenterCodes(data);
      } catch (err) {
        console.error('센터 코드 로드 실패:', err);
      }
    };
    fetchCenterCodes();
  }, []);

  // --- [핵심] 권한별 물류사 필터링 로직 ---
  const filteredDevcenterList = useMemo(() => {
  // 관리자가 아니면(즉, 001003 권한이면) 필터링 진행
    if (isLocalManager) {
      return centerCodes.filter(dc => 
        userCenterList.map(String).includes(String(dc.comm_ccode).trim())
    );
  }
  // 그 외(001001, 001002 등)는 전체 노출
      return centerCodes;
  }, [centerCodes, isLocalManager, userCenterList]);

  const getStatusInfo = (status: string) => {
    const target = statusCodes.find(c => c.comm_ccode === status);
    
    if (target) {
      return { 
        label: target.comm_text1, 
        color: target.comm_hex || '#94a3b8' // 값이 없으면 회색 기본값
      };
    }
    
    return { label: status || '미정', color: '#94a3b8' };
  };

  // --- 데이터 조회 함수 ---
  const fetchDeliveryData = useCallback(async () => {
    setLoading(true);
    try {
      // Ref에서 최신 값을 가져옵니다.
      const { searchName, searchHp, searchDriver, searchAddr, searchCenter } = searchParamsRef.current;
      console.log('--- RPC 호출 파라미터 확인 ---');
      console.log('조회일자:', searchDate);
      console.log('센터코드(넘어가는 값):', searchCenter); // 👈 이 부분을 확인하시면 됩니다!
      console.log('검색어(성함):', searchName);
      console.log('111:', userCenterList.join(','));
      console.log('---------------------------');
      // 기사 검색어가 비어있을 때는 빈 문자열('')을 보냄 (SQL NULL 처리용)
      const driverParam = searchDriver.trim() ? `%${searchDriver.trim()}%` : '';

      const { data, error } = await supabase.rpc('get_delivery_details', {
        p_devdate: searchDate,
        p_name: `%${searchName}%`,
        p_hp: `%${searchHp}%`,
        p_driver: driverParam,
        p_address: `%${searchAddr}%`,
        p_user_role: user.user_role,
        p_user_center_list: userCenterList.join(','),
        p_center_code: searchCenter
      });

      if (error) throw error;

      const grouped = (data || []).reduce((acc: any[], curr: any) => {
        const found = acc.find(item => item.cust_ordno === curr.cust_ordno);
        const itemDetail = { 
          name: curr.item_name, 
          qty: curr.cust_itemqty, 
          wh: curr.cust_outwh 
        };

        if (found) {
          found.items.push(itemDetail);
          if (!found.img_url && curr.img_url) {
            found.img_url = curr.img_url;
            found.img_type = curr.img_type;
          }
        } else {
          acc.push({ ...curr, items: [itemDetail], img_url: curr.img_url, img_type: curr.img_type });
        }
        return acc;
      }, []);

      let filteredData = grouped;
      if (searchGubun !== '전체') {
        filteredData = grouped.filter((item: any) => item.cust_gubun === searchGubun);
      }

      setDeliveryData(filteredData);
    } catch (error) {
      console.error('Fetch Error:', error);
      alert('데이터를 불러오는 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  }, [searchDate, searchGubun, userCenterList, searchCenter]); //, searchName, searchHp, searchDriver, searchAddr

  useEffect(() => {
    fetchDeliveryData();
    // 날짜와 구분 값이 변경될 때만 자동으로 서버에서 데이터를 다시 가져옵니다.
  }, [fetchDeliveryData, searchDate, searchGubun]);

  // enter키 눌러 조회처리
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      fetchDeliveryData();
    }
  };

  const toggleRow = (id: string) => setExpandedId(expandedId === id ? null : id);

  const openMapModal = (e: React.MouseEvent, address: string) => {
    e.stopPropagation();
    setSelectedAddress(address);
    setIsMapOpen(true);
  };

  const [isStatusModalOpen, setIsStatusModalOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<any>(null);

  const openStatusModal = (item: any) => {
    setSelectedItem(item);
    setIsStatusModalOpen(true);
  };

  // 상태별 팝업 테마 설정
  const getModalTheme = (status: string) => {
    switch(status) {
      case '002003': return { title: '✅ 배송 완료 상세', color: 'bg-green-50', text: 'text-green-600', btn: 'hover:bg-green-600' };
      case '002004': return { title: '⚠️ 배송 연기 사유', color: 'bg-amber-50', text: 'text-amber-600', btn: 'hover:bg-amber-600' };
      case '002008': return { title: '🚫 배송 취소 내역', color: 'bg-red-50', text: 'text-red-600', btn: 'hover:bg-red-600' };
      default: return { title: 'ℹ️ 배송 상세 정보', color: 'bg-slate-50', text: 'text-slate-600', btn: 'hover:bg-slate-900' };
    }
  };

  // 상단 상태 정의
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);

  // 이전 사진 보기
  const showPrev = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (previewIndex !== null && previewIndex > 0) {
      setPreviewIndex(previewIndex - 1);
    }
  };

  // 다음 사진 보기
  const showNext = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (previewIndex !== null && selectedItem?.images && previewIndex < selectedItem.images.length - 1) {
      setPreviewIndex(previewIndex + 1);
    }
  };

  const inputBaseStyle = "border-2 border-slate-400 rounded-lg px-2 text-[14px] font-bold text-slate-900 bg-white outline-none focus:border-blue-600 h-[40px] transition-all";

  return (
    <div className="min-h-screen bg-slate-100 p-4 md:p-8 font-sans text-slate-900 relative">
      <div className="max-w-[1600px] mx-auto">
        
        {/* 🔍 1. 조회 필터 영역 */}
        <div className="mb-6" id="top-anchor">
          <div className="bg-white p-6 rounded-2xl shadow-lg border-2 border-slate-300">
            <div className="flex flex-wrap items-end gap-4">
              {/* 구분 필터 */}
              <div className="flex flex-col gap-1">
                <label className="text-xs font-black text-slate-800 ml-1">구분</label>
                <select value={searchGubun} onChange={(e) => setSearchGubun(e.target.value)} className={`${inputBaseStyle} w-[120px]`}>
                  <option value="전체">전체</option>
                  <option value="온라인">온라인</option>
                  <option value="오프라인">오프라인</option>
                </select>
              </div>

              {/* 물류센터 드롭다운 */}
              <div className="flex flex-col gap-1">
                <label className="text-xs font-black text-slate-800 ml-1">물류센터</label>
                <select 
                  value={searchCenter} 
                  onChange={(e) => setSearchCenter(e.target.value)} 
                  disabled={isLocalManager && userCenterList.length === 1} // 관리센터가 1개인 경우 고정
                  className={`${inputBaseStyle} ${(isLocalManager && userCenterList.length === 1) ? 'bg-slate-100 text-slate-500 cursor-not-allowed' : ''}`}
                >
                  {/* 001003이고 센터가 1개면 '전체' 옵션을 아예 제거 */}
                  {(!isLocalManager || userCenterList.length > 1) && <option value="전체">전체</option>}
                  {filteredDevcenterList.map((dc) => (
                    <option key={dc.comm_ccode} value={dc.comm_ccode}>{dc.comm_text1}</option>
                  ))}
                </select>
              </div>

              {/* 배송일자 필터 (구분 오른쪽으로 이동됨) */}
              <div className="flex flex-col gap-1">
                <label className="text-xs font-black text-slate-800 ml-1">배송일자</label>
                <input type="date" value={searchDate} onChange={(e) => setSearchDate(e.target.value)} className={`${inputBaseStyle} w-[140px]`} />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs font-black text-slate-800 ml-1">고객명</label>
                <input type="text" placeholder="고객명" value={searchName} onChange={(e) => setSearchName(e.target.value)} onKeyDown={handleKeyDown} className={`${inputBaseStyle} w-[110px]`} />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-black text-slate-800 ml-1">연락처</label>
                <input type="text" placeholder="연락처" value={searchHp} onChange={(e) => setSearchHp(e.target.value)} onKeyDown={handleKeyDown} className={`${inputBaseStyle} w-[130px]`} />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-black text-slate-800 ml-1">기사명</label>
                <input type="text" placeholder="기사명" value={searchDriver} onChange={(e) => setSearchDriver(e.target.value)} onKeyDown={handleKeyDown} className={`${inputBaseStyle} w-[110px]`} />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-black text-slate-800 ml-1">배송주소</label>
                <input type="text" placeholder="주소" value={searchAddr} onChange={(e) => setSearchAddr(e.target.value)} onKeyDown={handleKeyDown} className={`${inputBaseStyle} w-[200px]`} />
              </div>
              
              <div className="flex items-center gap-3">
                <button 
                  onClick={fetchDeliveryData} 
                  disabled={loading} 
                  className="bg-slate-900 text-white px-8 h-[40px] rounded-lg font-black text-[14px] hover:bg-blue-600 active:scale-95 transition-all shadow-md disabled:opacity-50"
                >
                  {loading ? '조회 중...' : '데이터 조회하기'}
                </button>
                <div className="h-[40px] flex items-center px-4 bg-slate-100 border-2 border-slate-200 rounded-lg">
                  <span className="text-xs font-bold text-slate-500 mr-2">검색 결과:</span>
                  <span className="text-sm font-black text-blue-600">{deliveryData.length}</span>
                  <span className="text-xs font-bold text-slate-500 ml-0.5">건</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 📊 데이터 테이블 영역 */}
        <div className="bg-white rounded-[2rem] shadow-xl border-2 border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[1200px] table-fixed">
              <thead>
                <tr className="bg-slate-900 border-b border-slate-800 sticky top-0 z-50 shadow-md">
                  <th className="p-5 text-sm font-black text-slate-300 text-center w-[100px]">상태</th>
                  <th className="p-5 text-sm font-black text-slate-300 text-center w-[120px]">구분</th>
                  <th className="p-5 text-sm font-black text-slate-300 text-center w-[170px]">일자정보</th>
                  <th className="p-5 text-sm font-black text-slate-300 text-center w-[170px]">고객/연락처</th>
                  <th className="p-5 text-sm font-black text-slate-300 text-center w-[200px]">기사/배송메모</th>
                  <th className="p-5 text-sm font-black text-slate-300">물류센터 / 배송주소 / 고객메모</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {deliveryData.length === 0 ? (
                  <tr><td colSpan={6} className="p-20 text-center text-slate-400 font-bold">데이터가 없습니다.</td></tr>
                ) : (
                  deliveryData.map((item) => {
                    const status = getStatusInfo(item.cust_devstatus);
                    const showDevCost = item.cust_devcost && String(item.cust_devcost) !== '0';
                    
                    return (
                      <React.Fragment key={item.cust_ordno}>
                        <tr 
                          onClick={() => toggleRow(item.cust_ordno)} 
                          className={`cursor-pointer transition-all ${expandedId === item.cust_ordno ? 'bg-blue-50/50' : 'hover:bg-slate-50'}`}
                        >
                          <td className="p-5 text-center">
                            <span
                              onClick={(e) => {
                                e.stopPropagation();
                                // '배송전(002001)'을 제외한 모든 유효 상태에서 팝업 오픈
                                if (['002003', '002004', '002008'].includes(item.cust_devstatus)) {
                                  openStatusModal(item);
                                }
                              }} 
                              className={`
                                inline-block w-20 py-1.5 rounded-full text-xs font-black text-white shadow-sm transition-all
                                ${['002003', '002004', '002008'].includes(item.cust_devstatus) 
                                  ? 'cursor-pointer underline underline-offset-4 decoration-white/50 hover:scale-105 hover:brightness-110 active:scale-95' 
                                  : 'cursor-default'}
                              `}
                              style={{ backgroundColor: item.status_hex }} 
                            >
                              {item.status_name}
                            </span>
                            <div className="text-[10px] text-slate-400 mt-2 font-mono">{item.cust_ordno}</div>
                          </td>
                          <td className="p-5 text-center whitespace-nowrap">
                            <span className={`px-3 py-1 rounded-md text-xs font-black ${item.cust_gubun === '온라인' ? 'bg-purple-100 text-purple-700' : 'bg-orange-100 text-orange-700'}`}>
                              {item.cust_gubun || '-'}
                            </span>
                          </td>
                          <td className="p-5">
                            <div className="flex flex-col gap-1">
                              <div className="flex items-center gap-2">
                                <span className="text-[10px] bg-slate-200 px-1 rounded font-bold">배송</span>
                                <span className="text-sm font-bold text-slate-700">{item.cust_devdate || '-'}</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-[10px] bg-amber-100 text-amber-700 px-1 rounded font-bold">요청</span>
                                <span className="text-sm font-bold text-slate-700">{item.cust_reqdate || '-'}</span>
                              </div>
                            </div>
                          </td>
                          <td className="p-5">
                              <div className="text-lg font-black text-slate-900">{item.cust_name}</div>
                              <div className="text-xs text-blue-600 font-black">{item.cust_hpno1}</div>
                          </td>
                          <td className="p-5">
                              <div className="text-base font-black text-slate-800">{item.driver_name || '미지정'}</div>
                              {showDevCost && (
                                <div className="text-sm text-slate-600 font-bold">
                                  {isNaN(Number(item.cust_devcost)) ? item.cust_devcost : Number(item.cust_devcost).toLocaleString() + '원'}
                                </div>
                              )}
                          </td>
                          <td className="p-5">
                            <div className="flex items-center gap-3 mb-2 overflow-hidden">
                              {/* 물류센터 배지 - 고정 너비 유지 */}
                              <span className="shrink-0 px-2 py-0.5 bg-slate-100 border border-slate-300 text-slate-600 text-[11px] font-black rounded">
                                {item.center_name || '미지정'}
                              </span>
                              <button 
                                onClick={(e) => openMapModal(e, item.cust_address)}
                                className="text-left text-sm font-bold text-slate-700 hover:text-blue-600 hover:underline transition-all truncate flex-1"
                                title={item.cust_address} // 마우스 오버 시 전체 주소 툴팁 표시
                              >
                                📍 {item.cust_address}
                              </button>
                            </div>  
                            <div className="bg-red-50 p-2 rounded-lg border border-red-100">
                              <div className="text-[11px] text-red-400 font-black mb-1 uppercase tracking-tighter">고객메모</div>
                              <div className="text-[12px] text-black-600 font-bold leading-tight">
                                {item.cust_memo || '-'}
                              </div>
                            </div>                              
                          </td>
                        </tr>
                        <tr>
                          <td colSpan={6} className="p-0 border-none">
                            <div className={`overflow-hidden transition-all duration-300 ${expandedId === item.cust_ordno ? 'max-h-[800px]' : 'max-h-0'}`}>
                              <div className="p-4 px-12 pb-8 bg-blue-50/20">
                                <div className="bg-white rounded-2xl border-2 border-blue-100 shadow-sm overflow-hidden">
                                  <table className="w-full">
                                    <thead className="bg-blue-50">
                                      <tr>
                                        <th className="px-6 py-2 text-[11px] font-black text-blue-400 uppercase text-left">품목명</th>
                                        <th className="px-6 py-2 text-[11px] font-black text-blue-400 uppercase text-left">창고</th>
                                        <th className="px-6 py-2 text-[11px] font-black text-blue-400 uppercase text-right">수량</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-blue-50">
                                      {item.items.map((sub: any, i: number) => (
                                        <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}>
                                          <td className="px-6 py-3 text-base font-black text-slate-800">{sub.name}</td>
                                          <td className="px-6 py-3 text-sm font-bold text-slate-400">{sub.wh}</td>
                                          <td className="px-6 py-3 text-base font-black text-slate-900 text-right">{sub.qty} 개</td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              </div>
                            </div>
                          </td>
                        </tr>
                      </React.Fragment>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* 🔝 퀵 메뉴: 상단 이동 버튼 */}
      <div className={`fixed bottom-8 right-8 z-[999] transition-all duration-300 ${showTopBtn ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10 pointer-events-none'}`}>
        <button
          onClick={scrollToTop}
          className="flex flex-col items-center justify-center w-16 h-16 bg-slate-900 text-white rounded-full shadow-2xl hover:bg-blue-600 hover:scale-110 active:scale-95 transition-all group"
          title="맨 위로"
        >
          <span className="text-2xl mb-[-4px] group-hover:-translate-y-1 transition-transform">▲</span>
          <span className="text-[10px] font-black uppercase tracking-tighter">TOP</span>
        </button>
      </div>

      {/* 📍 지도 확인 모달 */}
      {isMapOpen && (
        <div className="fixed inset-0 z-[9999] bg-black/70 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-[2rem] shadow-2xl w-full max-w-xl overflow-hidden border-2 border-white">
            <div className="p-5 border-b flex justify-between items-center bg-slate-50">
              <h3 className="font-black text-slate-900 text-xl flex items-center gap-2">지도 보기</h3>
              <button onClick={() => setIsMapOpen(false)} className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-slate-200 text-2xl text-slate-500">×</button>
            </div>
            <div className="relative bg-slate-100">
              <iframe 
                width="100%" height="380" style={{ border: 0 }} loading="lazy" allowFullScreen
                src={`https://maps.google.com/maps?q=${encodeURIComponent(selectedAddress)}&t=&z=16&ie=UTF8&iwloc=&output=embed`} 
              />
            </div>
            <div className="p-6 bg-white">
              <div className="mb-6">
                <p className="text-sm text-slate-400 font-bold mb-1">배송 주소</p>
                <p className="text-slate-900 font-black text-lg">📍 {selectedAddress}</p>
              </div>
              <button onClick={() => setIsMapOpen(false)} className="w-full py-4 bg-slate-900 text-white font-black text-xl rounded-2xl hover:bg-blue-600 transition-all active:scale-95 shadow-xl">닫기</button>
            </div>
          </div>
        </div>
      )}

      {isStatusModalOpen && selectedItem && (() => {
        const theme = getModalTheme(selectedItem.cust_devstatus);
        return (
          <div className="fixed inset-0 z-[10000] bg-slate-900/60 flex items-center justify-center p-4 backdrop-blur-sm">
            {/* 카드형 컨테이너 */}
            <div className="bg-white rounded-[2rem] shadow-2xl w-full max-w-md overflow-hidden border border-slate-200 animate-in fade-in zoom-in duration-200">
              
              {/* 1. 상단 카드 헤더 (컬러 배경) */}
              <div className={`${theme.color} p-6 pb-8 relative`}>
                <div className="flex justify-between items-start">
                  <div>
                    <span className={`px-3 py-1 rounded-full text-[11px] font-black bg-white ${theme.text} shadow-sm mb-2 inline-block`}>
                      {selectedItem.status_name}
                    </span>
                    <h3 className="text-2xl font-black text-slate-900 leading-tight">
                      {selectedItem.cust_name} <span className="text-sm font-normal text-slate-500">고객님</span>
                    </h3>
                  </div>
                  <button 
                    onClick={() => setIsStatusModalOpen(false)} 
                    className="bg-white/50 hover:bg-white w-8 h-8 rounded-full flex items-center justify-center text-slate-600 transition-colors"
                  >
                    ✕
                  </button>
                </div>
              </div>

              {/* 2. 카드 메인 컨텐츠 (위로 살짝 겹침) */}
              <div className="px-6 pb-8 mt-2">
                <div className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden">
                  
                  {/* 증빙 사진 영역 */}
                  {selectedItem.cust_devstatus === '002003' && (
                    <div className="p-4 bg-slate-50/50">
                      <p className="text-[11px] font-black text-slate-400 uppercase mb-2 ml-1">
                        배송 증빙 자료 ({selectedItem.images?.length || 0})
                      </p>
                      
                      {/* 💡 핵심: w-full과 overflow-x-auto를 주어 부모 너비를 넘지 않게 합니다. */}
                      <div className="flex gap-3 overflow-x-auto pb-3 snap-x scrollbar-hide w-full custom-scroll">
                        {selectedItem.images && selectedItem.images.length > 0 ? (
                          selectedItem.images.map((img: any, idx: number) => (
                            <div 
                              key={idx}
                              onClick={() => setPreviewIndex(idx)} // 주소 대신 인덱스를 저장 
                              className="relative min-w-[260px] max-w-[260px] aspect-[4/3] bg-slate-200 rounded-2xl overflow-hidden shadow-sm snap-start border border-white"
                            >
                              <img 
                                src={img.url} 
                                className="w-full h-full object-cover shadow-inner" 
                                alt={`증빙-${idx}`} 
                              />
                              <div className="absolute top-2 left-2">
                                <span className="px-2 py-1 bg-black/60 backdrop-blur-md text-white text-[9px] font-bold rounded-lg shadow-sm">
                                  {img.type === 'PHOTO' ? '📸 배송사진' : '✍️ 고객서명'}
                                </span>
                              </div>
                            </div>
                          ))
                        ) : (
                          <div className="w-full h-40 bg-white rounded-2xl border-2 border-dashed border-slate-200 flex flex-col items-center justify-center text-slate-300">
                            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                              <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7" />
                              <circle cx="9" cy="9" r="2" />
                            </svg>
                            <p className="mt-2 text-[10px] font-bold uppercase tracking-widest">No Photos</p>
                          </div>
                        )}
                      </div>
                    </div>
                  )}  

                  {/* 정보 그리드 */}
                  <div className="p-5 space-y-4">
                    {/* 📅 배송연기일 때만 '연기일자' 추가 표시 */}
                    {selectedItem.cust_devstatus === '002004' && (
                      <div className="bg-amber-50 p-4 rounded-2xl border border-amber-100 mb-2">
                        <p className="text-[11px] font-black text-amber-500 uppercase mb-1">재배송 예정일 (연기일자)</p>
                        <p className="text-xl font-black text-amber-700">
                          {selectedItem.cust_devdelaydate || '-'}
                        </p>
                      </div>
                    )}

                    {/* 🚫 배송취소(002008)일 때 강조 문구 (선택 사항) */}
                    {selectedItem.cust_devstatus === '002008' && (
                      <div className="bg-red-50 p-4 rounded-2xl border border-red-100 mb-2">
                        <p className="text-[11px] font-black text-red-500 uppercase mb-1">처리 안내</p>
                        <p className="text-sm font-bold text-red-700 uppercase">해당 주문은 배송 취소 처리되었습니다.</p>
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <p className="text-[11px] font-black text-slate-400 uppercase">배송기사</p>
                        <p className="text-sm font-bold text-slate-800 flex items-center gap-1">
                          {selectedItem.driver_name || '미지정'}
                        </p>
                      </div>
                      <div className="space-y-1 text-right">
                        <p className="text-[11px] font-black text-slate-400 uppercase">처리 시간</p>
                        <p className="text-sm font-bold text-slate-800">
                          {selectedItem.status_time ? selectedItem.status_time.substring(0, 16) : '-'}
                        </p>
                      </div> 
                    </div>

                    <hr className="border-slate-50" />

                    {/* 사유/코멘트 영역 */}
                    <div className="space-y-2">
                      <p className="text-[11px] font-black text-slate-400 uppercase">
                        {selectedItem.cust_devstatus === '002004' ? '연기 사유' : 
                        selectedItem.cust_devstatus === '002008' ? '취소 사유' : '배송완료 메모'} 
                      </p>
                      <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                        <p className="text-sm text-slate-700 font-medium leading-relaxed whitespace-pre-wrap">
                          {selectedItem.cust_drivercomment || selectedItem.status_memo || '남겨진 메모가 없습니다.'}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 하단 닫기 버튼 */}
                <button 
                  onClick={() => setIsStatusModalOpen(false)} 
                  className={`w-full mt-6 py-4 rounded-2xl font-black text-white shadow-lg transition-all active:scale-95 ${theme.btn} bg-slate-900`}
                >
                  확인 및 닫기
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* 🔍 이미지 크게 보기 모달 (라이트박스) */}
      {previewIndex !== null && selectedItem?.images && (
        <div 
          className="fixed inset-0 z-[11000] bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-4 md:p-10 animate-in fade-in duration-200"
          onClick={() => setPreviewIndex(null)}
        >
          {/* 메인 컨테이너: 화면을 다 채우지 않고 최대 크기를 제한함 */}
          <div 
            className="relative w-full max-w-4xl h-[80vh] bg-white rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col border-4 border-white animate-in zoom-in-95 duration-300"
            onClick={(e) => e.stopPropagation()} // 내부 클릭 시 닫힘 방지
          >
            
            {/* 1. 상단 바 (정보 및 닫기) */}
            <div className="flex justify-between items-center p-6 bg-slate-50 border-b">
              <div className="flex items-center gap-3">
                <span className="bg-slate-900 text-white px-3 py-1 rounded-full text-xs font-black">
                  {previewIndex + 1} / {selectedItem.images.length}
                </span>
                <span className="text-slate-600 font-bold text-sm">
                  {selectedItem.images[previewIndex].type === 'PHOTO' ? '배송 사진 확인' : '서명 확인'}
                </span>
              </div>
              <button 
                onClick={() => setPreviewIndex(null)}
                className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-slate-200 text-slate-500 text-2xl transition-colors"
              >
                
              </button>
            </div>

            {/* 2. 이미지 영역 (화살표 포함) */}
            <div className="relative flex-1 bg-slate-100 flex items-center justify-center overflow-hidden">
              
              {/* ◀ 이전 버튼 */}
              {previewIndex > 0 && (
                <button 
                  onClick={(e) => { e.stopPropagation(); setPreviewIndex(previewIndex - 1); }}
                  className="absolute left-4 z-10 w-12 h-12 flex items-center justify-center bg-white/80 hover:bg-white text-slate-800 rounded-full shadow-lg transition-all active:scale-90"
                >
                  <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="3" viewBox="0 0 24 24">
                    <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              )}

              {/*이미지 */}
              <img 
                key={previewIndex}
                src={selectedItem.images[previewIndex].url} 
                className="max-w-full max-h-full object-contain p-4 select-none"
                alt="확대이미지" 
              />

              {/* ▶ 다음 버튼 */}
              {previewIndex < selectedItem.images.length - 1 && (
                <button 
                  onClick={(e) => { e.stopPropagation(); setPreviewIndex(previewIndex + 1); }}
                  className="absolute right-4 z-10 w-12 h-12 flex items-center justify-center bg-white/80 hover:bg-white text-slate-800 rounded-full shadow-lg transition-all active:scale-90"
                >
                  <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="3" viewBox="0 0 24 24">
                    <path d="M9 5l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              )}
            </div>

            {/* 3. 하단 안내 (선택사항) */}
            <div className="p-4 bg-white text-center border-t">
              <p className="text-xs text-slate-400 font-medium">배경을 클릭하거나 ✕ 버튼을 누르면 닫힙니다.</p>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}