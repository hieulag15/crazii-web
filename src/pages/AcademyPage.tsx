import { useState } from 'react';

interface AcademyPageProps { onBack: () => void; }
type TopicId = 'overview' | 'step1' | 'step2' | 'step3' | 'step4' | 'mtf' | 'rules' | 'rr' | 'defi1' | 'defi2' | 'defi3';

const TOPICS: { id: TopicId; icon: string; label: string; group?: string }[] = [
  { id: 'overview', icon: '🎯', label: 'Tổng quan phương pháp', group: 'Trading' },
  { id: 'step1', icon: '📈', label: 'B1: Xác định xu hướng' },
  { id: 'step2', icon: '🔑', label: 'B2: Khoanh vùng S/R' },
  { id: 'step3', icon: '🕯️', label: 'B3: Chờ nến đảo chiều' },
  { id: 'step4', icon: '⚡', label: 'B4: Xác nhận & Vào lệnh' },
  { id: 'mtf', icon: '🔍', label: 'Multi-Timeframe' },
  { id: 'rules', icon: '🚫', label: 'Nguyên tắc bất biến' },
  { id: 'rr', icon: '💰', label: 'Quản lý vốn & R:R' },
  { id: 'defi1', icon: '📊', label: 'DeFi: Đọc số liệu', group: 'Research' },
  { id: 'defi2', icon: '💎', label: 'DeFi: Định giá P/S & P/TVL' },
  { id: 'defi3', icon: '🏆', label: 'DeFi: Hold hay Skip?' },
];

export default function AcademyPage({ onBack }: AcademyPageProps) {
  const [activeTopic, setActiveTopic] = useState<TopicId>('overview');
  return (
    <div style={S.container}>
      <header style={S.header}>
        <button onClick={onBack} style={S.backBtn}>← Quay lại Chart</button>
        <h2 style={S.title}>📖 Học Viện Trading</h2>
        <span style={S.subtitle}>Key Level + Nến Đảo Chiều + EMA</span>
      </header>
      <div style={S.body}>
        <nav style={S.sidebar}>
          <div style={S.sidebarGroup}>📊 TRADING</div>
          {TOPICS.filter(t => !t.group || t.group === 'Trading').filter(t => !['defi1','defi2','defi3'].includes(t.id)).map(t => (
            <button key={t.id} onClick={() => setActiveTopic(t.id)}
              style={{ ...S.navItem, ...(activeTopic === t.id ? S.navItemActive : {}) }}>
              <span>{t.icon}</span> {t.label}
            </button>
          ))}
          <div style={{...S.sidebarGroup, marginTop:'12px'}}>📚 DEFI RESEARCH</div>
          {TOPICS.filter(t => ['defi1','defi2','defi3'].includes(t.id)).map(t => (
            <button key={t.id} onClick={() => setActiveTopic(t.id)}
              style={{ ...S.navItem, ...(activeTopic === t.id ? S.navItemActive : {}) }}>
              <span>{t.icon}</span> {t.label}
            </button>
          ))}
        </nav>
        <main style={S.main}>{renderTopic(activeTopic)}</main>
      </div>
    </div>
  );
}

function renderTopic(id: TopicId) {
  switch (id) {
    case 'overview': return <Overview />;
    case 'step1': return <Step1 />;
    case 'step2': return <Step2 />;
    case 'step3': return <Step3 />;
    case 'step4': return <Step4 />;
    case 'mtf': return <MtfSection />;
    case 'rules': return <RulesSection />;
    case 'rr': return <RrSection />;
    case 'defi1': return <Defi1 />;
    case 'defi2': return <Defi2 />;
    case 'defi3': return <Defi3 />;
  }
}

function Overview() {
  return (
    <article style={S.article}>
      <h3 style={S.h3}>🎯 Phương Pháp: Key Level + Nến Đảo Chiều</h3>
      <blockquote style={S.quote}>"Combo đơn giản nhưng ăn tiền: Key Level + Nến đảo chiều. Không cần hàng tá indicator rối rắm."</blockquote>
      <p style={S.p}>Đây là phương pháp giao dịch dựa trên <strong>Price Action</strong> thuần túy, kết hợp Key Level (hỗ trợ/kháng cự) với mô hình nến đảo chiều để tìm điểm vào lệnh chính xác.</p>
      <div style={S.infoBox}>
        <h4 style={S.h4}>Tài nguyên sử dụng:</h4>
        <ul style={S.ul}>
          <li><strong>Key Levels [K-Means] + EMA</strong> — Indicator tự vẽ hỗ trợ/kháng cự tĩnh + 3 đường EMA 34/89/200</li>
          <li><strong>Candlestick Pattern</strong> — Indicator tự nhận diện mô hình nến đảo chiều</li>
        </ul>
      </div>
      <div style={S.ruleBox}>
        <h4 style={S.h4}>4 bước setup chuẩn:</h4>
        <ol style={{...S.ul, paddingLeft:'20px'}}>
          <li><strong>Xác định xu hướng chính</strong> — EMA 34/89/200 trên D1/H4</li>
          <li><strong>Khoanh vùng kháng cự/hỗ trợ</strong> — Key Level tĩnh + EMA động</li>
          <li><strong>Chờ giá về vùng</strong> — Đợi nến đảo chiều xuất hiện tại đúng vùng</li>
          <li><strong>Xác nhận + Vào lệnh</strong> — Entry sau nến đóng, SL dưới râu, TP key level tiếp theo</li>
        </ol>
      </div>
      <div style={S.tipBox}><strong>💡 Triết lý:</strong> Kiên nhẫn chờ giá đến vùng mình muốn, không đuổi giá. 80% hiệu quả đến từ việc kiên nhẫn ở Bước 3.</div>
    </article>
  );
}

