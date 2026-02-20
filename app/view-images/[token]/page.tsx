// app/view-images/[ordNo]/page.tsx
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY! // 보안을 위해 서버에서 조회
);

export default async function ViewImages({ params }: { params: { token: string } }) {
  const resolvedParams = await params;
  const { token } = await params;
  console.log("📍 수신된 token번호:", token);

  // DB에서 해당 주문번호의 모든 이미지 가져오기
  const { data: masterData, error: masterError } = await supabase
    .from('ks_devcustm')
    .select('cust_ordno')
    .eq('cust_imgtoken', token)
    .single();

  if (masterError || !masterData) {
    return <div>유효하지 않거나 만료된 링크입니다.</div>;
  }

  const ordNo = masterData.cust_ordno;

  // 2. 찾아낸 ordNo로 이미지를 조회합니다 (기존 로직 동일)
  const { data: images } = await supabase
    .from('ks_devimages')
    .select('*')
    .eq('cust_ordno', ordNo)
    .eq('img_type', 'PHOTO');

  if (masterError || !images || images.length === 0) {
    return <div style={{ padding: '20px', textAlign: 'center' }}>등록된 배송 이미지가 없습니다.</div>;
  }

  return (
    <div style={{ padding: '20px', maxWidth: '600px', margin: '0 auto', fontFamily: 'sans-serif' }}>
      <h2 style={{ fontSize: '1.2rem', marginBottom: '20px', textAlign: 'center' }}>배송 완료 사진 확인</h2>
      <p style={{ color: '#666', marginBottom: '10px' }}>주문번호: {ordNo}</p>
      
      <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
        {images.map((img) => (
          <div key={img.id} style={{ border: '1px solid #eee', borderRadius: '8px', overflow: 'hidden' }}>
            {/* Storage의 Public URL을 생성해서 보여줌 */}
            <img 
              // src={`${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/delivery_images/${img.img_url}`} <-- 기존 (중복됨)
              src={img.img_url} // ✅ 이미 전체 URL이 저장되어 있으므로 컬럼 값 그대로 사용!
              alt="배송사진" 
              style={{ width: '100%', display: 'block' }} 
            />
            <div style={{ padding: '8px', background: '#f9f9f9', fontSize: '0.8rem', color: '#888' }}>
              배송사진
            </div>
          </div>
        ))}
      </div>
      
      <footer style={{ marginTop: '30px', textAlign: 'center', fontSize: '0.8rem', color: '#ccc' }}>
        © KS LOGIS - 배송을 완료하였습니다.
      </footer>
    </div>
  );
}