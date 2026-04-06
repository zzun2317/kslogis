'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { supabase } from '@/lib/supabase'; // 설정된 경로에 맞게 수정 필요
import * as XLSX from 'xlsx';

export default function SabangnetVerifyPage() {
  const [orders, setOrders] = useState<any[]>([]);
  const [searchDate, setSearchDate] = useState('');
  const [isLoading, setIsLoading] = useState(false);
	const [originalOrders, setOriginalOrders] = useState<any[]>([]);
	const topScrollRef = useRef<HTMLDivElement>(null);
  const tableContainerRef = useRef<HTMLDivElement>(null);
	const [tableWidth, setTableWidth] = useState(0);
	const [searchTerm, setSearchTerm] = useState('');
	const filteredOrders = useMemo(() => {
		if (!searchTerm) return orders;
		return orders.filter(order => 
			order.order_id?.includes(searchTerm) || 
			order.receive_name?.includes(searchTerm) ||
			order.receive_tel?.includes(searchTerm)
		);
	}, [orders, searchTerm]);
	
  // 1. 초기 시스템 날짜 설정 (오늘 날짜)
  useEffect(() => {
    const today = new Date().toISOString().split('T')[0];
    setSearchDate(today);
    fetchTempOrders(today);
  }, []);

	// 2. 테이블 너비를 실시간으로 계산하는 useEffect
  useEffect(() => {
    const updateWidth = () => {
      if (tableContainerRef.current) {
        // 테이블 본체의 실제 스크롤 가능 너비를 가져옴
        setTableWidth(tableContainerRef.current.scrollWidth);
      }
    };

    updateWidth();
    window.addEventListener('resize', updateWidth);
    return () => window.removeEventListener('resize', updateWidth);
  }, [orders]); // 데이터(orders)가 로드될 때마다 재측정

  // 2. 양방향 스크롤 싱크 함수 (배송 수정 페이지 로직 적용)
  const onTopScroll = () => {
    if (topScrollRef.current && tableContainerRef.current) {
      tableContainerRef.current.scrollLeft = topScrollRef.current.scrollLeft;
    }
  };

  const onBottomScroll = () => {
    if (topScrollRef.current && tableContainerRef.current) {
      topScrollRef.current.scrollLeft = tableContainerRef.current.scrollLeft;
    }
  };

  // 2. 데이터 조회 함수
	const fetchTempOrders = async (date: string) => {
		setIsLoading(true);
		try {
			// 직접 쿼리 대신 생성하신 RPC 함수(예: fn_get_sabangnet_verify_list)를 호출합니다.
			const { data, error } = await supabase.rpc('fn_get_sabangnet_verify_list', { 
				search_date: date.replace(/-/g, '') // '2026-03-24' -> '20260324' (사방넷 포맷)
			});

			if (error) throw error;

			// 함수에서 반환된 가공된 데이터를 상태에 저장합니다.
			setOrders(data || []);
			setOriginalOrders(JSON.parse(JSON.stringify(data || [])));
		} catch (error) {
			console.error('데이터 조회 오류:', error);
			alert('데이터를 가져오는 중 오류가 발생했습니다.');
		} finally {
			setIsLoading(false);
		}
	};

	// 3. ERP 세트명 실시간 수정 핸들러 (독립적으로 선언)
  const handleFieldChange = (tempSeq: number, field: string, value: string) => {
  setOrders(prev => prev.map(item => 
    item.temp_seq === tempSeq ? { ...item, [field]: value } : item
  ));
};

	// 특정 행의 데이터가 변경되었는지 확인
	const isRowChanged = (item: any) => {
			const original = originalOrders.find(o => o.temp_seq === item.temp_seq);
			return original && original.erp_set_name !== item.erp_set_name;
	};

	// 컴포넌트 내부 handleErpNameChange 아래에 추가
	const handleSaveRow = async (item: any) => {
		if (!isRowChanged(item)) return;
		if (!item.erp_set_name) {
			alert('ERP 세트품명을 입력해 주세요.');
			return;
		}

		try {
			setIsLoading(true);
			const { error } = await supabase.rpc('fn_insert_shopitem_from_sabang', {
				p_idx: item.idx,
				p_erp_set_name: item.erp_set_name,
				p_erp_underboard: item.erp_underboard,
				p_erp_sideboard: item.erp_sideboard,
				p_erp_connboard: item.erp_connboard,
				p_erp_mattress: item.erp_mattress,
				p_erp_outsideboard: item.erp_outsideboard,
				p_erp_footboard: item.erp_footboard,
				p_erp_gift: item.erp_gift,
				p_erp_etc: item.erp_etc
			});

			if (error) throw error;

			alert('성공적으로 저장되었습니다.');

			// 방법 1: 전체 데이터를 다시 불러와서 동기화 (가장 확실함)
			await fetchTempOrders(searchDate); 

			/* // 방법 2: 전체 재조회 없이 해당 행만 원본 데이터와 동기화 (네트워크 비용 절감)
			setOriginalOrders(prev => 
				prev.map(original => 
					original.temp_seq === item.temp_seq 
						? { ...original, erp_set_name: item.erp_set_name } 
						: original
				)
			);
			*/
			
		} catch (error) {
			console.error('저장 중 오류 발생:', error);
			alert('저장 처리 중 오류가 발생했습니다.');
		} finally {
			setIsLoading(false);
		}
	};

	const handleExcelDownloadERP = (format: 'xls' | 'xlsx') => {
		if (filteredOrders.length === 0) {
			alert("다운로드할 데이터가 없습니다.");
			return;
		}

		try {
			// 1. ERP 양식에 맞춘 데이터 매핑
			const excelData = filteredOrders.map((item) => {
				const unitPrice = Number(item.pay_cost) || 0; // 단가 (필요시 적절한 필드로 변경)
				const quantity = Number(item.order_count) || 1; // 수량
				// 특수문자(/, -, 공백 등)를 모두 제거하고 숫자만 추출
				const rawDate = item.order_date || '';
				const cleanDate = rawDate.replace(/[^0-9]/g, ''); // 숫자 외의 모든 문자 제거
				const finalOrderDate = cleanDate.slice(0, 8);

				return {
					'사업부문': '금성침대',
					'주문일자': finalOrderDate, // YYYYMMDD
					'거래처': item.mall_id || '', 
					'납품처': item.receive_info || '',
					'품목': item.erp_set_name || '', // ERP세트품명 매핑
					'단위': 'EA',
					'부가세포함': '1',
					'단가': unitPrice,
					'수량': quantity,
					'금액': unitPrice * quantity,
					'창고': '', // 필요한 경우 고정값 입력 가능
					'비고': item.delv_msg1 || '',
					'운송비': 0,
					'운송비부가세': 0,
					'시공비': 0,
					'시공비부가세': 0,
					'매체': item.order_gubun === '사방넷' ? '인터넷' : '방송',
					'주문번호': item.order_id || '',
					'주문인': item.user_name || '',
					'주문인연락처': item.user_cel || '',
					'통화내용': '',
					'사방넷주문번호': item.idx || '',
					'납기일': '',
					'상품번호': item.mall_product_id || '' // 쇼핑몰상품코드
				};
			});

			// 2. 워크시트 및 워크북 생성
			const worksheet = XLSX.utils.json_to_sheet(excelData);
			const workbook = XLSX.utils.book_new();
			XLSX.utils.book_append_sheet(workbook, worksheet, "ERP_UPLOAD");

			// 3. 파일 생성 및 다운로드 (확장자 선택 적용)
			const fileName = `ERP_주문수집_${searchDate}.${format}`;
			
			// xlsx 라이브러리의 writeFile은 확장자에 따라 내부 버전을 자동으로 조정합니다.
			XLSX.writeFile(workbook, fileName, { bookType: format });

		} catch (error) {
			console.error("ERP Excel download error:", error);
			alert("엑셀 생성 중 오류가 발생했습니다.");
		}
	};

	return (
    <div className="flex flex-col h-screen bg-slate-50">
      {/* 헤더 섹션 */}
      <div className="p-6 bg-white border-b border-slate-200 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-black text-slate-900 flex items-center gap-2">
              <span className="w-2 h-8 bg-blue-600 rounded-full"></span>
              사방넷 수집 데이터 검증
            </h1>
            <p className="text-slate-500 text-sm mt-1 font-medium">임시 테이블에 저장된 주문 건을 확인합니다.</p>
          </div>

          <div className="flex items-center gap-3 bg-white bg-slate-100 p-2 rounded-xl border border-slate-200">
            <label className="text-sm font-bold text-slate-700 ml-2">수집일자 조회</label>
            <input 
              type="date" 
              value={searchDate}
              onChange={(e) => setSearchDate(e.target.value)}
              className="border border-slate-300 px-3 h-10 rounded-lg bg-white text-black focus:ring-2 focus:ring-blue-500 outline-none"
            />
            <button 
							onClick={() => fetchTempOrders(searchDate)}
							disabled={isLoading}
							className="bg-slate-900 text-white px-5 h-10 rounded-lg font-bold hover:bg-blue-600 transition-all active:scale-95 disabled:bg-slate-400 flex items-center gap-2"
						>
							{isLoading ? '조회 중...' : (
								<>
									<span>데이터 조회</span>
									<span className="bg-blue-500 text-[11px] px-2 py-0.5 rounded-full shadow-inner">
										{orders.length.toLocaleString()}건
									</span>
								</>
							)}
						</button>
						{/* 신규: 엑셀파일 내려받기(ERP) 버튼 추가 */}
						<button
							onClick={() => {
								// 확장자 선택 로직
								const choice = confirm("'확인'을 누르면 .xlsx로, '취소'를 누르면 .xls로 다운로드합니다.");
								handleExcelDownloadERP(choice ? 'xlsx' : 'xls');
							}}
							className="flex items-center gap-2 px-6 h-[45px] bg-emerald-600 text-white rounded-xl font-black text-sm hover:bg-emerald-700 transition-all shadow-lg active:scale-95 group"
						>
							<svg 
								xmlns="http://www.w3.org/2000/svg" 
								width="20" 
								height="20" 
								viewBox="0 0 24 24" 
								fill="none" 
								stroke="currentColor" 
								strokeWidth="2.5" 
								strokeLinecap="round" 
								strokeLinejoin="round"
								className="group-hover:translate-y-0.5 transition-transform"
							>
								<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
								<polyline points="7 10 12 15 17 10" />
								<line x1="12" y1="15" x2="12" y2="3" />
							</svg>
							엑셀파일 내려받기(ERP)
						</button>
          </div>
        </div>
      </div>

			{/* 상단 가로 스크롤 동기화용 더미 바 */}
      <div 
				ref={topScrollRef}
				onScroll={onTopScroll}
				// 배송 수정 페이지와 동일한 스타일 적용 (rounded-t-xl, border-t 등)
				className="overflow-x-auto overflow-y-hidden bg-white border-x border-t border-slate-200 rounded-t-xl custom-scrollbar"
				style={{ height: '18px', minHeight: '18px' }}
			>
				{/* 실제 테이블 너비를 반영하도록 설정 */}
				<div style={{ width: `${tableWidth}px`, height: '1px' }}></div>
			</div>

      {/* 테이블 섹션 */}
      <div className="flex-1 p-6 overflow-hidden">
        <div className="h-full border border-slate-300 rounded-2xl bg-white shadow-xl overflow-hidden flex flex-col">
          <div className="overflow-x-auto overflow-y-auto custom-scrollbar flex-1">
						<div 
							ref={tableContainerRef}
							onScroll={onBottomScroll}
							className="flex-1 overflow-auto custom-scrollbar"
						>
							<table className="min-w-full border-collapse">
								<thead className="bg-slate-900 sticky top-0 z-20">
									<tr>
										<th className="px-4 py-4 text-white font-bold border-r border-slate-700 whitespace-nowrap">주문번호(ID)</th>
										<th className="px-4 py-4 text-white font-bold border-r border-slate-700 whitespace-nowrap">주문일자</th>
										<th className="px-4 py-4 text-white font-bold border-r border-slate-700 whitespace-nowrap min-w-[150px]">거래처(매체)</th>
										<th className="px-4 py-4 text-white font-bold border-r border-slate-700 whitespace-nowrap min-w-[120px]">주문인</th>
										<th className="px-4 py-4 text-white font-bold border-r border-slate-700 whitespace-nowrap min-w-[300px]">납품처 (수취인/연락처/주소)</th>
										<th className="px-4 py-4 text-white font-bold border-r border-slate-700 whitespace-nowrap">수량</th>
										<th className="px-4 py-4 text-white font-bold border-r border-slate-700 whitespace-nowrap min-w-[250px]">품목(상품명)</th>
										<th className="px-3 py-4 text-white font-bold border-r border-slate-700 whitespace-nowrap w-[60px] text-center">저장</th>
										<th className="px-4 py-4 text-white font-bold border-r border-slate-700 whitespace-nowrap min-w-[250px] decoration-slate-600/90 underline underline-offset-4 decoration-3">ERP세트품명</th>
										<th className="px-4 py-4 text-white font-bold border-r border-slate-700 whitespace-nowrap min-w-[200px] text-center decoration-slate-600/90 underline underline-offset-4 decoration-3">깔판</th>
										<th className="px-4 py-4 text-white font-bold border-r border-slate-700 whitespace-nowrap min-w-[200px] text-center decoration-slate-600/90 underline underline-offset-4 decoration-3">측판</th>
										<th className="px-4 py-4 text-white font-bold border-r border-slate-700 whitespace-nowrap min-w-[200px] text-center decoration-slate-600/90 underline underline-offset-4 decoration-3">발통</th>
										<th className="px-4 py-4 text-white font-bold border-r border-slate-700 whitespace-nowrap min-w-[200px] text-center decoration-slate-600/90 underline underline-offset-4 decoration-3">매트</th>
										<th className="px-4 py-4 text-white font-bold border-r border-slate-700 whitespace-nowrap min-w-[200px] text-center decoration-slate-600/90 underline underline-offset-4 decoration-3">협탁</th>
										<th className="px-4 py-4 text-white font-bold border-r border-slate-700 whitespace-nowrap min-w-[200px] text-center decoration-slate-600/90 underline underline-offset-4 decoration-3">후드</th>
										<th className="px-4 py-4 text-white font-bold border-r border-slate-700 whitespace-nowrap min-w-[200px] text-center decoration-slate-600/90 underline underline-offset-4 decoration-3">사은품</th>
										<th className="px-4 py-4 text-white font-bold border-r border-slate-700 whitespace-nowrap min-w-[200px] text-center decoration-slate-600/90 underline underline-offset-4 decoration-3">기타</th>
										<th className="px-4 py-4 text-white font-bold border-r border-slate-700 whitespace-nowrap min-w-[100px]">단가</th>
										<th className="px-4 py-4 text-white font-bold border-r border-slate-700 whitespace-nowrap text-center min-w-[100px]">창고</th>
										<th className="px-4 py-4 text-white font-bold whitespace-nowrap min-w-[250px]">비고</th>
										<th className="px-4 py-4 text-white font-bold border-r border-slate-700 whitespace-nowrap min-w-[150px]">수집구분</th>
									</tr>
								</thead>
								<tbody className="divide-y divide-slate-200">
									{orders.length > 0 ? (
										orders.map((item) => {
											const isMappingFailed = !item.erp_set_name;
											const infoInputStyle = "w-full px-2 py-1 text-[12px] text-slate-900 bg-white border border-slate-200 rounded focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition-all font-medium";
											return (
												<tr key={item.temp_seq} className="hover:bg-blue-50 transition-colors">
													<td className="px-4 py-3 font-medium text-slate-900 border-r border-slate-100">
														<div className="flex flex-col">
															<span className="text-[11px] text-blue-600 font-bold">{item.idx}</span>
															<span>{item.order_id}</span>
														</div>
													</td>
													{/* 주문일자 및 수집일시 (중요!) */}
													<td className="px-4 py-3 border-r border-slate-100 text-center">
														<div className="flex flex-col items-center">
															<span className="text-slate-700 font-medium">{item.order_date}</span>
															<span className="text-[11px] text-slate-400 mt-0.5">
																수집: {item.reg_date ? `${item.reg_date.substring(8,10)}:${item.reg_date.substring(10,12)}` : '-'}
															</span>
														</div>
													</td>
													<td className="px-4 py-3 text-slate-700 border-r border-slate-100 whitespace-nowrap">
														{item.mall_id}
													</td>
													<td className="px-4 py-3 text-slate-700 border-r border-slate-100 whitespace-nowrap">
														<div className="font-bold">{item.user_name}</div>
														<div className="text-[11px] text-slate-400">{item.user_cel}</div>
													</td>
													<td className="px-4 py-3 text-slate-700 border-r border-slate-100">
														<div className="text-[12px] text-slate-700 leading-snug line-clamp-3 whitespace-pre-wrap">
															{item.receive_info}
														</div>
													</td>
													<td className="px-4 py-3 text-[12px] text-slate-900 font-bold border-r border-slate-100 text-left">
														{Number(item.sale_cnt).toLocaleString()}
													</td>
													<td className="px-4 py-3 border-r border-slate-100 min-w-max">
														<div className="flex flex-col min-w-[300px]">
															<div className="text-[11px] text-slate-400 italic whitespace-nowrap">
																#{item.mall_product_id}
															</div>
															<div className={`font-medium text-[13px] leading-snug whitespace-pre-wrap break-all ${isMappingFailed ? 'text-red-600 font-bold' : 'text-slate-700'}`}>
																{item.product_name}
																{isMappingFailed && <span className="ml-1 text-[10px] text-red-500 animate-pulse">[미매칭]</span>}
															</div>
														</div>
													</td>

													<td className="px-2 py-3 text-center align-middle border-r border-slate-100 bg-white min-w-[60px]">
														<button 
															onClick={() => handleSaveRow(item)} 
															disabled={!isRowChanged(item)} // 변경사항 없으면 버튼 비활성화
															className={`p-1.5 transition-all rounded-md shadow-sm active:scale-90
																${isRowChanged(item) 
																	? 'text-blue-600 hover:bg-blue-50 bg-blue-50/50 cursor-pointer' 
																	: 'text-slate-200 cursor-not-allowed opacity-50'
																}`}
															title={isRowChanged(item) ? "변경사항 저장" : "변경내용 없음"}
														>
															<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
																<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path>
																<polyline points="17 21 17 13 7 13 7 21"></polyline>
																<polyline points="7 3 7 8 15 8"></polyline>
															</svg>
														</button>
													</td>

													{/* 2. ERP세트품명 부분 수정 */}
													{/* ERP세트품명: 수정 가능한 Input 필드로 변경 */}
													<td className="px-4 py-2 text-slate-700 border-r border-slate-100 bg-blue-50/30 min-w-max">
														<div className="flex flex-col min-w-[300px]">
															<input
																type="text"
																value={item.erp_set_name || ''}
																onChange={(e) => handleFieldChange(item.temp_seq, 'erp_set_name', e.target.value)}
																placeholder="매칭 정보 입력"
																className={`w-full px-3 py-2 text-[12px] font-bold rounded-lg border transition-all outline-none
																	${!item.erp_set_name 
																		? 'bg-red-50 border-red-200 text-red-600 focus:border-red-400' 
																		: 'bg-white border-slate-200 text-blue-700 focus:border-blue-500 focus:ring-2 focus:ring-blue-100'
																	}`}
															/>
															{!item.erp_set_name && (
																<div className="text-[10px] text-red-400 mt-1 ml-1 font-medium italic animate-pulse">
																	* 마스터 데이터와 매칭되지 않았습니다. 직접 입력해 주세요.
																</div>
															)}
														</div>
													</td>
													<td className="px-2 py-1 border-r border-slate-100">
														<input type="text" value={item.erp_underboard || ''} onChange={(e) => handleFieldChange(item.temp_seq, 'erp_underboard', e.target.value)} className={infoInputStyle} />
													</td>
													<td className="px-2 py-1 border-r border-slate-100">
														<input type="text" value={item.erp_sideboard || ''} onChange={(e) => handleFieldChange(item.temp_seq, 'erp_sideboard', e.target.value)} className={infoInputStyle} />
													</td>
													<td className="px-2 py-1 border-r border-slate-100">
														<input type="text" value={item.erp_connboard || ''} onChange={(e) => handleFieldChange(item.temp_seq, 'erp_connboard', e.target.value)} className={infoInputStyle} />
													</td>
													<td className="px-2 py-1 border-r border-slate-100">
														<input type="text" value={item.erp_mattress || ''} onChange={(e) => handleFieldChange(item.temp_seq, 'erp_mattress', e.target.value)} className={infoInputStyle} />
													</td>
													<td className="px-2 py-1 border-r border-slate-100">
														<input type="text" value={item.erp_outsideboard || ''} onChange={(e) => handleFieldChange(item.temp_seq, 'erp_outsideboard', e.target.value)} className={infoInputStyle} />
													</td>
													<td className="px-2 py-1 border-r border-slate-100">
														<input type="text" value={item.erp_footboard || ''} onChange={(e) => handleFieldChange(item.temp_seq, 'erp_footboard', e.target.value)} className={infoInputStyle} />
													</td>
													<td className="px-2 py-1 border-r border-slate-100">
														<input type="text" value={item.erp_gift || ''} onChange={(e) => handleFieldChange(item.temp_seq, 'erp_gift', e.target.value)} className={infoInputStyle} />
													</td>
													<td className="px-2 py-1 border-r border-slate-100">
														<input type="text" value={item.erp_etc || ''} onChange={(e) => handleFieldChange(item.temp_seq, 'erp_etc', e.target.value)} className={infoInputStyle} />
													</td>
													<td className="px-4 py-3 text-slate-600 border-r border-slate-100 text-right whitespace-nowrap">
														{Number(item.pay_cost).toLocaleString()}
													</td>
													<td className="px-4 py-3 text-slate-700 border-r border-slate-100 text-center whitespace-nowrap">
														{item.dpartner_id}
													</td>
													<td className="px-4 py-3 text-slate-500">
														<div className="line-clamp-3 text-[12px] leading-snug">
															{item.delv_msg1 || '-'}
														</div>
													</td>
													<td className="px-4 py-3 text-slate-500">
														<div className="line-clamp-3 text-[12px] leading-snug">
															{item.order_gubun || '-'}
														</div>
													</td>
												</tr>
											);
										})
									) : (
										<tr>
											<td colSpan={10} className="px-4 py-32 text-center text-slate-400 font-bold bg-slate-50">
												데이터가 존재하지 않습니다. 수집일자를 확인해 주세요.
											</td>
										</tr>
									)}
								</tbody>
							</table>
						</div>	
          </div>
        </div>
      </div>

      <style jsx global>{`
        .custom-scrollbar::-webkit-scrollbar { width: 8px; height: 8px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: #f1f5f9; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #94a3b8; }
      `}</style>
    </div>
  );
}