function Step1() {
  return (
    <article style={S.article}>
      <h3 style={S.h3}>📈 Bước 1: Xác Định Xu Hướng Chính</h3>
      <p style={S.p}>Nhìn khung lớn trước (D1 hoặc H4) để biết thị trường đang tăng hay giảm. Dùng bộ 3 EMA 34/89/200 làm kim chỉ nam:</p>
      <div style={{display:'flex',gap:'12px',marginBottom:'16px',flexWrap:'wrap'}}>
        <div style={{flex:1,minWidth:'200px',background:'rgba(34,197,94,0.06)',border:'1px solid #22c55e40',borderRadius:'10px',padding:'14px'}}>
          <h4 style={{color:'#22c55e',margin:'0 0 6px',fontSize:'0.9rem'}}>⬆️ Xu hướng TĂNG</h4>
          <ul style={{...S.ul,fontSize:'0.82rem'}}>
            <li>EMA 34 &gt; EMA 89 &gt; EMA 200</li>
            <li>Giá nằm <strong>trên</strong> cả 3 đường EMA</li>
            <li>→ Ưu tiên tìm lệnh <strong>BUY</strong></li>
          </ul>
        </div>
        <div style={{flex:1,minWidth:'200px',background:'rgba(239,68,68,0.06)',border:'1px solid #ef444440',borderRadius:'10px',padding:'14px'}}>
          <h4 style={{color:'#ef4444',margin:'0 0 6px',fontSize:'0.9rem'}}>⬇️ Xu hướng GIẢM</h4>
          <ul style={{...S.ul,fontSize:'0.82rem'}}>
            <li>EMA 34 &lt; EMA 89 &lt; EMA 200</li>
            <li>Giá nằm <strong>dưới</strong> cả 3 đường EMA</li>
            <li>→ Ưu tiên tìm lệnh <strong>SELL</strong></li>
          </ul>
        </div>
        <div style={{flex:1,minWidth:'200px',background:'rgba(234,179,8,0.06)',border:'1px solid #eab30840',borderRadius:'10px',padding:'14px'}}>
          <h4 style={{color:'#eab308',margin:'0 0 6px',fontSize:'0.9rem'}}>↔️ Sideway</h4>
          <ul style={{...S.ul,fontSize:'0.82rem'}}>
            <li>3 đường EMA đan xen lộn xộn</li>
            <li>Giá dao động quanh EMA</li>
            <li>→ <strong>Đứng ngoài</strong> hoặc giao dịch cẩn trọng</li>
          </ul>
        </div>
      </div>
      <div style={S.ruleBox}>
        <h4 style={S.h4}>Ý nghĩa 3 đường EMA:</h4>
        <ul style={S.ul}>
          <li><span style={{color:'#f97316'}}>EMA 34 (Cam)</span> — Xu hướng ngắn hạn, phản ứng nhanh</li>
          <li><span style={{color:'#3b82f6'}}>EMA 89 (Xanh)</span> — Xu hướng trung hạn</li>
          <li><span style={{color:'#a855f7'}}>EMA 200 (Tím)</span> — Xu hướng dài hạn, rất quan trọng</li>
        </ul>
      </div>
      <div style={S.tipBox}><strong>💡 Lưu ý:</strong> Khi cả 3 EMA xếp thứ tự đẹp và giá nằm đúng phía → xu hướng rất mạnh, confidence cao. Chỉ cần kiên nhẫn chờ pullback về vùng hỗ trợ/kháng cự.</div>
    </article>
  );
}

function Step2() {
  return (
    <article style={S.article}>
      <h3 style={S.h3}>🔑 Bước 2: Khoanh Vùng Hỗ Trợ / Kháng Cự</h3>
      <p style={S.p}>Chuyển qua khung entry (H4, H1, H2 — tùy style), dùng indicator Key Level để xác định vùng giá quan trọng phía trước.</p>
      <div style={S.infoBox}>
        <h4 style={S.h4}>Vùng tĩnh (Key Levels cứng):</h4>
        <ul style={S.ul}>
          <li><span style={{color:'#22c55e'}}>🟢 Hỗ trợ cứng (Xanh)</span> — Vùng giá đã phản ứng TĂNG nhiều lần trong lịch sử</li>
          <li><span style={{color:'#ef4444'}}>🔴 Kháng cự cứng (Đỏ)</span> — Vùng giá đã phản ứng GIẢM nhiều lần trong lịch sử</li>
          <li>Càng nhiều lần test (touches) → vùng càng mạnh</li>
        </ul>
      </div>
      <div style={S.infoBox}>
        <h4 style={S.h4}>Vùng động (EMA):</h4>
        <ul style={S.ul}>
          <li><span style={{color:'#f97316'}}>EMA 34 (Cam)</span> — Hỗ trợ/kháng cự di chuyển theo giá, nhạy nhất</li>
          <li><span style={{color:'#3b82f6'}}>EMA 89 (Xanh)</span> — Vùng quan trọng hơn khi giá pullback sâu</li>
          <li><span style={{color:'#a855f7'}}>EMA 200 (Tím)</span> — Hỗ trợ/kháng cự cực mạnh, giá hiếm khi xuyên qua dễ dàng</li>
        </ul>
      </div>
      <div style={S.ruleBox}>
        <h4 style={S.h4}>Cách khoanh vùng hiệu quả:</h4>
        <ul style={S.ul}>
          <li>Chỉ chọn <strong>2-3 vùng quan trọng nhất</strong> phía trước giá hiện tại</li>
          <li>Không ôm đồm quá nhiều vùng gây rối mắt</li>
          <li>Ưu tiên vùng có nhiều lần test + volume cao khi test</li>
          <li>Vùng có sự hợp lưu giữa Key Level tĩnh + EMA → cực mạnh</li>
        </ul>
      </div>
      <div style={S.tipBox}><strong>💡 Mẹo:</strong> Khi Key Level trùng với EMA (VD: support cứng nằm ngay EMA89), đó là "vùng hợp lưu" — khả năng giá phản ứng rất cao, ưu tiên trade tại đây.</div>
    </article>
  );
}

