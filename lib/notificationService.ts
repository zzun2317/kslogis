// src/lib/notificationService.ts
import { SolapiMessageService } from 'solapi';
import { createClient } from '@supabase/supabase-js';

// 서버 사이드에서만 실행될 것이므로 환경 변수에 NEXT_PUBLIC을 붙이지 않습니다.
const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const messageService = new SolapiMessageService(
  process.env.SOLAPI_API_KEY!,
  process.env.SOLAPI_API_SECRET!
);

export const sendAlimtalk = async ({
  status,
  phone,
  name,
  ordNo,
  items,
  driverName,
  driverHp,
  lat,
  lng,
  imageUrl,
  linkUrl,
  agentHp,
  agentName,
}: { 
  status: 'START' | 'COMPLETE';
  phone: string;
  name: string;
  ordNo?: string;
  items?: string;
  driverName?: string;
  driverHp?: string;
  lat?: number;
  lng?: number;
  imageUrl?: string;
  linkUrl?: string;
  agentHp?: string;
  agentName?: string;
}) => {
  try {
    const messagePromises: any[] = [];

    // 1. URL 결정 (공통)
    let finalUrl = "";
    if (status === 'START') {
      if (lat && lng) {
        const label = encodeURIComponent("배송기사위치");
        finalUrl = `map.kakao.com/link/map/${label},${lat},${lng}`;
      }
    } else {
      finalUrl = linkUrl || (ordNo ? `kslogis.vercel.app/view-images/${ordNo}` : "");
    }

    // 2. [고객용] 메시지 생성 및 추가
    const customerCode = status === 'START' ? 'DELIVERY_START' : 'DELIVERY_COMPLETE';
    const { data: custTemp } = await supabase
      .from('kakao_template')
      .select('template_id')
      .eq('template_code', customerCode)
      .eq('template_usegbn', true)
      .single();

    if (custTemp && phone) {
      const customerVariables: any = {
        "#{cust_name}": name,
        "#{cust_ordno}": ordNo || "",
        "#{url}": finalUrl,
      };

      if (status === 'START') {
        customerVariables["#{item_name}"] = items || "주문 상품";
        customerVariables["#{driver_name}"] = driverName || "배송 담당자";
        customerVariables["#{driver_hpno}"] = driverHp || "";
      } else {
        customerVariables["#{cust_setname}"] = items || "주문 상품";
      }

      // 개별 발송 프로미스 추가
      messagePromises.push(
        messageService.sendOne({
          to: phone.replace(/[^0-9]/g, ''),
          from: process.env.SOLAPI_SENDER_NUMBER!,
          kakaoOptions: {
            pfId: process.env.SOLAPI_PFID!,
            templateId: custTemp.template_id,
            variables: customerVariables
          }
        })
      );
    }

    // 3. [매장용] 메시지 생성 및 추가
    if (agentHp) {
      const agentCode = status === 'START' ? 'AGENT_DELIVERY_START' : 'AGENT_DELIVERY_COMPLETE';
      const { data: agentTemp } = await supabase
        .from('kakao_template')
        .select('template_id')
        .eq('template_code', agentCode)
        .eq('template_usegbn', true)
        .single();

      if (agentTemp) {
        messagePromises.push(
          messageService.sendOne({
            to: agentHp.replace(/[^0-9]/g, ''),
            from: process.env.SOLAPI_SENDER_NUMBER!,
            kakaoOptions: {
              pfId: process.env.SOLAPI_PFID!,
              templateId: agentTemp.template_id,
              variables: {
                "#{cust_name}": name,
                "#{cust_ordno}": ordNo || "",
                "#{item_name}": items || "주문 상품",
                "#{driver_name}": driverName || "배송 담당자",
                "#{driver_hpno}": driverHp || "",
                "#{url}": finalUrl,
              }
            }
          })
        );
      }
    }

    // 4. 모든 메시지 병렬 발송
    if (messagePromises.length === 0) return null;
    
    // Promise.all을 사용하여 등록된 모든 발송을 동시에 실행합니다.
    const results = await Promise.all(messagePromises);
    return results;

  } catch (error) {
    console.error('🚀 알림톡 발송 에러:', error);
    throw error;
  }
};

