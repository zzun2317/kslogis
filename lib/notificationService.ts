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
  linkUrl
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
  }
) => {
  // console.log(`🚀 [Service] 알림톡 함수 진입 - 상태: ${status}, 수신: ${name}`);
  try {
    const targetCode = status === 'START' ? 'DELIVERY_START' : 'DELIVERY_COMPLETE';
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
      kakaoVariables = {
        "#{cust_name}": name,
        "#{cust_ordno}": ordNo || "",
        "#{cust_setname}": items || "주문 상품",
        "#{url}": urlVariable,
      };
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