function Step3() {
  return (
    <article style={S.article}>
      <h3 style={S.h3}>🕯️ Bước 3: Chờ Giá Về Vùng + Nến Đảo Chiều</h3>
      <p style={S.p}>Đây là bước quyết định 80% hiệu quả. <strong>Kiên nhẫn là chìa khóa.</strong> Khi giá chạm vào vùng đã khoanh, quan sát nến đảo chiều.</p>
      <div style={S.ruleBox}>
        <h4 style={S.h4}>Khi nào tìm nến đảo chiều?</h4>
        <ul style={S.ul}>
          <li>📈 Xu hướng TĂNG + Giá về <strong>hỗ trợ</strong> → Tìm nến đảo chiều <strong>tăng</strong> (bullish)</li>
          <li>📉 Xu hướng GIẢM + Giá về <strong>kháng cự</strong> → Tìm nến đảo chiều <strong>giảm</strong> (bearish)</li>
        </ul>
      </div>
      <div style={S.infoBox}>
        <h4 style={S.h4}>Các mô hình nến đảo chiều mạnh:</h4>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'8px',marginTop:'8px'}}>
          <div style={S.patternCard}>
            <span style={{color:'#22c55e',fontWeight:'bold'}}>BULLISH (Tăng):</span>
            <ul style={{...S.ul,fontSize:'0.78rem',marginTop:'4px'}}>
              <li>🔨 Hammer (Búa)</li>
              <li>🌅 Morning Star (Sao mai)</li>
              <li>💪 Bullish Engulfing (Nhấn chìm tăng)</li>
              <li>🔄 Bullish Harami</li>
              <li>⚡ Bullish Kicker</li>
              <li>📌 Inverted Hammer</li>
            </ul>
          </div>
          <div style={S.patternCard}>
            <span style={{color:'#ef4444',fontWeight:'bold'}}>BEARISH (Giảm):</span>
            <ul style={{...S.ul,fontSize:'0.78rem',marginTop:'4px'}}>
              <li>⭐ Shooting Star (Sao băng)</li>
              <li>🌙 Evening Star (Sao hôm)</li>
              <li>💀 Bearish Engulfing (Nhấn chìm giảm)</li>
              <li>🔄 Bearish Harami</li>
              <li>⚡ Bearish Kicker</li>
              <li>🎪 Hanging Man</li>
            </ul>
          </div>
        </div>
      </div>
      <div style={S.warningBox}><strong>⚠️ Quan trọng:</strong> Nến đảo chiều CHỈ có giá trị khi xuất hiện <strong>tại đúng vùng Key Level</strong>. Nến đảo chiều giữa chừng không có ý nghĩa.</div>
      <div style={S.tipBox}><strong>💡 Wick touch:</strong> Nến có râu (wick) chạm vào Key Level hoặc EMA rồi bật ngược = xác nhận vùng đang hold. Tín hiệu mạnh hơn nhiều so với nến chỉ gần vùng.</div>
    </article>
  );
}

function Step4() {
  return (
    <article style={S.article}>
      <h3 style={S.h3}>⚡ Bước 4: Xác Nhận + Vào Lệnh</h3>
      <p style={S.p}>Khi nến đảo chiều đóng rõ ràng tại vùng giá, setup vào lệnh như sau:</p>
      <div style={{display:'flex',gap:'12px',marginBottom:'16px',flexWrap:'wrap'}}>
        <div style={{flex:1,minWidth:'250px',background:'rgba(34,197,94,0.05)',border:'1px solid #22c55e40',borderRadius:'10px',padding:'16px'}}>
          <h4 style={{color:'#22c55e',margin:'0 0 10px'}}>🟢 Setup BUY</h4>
          <ul style={{...S.ul,fontSize:'0.82rem'}}>
            <li><strong>Entry:</strong> Ngay giá đóng nến đảo chiều bullish</li>
            <li><strong>SL:</strong> Dưới chân râu nến đảo chiều (+ buffer nhỏ)</li>
            <li><strong>TP:</strong> Key Level kháng cự tiếp theo phía trên</li>
          </ul>
        </div>
        <div style={{flex:1,minWidth:'250px',background:'rgba(239,68,68,0.05)',border:'1px solid #ef444440',borderRadius:'10px',padding:'16px'}}>
          <h4 style={{color:'#ef4444',margin:'0 0 10px'}}>🔴 Setup SELL</h4>
          <ul style={{...S.ul,fontSize:'0.82rem'}}>
            <li><strong>Entry:</strong> Ngay giá đóng nến đảo chiều bearish</li>
            <li><strong>SL:</strong> Trên đỉnh râu nến đảo chiều (+ buffer nhỏ)</li>
            <li><strong>TP:</strong> Key Level hỗ trợ tiếp theo phía dưới</li>
          </ul>
        </div>
      </div>
      <div style={S.ruleBox}>
        <h4 style={S.h4}>Xử lý SL khi vùng có sideway:</h4>
        <p style={{...S.p,margin:'4px 0 8px'}}>Nếu vùng Key Level đó có nhiều cây nến thả râu (sideway nén):</p>
        <ul style={S.ul}>
          <li>Tìm cây nến có râu <strong>dài nhất</strong> trong vùng sideway đó</li>
          <li>Đặt SL ngay sau chân râu của cây nến dài nhất</li>
          <li>Lý do: Tránh bị quét SL bởi nhiễu khi giá test lại vùng</li>
        </ul>
      </div>
      <div style={S.infoBox}>
        <h4 style={S.h4}>Volume xác nhận (bonus):</h4>
        <ul style={S.ul}>
          <li>Nến đảo chiều có volume cao (&gt;1.5x trung bình) = xác nhận mạnh</li>
          <li>Volume thấp tại nến đảo chiều = cẩn trọng, có thể chỉ là noise</li>
          <li>Volume tăng dần khi giá rời khỏi vùng = xác nhận vùng hold tốt</li>
        </ul>
      </div>
      <div style={S.tipBox}><strong>💡 Pro tip:</strong> Không nhất thiết phải chờ nến đảo chiều "kinh điển". Nếu giá tạo cấu trúc đẹp tại vùng (VD: false break rồi đóng lại trong vùng) → cũng là tín hiệu tốt. Tuy nhiên cần backtest nhiều để nhận diện pattern này.</div>
    </article>
  );
}