/*
export const sendAlimtalk = async ({
  status,
  phone,
  name,
  ordNo,
  items,
  driverName,
  driverHp,
  lat,
  lng,
  imageUrl,
  linkUrl,
  agentHp,
  agentName,
  isAgent = false
}: { 
  status: 'START' | 'COMPLETE';
  phone: string;
  name: string;      // ✅ name을 구조 분해 할당 목록에 직접 넣습니다.
  ordNo?: string;
  items?: string;
  driverName?: string;
  driverHp?: string;
  lat?: number;
  lng?: number;
  imageUrl?: string;
  linkUrl?: string;
  agentHp?: string;
  agentName?: string;
  isAgent?: boolean; // ✅ 매장용 알림톡 여부를 나타내는 플래그 추가
  }
) => {
  // console.log(`🚀 [Service] 알림톡 함수 진입 - 상태: ${status}, 수신: ${name}`);
  try {
    const prefix = isAgent ? 'AGENT_' : '';
    const targetCode = isAgent 
      ? (status === 'START' ? 'AGENT_DELIVERY_START' : 'AGENT_DELIVERY_COMPLETE')
      : (status === 'START' ? 'DELIVERY_START' : 'DELIVERY_COMPLETE');
    // console.log(`🔍 [Service] DB 템플릿 조회 시도 (code: ${targetCode})`);
    // 1. DB에서 템플릿 정보 조회 (기존 로직 유지)
    const { data: templateData, error: dbError } = await supabase
      .from('kakao_template')
      .select('template_id')
      .eq('template_code', targetCode)
      .eq('template_usegbn', true)
      .single();

    if (dbError || !templateData) {
      // console.error('❌ [Service] 템플릿 조회 실패:', dbError?.message || '데이터 없음');
      throw new Error(`DB에 ${targetCode} 상태에 대한 템플릿이 없습니다.`);
    }

    let urlVariable = "";
    // console.log(`✅ [Service] 템플릿 조회 성공: ${templateData.template_id}`);
    // console.log(`📤 [Service] Solapi 요청 전송 시도...`);
    // 2-1. [배송 완료] 이미지 처리
    if (status === 'COMPLETE') {
      let finalImageUrl = imageUrl;
      if (!linkUrl && ordNo) {
        linkUrl = `kslogis.vercel.app/view-images/${ordNo}`;
      }
      if (!finalImageUrl && ordNo) {
        const { data: imageData } = await supabase
          .from('ks_devimages')
          .select('img_url')
          .eq('cust_ordno', ordNo)
          .eq('img_type', 'PHOTO')
          .order('reg_date', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (imageData?.img_url) finalImageUrl = imageData.img_url;
      }

      if (finalImageUrl) {
        if (finalImageUrl.startsWith('http')) {
          urlVariable = finalImageUrl.replace(/^https?:\/\//, '');
        } else {
          const { data: signedData } = await supabase.storage
            .from('delivery_images')
            .createSignedUrl(finalImageUrl, 60 * 60 * 24 * 7);
          if (signedData) urlVariable = signedData.signedUrl.replace(/^https?:\/\//, '');
        }
      }
    }
    // 2-2. [배송 출발] 위치 처리
    else if (status === 'START' && lat && lng) {
      const label = encodeURIComponent("배송기사위치");
      urlVariable = `map.kakao.com/link/map/${label},${lat},${lng}`;
    }

    // 3. 변수 구성
    let kakaoVariables: any = {};
    if (status === 'START') {
      kakaoVariables = {
        "#{cust_name}": name,
        "#{cust_ordno}": ordNo || "",
        "#{item_name}": items || "주문 상품",
        "#{driver_name}": driverName || "배송 담당자",
        "#{driver_hpno}": driverHp || "",
        "#{url}": urlVariable,
      };
    } else {
      // ✅ [배송완료] 고객용 vs 매장용 변수 분기 처리
      if (isAgent) {
        // 🏪 매장용 (AGENT_DELIVERY_COMPLETE) - 템플릿 문구 매칭
        kakaoVariables = {
          "#{cust_name}": name,
          "#{cust_ordno}": ordNo || "",
          "#{item_name}": items || "주문 상품", // 매장용은 item_name 사용
          "#{driver_name}": driverName || "배송 담당자",
          "#{driver_hpno}": driverHp || "",
          "#{url}": linkUrl,
        };  
      } else {
        kakaoVariables = {
          "#{cust_name}": name,
          "#{cust_ordno}": ordNo || "",
          "#{cust_setname}": items || "주문 상품",
          // "#{url}": urlVariable,
          "#{url}": linkUrl,
        };
      }
    }

    // 4. 발송
    return await messageService.sendOne({
      to: phone.replace(/-/g, ''),
      from: process.env.SOLAPI_SENDER_NUMBER!,
      kakaoOptions: {
        pfId: process.env.SOLAPI_PFID!,
        templateId: templateData.template_id,
        variables: kakaoVariables
      }
    });
  } catch (error) {
    console.error('🚀 알림톡 서비스 에러:', error);
    throw error;
  }
};
*/