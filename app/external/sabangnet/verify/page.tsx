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
	const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' | null }>({
		key: '',
		direction: null,
	});
	const filteredOrders = useMemo(() => {
		let result = [...orders];
		if (searchTerm) {
			result = result.filter(order => 
				order.order_id?.includes(searchTerm) || 
				order.receive_name?.includes(searchTerm) ||
				order.receive_tel?.includes(searchTerm)
			);
		}

		if (sortConfig.key && sortConfig.direction) {
			result.sort((a, b) => {
				const aValue = a[sortConfig.key] ?? '';
				const bValue = b[sortConfig.key] ?? '';

				if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
				if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
				return 0;
			});
		}
		return result;
	}, [orders, searchTerm, sortConfig]);

	const SortIcon = ({ columnKey, sortConfig }: { columnKey: string, sortConfig: any }) => {
		if (sortConfig.key !== columnKey) return <span className="text-slate-500 opacity-30 text-[10px]">↕</span>;
		return (
			<span className="text-blue-400 text-[10px]">
				{sortConfig.direction === 'asc' ? '▲' : '▼'}
			</span>
		);
	};

	const handleSort = (key: string) => {
		let direction: 'asc' | 'desc' = 'asc';
		if (sortConfig.key === key && sortConfig.direction === 'asc') {
			direction = 'desc';
		}
		setSortConfig({ key, direction });
	};
	
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

	const handleSaveAll = async () => {
		// 1. 변경된 데이터만 필터링
		const changedItems = orders.filter(item => isRowChanged(item));

		if (changedItems.length === 0) {
			alert("변경사항이 있는 데이터가 없습니다.");
			return;
		}

		// 2. 필수값(ERP세트품명) 체크
		const invalidItems = changedItems.filter(item => !item.erp_set_name);
		if (invalidItems.length > 0) {
			alert(`ERP세트품명이 입력되지 않은 건이 ${invalidItems.length}건 있습니다.`);
			return;
		}

		if (!confirm(`${changedItems.length}건의 변경사항을 일괄 저장하시겠습니까?`)) return;

		setIsLoading(true);
		try {
			// 3. 모든 변경 건에 대해 병렬로 RPC 호출 실행
			await Promise.all(
				changedItems.map(item => 
					supabase.rpc('fn_insert_shopitem_from_sabang', {
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
					})
				)
			);

			alert('모든 변경사항이 성공적으로 저장되었습니다.');
			await fetchTempOrders(searchDate); // 화면 데이터 갱신
		} catch (error) {
			console.error('일괄 저장 중 오류:', error);
			alert('일괄 저장 처리 중 일부 또는 전체에서 오류가 발생했습니다.');
		} finally {
			setIsLoading(false);
		}
	};

	// erp양식으로 등록시 처리 내용
	// 수량은 1개씩 입력하고, 2개이상인 경우 동일한 주문건을 새로운 행으로 추가한다
	// 사은품이 있는경우는 동일한 주문건으로 추가로 생성한다
	// 수량이2개, 사은품이 있는경우 > 화면에서는 한 행으로 조회되나, 엑셀은 3개 행으로 분리된다.
	const handleExcelDownloadERP = (format: 'xls' | 'xlsx') => {
		if (filteredOrders.length === 0) {
			alert("다운로드할 데이터가 없습니다.");
			return;
		}

		try {
			// 1. 헤더 정의 (1행: 영문 키(erp컬럼명), 2행: 명칭)
			const headerRow1 = [
				'BizUnitName', 'MmbOrderDate', 'CustName', 'DVPlaceName', 'Dummy13', 
				'ItemName', 'UnitName', 'IsInclusedVAT', 'Price', 'Qty', 'CurAmt', 
				'WHName', 'Remark', 'CarryingCost', 'CarryingVat', 'InstallCost', 
				'InstallVat', 'Dummy6', 'Dummy7', 'Dummy8', 'Dummy9', 'Dummy10', 
				'Dummy11', 'DvReqDate', 'ItemNo'
			];

			const headerRow2 = [
				'사업부문', '주문일자', '거래처', '납품처', '사은품여부', 
				'품목', '단위', '부가세포함여부', '단가', '수량', '금액', 
				'창고', '비고', '운송비', '운송비부가세', '시공비', 
				'시공비부가세', '매체', '주문번호', '주문인', '주문인연락처', 
				'통화내용', '사방넷주문번호', '납기일', '상품번호'
			];

			// 1. ERP 양식에 맞춘 데이터 매핑
			const dataRows = filteredOrders.flatMap((item) => {
				const rows = [];
				const unitPrice = Number(item.pay_cost) || 0; // 단가 (필요시 적절한 필드로 변경)
				const quantity = Number(item.sale_cnt) || 1; // 수량
				// 특수문자(/, -, 공백 등)를 모두 제거하고 숫자만 추출
				const rawDate = item.order_date || '';
				const cleanDate = rawDate.replace(/[^0-9]/g, ''); // 숫자 외의 모든 문자 제거
				const finalOrderDate = cleanDate.slice(0, 8);

				// 공통 데이터 생성 헬퍼
				const baseRow = (itemName: string, qty: number, price: number, isGift: boolean) => [
					'금성침대',              // BizUnitNmae
					finalOrderDate,         // MmbOrderDate
					item.mall_id || '',     // CustNmae
					item.receive_info || '',// DVPlaceName
					'0',     								// Dummy13 (사은품 '0')
					itemName,               // ItemName
					'EA',                   // UnitName
					isGift ? '0' : '1',     // IsInclusedVAT
					price,                  // Price
					qty,                    // Qty
					price * qty,            // CurAmt
					item.dpartner_id || '', // WHName
					item.delv_msg1 || '',   // Remark
					0, 0, 0, 0,             // 운송비/시공비
					item.order_gubun === '사방넷' ? '인터넷' : '방송', // Dummy6
					item.order_id || '',    // Dummy7
					item.user_name || '',   // Dummy8
					item.user_cel || '',    // Dummy9
					'',                     // Dummy10
					item.idx || '',         // Dummy11
					item.hope_delv_date,    // DvReqDate
					item.mall_product_id || '' // ItemNo
				];

				// A. 수량만큼 행 분리 (1개씩 등록)
				for (let i = 0; i < quantity; i++) {
					rows.push(baseRow(item.erp_set_name || '', 1, unitPrice, false));
				}

				const giftName = item.erp_gift?.trim();
				const isValidGift = giftName && giftName !== '' && giftName !== '-';
				// B. 사은품이 있는 경우 (erp_gift 컬럼 데이터 확인)
				if (isValidGift) {
					// 유효한 사은품 명칭이 있을 때만 단가 0원으로 1개 행 추가
					rows.push(baseRow(giftName, 1, 0, true));
				}

				return rows;
			});

			// 2. 워크시트 및 워크북 생성
			const worksheet = XLSX.utils.aoa_to_sheet([headerRow1, headerRow2, ...dataRows]);
			const workbook = XLSX.utils.book_new();
			XLSX.utils.book_append_sheet(workbook, worksheet, "세트주문정보"); //* erp 세트주문업로드 엑셀시트명 고정

			// 3. 파일 생성 및 다운로드 (확장자 선택 적용)
			const fileName = `ERP_주문수집_${searchDate}.${format}`;
			
			// xlsx 라이브러리의 writeFile은 확장자에 따라 내부 버전을 자동으로 조정합니다.
			XLSX.writeFile(workbook, fileName, { bookType: format });

		} catch (error) {
			console.error("ERP Excel download error:", error);
			alert("엑셀 생성 중 오류가 발생했습니다.");
		}
	};

	// 화면에 보이는 순서대로 엑셀파일 다운로드
	const handleExcelDownloadRaw = (format: 'xls' | 'xlsx') => {
    if (filteredOrders.length === 0) {
      alert("다운로드할 데이터가 없습니다.");
      return;
    }

    try {
      // 1. 엑셀 헤더 정의 (분리된 컬럼 기준)
      // const headers = [
      //   '순번(IDX)', '주문번호', '주문일자', '납기일', '거래처(매체)', 
      //   '주문인', '주문인연락처', '거래처명', '수취인', '수취인연락처', 
      //   '수취인주소', '수량', '상품ID', '상품명', 'ERP세트품명', 
      //   '깔판', '측판', '발통', '매트', '협탁', '후드', '사은품', '기타',
      //   '단가', '창고', '비고', '수집구분'
      // ];

			const headers = [
				'배송상태',
				'배송출발',
				'배송완료',
				'업체', // 거래처 mall_id
				'매체', // 매체 order_gubun
				'상품코드', // 상품ID mall_product_id
				'상품명', // 상품명 product_name
				'옵션수집', // sku_value
				'색상', //  p_sku_value
				'번호', // ERP세트품명 erp_set_name
				'깔판', // 깔판 erp_underboard
				'측판', // 측판 erp_sideboard
				'발통', // 발통 erp_connboard
				'매트', // 매트 erp_mattress
				'협탁', // 협탁 erp_outsideboard
				'화장대', // 후드 erp_footboard
				'사은품', // 사은품 erp_gift
				'주문번호',  // 쇼핑몰주문번호 order_id
				'주문인', // 주문인 user_name
				'주문인연락처', // 주문인연락처 user_cel
				'수량', // 수량 sele_cnt
				'수취인', // 수취인 receive_name
				'수취인연락처1', // 수취인연락처1 receive_cel
				'수취인연락처2', // 수취인연락처2 receive_tel
				'주소', // 주소 receive_addr
				'구역', // 
				'지역', // 창고 dpartner_id
				'발주일', // 주문수집일 reg_date
				'지정일',
				'통화내용',
				'예정일',
				'배송일',
				'반품',
				'반품일',
				'취소',
				'배출일',
				'배송메시지', // 배송메시지 dev_msg1
				'현금수령',
				'공급가', // mall_won_code
				'매출가',
				'우편번호', // 우편번호 receive_zipcode
				'배송비', //
				'사방넷주문번호', // 사방넷주문번호 sabang_idx
				'주문수집옵션', // 주문수집옵션 p_product_id
				'출하지시번호',
				'가키인',
				'택배사은품'
			];

			const rows = filteredOrders.map(item => [
				'', // '배송상태',
				'', // '배송출발',
				'', // '배송완료',
				item.mall_id, // '업체', // 거래처 mall_id
				item.order_gubun, // '매체', // 매체 order_gubun
				item.mall_product_id, // '상품코드', // 상품ID mall_product_id
				item.product_name, // '상품명', // 상품명 product_name
				item.sku_value, // 옵션수집 sku_value
				item.p_sku_value, // '색상', //  p_sku_value
				item.erp_set_name, // '번호', // ERP세트품명 erp_set_name
				item.erp_underboard, // '깔판', // 깔판 erp_underboard
				item.erp_sideboard, // '측판', // 측판 erp_sideboard
				item.erp_connboard, // '발통', // 발통 erp_connboard
				item.erp_mattress, // '매트', // 매트 erp_mattress
				item.erp_outsideboard, // '협탁', // 협탁 erp_outsideboard
				item.erp_footboard, // '화장대', // 후드 erp_footboard
				item.erp_gift, // '사은품', // 사은품 erp_gift
				item.order_id, // '주문번호',  // 쇼핑몰주문번호 order_id
				item.user_name, // '주문인', // 주문인 user_name
				item.user_cel, // '주문인연락처', // 주문인연락처 user_cel
				item.sale_cnt, // '수량', // 수량 sele_cnt
				item.receive_name,// '수취인', // 수취인 receive_name
				item.receive_cel, // '수취인연락처1', // 수취인연락처1 receive_cel
				item.receive_tel, // '수취인연락처2', // 수취인연락처2 receive_tel
				item.receive_addr, // '주소', // 주소 receive_addr
				'', // '구역', // 
				item.dpartner_id, // '지역', // 창고 dpartner_id
				item.reg_date.slice(0, 8), // '발주일', // 주문수집일 reg_date
				'', // '지정일',
				'', // '통화내용',
				'', // '예정일',
				'', // '배송일',
				'', // '반품',
				'', // '반품일',
				'', // '취소',
				'', // '배출일',
				item.delv_msg1, // '배송메시지', // 배송메시지 dev_msg1
				'', // '현금수령',
				item.mall_won_code, // '공급가', // mall_won_code
				item.pay_cost, // '매출가',
				String(item.receive_zipcode).replace(/-/g, ''), // '우편번호', // 우편번호 receive_zipcode
				'', // '배송비', //
				item.idx, // '사방넷주문번호', // 사방넷주문번호 sabang_idx
				item.p_product_id, // '주문수집옵션', // 주문수집옵션 p_product_id
				'', // '출하지시번호',
				'', // '가키인',
				''// '택배사은품'
			]);

      // 2. 데이터 매핑 (한 컬럼 내 두 데이터를 좌우로 분리)
      // const rows = filteredOrders.map(item => [
      //   item.idx,                      // 순번
      //   item.order_id,                 // 주문번호
      //   item.order_date,               // 주문일자
      //   item.hope_delv_date,           // 납기일
      //   item.mall_id,                  // 거래처(매체)
      //   item.user_name,                // 주문인
      //   item.user_cel,                 // 주문인연락처
      //   item.agent_name,               // 거래처명
      //   item.receive_name,             // 수취인
      //   item.receive_cel,              // 수취인연락처
      //   item.receive_addr,             // 수취인주소
      //   Number(item.sale_cnt),         // 수량
      //   item.mall_product_id,          // 상품ID
      //   item.product_name,             // 상품명
      //   item.erp_set_name,             // ERP세트품명
      //   item.erp_underboard, item.erp_sideboard, item.erp_connboard,
      //   item.erp_mattress, item.erp_outsideboard, item.erp_footboard,
      //   item.erp_gift, item.erp_etc,   // 구성품 및 사은품
      //   Number(item.pay_cost),         // 단가
      //   item.dpartner_id,              // 창고
      //   item.delv_msg1,                // 비고
      //   item.order_gubun               // 수집구분
      // ]);

      // 3. 엑셀 파일 생성
      const worksheet = XLSX.utils.aoa_to_sheet([headers, ...rows]);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "조회내역");

      const fileName = `사방넷_검증내역_${searchDate}.${format}`;
      XLSX.writeFile(workbook, fileName, { bookType: format });

    } catch (error) {
      console.error("Excel download error:", error);
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

						<button
							onClick={handleSaveAll}
							disabled={isLoading || orders.filter(item => isRowChanged(item)).length === 0}
							className="flex items-center gap-2 px-6 h-[45px] bg-blue-600 text-white rounded-xl font-black text-sm hover:bg-blue-700 transition-all shadow-lg active:scale-95 disabled:bg-slate-300 disabled:cursor-not-allowed group"
						>
							<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
								<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path>
								<polyline points="17 21 17 13 7 13 7 21"></polyline>
								<polyline points="7 3 7 8 15 8"></polyline>
							</svg>
							일괄저장 ({orders.filter(item => isRowChanged(item)).length})
						</button>

						<button
							onClick={() => {
								const choice = confirm("'확인'을 누르면 .xlsx(권장)로, '취소'를 누르면 .xls로 다운로드합니다.");
								handleExcelDownloadRaw(choice ? 'xlsx' : 'xls');
							}}
							disabled={isLoading || filteredOrders.length === 0}
							className="flex items-center gap-2 px-5 h-[45px] bg-white text-slate-700 border border-slate-300 rounded-xl font-bold text-sm hover:bg-slate-50 transition-all shadow-sm active:scale-95 disabled:opacity-50"
						>
							<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
								<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
							</svg>
							화면내역 다운로드
						</button>

						{/* 신규: 엑셀파일 내려받기(ERP) 버튼 추가 */}
						{/* <button
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
						</button> */}
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
										<th className="px-4 py-4 text-white font-bold border-r border-slate-700 whitespace-nowrap">납기일</th>
										<th className="px-4 py-4 text-white font-bold border-r border-slate-700 whitespace-nowrap min-w-[150px]">거래처(매체)</th>
										<th className="px-4 py-4 text-white font-bold border-r border-slate-700 whitespace-nowrap min-w-[120px]">주문인</th>
										<th className="px-4 py-4 text-white font-bold border-r border-slate-700 whitespace-nowrap min-w-[150px]">거래처</th>
										<th className="px-4 py-4 text-white font-bold border-r border-slate-700 whitespace-nowrap min-w-[150px]">수취인</th>
										<th className="px-4 py-4 text-white font-bold border-r border-slate-700 whitespace-nowrap min-w-[150px]">수취인연락처</th>
										<th className="px-4 py-4 text-white font-bold border-r border-slate-700 whitespace-nowrap min-w-[300px]">수취인주소</th>
										<th className="px-4 py-4 text-white font-bold border-r border-slate-700 whitespace-nowrap">수량</th>
										<th className="px-4 py-4 text-white font-bold border-r border-slate-700 whitespace-nowrap min-w-[250px]">품목(상품명)</th>
										<th className="px-3 py-4 text-white font-bold border-r border-slate-700 whitespace-nowrap w-[60px] text-center">저장</th>
										<th 
											className="px-4 py-4 text-white font-bold border-r border-slate-700 whitespace-nowrap min-w-[250px] decoration-slate-600/90 underline underline-offset-4 decoration-3 cursor-pointer hover:bg-slate-800"
											onClick={() => handleSort('erp_set_name')}
										>
											<div className="flex items-center justify-center gap-1">
												ERP세트품명
												<SortIcon columnKey="erp_set_name" sortConfig={sortConfig} />
											</div>
										</th>
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
									{/* {orders.length > 0 ? ( */}
									{filteredOrders.length > 0 ? (
										filteredOrders.map((item) => {
										// orders.map((item) => {
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
													{/* 납기일 */}
													<td className="px-4 py-3 border-r border-slate-100 text-center">
														<div className="flex flex-col items-center">
															<span className="text-slate-700 font-medium">{item.hope_delv_date}</span>
														</div>
													</td>
													<td className="px-4 py-3 text-slate-700 border-r border-slate-100 whitespace-nowrap">
														{item.mall_id}
													</td>
													<td className="px-4 py-3 text-slate-700 border-r border-slate-100 whitespace-nowrap">
														<div className="font-bold">{item.user_name}</div>
														<div className="text-[11px] text-slate-400">{item.user_cel}</div>
													</td>
													<td className="px-4 py-3 text-slate-700 border-r border-slate-100 whitespace-nowrap">
														{item.agent_name}
													</td>
													<td className="px-4 py-3 text-slate-700 border-r border-slate-100 whitespace-nowrap">
														{item.receive_name}
													</td>
													<td className="px-4 py-3 text-slate-700 border-r border-slate-100 whitespace-nowrap">
														{item.receive_cel}
													</td>
													<td className="px-4 py-3 text-slate-700 border-r border-slate-100">
														<div className="text-[12px] text-slate-700 leading-snug line-clamp-3 whitespace-pre-wrap">
															{item.receive_addr}
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