function MtfSection() {
  return (
    <article style={S.article}>
      <h3 style={S.h3}>🔍 Multi-Timeframe Analysis</h3>
      <p style={S.p}>Phân tích đa khung thời gian giúp tăng tỷ lệ thắng đáng kể. Quy trình từ lớn đến nhỏ:</p>
      <div style={S.ruleBox}>
        <h4 style={S.h4}>Quy trình 3 bước MTF:</h4>
        <div style={{display:'flex',flexDirection:'column',gap:'12px',marginTop:'8px'}}>
          <div style={{display:'flex',gap:'10px',alignItems:'flex-start'}}>
            <span style={{background:'#3b82f620',color:'#3b82f6',padding:'2px 8px',borderRadius:'4px',fontWeight:'bold',fontSize:'0.8rem',flexShrink:0}}>W1</span>
            <div>
              <strong style={{color:'#e2e8f0',fontSize:'0.85rem'}}>Nến Tuần — Bức tranh lớn</strong>
              <ul style={{...S.ul,fontSize:'0.78rem',marginTop:'4px'}}>
                <li>Xem xu hướng tổng thể đang tăng/giảm/sideway</li>
                <li>Check mô hình kinh điển: 2 đỉnh, 2 đáy, 3 đỉnh, Head & Shoulders...</li>
                <li>Cấu trúc Higher Highs + Higher Lows = uptrend bền vững</li>
                <li>Cấu trúc Lower Highs + Lower Lows = downtrend bền vững</li>
              </ul>
            </div>
          </div>
          <div style={{display:'flex',gap:'10px',alignItems:'flex-start'}}>
            <span style={{background:'#a855f720',color:'#a855f7',padding:'2px 8px',borderRadius:'4px',fontWeight:'bold',fontSize:'0.8rem',flexShrink:0}}>D1</span>
            <div>
              <strong style={{color:'#e2e8f0',fontSize:'0.85rem'}}>Nến Ngày — Xu hướng & Volume</strong>
              <ul style={{...S.ul,fontSize:'0.78rem',marginTop:'4px'}}>
                <li>Xu hướng hiện tại: giá đang tăng/giảm trên D1?</li>
                <li>Volume: vol mua cao hay vol bán cao?</li>
                <li>Vol bán/mua đã giảm dần chưa → cơ sở cho đảo chiều/hồi</li>
                <li>Giá có đang gần vùng S/R quan trọng nào trên D1 không?</li>
              </ul>
            </div>
          </div>
          <div style={{display:'flex',gap:'10px',alignItems:'flex-start'}}>
            <span style={{background:'#22c55e20',color:'#22c55e',padding:'2px 8px',borderRadius:'4px',fontWeight:'bold',fontSize:'0.8rem',flexShrink:0}}>H4</span>
            <div>
              <strong style={{color:'#e2e8f0',fontSize:'0.85rem'}}>Nến 4H — Khung Entry</strong>
              <ul style={{...S.ul,fontSize:'0.78rem',marginTop:'4px'}}>
                <li>Đợi nến đảo chiều tại vùng hỗ trợ/kháng cự</li>
                <li>Setup vào lệnh khi nến H4 đóng xác nhận</li>
                <li>Scan vào khung giờ H4 đóng nến: 7h, 11h, 15h, 19h, 23h, 3h</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
      <div style={S.warningBox}><strong>⚠️ Lưu ý:</strong> Không bao giờ trade ngược xu hướng W1/D1. Nếu W1 đang downtrend rõ ràng, H4 có tín hiệu BUY cũng chỉ là pullback ngắn — rủi ro cao.</div>
    </article>
  );
}

function RulesSection() {
  return (
    <article style={S.article}>
      <h3 style={S.h3}>🚫 Nguyên Tắc Bất Biến — KHÔNG BAO GIỜ PHÁ</h3>
      <div style={{...S.warningBox,border:'2px solid #ef444450'}}>
        <ul style={{...S.ul,fontSize:'0.9rem'}}>
          <li>🚫 <strong>Không SELL</strong> khi giá đang gần vùng Hỗ trợ</li>
          <li>🚫 <strong>Không BUY</strong> khi giá đang gần vùng Kháng cự</li>
        </ul>
      </div>
      <div style={S.ruleBox}>
        <h4 style={S.h4}>Điều kiện KHÔNG vào lệnh:</h4>
        <ul style={S.ul}>
          <li>❌ Giá đang sideway giữa 2 vùng (không có xu hướng rõ)</li>
          <li>❌ Nến đảo chiều xuất hiện giữa chừng (không tại vùng Key Level)</li>
          <li>❌ Xu hướng D1/W1 ngược với hướng muốn trade</li>
          <li>❌ Volume quá thấp (thiếu thanh khoản, dễ bị manipulation)</li>
          <li>❌ R:R không đạt tối thiểu 1.5 (risk quá lớn so với reward)</li>
          <li>❌ Đang có tin tức lớn sắp ra (FOMC, CPI, NFP...)</li>
        </ul>
      </div>
      <div style={S.infoBox}>
        <h4 style={S.h4}>Mindset đúng:</h4>
        <ul style={S.ul}>
          <li>Không cần trade mỗi ngày. Chất lượng &gt; số lượng</li>
          <li>Bỏ lỡ cơ hội còn tốt hơn vào sai lệnh</li>
          <li>Tuân thủ kỷ luật 100% — không có ngoại lệ</li>
          <li>Mỗi lệnh thua đều phải ghi chú lý do vào Journal để học</li>
        </ul>
      </div>
    </article>
  );
}

