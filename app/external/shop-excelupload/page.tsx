'use client';

import { useState, useEffect } from 'react';
import * as XLSX from 'xlsx';

interface TempOrder {
  sabang_idx: string;
  order_gubun: string; // 범용적으로 string 사용
  status: string;      // 범용적으로 string 사용
  raw_data: Record<string, any>;
}

export default function ShopExcelUploadPage() {
  const [mallConfigs, setMallConfigs] = useState<any[]>([]); // ks_common에서 가져온 쇼핑몰 목록
  const [selectedMall, setSelectedMall] = useState<any>(null); // 선택된 몰의 전체 객체
  const [excelData, setExcelData] = useState<any[]>([]);
  const [isValidated, setIsValidated] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [fileName, setFileName] = useState('');
  
  // 1. 공통 코드에서 쇼핑몰 리스트 가져오기 (comm_mcode = '010')
  useEffect(() => {
    const fetchMallConfigs = async () => {
      try {
        // API 경로는 실제 환경에 맞춰 수정하세요. (예: /api/common/code/010)
        const response = await fetch('/api/common/codes?mcode=010');
        const result = await response.json();
        
        if (result.success) {
          // comm_sort 기준 오름차순 정렬
          const sortedData = result.data.sort((a: any, b: any) => a.comm_sort - b.comm_sort);
          setMallConfigs(sortedData);
        }
      } catch (error) {
        console.error('쇼핑몰 설정 로드 실패:', error);
      }
    };
    fetchMallConfigs();
  }, []);

  // 2. 엑셀 파일 읽기 및 comm_text1(컬럼명) 검증
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedMall) return;

    setFileName(file.name);
    const reader = new FileReader();

    reader.onload = (evt) => {
      // 1. 결과값을 ArrayBuffer로 받습니다.
      const data = evt.target?.result;
      
      try {
        // 2. XLSX.read에서 type을 'array'로 지정합니다. 
        // 이렇게 하면 라이브러리가 바이너리인지 텍스트인지 스스로 더 잘 판단합니다.
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary', cellDates: true });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const jsonData: any[] = XLSX.utils.sheet_to_json(ws, { 
          defval: "" // 값이 비어있는 셀을 빈 문자열("")로 채워서 객체 키를 유지합니다.
        });
        
        if (jsonData.length > 0) {
          const headers = Object.keys(jsonData[0]);
          // console.log("1. 엑셀 원본 헤더:", headers.map(h => `[${h}]`));//!
          const requiredColumns = selectedMall.comm_text1.split('|');
          // console.log("2. 설정 기준 컬럼:", requiredColumns.map((c: string) => `[${c}]`));//!
          
          // 컬럼명 검증 (데이터가 잘 들어왔다면 이 로직은 그대로 유지)
          // console.log("3. 컬럼별 매칭 상세 분석:"); //!
          //!
          const hasAllColumns = requiredColumns.every((col: string) => {
            const target = col.trim();
            // 엑셀 헤더들도 trim() 처리하여 비교
            const isMatch = headers.map(h => h.trim()).includes(target);
            
            if (!isMatch) {
              // 매칭되지 않는 컬럼이 무엇인지 콘솔에 빨간색으로 표시
              console.error(`   ❌ 불일치 컬럼 발견: "${target}" 항목이 엑셀에 없거나 명칭이 다릅니다.`);
            } else {
              console.log(`   ✅ 일치: "${target}"`);
            }
            return isMatch;
          });
          //!

          // 임시주석처리
          // const hasAllColumns = requiredColumns.every((col: string) => 
          //   headers.map(h => h.trim()).includes(col.trim())
          // );

          if (hasAllColumns) {
            setExcelData(jsonData);
            setIsValidated(true);
          } else {
            alert(`[${selectedMall.comm_text2}] 양식이 아닙니다.`);
            setIsValidated(false);
          }
        }
      } catch (error) {
        console.error("파싱 중 실제 에러 발생:", error);
      }
    };

    // 3. readAsBinaryString 대신 readAsArrayBuffer를 사용하세요.
    reader.readAsArrayBuffer(file);
  };
  // YYYYMMDDHHMMSS 형식의 숫자를 반환하는 함수
  const getFormattedDate = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    
    return Number(`${year}${month}${day}${hours}${minutes}${seconds}`);
  };

  // 3. 임시 테이블 저장
  // SK스토아 전용 매핑 함수
  const transformSKStoa = (row: any) => {
    const orderId = String(row['주문번호']); // sabang_idx 및 IDX용
    const regDate = getFormattedDate(); // 수집일자

    const rawData = {
      // 엑셀 항목 -> JSON 키 매핑
      "ORDER_STATUS": String(row['주문구분']),
      "ORDER_ID": orderId,
      "ORDER_DATE": String(row['주문접수일'] || ''),
      "DPARTNER_ID": String(''),
      "HOPE_DELV_DATE": String(row['업체지시일'] || ''),
      "IDX": orderId,
      "MALL_PRODUCT_ID": String(row['상품코드']),
      "PRODUCT_ID": String(row['상품코드']),
      "P_PRODUCT_NAME": String(row['상품명']),
      "PRODUCT_NAME": String(row['상품명']),
      "P_SKU_VALUE": String(row['단품상세']),
      "SKU_VALUE": String(row['단품상세']),
      "SALE_CNT": String(row['수량']),
      "USER_NAME": String(row['고객명']),
      "USER_CEL": String(row['전화2']),
      "RECEIVE_NAME": String(row['인수자']),
      "RECEIVE_ZIPCODE": String(row['우편번호'] || '').replace(/-/g, ''),
      "RECEIVE_ADDR": String(row['주소']),
      "RECEIVE_TEL": String(row['전화1']),
      "RECEIVE_CEL": String(row['전화2']),
      "PAY_COST": String(row['금액(부가세포함)']),
      "DELV_MSG": String(row['배송메시지']),
      "DELV_MSG1": String(row['배송메시지']),
      // 고정값
      "MALL_ID": "에스케이스토아",
      "MALL_USER_ID": "E207165",
      "REG_DATE": regDate
    };

    return {
      sabang_idx: orderId,
      raw_data: rawData,
      order_gubun: 'SK' as const, // as const를 붙여서 타입을 고정합니다.
      status: 'wait' as const,
      comm_ccode: '009017' as const
    };
  };

  const transformLotte = (row: any) => {
    const orderId = String(row['주문번호'] || '');
    const regDate = getFormattedDate(); // 수집일자

    // 날짜 변환용 헬퍼 함수: Date 객체면 YYYY-MM-DD로, 아니면 문자열로 반환
    const formatDate = (val: any) => {
      if (val instanceof Date) {
        // 한국 시간 기준으로 날짜만 추출 (YYYY-MM-DD)
        const year = val.getFullYear();
        const month = String(val.getMonth() + 1).padStart(2, '0');
        const day = String(val.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
      }
      return String(val || '');
    };

    const rawData = {
      "ORDER_DATE": formatDate(row['업체지시일']),
      "IDX": orderId,
      "ORDER_ID": orderId,
      "DPARTNER_ID": String(row['배송사'] || ''),
      "HOPE_DELV_DATE": formatDate(row['배송예정일']),
      "USER_NAME": String(row['주문자'] || ''),
      "USER_TEL": String(row['주문자(연락처)'] || ''),
      "USER_CEL": String(row['주문자(휴대폰)'] || ''),
      "RECEIVE_NAME": String(row['인수자'] || ''),
      "RECEIVE_TEL": String(row['인수자(연락처)'] || ''),
      "RECEIVE_CEL": String(row['인수자(휴대폰)'] || ''),
      "ORDER_STATUS": String(row['주문구분'] || ''),
      "MALL_PRODUCT_ID": String(row['상품코드'] || ''),
      "PRODUCT_ID": String(row['상품코드'] || ''),
      "P_PRODUCT_NAME": String(row['상품명'] || ''),
      "PRODUCT_NAME": String(row['상품명'] || ''),
      "P_SKU_VALUE": String(row['단품상세'] || ''),
      "SKU_VALUE": String(row['단품상세'] || ''),
      "SALE_CNT": String(row['주문수량'] || ''),
      "RECEIVE_ZIPCODE": String(row['우편번호'] || '').replace(/-/g, ''),
      "RECEIVE_ADDR": String(row['배송지'] || ''),
      "PAY_COST": String(row['실주문금액'] || ''),
      "DELV_MSG": String(row['전언'] || ''),
      "DELV_MSG1": String(row['전언'] || ''),
      // 고정값
      "MALL_ID": "우리홈쇼핑(인터넷)",
      "MALL_USER_ID": "2539",
      "REG_DATE": regDate
    };

    return {
      sabang_idx: orderId,
      raw_data: rawData,
      order_gubun: '롯데' as const,
      status: 'wait' as const,
      comm_ccode: '009009' as const
    };
  };

  const transformEmons = (row: any) => {
    const sabangIdx = String(row['주문번호(사방넷)'] || '');
    const regDate = getFormattedDate(); // 수집일자
    
    // 우편번호 하이픈 제거 로직
    const rawZipCode = String(row['수취인우편번호(1)'] || '');
    const cleanZipCode = rawZipCode.replace(/-/g, '');

    const rawData = {
      "IDX": sabangIdx,
      "MALL_ID": String(row['쇼핑몰명(1)'] || ''),
      "PARTNER_ID": String(row['매입처명'] || ''),
      "DPARTNER_ID": String(''),
      "MALL_PRODUCT_ID": String(row['상품코드(쇼핑몰)'] || ''),
      "PRODUCT_ID": String(row['상품코드(쇼핑몰)'] || ''),
      "P_PRODUCT_NAME": String(row['상품명(수집)'] || ''),
      "P_SKU_VALUE": String(row['옵션(수집)'] || ''),
      "PRODUCT_NAME": String(row['상품명(확정)'] || ''),
      "SKU_VALUE": String(row['옵션(확정)'] || ''),
      "ORDER_ID": String(row['주문번호(쇼핑몰)'] || ''),
      "USER_NAME": String(row['주문자명'] || ''),
      "USER_TEL": String(row['주문자전화번호1'] || ''),
      "USER_CEL": String(row['주문자전화번호1'] || ''),
      "SALE_CNT": String(row['수량'] || ''),
      "RECEIVE_NAME": String(row['수취인명'] || ''),
      "RECEIVE_TEL": String(row['수취인전화번호1'] || ''),
      "RECEIVE_CEL": String(row['수취인전화번호2'] || ''),
      "RECEIVE_ADDR": String(row['수취인주소(4)'] || ''),
      "ORDER_DATE": String(row['수집일시(YYYY-MM-DD HH:MM:SS)'] || ''),
      "HOPE_DELV_DATE": String(row['배송희망일자(YYYY-MM-DD)'] || ''),
      "DELV_MSG": String(row['배송메세지'] || ''),
      "DELV_MSG1": String(row['배송메세지'] || ''),
      "PAY_COST": String(row['공급단가*수량(횡대전용)'] || ''),
      "RECEIVE_ZIPCODE": cleanZipCode,
      "MALL_USER_ID": "emons_ksbed",
      "REG_DATE": regDate
    };

    return {
      sabang_idx: sabangIdx,
      raw_data: rawData,
      order_gubun: '사방넷' as const,
      status: 'wait' as const,
      comm_ccode: '009029' as const
    };
  };

  // 2. 메인 저장 핸들러
  const handleSaveToTemp = async () => {
    if (!selectedMall || excelData.length === 0) return;
    // console.log('선택된 몰 정보:', selectedMall);
    // console.log('comm_text2 값:', selectedMall.comm_text2);

    setIsLoading(true);

    // 현재 선택된 몰 코드(예: 010001)에 따라 어떤 변환 함수를 쓸지 결정
    // (임시로 'sk'라고 가정)
    let transformedData: TempOrder[] = [];
    
    if (selectedMall.comm_text2.includes('SK')) {
      // SK스토아용 매핑 함수 호출
      transformedData = excelData.map(row => transformSKStoa(row));
    } else if (selectedMall.comm_text2.includes('롯데')) {
      // 롯데홈쇼핑용 매핑 함수 호출
      transformedData = excelData.map(row => transformLotte(row));
    } else if (selectedMall.comm_text2.includes('에몬스')) {
      // 에몬스(사방넷)용 매핑 함수 호출
      transformedData = excelData.map(row => transformEmons(row));
    } else {
      alert('지원하지 않는 쇼핑몰 양식입니다.');
      setIsLoading(false);
      return;
    }

    try {
      const response = await fetch('/api/external/shoporder-save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(transformedData), // 변환된 전체 배열 전송
      });

      const result = await response.json();
      if (result.success) alert('성공적으로 저장되었습니다.');
    } catch (err) {
      alert('저장 중 오류 발생');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">쇼핑몰 엑셀 주문 연동</h1>
      
      <div className="bg-white p-5 rounded-xl mb-6 flex flex-wrap gap-6 items-end border border-gray-200 shadow-sm">
        {/* 쇼핑몰 선택 (comm_text2 표시) */}
        <div className="flex items-center gap-4">
          <label className="text-sm font-bold text-black whitespace-nowrap">쇼핑몰 선택</label>
          <select 
            onChange={(e) => {
              const mall = mallConfigs.find(m => m.comm_ccode === e.target.value);
              setSelectedMall(mall);
              setExcelData([]);
              setIsValidated(false);
              setFileName('');
            }}
            className="border border-gray-300 px-3 h-11 rounded-lg w-60 text-black focus:ring-2 focus:ring-blue-500 outline-none bg-white font-medium"
          >
            <option value="">-- 쇼핑몰을 선택하세요 --</option>
            {mallConfigs.map((mall) => (
              <option key={mall.comm_ccode} value={mall.comm_ccode}>
                {mall.comm_text2}
              </option>
            ))}
          </select>
        </div>

        {/* 파일 업로드 버튼 */}
        <div className="flex items-center gap-4">
          <label 
            htmlFor="excel-upload"
            className={`flex items-center justify-center px-4 h-11 rounded-lg font-bold cursor-pointer transition-colors shadow-md border
              ${!selectedMall ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed' : 'bg-white text-blue-600 border-blue-600 hover:bg-blue-50'}`}
          >
            {fileName || '엑셀 파일 선택'}
          </label>
          <input 
            id="excel-upload"
            type="file" 
            accept=".xlsx, .xls"
            onChange={handleFileUpload}
            disabled={!selectedMall || isLoading}
            className="hidden"
          />
        </div>
        
        <button 
          onClick={handleSaveToTemp}
          disabled={!isValidated || isLoading}
          className="bg-green-600 text-white px-8 h-11 rounded-lg font-bold hover:bg-green-700 disabled:bg-gray-300 transition-colors shadow-md flex items-center justify-center ml-auto"
        >
          {isLoading ? '처리 중...' : '임시 테이블 저장'}
        </button>
      </div>

      {/* 데이터 프리뷰 테이블 */}
      <div className="border rounded-lg overflow-hidden bg-white shadow-sm border-gray-300">
        <div className="overflow-x-auto h-[550px] custom-scrollbar">
          <table className="min-w-full divide-y divide-gray-300 text-sm">
            <thead className="bg-gray-100 sticky top-0 z-10">
              <tr>
                {excelData.length > 0 ? (
                  Object.keys(excelData[0]).map((header) => (
                    <th key={header} className="px-4 py-3 text-left text-black font-bold border-b border-gray-300 whitespace-nowrap">
                      {header}
                    </th>
                  ))
                ) : (
                  <th className="px-4 py-3 text-left text-black font-bold border-b border-gray-300">대기 중</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white">
              {excelData.length > 0 ? (
                excelData.map((row, idx) => (
                  <tr key={idx} className="hover:bg-blue-50">
                    {Object.values(row).map((val: any, i) => (
                      <td key={i} className="px-4 py-3 text-black border-r border-gray-100 last:border-0">
                        {val?.toString()}
                      </td>
                    ))}
                  </tr>
                ))
              ) : (
                <tr>
                  <td className="px-4 py-20 text-center text-gray-500 font-bold bg-gray-50">
                    쇼핑몰 선택 후 엑셀 파일을 업로드해 주세요.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}