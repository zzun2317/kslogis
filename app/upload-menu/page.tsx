'use client';

import React, { useState, useRef, useEffect } from 'react';
import * as XLSX from 'xlsx';
import Script from 'next/script';
import { useAuth } from '@/hook/useAuth';
import { useAuthStore } from '@/store/useAuthStore';
import { supabase } from '@/lib/supabase'; 

const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const KAKAO_KEY = process.env.NEXT_PUBLIC_KAKAO_JS_KEY;
declare global {
  interface Window {
    kakao: any;
    daum: any;
  }
}

interface ValidationError {
  row: number;
  column: string;
  message: string;
}

const formatExcelDate = (value: any): string => {
  if (!value) return '';
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) {
    return value.substring(0, 10);
  }
  if (value instanceof Date) {
    return value.toISOString().split('T')[0];
  }
  if (typeof value === 'number') {
    const date = XLSX.SSF.parse_date_code(value);
    const y = date.y;
    const m = String(date.m).padStart(2, '0');
    const d = String(date.d).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  return String(value);
};

export default function ExcelUploadPage() {
  const [previewData, setPreviewData] = useState<any[]>([]); 
  const [headers, setHeaders] = useState<string[]>([]);      
  const [fileName, setFileName] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [loadingText, setLoadingText] = useState('처리 중입니다...');
  const [columnWidths, setColumnWidths] = useState<{ [key: string]: number }>({});
  const [regCnt, setRegCnt] = useState(0); //  검증 실행 횟수
  const [refixCnt, setRefixCnt] = useState(0); // 남은 수정 대상(에러) 수량
  
  const user = useAuthStore((state) => state.user);
  const userId = user?.id; // user 객체 안에 id가 들어있는지 확인 (UUID)
  // const [userId, setUserId] = useState<string>('');
  const [userEmail, setUserEmail] = useState<string>('');

  const tableContainerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [errors, setErrors] = useState<ValidationError[]>([]); 
  const [isValidated, setIsValidated] = useState(false);
  const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set());

  const ROW_HEIGHT_CLASS = "h-12";
  const ROW_HEIGHT_PX = 48; 

  const REQUIRED_COLUMNS = [
    '출하의뢰번호', '상차(요청)일', '하차(배송)일', 
    '품번', '요청수량', '주소1', '휴대전화번호'
  ];

  const DATE_COLUMNS = ['상차(요청)일', '하차(배송)일', '수주일'];
  const EDITABLE_COLUMNS = ['상차(요청)일', '하차(배송)일', '주소1', '주소2', '전화번호', '휴대전화번호'];

  const errorRowIndices = new Set(errors.map(err => err.row));
  const errorRowsArray = Array.from(new Set(errors.map(err => err.row)));

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    setLoadingText('엑셀 파일을 읽는 중...');
    setFileName(file.name);

    // 검증처리 변수 초기화
    setRegCnt(0);      // 검증 횟수 초기화
    setRefixCnt(0);    // 남은 에러 수 초기화
    setErrors([]);     // 에러 목록 초기화
    setIsValidated(false); // 검증 완료 상태 초기화

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = evt.target?.result;
        const wb = XLSX.read(data, { type: 'binary', cellDates: true });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rawData: any[] = XLSX.utils.sheet_to_json(ws, { defval: '' });

        if (rawData.length > 0) {
          const formattedData = rawData.map(row => {
            const newRow = { ...row };
            DATE_COLUMNS.forEach(col => {
              if (newRow[col]) {
                newRow[col] = formatExcelDate(newRow[col]);
              }
            });
            return newRow;
          });

          const columnNames = Object.keys(formattedData[0]);
          setHeaders(['No.', ...columnNames]);
          setPreviewData(formattedData); 
          setColumnWidths({});
          setErrors([]);
          setIsValidated(false);
        }
      } catch (err) {
        console.error("Excel Parsing Error:", err);
        alert("엑셀 파일 파싱 중 오류가 발생했습니다.");
      } finally {
        setLoading(false);
      }
    };
    reader.readAsBinaryString(file);
  };

  const handleClear = () => {
    if (window.confirm("업로드된 데이터를 초기화하시겠습니까?")) {
      setPreviewData([]);
      setHeaders([]);
      setFileName('');
      setErrors([]);
      setIsValidated(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

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

  // ✅ 보완된 handleValidate 함수
  const handleValidate = async () => {
    setLoading(true);
    setLoadingText('배송정보, 차량 코드 매핑 및 주소 좌표를 검증 중입니다...');
    await new Promise(resolve => setTimeout(resolve, 100));

    const newErrors: ValidationError[] = [];
    // const updatedData = [...previewData];
    // const updatedData = JSON.parse(JSON.stringify(previewData));
    const updatedData = previewData.map(row => ({ ...row }));

    try {
      // 1. 차량 코드 정보 가져오기 (에러 핸들링 강화)
      const { data: commonCodes, error: commonError } = await supabase
        .from('ks_common')
        .select('comm_ccode, comm_text2')
        .eq('comm_mcode', '004')
        //.abortSignal(AbortSignal.timeout(10000)); // 10초 타임아웃 추가

      if (commonError) {
        // AbortError인 경우 재시도 유도 또는 알림
        if (commonError.message.includes('AbortError')) {
          throw new Error('데이터베이스 연결이 일시적으로 중단되었습니다. 다시 시도해 주세요.');
        }
        throw commonError;
      }

      const vehicleCodeMap = new Map();
      commonCodes?.forEach(item => {
        if (item.comm_text2) vehicleCodeMap.set(item.comm_text2.trim(), item.comm_ccode);
      });

      // 현재 엑셀의 모든 수주번호가 DB에 이미 있는지 확인
      const allOrderNos = Array.from(new Set(
        updatedData.map((row: any) => String(row['수주번호'] || '').trim()).filter(Boolean)
      ));
      // 수주번호가 너무 많을 수 있으므로 select 시 in 필터 사용
      const { data: existingOrders, error: checkError } = await supabase
        .from('ks_devcustm')
        .select('cust_ordno')
        .in('cust_ordno', allOrderNos);
      if (checkError) console.error("중복 체크 중 오류:", checkError);
      // console.log("1. 추출된 수주번호 배열:", allOrderNos);
      // console.log("2. DB에서 검색된 결과:", existingOrders);
      // 이미 존재하는 수주번호를 Set으로 저장 (검색 속도 향상)
      const existingOrderSet = new Set(existingOrders?.map(item => item.cust_ordno));

      let targetOrderNos: string[] = [];
      if (regCnt === 0) {
        targetOrderNos = Array.from(new Set(updatedData.map((row: any) => String(row['수주번호'] || '').trim())));
        console.log("최초 검증: 전체 데이터를 검증합니다.");
      } else {
        // 기존 에러 목록에서 수주번호 추출
        const errorIndices = new Set(errors.map(e => e.row));
        targetOrderNos = Array.from(new Set(
          updatedData
            .filter((_, idx) => errorIndices.has(idx))
            .map((row: any) => String(row['수주번호'] || '').trim())
        ));
        console.log(`재검증: 에러가 발생한 ${targetOrderNos.length}건의 수주번호만 검증합니다.`);
      }

      if (targetOrderNos.length === 0) {
        alert("검증할 대상이 없습니다.");
        setLoading(false);
        return;
      }

      // 2. 수주번호(주문번호) 기준으로 유니크한 목록 생성 (시간 단축)
      // const uniqueOrders = Array.from(new Set(updatedData.map(row => row['수주번호'])));
      // const uniqueOrders = Array.from(new Set(updatedData.map((row: any) => String(row['수주번호'] || '').trim())));
      const BATCH_SIZE = 40; // 40건씩 묶어서 병렬 처리
      for (let i = 0; i < targetOrderNos.length; i += BATCH_SIZE) {
        const batch = targetOrderNos.slice(i, i + BATCH_SIZE);
        
        await Promise.all(batch.map(async (orderNo) => {
          // const firstRowIndex = updatedData.findIndex(r => r['수주번호'] === orderNo);
          const firstRowIndex = updatedData.findIndex((r: any) => String(r['수주번호']).trim() === orderNo);
          const row = updatedData[firstRowIndex];

          // 1. 연락처 자동 보정 로직 (휴대전화번호가 없으면 전화번호를 대입)
          // row 객체는 참조값이므로 여기서 수정하면 updatedData에도 반영됩니다.
          const hp1 = String(row['휴대전화번호'] || '').trim();
          const hp2 = String(row['전화번호'] || '').trim();

          if (!hp1 && hp2) {
            row['휴대전화번호'] = hp2; // 휴대전화번호가 비었을 때 전화번호를 넣어줌
          }

          // 2. 필수 항목 체크 (이제 휴대전화번호가 보정되었으므로, 둘 다 없을 때만 에러가 납니다)
          REQUIRED_COLUMNS.forEach(col => {
            const val = row[col]?.toString().trim();
            if (!val) {
              newErrors.push({ row: firstRowIndex, column: col, message: `${col} 필수!` });
            }
          });

          // 온라인 배송건 우편번호 확인 : 온라인 주문은 우편번호가 필수입니다. [cite: 123]
          if (row['수주구분'] === '온라인' && !row['우편번호']?.toString().trim()) {
            newErrors.push({ 
              row: firstRowIndex, 
              column: '우편번호', 
              message: '온라인 주문은 우편번호가 필수입니다.' 
            });
          }

          // 중복 수주번호 체크 및 비고란 업데이트
          let duplicateMemo = "";
          const isDuplicate = existingOrderSet.has(String(orderNo).trim());
          if (existingOrderSet.has(orderNo)) {
            duplicateMemo = "이미 업로드된 수주번호";
            // 만약 중복을 '에러'로 처리해서 저장을 막고 싶다면 아래 주석 해제
            newErrors.push({ row: firstRowIndex, column: '수주번호', message: duplicateMemo });
          }

          // 차량 매핑
          let mappedCenterCode = '004001';
          const vehicleName = row['차량']?.toString().trim();
          if (vehicleName === '제일인테크(경남)' || vehicleName === '제일인테크(경북)') {
            mappedCenterCode = '004002';
          } else if (vehicleName && vehicleCodeMap.has(vehicleName)) {
            mappedCenterCode = vehicleCodeMap.get(vehicleName);
          }

          // console.log("--- 주소 검증 진입 ---", row['주소1']);

          // 1. 주소 처리 로직 수정. 주소1에 상세주소가 입력되어 있는 경우 위치좌표, 상세주소 분리입력처리
          let cust_lat = null, cust_lng = null;
          if (row['주소1']?.trim()) {
            const originalAddress1 = row['주소1'].trim();
            // console.log("getCoordinates 호출 직전:", originalAddress1);
            const coords = await getCoordinates(originalAddress1);
            // console.log("getCoordinates 결과 수신:", coords);
            
            cust_lat = coords.lat;
            cust_lng = coords.lng;

            if (cust_lat && cust_lng && coords.refinedAddress) {
              const refined = coords.refinedAddress.trim();
              const original = originalAddress1.trim();
              
              // 방법 1: 원본 주소에서 정제 주소 문자열이 시작되는 지점을 찾아 그 이후를 상세주소로 인식
              let detailPart = '';
              const startIndex = original.indexOf(refined);
              
              if (startIndex !== -1) {
                // 정제 주소 이후의 나머지 문자열을 가져옴
                detailPart = original.substring(startIndex + refined.length).trim();
              } else {
                // 만약 정확히 일치하는 지점이 없다면 (띄어쓰기 등 불일치), 
                // 최소한 정제 주소와 원본 주소가 다를 때만 상세주소가 있다고 판단
                if (original !== refined) {
                  detailPart = original.replace(refined, '').trim();
                }
              }

              row['주소1'] = detailPart ? `${refined} ${detailPart}` : refined;
              
              if (coords.zoneNo) {
                row['우편번호'] = coords.zoneNo;
              }
            }
            else {
              newErrors.push({ 
                row: firstRowIndex, 
                column: '주소1', 
                message: '위치 좌표를 찾을 수 없는 주소입니다. 주소를 확인해 주세요.' 
              });
            }
          }

          // 주소 좌표 추출 (카카오 API) 
          // let cust_lat = null, cust_lng = null;
          // if (row['주소1']?.trim()) {
          //   const coords = await getCoordinates(row['주소1']);
          //   cust_lat = coords.lat;
          //   cust_lng = coords.lng;
          //   if (!cust_lat || !cust_lng) {
          //     newErrors.push({ row: firstRowIndex, column: '주소1', message: `좌표 오류` });
          //   }
          // }

          // 필수 항목 체크 [cite: 1, 123]
          REQUIRED_COLUMNS.forEach(col => {
            if (!row[col]?.toString().trim()) {
              newErrors.push({ row: firstRowIndex, column: col, message: `${col} 필수!` });
            }
          });

          // updatedData.forEach((item, idx) => {
          updatedData.forEach((item: any, idx: number) => {
            if (String(item['수주번호']).trim() === String(orderNo).trim()) {
              updatedData[idx]['휴대전화번호'] = row['휴대전화번호'];
              updatedData[idx].cust_devcenter = mappedCenterCode;
              updatedData[idx]['주소1'] = row['주소1'];
              updatedData[idx]['우편번호'] = row['우편번호'];
              updatedData[idx].cust_lat = cust_lat;
              updatedData[idx].cust_lng = cust_lng;
              if (isDuplicate) {
                const currentMemo = updatedData[idx]['마스터비고'] || '';
                if (!currentMemo.includes(duplicateMemo)) {
                  // 기존 비고가 있으면 띄어쓰기 후 추가, 없으면 바로 추가
                  updatedData[idx]['마스터비고'] = currentMemo 
                    ? `${currentMemo} (${duplicateMemo})` 
                    : duplicateMemo;
                }
              }
                
                // 대표 행 이외의 행들에 대해서도 필수값 에러가 있다면 추가 (선택 사항)
                // 여기서는 수주번호가 같으면 주소/날짜가 같다고 가정하므로 생략 가능
            }
          });
        }));
        
        // 처리 중임을 알리기 위해 로딩 텍스트 업데이트
        await new Promise(resolve => setTimeout(resolve, 0));
        setLoadingText(`${i + batch.length}건 검증 중...`);
      } // for (let i = 0; i < targetOrderNos.length; i += BATCH_SIZE) {

      // 3. 상태 업데이트
      setPreviewData(updatedData);
      setErrors(newErrors);
      setRegCnt(prev => prev + 1);// 검증 실행 횟수 증가
      setRefixCnt(newErrors.length); // 남은 에러 개수 설정
      setIsValidated(newErrors.length === 0);
      
      if (newErrors.length === 0) {
        alert('데이터 검증 완료: 데이터를 저장 해주세요');
      } else {
        alert(`검증 결과: ${newErrors.length}건의 오류가 발견되었습니다.`);
      }

    } catch (err: any) {
      console.error("Validation Error:", err);
      alert(err.message || "검증 작업 중 알 수 없는 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  const openPostcode = (rowIndex: number) => {
    const Postcode = window.daum?.Postcode || window.kakao?.Postcode;
    if (!Postcode) {
      alert("주소 서비스 스크립트가 로드되지 않았습니다.");
      return;
    }

    // 1: 현재 행의 기존 주소값을 가져와서 검색창 초기값으로 사용
    const row = previewData[rowIndex];
    const fullAddress = row ? row['주소1'] : '';
    let searchQ = fullAddress.split('(')[0].trim();
    const addrParts = searchQ.split(' ');
    if (addrParts.length > 4) {
      searchQ = addrParts.slice(0, 4).join(' ');
    }

    new Postcode({
      // 2: 팝업이 열릴 때 기존 주소가 입력되어 있도록 설정
      q: searchQ,
      oncomplete: async (data: any) => {
        console.log("선택된 주소 데이터:", data);
        const selectedAddr = data.roadAddress || data.address; // 정제된 주소
        const postNo = data.zonecode;
        
        let detailPart = '';
        const searchIdx = fullAddress.indexOf(searchQ);
        if (searchIdx !== -1) {
          // searchQ 이후의 문자열을 가져옴
          detailPart = fullAddress.substring(searchIdx + searchQ.length).trim();
        }

        // 정제주소 + 상세주소 결합
        // 상세주소가 이미 존재한다면 한 칸 띄우고 결합
        const finalCombinedAddress = detailPart 
          ? `${selectedAddr} ${detailPart}` 
          : selectedAddr;

        console.log("최종 결합 주소:", finalCombinedAddress);

        // 좌표 정보는 '정제된 주소' 기준으로 가져오는 것이 가장 정확
        const coords = await getCoordinates(selectedAddr);

        setPreviewData(prev => {
          const newData = [...prev];
          const targetOrderNo = newData[rowIndex]['수주번호'];

          return newData.map(item => {
            if (item['수주번호'] === targetOrderNo) {
              return {
                ...item,
                '주소1': finalCombinedAddress, // 결합된 주소 입력
                '우편번호': postNo,
                'lat': coords.lat,
                'lng': coords.lng
              };
            }
            return item;
          });
        });

        setIsValidated(false);
      }
    }).open({
      q: searchQ
    });
  };

  // const openPostcode = (rowIndex: number) => {
  //   // if (!window.daum || !window.daum.Postcode) {
  //   if (!window.kakao || !window.kakao.Postcode) {
  //     alert("주소 서비스 스크립트가 아직 로드되지 않았습니다.");
  //     return;
  //   }
  //   // new window.daum.Postcode({
  //   new window.kakao.Postcode({
  //     oncomplete: (data: any) => {
  //       const finalAddress = data.roadAddress || data.address;
  //       handleCellChange(rowIndex, '주소1', finalAddress);
  //       handleCellChange(rowIndex, '우편번호', data.zonecode);
  //     }
  //   }).open();
  // };

  const handleCellChange = (rowIndex: number, column: string, value: string) => {
    const newData = [...previewData];
    const targetOrderNumber = newData[rowIndex]['수주번호'];

    if (EDITABLE_COLUMNS.includes(column) && targetOrderNumber) {
      newData.forEach((row, idx) => {
        if (row['수주번호'] === targetOrderNumber) {
          newData[idx] = { ...newData[idx], [column]: value };
        }
      });
    } else {
      newData[rowIndex] = { ...newData[rowIndex], [column]: value };
    }

    setPreviewData(newData);
    if (isValidated) setIsValidated(false);

    // 에러 상태 및 refixCnt 관리
    if (errors.length > 0) {
      const wasError = errors.some(err => err.row === rowIndex && err.column === column);// 기존에 에러였는지 확인 [cite: 63]
      
      const remainingErrors = errors.filter(err => {
        const isTarget = targetOrderNumber ? newData[err.row]?.['수주번호'] === targetOrderNumber : err.row === rowIndex;
        return !(err.column === column && isTarget);
      });

      if (wasError && remainingErrors.length < errors.length) {
        // 에러가 해결되었다면 카운트 감소
        setRefixCnt(prev => Math.max(0, prev - (errors.length - remainingErrors.length)));
      }
      setErrors(remainingErrors);
    }

    // 모든 에러가 사라지면 검증 완료 상태로 전환
    if (refixCnt === 0 || errors.length === 0) {
      setIsValidated(true);
    } else {
      setIsValidated(false);
    }
  }; // handleCellChange

  const scrollToError = (rowIndex: number) => {
    if (tableContainerRef.current) {
      tableContainerRef.current.scrollTo({ top: rowIndex * ROW_HEIGHT_PX, behavior: 'smooth' });
    }
  };

  const handleMouseDown = (header: string, e: React.MouseEvent) => {
    const startX = e.pageX;
    const headerElement = (e.target as HTMLElement).parentElement;
    const startWidth = headerElement?.offsetWidth || 150;
    const onMouseMove = (moveEvent: MouseEvent) => {
      const currentWidth = startWidth + (moveEvent.pageX - startX);
      setColumnWidths((prev) => ({ ...prev, [header]: currentWidth > 50 ? currentWidth : 50 }));
    };
    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  };

  const getCellError = (rowIndex: number, columnName: string) => {
    return errors.find(err => err.row === rowIndex && err.column === columnName);
  };

  const handleSaveToDB = async () => {
    // console.log("=== 저장 프로세스 시작 ===");
    // console.log("1. 현재 로그인 된 유저 ID (userId):", userId);
    // console.log("2. 검증 완료 여부 (isValidated):", isValidated);
    // console.log("3. 발견된 에러 개수 (errors.length):", errors.length);
    if (errors.length > 0) {
      alert("검증 완료 후 진행해 주세요.");
      return;
    }
    if (!window.confirm("데이터를 저장하시겠습니까?")) return;
    
    setLoading(true);
    setLoadingText('데이터베이스에 저장 중...');
    await new Promise(resolve => setTimeout(resolve, 100));
    try {
      const { error } = await supabase.rpc('process_excel_upload', {
        p_user_id: userId,
        p_json_data: previewData.map((row, index) => ({ ...row, 'No.': index + 1 }))
      });
      if (error) throw error;
      alert('저장이 완료되었습니다.');
      setPreviewData([]); setHeaders([]); setFileName(''); setErrors([]); setIsValidated(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      } // 저장 후 검증 상태 초기화 (데이터가 바뀌었으므로 재검증 유도)
    } catch (error: any) {
      alert(error.message || '업로드 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  // 전체 선택/해제 핸들러
  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      setSelectedRows(new Set(previewData.keys()));
    } else {
      setSelectedRows(new Set());
    }
  };

  // 개별 선택 핸들러
  const handleSelectRow = (index: number) => {
    const newSelected = new Set(selectedRows);
    if (newSelected.has(index)) {
      newSelected.delete(index);
    } else {
      newSelected.add(index);
    }
    setSelectedRows(newSelected);
  };

  const handleDeleteSelected = () => {
    if (selectedRows.size === 0) {
      alert("삭제할 항목을 선택해 주세요.");
      return;
    }
    const selectedIndices = Array.from(selectedRows);
    const selectedOrderNos = new Set(
      selectedIndices
        .map(idx => previewData[idx]['수주번호'])
        .filter(ordNo => ordNo !== undefined && ordNo !== null && String(ordNo).trim() !== '')
  );
    
    // 예외 처리: 체크되지 않은 행들 중, 체크된 수주번호와 동일한 수주번호가 있는지 확인
    const hasIncompleteOrder = previewData.some((row, idx) => {
      const ordNo = row['수주번호'];
      const isOrdNoEmpty = !ordNo || String(ordNo).trim() === '';
      return !isOrdNoEmpty && !selectedRows.has(idx) && selectedOrderNos.has(ordNo);
    });

    if (hasIncompleteOrder) {
      alert("동일한 수주번호를 가진 데이터는 함께 삭제해야 합니다. 모든 항목을 체크해 주세요.");
      return;
    }

    if (window.confirm(`${selectedRows.size}건의 데이터를 삭제하시겠습니까?`)) {
      const newData = previewData.filter((_, idx) => !selectedRows.has(idx));
      setPreviewData(newData);
      setSelectedRows(new Set());
      // 삭제 후 검증 상태 초기화 (데이터가 바뀌었으므로 재검증 유도)
      setRegCnt(0);
      setRefixCnt(0);
      setIsValidated(false); 
    }
  };

  return (
    <div className={`flex flex-col min-h-screen bg-slate-50 text-slate-900 ${loading ? 'pointer-events-none cursor-wait' : ''}`}>
      {/* <Script src={`//dapi.kakao.com/v2/maps/sdk.js?appkey=${KAKAO_KEY}&libraries=services&autoload=false`} onLoad={() => window.kakao.maps.load()} />
      <Script src="//t1.kakaocdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js" strategy="lazyOnload" /> */}

      <header className="sticky top-[64px] z-30 bg-white border-b px-8 py-4 shadow-sm flex justify-between items-center">
        <div className="flex items-center gap-6">
          <div className="flex flex-col">
            <h1 className="text-xl font-bold text-slate-800">고객배송정보 관리</h1>
            {userEmail && <span className="text-xs text-slate-400 font-normal">담당자: {userEmail}</span>}
          </div>
          <div className="flex items-center gap-3">
            <label htmlFor="file-upload" className="cursor-pointer bg-slate-100 hover:bg-slate-200 text-slate-700 px-4 py-2 rounded-md border border-slate-300 text-sm font-medium transition">
              {fileName ? '파일 변경' : '엑셀 파일 선택'}
            </label>
            <input id="file-upload" ref={fileInputRef} type="file" accept=".xlsx, .xls" onChange={handleFileChange} className="hidden" />
            {fileName && <span className="text-sm text-blue-600 font-medium">{fileName}</span>}
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          {/* 선택된 항목이 있을 때만 활성화되는 삭제 버튼 */}
          <button 
            onClick={handleDeleteSelected}
            disabled={selectedRows.size === 0 || loading}
            className="px-4 py-2 rounded-md font-bold text-red-600 border border-red-200 bg-red-50 hover:bg-red-100 disabled:opacity-50 disabled:cursor-not-allowed transition shadow-sm"
          >
            선택 삭제 ({selectedRows.size})
          </button>
          {previewData.length > 0 && (
            <button onClick={handleClear} className="px-4 py-2 rounded-md font-bold text-slate-500 hover:text-red-500 border border-slate-200 bg-white shadow-sm transition">초기화</button>
          )}
          <button onClick={handleValidate} disabled={previewData.length === 0 || loading} className="px-6 py-2 rounded-md font-bold transition border bg-white text-blue-600 border-blue-600 hover:bg-blue-50 disabled:text-slate-300 disabled:border-slate-200">
            데이터 검증 {previewData.length > 0 && `(${previewData.length}건)`}
          </button>
          <button onClick={handleSaveToDB} 
                  disabled={
                    previewData.length === 0 || 
                    loading || 
                    regCnt === 0 || // 최소 1회 검증 필수
                    refixCnt > 0    // 남은 에러가 없어야 함
                  } 
                  className="px-8 py-2 rounded-md font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 shadow-sm transition">
            {loading ? '처리 중...' : '데이터 저장하기'}
          </button>
        </div>
      </header>

      <main className="flex-1 p-8 overflow-hidden relative">
        {previewData.length > 0 ? (
          <div className="flex gap-4 h-full">
            <div ref={tableContainerRef} className="flex-1 bg-white rounded-lg shadow border border-slate-200 overflow-auto max-h-[calc(100vh-200px)] scroll-smooth">
              <table className="text-left text-sm border-collapse table-auto w-max">
                <thead className="bg-slate-50 border-b border-slate-200 sticky top-0 z-20">
                  <tr className={ROW_HEIGHT_CLASS}>
                    {headers.map((header) => (
                      <th 
                        key={header} 
                        style={columnWidths[header] ? { width: `${columnWidths[header]}px` } : {}} 
                        className={`relative px-4 font-semibold text-slate-700 bg-slate-100 align-middle border-r border-slate-200 last:border-r-0 
                          ${header === 'No.' ? 'sticky left-0 z-40 w-16 text-center border-r-2 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]' : ''}
                          ${header === '선택' ? 'sticky left-16 z-40 w-16 text-center border-r-2 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]' : ''}
                        `}
                      >
                        <div className="truncate">{header}</div>
                        {/* 'No.'와 '선택' 컬럼이 아니면 리사이즈 핸들 표시 */}
                        {header !== 'No.' && header !== '선택' && (
                          <div onMouseDown={(e) => handleMouseDown(header, e)} className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize hover:bg-blue-400 transition-colors" />
                        )}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {previewData.map((row, index) => {
                    const hasErrorInRow = errorRowIndices.has(index);
                    const isSelected = selectedRows.has(index);
                    return (
                      <tr key={index} className={`${ROW_HEIGHT_CLASS} hover:bg-slate-50 transition`}>
                        {headers.map((header) => {
                          // 1. No. 컬럼 (순번)
                          if (header === 'No.') {
                            return (
                              <td key={header} className={`sticky left-0 z-10 px-4 text-center font-bold border-r-2 transition-colors ${hasErrorInRow ? 'bg-red-500 text-white border-red-600' : 'bg-white text-slate-400 border-slate-200'}`}>
                                {index + 1}
                              </td>
                            );
                          }

                          // 2. 선택 컬럼 (체크박스) ✅ 이 부분을 명시적으로 추가합니다.
                          if (header === '선택') {
                            return (
                              <td key={header} className={`sticky left-16 z-10 w-16 text-center border-r-2 transition-colors ${isSelected ? 'bg-blue-50' : 'bg-white'} border-slate-200 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]`}>
                                <input 
                                  type="checkbox" 
                                  checked={isSelected}
                                  onChange={() => handleSelectRow(index)}
                                  className="w-4 h-4 cursor-pointer"
                                />
                              </td>
                            );
                          }
                          const cellError = getCellError(index, header);
                          const isEditable = EDITABLE_COLUMNS.includes(header);
                          const isAddress1 = header === '주소1';
                          return (
                            <td key={header} className={`align-middle border-r border-slate-100 last:border-r-0 transition-colors p-0 ${cellError ? 'bg-red-50 text-red-600 font-bold' : 'text-slate-600'}`}>
                              {isEditable ? (
                                <input 
                                  type="text" 
                                  readOnly={isAddress1}
                                  value={row[header] || ''} 
                                  onClick={() => isAddress1 && openPostcode(index)}
                                  onFocus={(e) => !isAddress1 && e.target.select()} // 선택된 데이터 전체선택
                                  onChange={(e) => !isAddress1 && handleCellChange(index, header, e.target.value)} 
                                  className={`w-full h-11 px-4 outline-none focus:ring-2 focus:ring-blue-400 transition-all bg-transparent focus:bg-white ${isAddress1 ? 'cursor-pointer hover:bg-blue-50' : ''}`}  
                                  placeholder={isAddress1 ? "주소 검색" : ""}
                                />
                              ) : (
                                <div className={`px-4 py-3 truncate`} style={columnWidths[header] ? { width: `${columnWidths[header]}px` } : { maxWidth: '300px' }}>{row[header]?.toString() || ''}</div>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            
            {/* 우측 에러 표시바 (미니맵) */}
            {errors.length > 0 && (
              <div className="w-4 bg-slate-100 rounded border border-slate-200 relative overflow-hidden shadow-inner shrink-0" style={{ height: 'calc(100vh - 200px)' }}>
                {errorRowsArray.map((rowIndex) => (
                  <div 
                    key={rowIndex} 
                    onClick={() => scrollToError(rowIndex)} 
                    className="absolute left-0 w-full bg-red-500 hover:bg-red-700 cursor-pointer transition-colors" 
                    style={{ 
                      top: `${(rowIndex / previewData.length) * 100}%`, 
                      height: `${Math.max(2, 100 / previewData.length)}%` 
                    }} 
                    title={`${rowIndex + 1}행에 오류가 있습니다.`} 
                  />
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-[60vh] border-2 border-dashed border-slate-300 rounded-xl bg-white text-slate-400">
            <p className="text-lg font-medium">업로드할 파일을 선택해 주세요.</p>
          </div>
        )}
      </main>

      {loading && (
        <div className="fixed inset-0 z-[9999] bg-slate-900/30 backdrop-blur-sm flex items-center justify-center">
          <div className="bg-white p-6 rounded-2xl shadow-2xl flex flex-col items-center gap-4">
            <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
            <p className="text-sm font-bold text-slate-700">{loadingText}</p>
          </div>
        </div>
      )}
    </div>
  );
}