function RrSection() {
  return (
    <article style={S.article}>
      <h3 style={S.h3}>💰 Quản Lý Vốn & Risk:Reward</h3>
      <p style={S.p}>Quản lý vốn quyết định bạn tồn tại được bao lâu trong thị trường. Dù win rate 60% nhưng R:R xấu vẫn thua dài hạn.</p>
      <div style={S.ruleBox}>
        <h4 style={S.h4}>Nguyên tắc R:R:</h4>
        <ul style={S.ul}>
          <li>R:R tối thiểu <strong>1:1.5</strong> mới được vào lệnh</li>
          <li>R:R lý tưởng: <strong>1:2</strong> trở lên</li>
          <li>Nếu SL quá rộng mà TP không đạt 1.5R → <strong>bỏ qua</strong></li>
        </ul>
      </div>
      <div style={S.ruleBox}>
        <h4 style={S.h4}>Chiến lược chốt lời:</h4>
        <ul style={S.ul}>
          <li><strong>TP1 (Chốt 50-70%):</strong> Key Level gần nhất — an toàn, tỷ lệ chạm cao</li>
          <li><strong>TP2 (Chốt 20-30%):</strong> Key Level tiếp theo — gồng thêm nếu trend mạnh</li>
          <li><strong>Trailing (10% còn lại):</strong> Kéo SL theo EMA34 — maximize profit khi trend kéo dài</li>
        </ul>
      </div>
      <div style={S.tipBox}>
        <strong>💡 Breakeven rule:</strong> Khi giá chạm TP1, kéo SL về entry (breakeven) cho phần còn lại. Lúc này bạn đã "free trade" — chỉ có thể win hoặc hòa, không thể thua.
      </div>
      <div style={S.infoBox}>
        <h4 style={S.h4}>Risk per trade:</h4>
        <ul style={S.ul}>
          <li>Tối đa <strong>1-2%</strong> tài khoản mỗi lệnh</li>
          <li>Tối đa <strong>3-5%</strong> tổng risk mở cùng lúc</li>
          <li>Thua 3 lệnh liên tiếp → nghỉ 1 ngày, review Journal</li>
        </ul>
      </div>
      <div style={{marginTop:'16px',padding:'12px',background:'#1e293b40',borderRadius:'8px',border:'1px dashed #64748b'}}>
        <p style={{color:'#94a3b8',fontSize:'0.82rem',margin:0}}>📝 <em>Nội dung sẽ được cập nhật thêm: Position sizing nâng cao, trailing stop strategies, correlation risk management.</em></p>
      </div>
    </article>
  );
}

function Defi1() {
  return (
    <article style={S.article}>
      <h3 style={S.h3}>📊 DeFi Research Bài 1: Đọc Số Liệu On-Chain</h3>
      <blockquote style={S.quote}>"DefiLlama là bảng số liệu tài chính real-time của toàn bộ thị trường DeFi. Miễn phí. On-chain. Không ai chỉnh sửa được."</blockquote>
      <p style={S.p}>Thay vì fomo theo KOLs, bạn có thể tự đọc dữ liệu tài chính on-chain để hiểu bản chất dự án. Đây là cách một người làm phân tích tài chính nhìn vào crypto.</p>
      <div style={S.infoBox}>
        <h4 style={S.h4}>3 trang quan trọng nhất trên DefiLlama:</h4>
        <div style={{display:'flex',flexDirection:'column',gap:'10px',marginTop:'8px'}}>
          <div style={S.patternCard}>
            <strong style={{color:'#fbbf24'}}>1. defillama.com/protocols — TVL (Sức khỏe toàn hệ)</strong>
            <p style={{fontSize:'0.8rem',color:'#94a3b8',margin:'6px 0 0'}}>TVL = Total Value Locked — tổng tài sản đang khóa trong protocol. Nhưng đừng chỉ nhìn con số:</p>
            <ul style={{...S.ul,fontSize:'0.78rem',marginTop:'4px'}}>
              <li>TVL trend 30 ngày / 1 quý / 6 tháng: tăng đều hay vừa spike?</li>
              <li>TVL tăng do user thật hay do giá token thế chấp tăng?</li>
              <li>TVL cao quá = FOMO cao (nhà nhà thế chấp coin để đòn bẩy)</li>
              <li>TVL thấp = có thể là cơ hội nhập hàng</li>
            </ul>
          </div>
          <div style={S.patternCard}>
            <strong style={{color:'#fbbf24'}}>2. defillama.com/chains — Dòng tiền vĩ mô</strong>
            <p style={{fontSize:'0.8rem',color:'#94a3b8',margin:'6px 0 0'}}>Xem ecosystem nào đang được build thật:</p>
            <ul style={{...S.ul,fontSize:'0.78rem',marginTop:'4px'}}>
              <li>Chain TVL tăng đều 3-6 tháng = developer và user vào thật</li>
              <li>Chain TVL spike rồi dump = incentive ngắn hạn, tránh xa</li>
            </ul>
          </div>
          <div style={S.patternCard}>
            <strong style={{color:'#fbbf24'}}>3. defillama.com/fees — P&L thật của protocol</strong>
            <p style={{fontSize:'0.8rem',color:'#94a3b8',margin:'6px 0 0'}}>Đây mới là phần quan trọng nhất:</p>
            <ul style={{...S.ul,fontSize:'0.78rem',marginTop:'4px'}}>
              <li><strong>Fees</strong> = tổng phí user trả (doanh thu gross)</li>
              <li><strong>Revenue</strong> = phần protocol thực sự giữ lại</li>
              <li>VD: Uniswap thu trăm triệu USD phí nhưng 100% trả LP → revenue = $0</li>
            </ul>
          </div>
        </div>
      </div>
      <div style={S.warningBox}>
        <strong>🚨 RED FLAG:</strong> TVL tăng mạnh mà fees/revenue KHÔNG tăng theo → dòng tiền là tiền "thuê" từ token emission, không organic. Loại này dump mạnh khi hết incentive (VD: $STRK, $ZK, $ARB, $OP, $BERA).
      </div>
      <div style={S.tipBox}>
        <strong>💡 Ví dụ thực tế:</strong> Tháng 12/2024, TVL toàn thị trường tăng 40% trong 1 tháng — nhưng phần lớn chỉ vì ETH tăng từ $2.2K → $4.2K. Tài sản ký quỹ trị giá cao hơn, không phải có thêm user thật. Ngược lại 2022, TVL chạm đáy vì giá tài sản thế chấp giảm + vay bị thanh lý.
      </div>
      <div style={S.ruleBox}>
        <h4 style={S.h4}>✅ Checklist trước khi research sâu:</h4>
        <ul style={S.ul}>
          <li>TVL trend 30-90 ngày: tăng đều hay chỉ spike 1 lần?</li>
          <li>TVL tăng do user thật hay do giá collateral tăng?</li>
          <li>Protocol có fees thật không?</li>
          <li>Revenue là bao nhiêu % của tổng fees?</li>
          <li>Chạy đa chain hay phụ thuộc 1 chain duy nhất?</li>
        </ul>
      </div>
    </article>
  );
}

function Defi2() {
  return (
    <article style={S.article}>
      <h3 style={S.h3}>💎 DeFi Research Bài 2: Định Giá — Rẻ Hay Đắt?</h3>
      <p style={S.p}>Câu hỏi quan trọng nhất: <strong>bạn đang trả bao nhiêu tiền để mua $1 doanh thu của dự án?</strong></p>
      <div style={{display:'flex',gap:'12px',marginBottom:'16px',flexWrap:'wrap'}}>
        <div style={{flex:1,minWidth:'250px',background:'#0f172a',border:'1px solid #1e2d4a',borderRadius:'10px',padding:'16px'}}>
          <h4 style={{color:'#fbbf24',margin:'0 0 8px'}}>P/S Ratio (Price-to-Sales)</h4>
          <p style={{fontSize:'0.8rem',color:'#94a3b8',margin:'0 0 8px'}}>= Market Cap ÷ Annual Revenue</p>
          <p style={{fontSize:'0.78rem',color:'#cbd5e1',margin:'0 0 6px'}}><strong>Hiểu đơn giản:</strong> Bạn trả bao nhiêu cho mỗi $1 doanh thu?</p>
          <ul style={{...S.ul,fontSize:'0.78rem'}}>
            <li><span style={{color:'#22c55e'}}>P/S &lt; 10x</span> → Vùng rẻ (nếu revenue đang tăng)</li>
            <li><span style={{color:'#eab308'}}>P/S 10-30x</span> → Fair value</li>
            <li><span style={{color:'#ef4444'}}>P/S &gt; 50x</span> → Thị trường định giá "ngáo", dễ trap</li>
          </ul>
        </div>
        <div style={{flex:1,minWidth:'250px',background:'#0f172a',border:'1px solid #1e2d4a',borderRadius:'10px',padding:'16px'}}>
          <h4 style={{color:'#fbbf24',margin:'0 0 8px'}}>P/TVL Ratio (Price-to-TVL)</h4>
          <p style={{fontSize:'0.8rem',color:'#94a3b8',margin:'0 0 8px'}}>= Market Cap ÷ TVL</p>
          <p style={{fontSize:'0.78rem',color:'#cbd5e1',margin:'0 0 6px'}}><strong>Hiểu đơn giản:</strong> Bạn trả bao nhiêu so với tài sản protocol đang quản lý?</p>
          <ul style={{...S.ul,fontSize:'0.78rem'}}>
            <li><span style={{color:'#22c55e'}}>P/TVL &lt; 0.1</span> → Rẻ so với tài sản</li>
            <li><span style={{color:'#eab308'}}>P/TVL 0.1-0.3</span> → Hợp lý</li>
            <li><span style={{color:'#ef4444'}}>P/TVL &gt; 1</span> → Kỳ vọng rất cao, cẩn thận</li>
          </ul>
        </div>
      </div>
      <div style={S.ruleBox}>
        <h4 style={S.h4}>📊 Ví dụ so sánh 2 DEX (Comparable Analysis):</h4>
        <div style={{overflowX:'auto',marginTop:'8px'}}>
          <table style={{width:'100%',borderCollapse:'collapse',fontSize:'0.78rem'}}>
            <thead><tr style={{borderBottom:'1px solid #334155'}}>
              <th style={{padding:'6px',textAlign:'left',color:'#94a3b8'}}>Protocol</th>
              <th style={{padding:'6px',textAlign:'right',color:'#94a3b8'}}>TVL</th>
              <th style={{padding:'6px',textAlign:'right',color:'#94a3b8'}}>Revenue/năm</th>
              <th style={{padding:'6px',textAlign:'right',color:'#94a3b8'}}>MCap</th>
              <th style={{padding:'6px',textAlign:'right',color:'#94a3b8'}}>P/S</th>
              <th style={{padding:'6px',textAlign:'right',color:'#94a3b8'}}>P/TVL</th>
              <th style={{padding:'6px',textAlign:'right',color:'#94a3b8'}}>Margin</th>
            </tr></thead>
            <tbody>
              <tr style={{borderBottom:'1px solid #1e2d4a'}}>
                <td style={{padding:'6px',color:'#e2e8f0'}}>$HYPE</td>
                <td style={{padding:'6px',textAlign:'right',color:'#cbd5e1'}}>$800M</td>
                <td style={{padding:'6px',textAlign:'right',color:'#cbd5e1'}}>$20M</td>
                <td style={{padding:'6px',textAlign:'right',color:'#cbd5e1'}}>$150M</td>
                <td style={{padding:'6px',textAlign:'right',color:'#eab308'}}>7.5x</td>
                <td style={{padding:'6px',textAlign:'right',color:'#cbd5e1'}}>0.19</td>
                <td style={{padding:'6px',textAlign:'right',color:'#cbd5e1'}}>18%</td>
              </tr>
              <tr>
                <td style={{padding:'6px',color:'#22c55e',fontWeight:'bold'}}>$ASTER ✓</td>
                <td style={{padding:'6px',textAlign:'right',color:'#cbd5e1'}}>$400M</td>
                <td style={{padding:'6px',textAlign:'right',color:'#cbd5e1'}}>$15M</td>
                <td style={{padding:'6px',textAlign:'right',color:'#cbd5e1'}}>$80M</td>
                <td style={{padding:'6px',textAlign:'right',color:'#22c55e',fontWeight:'bold'}}>5.3x</td>
                <td style={{padding:'6px',textAlign:'right',color:'#cbd5e1'}}>0.20</td>
                <td style={{padding:'6px',textAlign:'right',color:'#22c55e',fontWeight:'bold'}}>32%</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p style={{fontSize:'0.78rem',color:'#94a3b8',marginTop:'8px'}}>→ $ASTER nhỏ hơn nhưng rẻ hơn tương đối, margin gấp đôi, giữ lại value tốt hơn. <strong>TVL to không có nghĩa là nên mua.</strong></p>
      </div>
      <div style={S.warningBox}>
        <strong>⚠️ Luôn dùng Market Cap, KHÔNG dùng FDV!</strong> FDV tính cả token chưa unlock, che giấu rủi ro dilution. Nhiều dự án "rẻ" theo FDV nhưng còn 70-80% token chưa ra. Unlock xong là dump ($ARB, $OP, $ZK).
      </div>
      <div style={S.warningBox}>
        <strong>⚠️ VALUE TRAP:</strong> P/S = 8x mà revenue tháng nào cũng giảm = rẻ mãi mãi, không có catalyst. Ngược lại P/S = 40x nhưng revenue tăng 3x/năm = vẫn có thể là cơ hội. <strong>Luôn check revenue trend 3-6 tháng.</strong>
      </div>
    </article>
  );
}

function Defi3() {
  return (
    <article style={S.article}>
      <h3 style={S.h3}>🏆 DeFi Research Bài 3: Rẻ Rồi — Hold Hay Skip?</h3>
      <p style={S.p}>Nhiều dự án rẻ mãi mãi vì lý do chính đáng — không có gì khiến nó tăng lại. Đây là 5 tiêu chí lọc dự án đáng hold dài hạn:</p>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'10px',marginBottom:'16px'}}>
        <div style={S.patternCard}>
          <strong style={{color:'#fbbf24'}}>1. Lợi thế cạnh tranh khó copy</strong>
          <p style={{fontSize:'0.75rem',color:'#94a3b8',margin:'6px 0 0'}}>Fork y chang dự án này, user có rời đi không?</p>
          <ul style={{...S.ul,fontSize:'0.73rem',marginTop:'4px'}}>
            <li>🟢 $UNI: thanh khoản sâu, fork không có ai trade</li>
            <li>🟢 $AAVE: lịch sử vay lâu năm, chi phí chuyển đổi cao</li>
            <li>🔴 APY cao chỉ vì in token → tắt thưởng là user chạy</li>
          </ul>
        </div>
        <div style={S.patternCard}>
          <strong style={{color:'#fbbf24'}}>2. Doanh thu thật (không phải in token)</strong>
          <p style={{fontSize:'0.75rem',color:'#94a3b8',margin:'6px 0 0'}}>Tắt hết thưởng token → user còn dùng không?</p>
          <ul style={{...S.ul,fontSize:'0.73rem',marginTop:'4px'}}>
            <li>🟢 $GMX: giảm thưởng nhưng trader thật vẫn trade</li>
            <li>🔴 Dự án "đào-rồi-bán" 2021: tắt thưởng → TVL về 0</li>
          </ul>
        </div>
        <div style={S.patternCard}>
          <strong style={{color:'#fbbf24'}}>3. Token ăn được doanh thu</strong>
          <p style={{fontSize:'0.75rem',color:'#94a3b8',margin:'6px 0 0'}}>Cầm token có nhận tiền từ protocol không?</p>
          <ul style={{...S.ul,fontSize:'0.73rem',marginTop:'4px'}}>
            <li>🟢 Chia phí cho holder, buyback & burn từ revenue thật</li>
            <li>🔴 $UNI: chưa bao giờ chia phí, token chỉ để vote</li>
          </ul>
        </div>
        <div style={S.patternCard}>
          <strong style={{color:'#fbbf24'}}>4. Team uy tín</strong>
          <p style={{fontSize:'0.75rem',color:'#94a3b8',margin:'6px 0 0'}}>Có sản phẩm thật, code cập nhật, có audit?</p>
          <ul style={{...S.ul,fontSize:'0.73rem',marginTop:'4px'}}>
            <li>✅ GitHub active, có audit security</li>
            <li>✅ Không lịch sử rút thanh khoản khi unlock</li>
          </ul>
        </div>
      </div>
      <div style={S.infoBox}>
        <h4 style={S.h4}>5. Đang đi đúng làn sóng thị trường</h4>
        <p style={{fontSize:'0.82rem',color:'#cbd5e1',margin:'4px 0 8px'}}>Protocol tốt nhưng category đang nguội = vị thế tệ. Nhóm ngành còn động lực 2-3 năm tới:</p>
        <div style={{display:'flex',gap:'8px',flexWrap:'wrap'}}>
          <span style={{background:'#3b82f620',color:'#3b82f6',padding:'4px 10px',borderRadius:'6px',fontSize:'0.78rem'}}>Perp DEX</span>
          <span style={{background:'#22c55e20',color:'#22c55e',padding:'4px 10px',borderRadius:'6px',fontSize:'0.78rem'}}>Lending / CDP</span>
          <span style={{background:'#a855f720',color:'#a855f7',padding:'4px 10px',borderRadius:'6px',fontSize:'0.78rem'}}>RWA — $ONDO</span>
        </div>
      </div>
      <div style={S.warningBox}>
        <strong>🚨 Dấu hiệu nguy hiểm — thấy là DỪNG:</strong> TVL tăng vọt + không có sản phẩm mới + token in ra nhanh hơn doanh thu tăng + team ẩn danh + chưa audit + FDV gấp hơn 5x MCap + còn nhiều token chưa unlock. VD: $STRK, $ZK, $ARB, $OP từng đỉnh gần hết dấu hiệu này lúc unlock lớn.
      </div>
      <div style={S.ruleBox}>
        <h4 style={S.h4}>🎯 Bảng chấm điểm nhanh (trước khi vào vị thế):</h4>
        <table style={{width:'100%',borderCollapse:'collapse',fontSize:'0.8rem',marginTop:'8px'}}>
          <thead><tr style={{borderBottom:'1px solid #334155'}}><th style={{padding:'6px',textAlign:'left',color:'#94a3b8'}}>Tiêu chí</th><th style={{padding:'6px',textAlign:'right',color:'#94a3b8'}}>Điểm tối đa</th></tr></thead>
          <tbody>
            <tr style={{borderBottom:'1px solid #1e2d4a20'}}><td style={{padding:'6px',color:'#cbd5e1'}}>Lợi thế cạnh tranh khó copy</td><td style={{padding:'6px',textAlign:'right',color:'#e2e8f0',fontWeight:'bold'}}>25</td></tr>
            <tr style={{borderBottom:'1px solid #1e2d4a20'}}><td style={{padding:'6px',color:'#cbd5e1'}}>Doanh thu thật + tăng trưởng</td><td style={{padding:'6px',textAlign:'right',color:'#e2e8f0',fontWeight:'bold'}}>25</td></tr>
            <tr style={{borderBottom:'1px solid #1e2d4a20'}}><td style={{padding:'6px',color:'#cbd5e1'}}>Token ăn được tiền doanh thu</td><td style={{padding:'6px',textAlign:'right',color:'#e2e8f0',fontWeight:'bold'}}>20</td></tr>
            <tr style={{borderBottom:'1px solid #1e2d4a20'}}><td style={{padding:'6px',color:'#cbd5e1'}}>Team uy tín + audit</td><td style={{padding:'6px',textAlign:'right',color:'#e2e8f0',fontWeight:'bold'}}>15</td></tr>
            <tr><td style={{padding:'6px',color:'#cbd5e1'}}>Đúng làn sóng thị trường</td><td style={{padding:'6px',textAlign:'right',color:'#e2e8f0',fontWeight:'bold'}}>15</td></tr>
          </tbody>
        </table>
        <div style={{display:'flex',gap:'8px',marginTop:'10px',flexWrap:'wrap'}}>
          <span style={{background:'#ef444420',color:'#fca5a5',padding:'4px 10px',borderRadius:'6px',fontSize:'0.75rem'}}>&lt; 60đ: Skip</span>
          <span style={{background:'#eab30820',color:'#fde047',padding:'4px 10px',borderRadius:'6px',fontSize:'0.75rem'}}>60-75đ: Theo dõi, chờ thêm dữ liệu</span>
          <span style={{background:'#22c55e20',color:'#86efac',padding:'4px 10px',borderRadius:'6px',fontSize:'0.75rem'}}>&gt; 75đ: Research sâu, có thể DCA dần</span>
        </div>
      </div>
      <div style={S.tipBox}><strong>💡 Lời kết:</strong> DefiLlama chỉ là công cụ, số liệu là nguyên liệu. Người thắng dài hạn là người hiểu giá trị tạo ra ở đâu, ai giữ giá trị đó, và token mình cầm có thực sự nhận được phần nào không.</div>
    </article>
  );
}

// ============================================================
// STYLES
// ============================================================
const S: Record<string, React.CSSProperties> = {
  container: { height: '100vh', display: 'flex', flexDirection: 'column', background: '#060d1a', color: '#e2e8f0', fontFamily: 'system-ui, sans-serif', overflow: 'hidden' },
  header: { display: 'flex', alignItems: 'center', gap: '16px', padding: '10px 20px', background: '#0a1628', borderBottom: '1px solid #1e2d4a', flexShrink: 0 },
  backBtn: { background: '#1e293b', border: '1px solid #334155', color: '#94a3b8', padding: '6px 14px', borderRadius: '6px', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600 },
  title: { margin: 0, fontSize: '1.2rem', color: '#fbbf24', fontWeight: 800 },
  subtitle: { color: '#64748b', fontSize: '0.82rem' },
  body: { display: 'flex', flex: 1, overflow: 'hidden' },
  sidebar: { width: '240px', background: '#0a1628', borderRight: '1px solid #1e2d4a', padding: '12px 8px', display: 'flex', flexDirection: 'column', gap: '4px', overflowY: 'auto', flexShrink: 0 },
  sidebarGroup: { color: '#64748b', fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', padding: '4px 12px', marginBottom: '2px' },
  navItem: { display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 12px', background: 'transparent', border: '1px solid transparent', borderRadius: '8px', color: '#94a3b8', cursor: 'pointer', fontSize: '0.82rem', fontWeight: 600, textAlign: 'left', width: '100%' },
  navItemActive: { background: '#1e293b', borderColor: '#334155', color: '#fbbf24' },
  main: { flex: 1, overflow: 'auto', padding: '20px 28px' },
  article: { maxWidth: '800px' },
  h3: { color: '#fbbf24', fontSize: '1.2rem', margin: '0 0 14px', fontWeight: 700 },
  h4: { color: '#fbbf24', fontSize: '0.92rem', margin: '0 0 8px', fontWeight: 700 },
  p: { fontSize: '0.88rem', lineHeight: '1.7', color: '#cbd5e1', margin: '0 0 12px' },
  quote: { fontStyle: 'italic', color: '#94a3b8', borderLeft: '3px solid #fbbf24', paddingLeft: '14px', margin: '14px 0', lineHeight: '1.6', fontSize: '0.88rem' },
  ul: { paddingLeft: '18px', display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '0.85rem', lineHeight: '1.6', color: '#cbd5e1' },
  ruleBox: { background: '#0f172a', border: '1px solid #1e2d4a', borderRadius: '10px', padding: '14px 16px', margin: '14px 0' },
  infoBox: { background: '#0f172a', border: '1px solid #1e2d4a', borderRadius: '10px', padding: '14px 16px', margin: '14px 0' },
  tipBox: { background: 'rgba(59,130,246,0.08)', border: '1px solid #3b82f640', borderRadius: '8px', padding: '12px 14px', margin: '14px 0', fontSize: '0.85rem', color: '#93c5fd', lineHeight: '1.6' },
  warningBox: { background: 'rgba(239,68,68,0.06)', border: '1px solid #ef444430', borderRadius: '8px', padding: '12px 14px', margin: '14px 0', fontSize: '0.85rem', color: '#fca5a5', lineHeight: '1.6' },
  patternCard: { background: '#1e293b', border: '1px solid #334155', borderRadius: '8px', padding: '10px', fontSize: '0.82rem' },
};
